import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileText,
  HandCoins,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
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
import { formatCurrency, formatShortDate } from '../../utils/formatters';
import DashboardCard from './components/DashboardCard';
import DashboardPanel from './components/DashboardPanel';
import useDashboardData from './hooks/useDashboardData';
import { buildDashboardMetrics } from './utils/dashboardMetrics';
import './Dashboard.css';

const CHART_TOOLTIP_STYLE = {
  background: '#18181c',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
  color: '#fff',
  boxShadow: '0 12px 28px rgba(0, 0, 0, 0.24)',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    data,
    loading,
    error,
    refreshedAt,
    refresh,
  } = useDashboardData();

  const dashboard = useMemo(() => buildDashboardMetrics({
    ...data,
    monthlyGoal: Number(localStorage.getItem('studioflow_finance_monthly_goal') || 30000),
  }), [data]);

  const cards = [
    {
      title: 'Receita no mês',
      value: formatCurrency(dashboard.monthlyRevenue),
      description: `${dashboard.goalProgress}% da meta mensal`,
      icon: TrendingUp,
      tone: 'green',
      path: '/financeiro',
    },
    {
      title: 'Resultado contábil do mês',
      value: formatCurrency(dashboard.netProfit),
      description: `Caixa ${formatCurrency(dashboard.operationalCashResult)} · Depreciação ${formatCurrency(dashboard.monthlyDepreciation)}`,
      icon: CircleDollarSign,
      tone: dashboard.netProfit >= 0 ? 'gold' : 'red',
      path: '/financeiro',
    },
    {
      title: 'A receber',
      value: formatCurrency(dashboard.receivable),
      description: 'Saldo pendente dos trabalhos',
      icon: HandCoins,
      tone: 'blue',
      path: '/financeiro',
    },
    {
      title: 'Trabalhos ativos',
      value: dashboard.activeProjects,
      description: `${dashboard.overdueProjects} com prazo vencido`,
      icon: BriefcaseBusiness,
      tone: dashboard.overdueProjects > 0 ? 'red' : 'blue',
      path: '/trabalhos',
    },
    {
      title: 'Eventos da semana',
      value: dashboard.weeklyEvents,
      description: `${dashboard.futureEvents.length} compromisso(s) futuro(s)`,
      icon: CalendarDays,
      tone: 'gold',
      path: '/agenda',
    },
    {
      title: 'Leads em aberto',
      value: dashboard.activeLeads,
      description: `Conversão geral de ${dashboard.conversionRate}%`,
      icon: Users,
      tone: 'purple',
      path: '/crm',
    },
    {
      title: 'Propostas pendentes',
      value: dashboard.pendingProposals,
      description: 'Aguardando retorno ou decisão',
      icon: FileText,
      tone: 'orange',
      path: '/documentos',
    },
    {
      title: 'Contratos pendentes',
      value: dashboard.pendingContracts,
      description: 'Aguardando assinatura ou conclusão',
      icon: FileCheck2,
      tone: 'purple',
      path: '/documentos',
    },
  ];

  const lastRefreshLabel = refreshedAt
    ? refreshedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="sf-dashboard">
      <section className="sf-dashboard-hero">
        <div>
          <span className="sf-dashboard-eyebrow">Visão executiva</span>
          <h1>Painel de Controle</h1>
          <p>
            Acompanhe a operação comercial, os trabalhos, a agenda e a saúde financeira do estúdio em uma única visão.
          </p>
        </div>

        <div className="sf-dashboard-actions">
          <button type="button" className="sf-dashboard-refresh" onClick={refresh} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            Atualizar
          </button>
          <button type="button" className="sf-dashboard-primary-action" onClick={() => navigate('/trabalhos')}>
            <BriefcaseBusiness size={16} />
            Ver trabalhos
          </button>
        </div>
      </section>

      <div className="sf-dashboard-statusbar">
        <span className="sf-dashboard-status-dot" />
        {loading
          ? 'Atualizando informações do StudioFlow…'
          : lastRefreshLabel
            ? `Dados sincronizados às ${lastRefreshLabel}`
            : 'Dados sincronizados'}
      </div>

      {error && <div className="sf-dashboard-error">{error}</div>}

      <section className="sf-dashboard-metrics">
        {loading && !refreshedAt
          ? Array.from({ length: 8 }, (_, index) => <div className="sf-dashboard-skeleton" key={index} />)
          : cards.map((card) => <DashboardCard key={card.title} {...card} />)}
      </section>

      <section className="sf-dashboard-main-grid">
        <DashboardPanel
          title="Desempenho financeiro"
          subtitle="Receitas e despesas efetivamente registradas nos últimos seis meses."
          action={(
            <button type="button" className="sf-dashboard-panel-link" onClick={() => navigate('/financeiro')}>
              Financeiro <ArrowRight size={15} />
            </button>
          )}
        >
          <div className="sf-dashboard-chart">
            <ResponsiveContainer>
              <BarChart data={dashboard.monthlyChart} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="mes" stroke="var(--text-secondary)" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  stroke="var(--text-secondary)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  tickFormatter={(value) => (value >= 1000 ? `R$ ${Math.round(value / 1000)} mil` : `R$ ${value}`)}
                />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
                <Legend wrapperStyle={{ paddingTop: 12, fontSize: 12 }} />
                <Bar dataKey="receitas" name="Receitas" fill="#c5a059" radius={[5, 5, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill="#d85b67" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="sf-dashboard-goal">
            <div className="sf-dashboard-goal-copy">
              <span>Meta mensal</span>
              <strong>{formatCurrency(dashboard.monthlyRevenue)} de {formatCurrency(dashboard.monthlyGoal)}</strong>
            </div>
            <div className="sf-dashboard-goal-track">
              <div style={{ width: `${dashboard.goalProgress}%` }} />
            </div>
          </div>
        </DashboardPanel>

        <DashboardPanel title="Serviços contratados" subtitle="Distribuição dos trabalhos oficiais do ano por categoria.">
          <div className="sf-dashboard-chart sf-dashboard-chart-small">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={dashboard.serviceChart}
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={83}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {dashboard.serviceChart.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="sf-dashboard-service-list">
            {dashboard.serviceChart.slice(0, 6).map((item) => (
              <div className="sf-dashboard-service-item" key={item.name}>
                <span className="sf-dashboard-service-name">
                  <span className="sf-dashboard-service-dot" style={{ background: item.color }} />
                  {item.name}
                </span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </DashboardPanel>
      </section>

      <section className="sf-dashboard-bottom-grid">
        <DashboardPanel
          title="Próximos compromissos"
          subtitle="Eventos e trabalhos com data futura, em ordem cronológica."
          action={(
            <button type="button" className="sf-dashboard-panel-link" onClick={() => navigate('/agenda')}>
              Agenda <ArrowRight size={15} />
            </button>
          )}
        >
          {dashboard.futureEvents.length > 0 ? (
            <div className="sf-dashboard-event-list">
              {dashboard.futureEvents.slice(0, 6).map((event) => (
                <div className="sf-dashboard-event-item" key={event.id}>
                  <div className="sf-dashboard-event-date">{formatShortDate(event.data)}</div>
                  <div className="sf-dashboard-event-copy">
                    <strong>{event.cliente}</strong>
                    <span>
                      {event.tipo}
                      {event.local ? ` · ${event.local}` : ''}
                      {event.horario ? ` · ${event.horario}` : ''}
                    </span>
                  </div>
                  <Clock3 size={16} />
                </div>
              ))}
            </div>
          ) : (
            <div className="sf-dashboard-empty">Nenhum compromisso futuro foi encontrado.</div>
          )}
        </DashboardPanel>

        <DashboardPanel title="Central de atenção" subtitle="Pendências que merecem ação agora.">
          {dashboard.alerts.length > 0 ? (
            <div className="sf-dashboard-alert-list">
              {dashboard.alerts.map((alert) => (
                <button
                  type="button"
                  className={`sf-dashboard-alert-item tone-${alert.tone}`}
                  key={alert.id}
                  onClick={() => navigate(alert.path)}
                >
                  <span className="sf-dashboard-alert-icon">
                    {alert.tone === 'danger' ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
                  </span>
                  <span className="sf-dashboard-alert-copy">
                    <strong>{alert.title}</strong>
                    <span>{alert.description}</span>
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <div className="sf-dashboard-empty">Tudo em ordem. Nenhuma pendência crítica foi identificada.</div>
          )}
        </DashboardPanel>
      </section>

      <section className="sf-dashboard-metrics">
        <DashboardCard
          title="Saldo de caixa"
          value={formatCurrency(dashboard.cashBalance)}
          description="Entradas reais menos saídas efetivas"
          icon={WalletCards}
          tone={dashboard.cashBalance >= 0 ? 'green' : 'red'}
          path="/financeiro"
        />
        <DashboardCard
          title="Pagamentos futuros"
          value={formatCurrency(dashboard.upcomingPayments)}
          description="Despesas dos próximos 30 dias"
          icon={TrendingDown}
          tone="orange"
          path="/financeiro"
        />
        <DashboardCard
          title="Taxa de conversão"
          value={`${dashboard.conversionRate}%`}
          description={`${dashboard.activeLeads} oportunidade(s) em aberto`}
          icon={Target}
          tone="purple"
          path="/crm"
        />
        <DashboardCard
          title="Clientes cadastrados"
          value={dashboard.clientsCount}
          description={`${dashboard.projectsCount} trabalho(s) oficiais em ${new Date().getFullYear()}`}
          icon={Users}
          tone="blue"
          path="/clientes"
        />
      </section>
    </div>
  );
}
