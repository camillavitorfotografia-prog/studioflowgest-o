import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { 
  AlertCircle, 
  CalendarDays, 
  CheckCircle, 
  Clock, 
  DollarSign, 
  Target, 
  TrendingDown, 
  TrendingUp, 
  Users 
} from 'lucide-react';
import { ACTIVE_LEAD_STATUSES } from '../../data/crm';
import { formatCurrency, formatShortDate, isCurrentMonth, parseCurrency, parseDate } from '../../utils/formatters';
import { readStorage, STORAGE_KEYS, syncLegacyLeads } from '../../utils/storage';
import { getStudioData } from '../../utils/integratedData';

const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const serviceColors = ['#c5a059', '#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

export default function Dashboard() {
  const [data, setData] = useState({
    leads: [],
    clients: [],
    finances: [],
    agendaEvents: [],
  });

  useEffect(() => {
    const loadData = () => {
      const studio = getStudioData();
      setData({
        leads: syncLegacyLeads() || [],
        clients: (studio?.projects || []).map((project) => ({
          ...project.cliente,
          id: project.id,
          nome: project.clienteNome || 'Cliente sem nome',
          tipo: project.tipoServico || 'Não especificado',
          dataTrabalho: project.data,
          valorTotal: project.valorContratado,
          pagamentos: project.financeiro?.receitas || project.pagamentos || [],
          status: project.status,
        })),
        finances: readStorage(STORAGE_KEYS.finances, []),
        agendaEvents: readStorage(STORAGE_KEYS.agendaEvents, []),
      });
    };

    loadData();
    window.addEventListener('focus', loadData);
    window.addEventListener('storage', loadData);
    return () => {
      window.removeEventListener('focus', loadData);
      window.removeEventListener('storage', loadData);
    };
  }, []);

  const dashboard = useMemo(() => {
    const now = new Date();
    const clients = data.clients || [];
    const leads = data.leads || [];
    const finances = data.finances || [];

    const futureEvents = clients
      .map((client) => ({
        id: client.id,
        cliente: client.nome,
        tipo: client.tipo,
        data: client.dataTrabalho,
        valor: parseCurrency(client.valorTotal),
      }))
      .filter((event) => {
        const date = parseDate(event.data);
        return date && date >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
      })
      .sort((a, b) => parseDate(a.data) - parseDate(b.data));

    const eventsThisMonth = futureEvents.filter((event) => isCurrentMonth(event.data, now));
    const nextWedding = futureEvents.find((event) => (event.tipo || '').toLowerCase().includes('casamento'));

    // Faturamento Mensal (Base de Caixa: focado no que de fato entrou no mês via pagamentos recebidos)
    const monthlyRevenue = clients.reduce((total, client) => {
      const payments = client.pagamentos || [];
      const paidThisMonth = payments.reduce((sum, payment) => {
        if (!isCurrentMonth(payment.data, now)) return sum;
        return sum + parseCurrency(payment.valor);
      }, 0);

      if (paidThisMonth > 0) return total + paidThisMonth;
      if (isCurrentMonth(client.dataTrabalho, now)) return total + parseCurrency(client.valorTotal);
      return total;
    }, 0);

    const monthlyExpenses = finances.reduce((total, transaction) => {
      if (transaction.tipoGeral !== 'Saida' || !isCurrentMonth(transaction.data, now)) return total;
      return total + parseCurrency(transaction.valor);
    }, 0);

    const overduePayments = clients.reduce((total, client) => {
      const eventDate = parseDate(client.dataTrabalho);
      const totalValue = parseCurrency(client.valorTotal);
      const paid = (client.pagamentos || []).reduce((sum, payment) => sum + parseCurrency(payment.valor), 0);
      const pending = Math.max(0, totalValue - paid);
      if (pending > 0 && eventDate && eventDate < now) return total + pending;
      return total;
    }, 0);

    const pendingRevenue = clients.reduce((total, client) => {
      const totalValue = parseCurrency(client.valorTotal);
      const paid = (client.pagamentos || []).reduce((sum, payment) => sum + parseCurrency(payment.valor), 0);
      return total + Math.max(0, totalValue - paid);
    }, 0);

    const waitingQuotes = leads.filter((lead) => ['orcamento_enviado', 'aguardando_retorno'].includes(lead.status)).length;
    const activeClients = clients.filter((client) => client.status !== 'finalizado').length;

    // Construção dos últimos 6 meses para o gráfico
    const monthlyChart = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return {
        month: date.getMonth(),
        year: date.getFullYear(),
        mes: monthNames[date.getMonth()],
        receitas: 0,
        despesas: 0,
        eventos: 0,
      };
    });

    clients.forEach((client) => {
      const eventDate = parseDate(client.dataTrabalho);
      if (!eventDate) return;
      const item = monthlyChart.find((m) => m.month === eventDate.getMonth() && m.year === eventDate.getFullYear());
      if (!item) return;
      item.receitas += parseCurrency(client.valorTotal);
      item.eventos += 1;
    });

    finances.forEach((transaction) => {
      if (transaction.tipoGeral !== 'Saida') return;
      const date = parseDate(transaction.data);
      if (!date) return;
      const item = monthlyChart.find((m) => m.month === date.getMonth() && m.year === date.getFullYear());
      if (item) item.despesas += parseCurrency(transaction.valor);
    });

    const services = clients.reduce((acc, client) => {
      const name = client.tipo || 'Outros';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});

    const serviceChart = Object.entries(services).map(([name, value], index) => ({
      name,
      value,
      color: serviceColors[index % serviceColors.length],
    }));

    return {
      futureEvents,
      eventsThisMonth,
      nextWedding,
      monthlyRevenue,
      monthlyExpenses,
      estimatedProfit: monthlyRevenue - monthlyExpenses,
      overduePayments,
      pendingRevenue,
      waitingQuotes,
      activeClients,
      monthlyChart,
      serviceChart: serviceChart.length ? serviceChart : [{ name: 'Sem dados', value: 1, color: '#333' }],
    };
  }, [data]);

  const cards = [
    { title: 'Eventos Futuros', value: dashboard.futureEvents.length, icon: <CalendarDays size={22} />, color: '#60a5fa' },
    { title: 'Eventos Este Mês', value: dashboard.eventsThisMonth.length, icon: <Clock size={22} />, color: '#c5a059' },
    { title: 'Clientes Ativos', value: dashboard.activeClients, icon: <Users size={22} />, color: '#10b981' },
    { title: 'Orçamentos Aguardando', value: dashboard.waitingQuotes, icon: <Target size={22} />, color: '#f59e0b' },
    { title: 'A Receber Total', value: formatCurrency(dashboard.pendingRevenue), icon: <DollarSign size={22} />, color: '#34d399' },
    { title: 'Pagamentos Atrasados', value: formatCurrency(dashboard.overduePayments), icon: <AlertCircle size={22} />, color: '#ef4444' },
    { title: 'Faturamento Mensal', value: formatCurrency(dashboard.monthlyRevenue), icon: <TrendingUp size={22} />, color: '#22c55e' },
    { title: 'Despesas Mensais', value: formatCurrency(dashboard.monthlyExpenses), icon: <TrendingDown size={22} />, color: '#f87171' },
    { title: 'Resultado do Mês', value: formatCurrency(dashboard.estimatedProfit), icon: <CheckCircle size={22} />, color: dashboard.estimatedProfit >= 0 ? '#10b981' : '#ef4444' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '32px' }}>
      <header>
        <h1 style={{ color: 'var(--text-main)', fontSize: '2rem', fontWeight: '700', margin: 0 }}>Painel de Controle</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '6px', fontSize: '0.95rem' }}>
          Visão geral de saúde financeira, funil de prospecção e cronograma técnico do estúdio.
        </p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        {cards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 0.8fr)', gap: '24px', flexWrap: 'wrap' }}>
        <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-md)', minHeight: '360px' }}>
          <h2 style={{ color: 'var(--text-main)', fontSize: '1.1rem', marginBottom: '24px', fontWeight: '600' }}>Fluxo de Caixa (Últimos 6 meses)</h2>
          <div style={{ width: '100%', height: 285 }}>
            <ResponsiveContainer>
              <BarChart data={dashboard.monthlyChart} margin={{ top: 0, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="mes" stroke="var(--text-secondary)" tickLine={false} axisLine={false} style={{ fontSize: '0.85rem' }} />
                <YAxis stroke="var(--text-secondary)" tickLine={false} axisLine={false} style={{ fontSize: '0.85rem' }} tickFormatter={(val) => (val >= 1000 ? `R$ ${Math.round(val / 1000)}k` : `R$ ${val}`)} />
                <Tooltip contentStyle={{ background: '#1D1D21', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }} formatter={(value) => formatCurrency(value)} />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '0.9rem' }} />
                <Bar dataKey="receitas" name="Receitas coletadas" fill="#c5a059" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas pagas" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-md)', minHeight: '360px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <h2 style={{ color: 'var(--text-main)', fontSize: '1.1rem', marginBottom: '20px', fontWeight: '600' }}>Serviços Contratados</h2>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={dashboard.serviceChart} cx="50%" cy="50%" innerRadius={58} outerRadius={82} paddingAngle={4} dataKey="value" stroke="none">
                  {dashboard.serviceChart.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1D1D21', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            {dashboard.serviceChart.map((item) => (
              <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color }} />
                  {item.name}
                </span>
                <strong style={{ color: 'var(--text-main)' }}>{item.value}x</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 0.75fr)', gap: '24px' }}>
        <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-md)' }}>
          <h2 style={{ color: 'var(--text-main)', fontSize: '1.1rem', marginBottom: '18px', fontWeight: '600' }}>Volume de Produção (Eventos/Mês)</h2>
          <div style={{ width: '100%', height: 230 }}>
            <ResponsiveContainer>
              <BarChart data={dashboard.monthlyChart} margin={{ top: 0, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="mes" stroke="var(--text-secondary)" tickLine={false} axisLine={false} style={{ fontSize: '0.85rem' }} />
                <YAxis stroke="var(--text-secondary)" tickLine={false} axisLine={false} style={{ fontSize: '0.85rem' }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1D1D21', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }} />
                <Bar dataKey="eventos" name="Quantidade de Eventos" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ color: 'var(--text-main)', fontSize: '1.1rem', marginBottom: '6px', fontWeight: '600' }}>Próximos Compromissos</h2>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {dashboard.futureEvents.slice(0, 4).map((event) => (
              <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ minWidth: '58px', borderRadius: '8px', background: 'rgba(197,160,89,0.1)', border: '1px solid rgba(197,160,89,0.2)', color: '#c5a059', padding: '6px', textAlign: 'center', fontWeight: 700, fontSize: '0.85rem' }}>
                  {formatShortDate(event.data)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: 'var(--text-main)', fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.cliente}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{event.tipo}</div>
                </div>
              </div>
            ))}
            {dashboard.futureEvents.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', padding: '20px 0', textAlign: 'center' }}>Nenhum evento futuro agendado.</p>
            )}
          </div>
          
          {dashboard.nextWedding && (
            <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>Próximo Casamento</div>
              <div style={{ color: 'var(--text-main)', fontWeight: 700, fontSize: '0.95rem' }}>{dashboard.nextWedding.cliente}</div>
              <div style={{ color: '#c5a059', fontSize: '0.85rem', marginTop: '4px', fontWeight: 600 }}>{formatShortDate(dashboard.nextWedding.data)}</div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  return (
    <article className="glass" style={{ padding: '18px', borderRadius: 'var(--radius-md)', display: 'flex', gap: '14px', alignItems: 'center', minHeight: '96px' }}>
      <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
        <div style={{ color: 'var(--text-main)', fontSize: typeof value === 'string' && value.length > 12 ? '1.2rem' : '1.5rem', fontWeight: 800, marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </div>
      </div>
    </article>
  );
}