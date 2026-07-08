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
import { AlertCircle, CalendarDays, CheckCircle, Clock, DollarSign, Target, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { ACTIVE_LEAD_STATUSES } from '../../data/crm';
import { formatCurrency, formatShortDate, isCurrentMonth, parseCurrency, parseDate } from '../../utils/formatters';
import { readStorage, STORAGE_KEYS, syncLegacyLeads } from '../../utils/storage';

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
      setData({
        leads: syncLegacyLeads(),
        clients: readStorage(STORAGE_KEYS.clients, []),
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
    const clients = data.clients;
    const leads = data.leads;
    const finances = data.finances;

    const futureEvents = clients
      .map((client) => ({
        id: client.id,
        cliente: client.nome,
        tipo: client.tipo || client.tipoServico || 'Evento',
        data: client.dataTrabalho || client.dataEvento,
        valor: parseCurrency(client.valorTotal || client.valorOrcamento),
      }))
      .filter((event) => {
        const date = parseDate(event.data);
        return date && date >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
      })
      .sort((a, b) => parseDate(a.data) - parseDate(b.data));

    const eventsThisMonth = futureEvents.filter((event) => isCurrentMonth(event.data, now));
    const nextWedding = futureEvents.find((event) => (event.tipo || '').toLowerCase().includes('casamento'));

    const monthlyRevenue = clients.reduce((total, client) => {
      const payments = client.pagamentos || [];
      const paidThisMonth = payments.reduce((sum, payment) => {
        if (!isCurrentMonth(payment.data, now)) return sum;
        return sum + parseCurrency(payment.valor);
      }, 0);

      if (paidThisMonth > 0) return total + paidThisMonth;
      if (isCurrentMonth(client.dataTrabalho || client.dataEvento, now)) return total + parseCurrency(client.valorTotal);
      return total;
    }, 0);

    const monthlyExpenses = finances.reduce((total, transaction) => {
      if (transaction.tipoGeral !== 'Saida' || !isCurrentMonth(transaction.data, now)) return total;
      return total + parseCurrency(transaction.valor);
    }, 0);

    const overduePayments = clients.reduce((total, client) => {
      const eventDate = parseDate(client.dataTrabalho || client.dataEvento);
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
      const eventDate = parseDate(client.dataTrabalho || client.dataEvento);
      if (!eventDate) return;
      const item = monthlyChart.find((month) => month.month === eventDate.getMonth() && month.year === eventDate.getFullYear());
      if (!item) return;
      item.receitas += parseCurrency(client.valorTotal);
      item.eventos += 1;
    });

    finances.forEach((transaction) => {
      if (transaction.tipoGeral !== 'Saida') return;
      const date = parseDate(transaction.data);
      if (!date) return;
      const item = monthlyChart.find((month) => month.month === date.getMonth() && month.year === date.getFullYear());
      if (item) item.despesas += parseCurrency(transaction.valor);
    });

    const services = clients.reduce((acc, client) => {
      const name = client.tipo || client.tipoServico || 'Outros';
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
      openLeads: leads.filter((lead) => ACTIVE_LEAD_STATUSES.includes(lead.status)).length,
    };
  }, [data]);

  const cards = [
    { title: 'Eventos futuros', value: dashboard.futureEvents.length, icon: <CalendarDays size={22} />, color: '#60a5fa' },
    { title: 'Eventos este mes', value: dashboard.eventsThisMonth.length, icon: <Clock size={22} />, color: '#c5a059' },
    { title: 'Clientes ativos', value: dashboard.activeClients, icon: <Users size={22} />, color: '#10b981' },
    { title: 'Orcamentos aguardando', value: dashboard.waitingQuotes, icon: <Target size={22} />, color: '#f59e0b' },
    { title: 'A receber', value: formatCurrency(dashboard.pendingRevenue), icon: <DollarSign size={22} />, color: '#34d399' },
    { title: 'Pagamentos atrasados', value: formatCurrency(dashboard.overduePayments), icon: <AlertCircle size={22} />, color: '#ef4444' },
    { title: 'Faturamento mensal', value: formatCurrency(dashboard.monthlyRevenue), icon: <TrendingUp size={22} />, color: '#22c55e' },
    { title: 'Despesas mensais', value: formatCurrency(dashboard.monthlyExpenses), icon: <TrendingDown size={22} />, color: '#f87171' },
    { title: 'Lucro estimado', value: formatCurrency(dashboard.estimatedProfit), icon: <CheckCircle size={22} />, color: dashboard.estimatedProfit >= 0 ? '#10b981' : '#ef4444' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '32px' }}>
      <header>
        <h1 style={{ color: 'var(--text-main)', fontSize: '2rem', fontWeight: '700', margin: 0 }}>Painel de Controle</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '6px' }}></p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
        {cards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 0.8fr)', gap: '24px' }}>
        <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-md)', minHeight: '360px' }}>
          <h2 style={{ color: 'var(--text-main)', fontSize: '1.1rem', marginBottom: '24px' }}>Receitas x despesas</h2>
          <ResponsiveContainer width="100%" height={285}>
            <BarChart data={dashboard.monthlyChart} margin={{ top: 0, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="mes" stroke="var(--text-secondary)" tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-secondary)" tickLine={false} axisLine={false} tickFormatter={(value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : value)} />
              <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff' }} formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="receitas" name="Receitas" fill="#c5a059" radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-md)', minHeight: '360px' }}>
          <h2 style={{ color: 'var(--text-main)', fontSize: '1.1rem', marginBottom: '20px' }}>Servicos mais contratados</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={dashboard.serviceChart} cx="50%" cy="50%" innerRadius={58} outerRadius={82} paddingAngle={4} dataKey="value" stroke="none">
                {dashboard.serviceChart.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff' }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {dashboard.serviceChart.map((item) => (
              <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '0.85rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color }} />
                  {item.name}
                </span>
                <strong style={{ color: '#fff' }}>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 0.75fr)', gap: '24px' }}>
        <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-md)' }}>
          <h2 style={{ color: 'var(--text-main)', fontSize: '1.1rem', marginBottom: '18px' }}>Eventos por mes</h2>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={dashboard.monthlyChart} margin={{ top: 0, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="mes" stroke="var(--text-secondary)" tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-secondary)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff' }} />
              <Bar dataKey="eventos" name="Eventos" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-md)' }}>
          <h2 style={{ color: 'var(--text-main)', fontSize: '1.1rem', marginBottom: '18px' }}>Proximos eventos</h2>
          {dashboard.futureEvents.slice(0, 5).map((event) => (
            <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ minWidth: '58px', borderRadius: '8px', background: 'rgba(197,160,89,0.12)', border: '1px solid rgba(197,160,89,0.25)', color: '#c5a059', padding: '8px', textAlign: 'center', fontWeight: 700 }}>
                {formatShortDate(event.data)}
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 600 }}>{event.cliente}</div>
                <div style={{ color: '#888', fontSize: '0.85rem' }}>{event.tipo}</div>
              </div>
            </div>
          ))}
          {dashboard.futureEvents.length === 0 && <p style={{ color: '#888' }}>Nenhum evento futuro agendado.</p>}
          {dashboard.nextWedding && (
            <div style={{ marginTop: '18px', background: '#111', border: '1px solid #222', borderRadius: '10px', padding: '14px' }}>
              <div style={{ color: '#888', fontSize: '0.78rem', marginBottom: '4px' }}>Proximo casamento</div>
              <div style={{ color: '#fff', fontWeight: 700 }}>{dashboard.nextWedding.cliente}</div>
              <div style={{ color: '#c5a059', fontSize: '0.86rem', marginTop: '4px' }}>{formatShortDate(dashboard.nextWedding.data)}</div>
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
      <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: `${color}22`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>{title}</div>
        <div style={{ color: 'var(--text-main)', fontSize: typeof value === 'string' && value.length > 10 ? '1.15rem' : '1.55rem', fontWeight: 800, marginTop: '4px', wordBreak: 'break-word' }}>{value}</div>
      </div>
    </article>
  );
}
