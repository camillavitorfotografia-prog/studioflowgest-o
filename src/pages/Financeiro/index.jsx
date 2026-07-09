import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  CircleDollarSign,
  FileSpreadsheet,
  LineChart,
  Package,
  PiggyBank,
  Receipt,
  Settings,
  Wallet,
} from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Modal from '../../components/Modal';
import { getStudioData } from '../../utils/integratedData';
import Despesas from './Despesas';
import {
  FINANCE_STORAGE_KEYS,
  buildFinanceSnapshot,
  calculateDepreciation,
  formatCurrency,
  getAverageVariableExpenses,
  getEquipmentMonthlyDepreciation,
  getMonthlyTotals,
  getTransactionDate,
  getTransactionStatus,
  getTransactionValue,
  groupBySum,
  isExpense,
  monthKey,
  normalizeDistributionConfig,
  parseCurrency,
} from '../../utils/financeEngine';

const tabs = [
  { id: 'dashboard', label: 'Painel', icon: BarChart3 },
  { id: 'receitas', label: 'Receitas', icon: ArrowUpCircle },
  { id: 'fixas', label: 'Despesas Fixas', icon: Receipt },
  { id: 'variaveis', label: 'Despesas Variaveis', icon: ArrowDownCircle },
  { id: 'equipamentos', label: 'Investimentos', icon: Package },
  { id: 'relatorios', label: 'Relatorios', icon: FileSpreadsheet },
];

export default function Financeiro() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="sf-finance-page">
      <div className="sf-finance-nav">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
              <Icon size={17} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'dashboard' && <FinanceDashboard />}
      {activeTab === 'receitas' && <Receitas />}
      {activeTab === 'fixas' && <Despesas area="fixa" />}
      {activeTab === 'variaveis' && <Despesas area="variavel" />}
      {activeTab === 'equipamentos' && <Investimentos />}
      {activeTab === 'relatorios' && <RelatoriosFinanceiros />}
    </div>
  );
}

function useFinanceData() {
  const [financasConfig, setFinancasConfig] = useState(() =>
    JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.config) || '{"salario": 35, "empresa": 45, "reserva": 20}'),
  );
  const [saldos, setSaldos] = useState(() =>
    JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.balances) || '{"salario": 0, "empresa": 0, "reserva": 0}'),
  );
  const [studio, setStudio] = useState(() => getStudioData());
  const [transacoes, setTransacoes] = useState(() => JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.transactions) || '[]'));
  const [equipamentos, setEquipamentos] = useState(() => JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.equipment) || '[]'));

  useEffect(() => {
    const loadAll = () => {
      setFinancasConfig(JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.config) || '{"salario": 35, "empresa": 45, "reserva": 20}'));
      setSaldos(JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.balances) || '{"salario": 0, "empresa": 0, "reserva": 0}'));
      setStudio(getStudioData());
      setTransacoes(JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.transactions) || '[]'));
      setEquipamentos(JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.equipment) || '[]'));
    };

    window.addEventListener('focus', loadAll);
    window.addEventListener('storage', loadAll);
    window.addEventListener('sf_storage_update', loadAll);

    return () => {
      window.removeEventListener('focus', loadAll);
      window.removeEventListener('storage', loadAll);
      window.removeEventListener('sf_storage_update', loadAll);
    };
  }, []);

  const clientes = useMemo(() => {
    return (studio.projects || []).map((project) => ({
      ...project.cliente,
      id: project.clientId,
      projectId: project.id,
      nome: project.clienteNome,
      valorTotal: project.valorContratado,
      pagamentos: project.financeiro?.receitas || project.pagamentos || [],
      dataTrabalho: project.data,
      tipo: project.tipoServico,
    }));
  }, [studio.projects]);

  const data = useMemo(() => {
    const now = new Date();
    const currentMonth = monthKey(now);
    let receitaBruta = 0;
    let contasAReceber = 0;
    let inadimplente = 0;

    clientes.forEach((client) => {
      const total = parseCurrency(client.valorTotal);
      const paid = (client.pagamentos || []).reduce((sum, payment) => {
        const value = parseCurrency(payment.valor);
        if (monthKey(payment.data) === currentMonth) receitaBruta += value;
        return sum + value;
      }, 0);
      const remaining = Math.max(0, total - paid);
      const workDate = client.dataTrabalho ? new Date(client.dataTrabalho) : null;
      if (remaining > 0 && workDate && workDate < now) inadimplente += remaining;
      else contasAReceber += remaining;
    });

    const monthlyTotals = getMonthlyTotals(transacoes, now);
    const despesasFixas = monthlyTotals.fixed;
    const despesasVariaveis = monthlyTotals.variable;
    const depreciacaoMensal = getEquipmentMonthlyDepreciation(equipamentos);
    const investimentoEquipamentosMes = equipamentos
      .filter((item) => monthKey(item.dataCompra || item.data) === currentMonth)
      .reduce((sum, item) => sum + Number(item.valorCompra ?? item.valor ?? 0), 0);
    const mediaVariavel = getAverageVariableExpenses(transacoes);
    const custoOperacional = despesasFixas + mediaVariavel + depreciacaoMensal;
    const lucroReal = receitaBruta - despesasFixas - despesasVariaveis - depreciacaoMensal;
    const margemLucro = receitaBruta > 0 ? (lucroReal / receitaBruta) * 100 : 0;
    const fluxoCaixa = receitaBruta - despesasFixas - despesasVariaveis;
    const contasAPagar = transacoes
      .filter((item) => isExpense(item) && getTransactionStatus(item) !== 'Pago')
      .reduce((sum, item) => sum + getTransactionValue(item), 0);
    const proximosVencimentos = transacoes
      .filter((item) => isExpense(item) && getTransactionStatus(item) !== 'Pago')
      .sort((a, b) => new Date(getTransactionDate(a)) - new Date(getTransactionDate(b)))
      .slice(0, 5);
    const despesasPorCategoria = groupBySum(
      transacoes.filter((item) => isExpense(item) && monthKey(getTransactionDate(item)) === currentMonth),
      (item) => item.categoria,
    );
    const maiorCategoria = Object.entries(despesasPorCategoria).sort((a, b) => b[1] - a[1])[0];

    const financeSnapshot = buildFinanceSnapshot({
      clients: clientes,
      transactions: transacoes,
      equipment: equipamentos,
      balances: saldos,
      config: financasConfig,
      referenceDate: now,
    });

    return {
      saldos,
      setSaldos,
      clientes,
      transacoes,
      equipamentos,
      financasConfig,
      setFinancasConfig,
      receitaBruta,
      contasAReceber,
      inadimplente,
      despesasFixas,
      despesasVariaveis,
      depreciacaoMensal,
      investimentoEquipamentosMes,
      mediaVariavel,
      custoOperacional,
      lucroReal,
      margemLucro,
      fluxoCaixa,
      contasAPagar,
      proximosVencimentos,
      maiorCategoria,
      financeSnapshot,
    };
  }, [clientes, equipamentos, financasConfig, saldos, transacoes]);

  return data;
}

function FinanceDashboard() {
  const data = useFinanceData();
  const [configOpen, setConfigOpen] = useState(false);
  const { receitaBruta, financasConfig, saldos, setSaldos } = data;

  const saveConfig = () => {
    const normalized = normalizeDistributionConfig(data.financasConfig);
    data.setFinancasConfig(normalized);
    localStorage.setItem(FINANCE_STORAGE_KEYS.config, JSON.stringify(normalized));
    window.dispatchEvent(new Event('sf_storage_update'));
    setConfigOpen(false);
  };

  useEffect(() => {
    if (receitaBruta <= 0) return;
    const currentMonth = monthKey(new Date());
    const ledger = JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.distributionLedger) || '{}');
    const alreadyDistributed = Number(ledger[currentMonth] || 0);
    const delta = receitaBruta - alreadyDistributed;
    if (delta <= 0.01) return;

    const config = normalizeDistributionConfig(financasConfig);
    const distribution = {
      salario: delta * (config.salario / 100),
      empresa: delta * (config.empresa / 100),
      reserva: delta * (config.reserva / 100),
    };
    const nextBalances = {
      salario: Number(saldos.salario || 0) + distribution.salario,
      empresa: Number(saldos.empresa || 0) + distribution.empresa,
      reserva: Number(saldos.reserva || 0) + distribution.reserva,
    };
    const transactions = JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.transactions) || '[]');

    ledger[currentMonth] = alreadyDistributed + delta;
    localStorage.setItem(FINANCE_STORAGE_KEYS.distributionLedger, JSON.stringify(ledger));
    localStorage.setItem(FINANCE_STORAGE_KEYS.balances, JSON.stringify(nextBalances));
    localStorage.setItem(
      FINANCE_STORAGE_KEYS.transactions,
      JSON.stringify([
        ...transactions,
        {
          id: `regra-tres-${Date.now()}`,
          descricao: 'Regra dos Três',
          valor: delta,
          tipo: 'distribuicao',
          tipoGeral: 'Movimentacao Interna',
          detalhes: distribution,
          data: new Date().toISOString().slice(0, 10),
        },
      ]),
    );
    setSaldos(nextBalances);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('sf_storage_update'));
  }, [receitaBruta, financasConfig, saldos, setSaldos]);

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="Painel Financeiro"
        subtitle="Receita, lucro real, custo operacional, vencimentos e caixa em um único lugar."
        action={
          <button className="sf-secondary-button" onClick={() => setConfigOpen(true)}>
            <Settings size={16} /> Distribuição
          </button>
        }
      />

      <div className="sf-metric-grid">
        <Metric icon={ArrowUpCircle} label="Receita do mês" value={data.receitaBruta} tone="positive" />
        <Metric icon={PiggyBank} label="Lucro do mês" value={data.lucroReal} tone={data.lucroReal >= 0 ? 'positive' : 'negative'} />
        <Metric icon={Wallet} label="Saldo disponível" value={data.saldos.salario + data.saldos.empresa + data.saldos.reserva} tone="positive" />
        <Metric icon={PiggyBank} label="Fundo acumulado" value={data.saldos.reserva} />
        <Metric icon={BriefcaseBusiness} label="Dinheiro da empresa" value={data.saldos.empresa} />
        <Metric icon={CircleDollarSign} label="Salário disponível" value={data.saldos.salario} />
        <Metric icon={Receipt} label="Despesas fixas" value={data.despesasFixas} tone="warning" />
        <Metric icon={ArrowDownCircle} label="Despesas variáveis" value={data.despesasVariaveis} tone="negative" />
        <Metric icon={Package} label="Investimento em equipamentos" value={data.investimentoEquipamentosMes} />
        <Metric icon={Wallet} label="Fluxo de caixa" value={data.fluxoCaixa} tone={data.fluxoCaixa >= 0 ? 'positive' : 'negative'} />
        <Metric icon={LineChart} label="Previsão financeira" value={data.financeSnapshot.forecast} tone={data.financeSnapshot.forecast >= 0 ? 'positive' : 'negative'} />
        <Metric icon={CalendarClock} label="Contas a pagar" value={data.contasAPagar} tone="warning" />
        <Metric icon={CircleDollarSign} label="Contas a receber" value={data.contasAReceber} />
      </div>

      <div className="sf-panel-grid">
        <div className="sf-card tall">
          <h3>Regra dos Três</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Salário', value: data.financeSnapshot.distribution.salario, color: '#10b981' },
                  { name: 'Reserva', value: data.financeSnapshot.distribution.reserva, color: '#c5a059' },
                  { name: 'Empresa', value: data.financeSnapshot.distribution.empresa, color: '#2563eb' },
                ]}
                dataKey="value"
                innerRadius={58}
                outerRadius={82}
                paddingAngle={4}
                stroke="none"
              >
                {[
                  { name: 'Salário', color: '#10b981' },
                  { name: 'Reserva', color: '#c5a059' },
                  { name: 'Empresa', color: '#2563eb' }
                ].map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="formula-row"><span>Salário</span><strong>{data.financeSnapshot.distribution.salario.toFixed(1)}%</strong></div>
          <div className="formula-row"><span>Fundo de reserva</span><strong>{data.financeSnapshot.distribution.reserva.toFixed(1)}%</strong></div>
          <div className="formula-row"><span>Caixa da empresa</span><strong>{data.financeSnapshot.distribution.empresa.toFixed(1)}%</strong></div>
        </div>

        <div className="sf-card tall">
          <h3>Fluxo e previsão</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={[
                { name: 'Receita', valor: data.receitaBruta },
                { name: 'Fluxo', valor: data.fluxoCaixa },
                { name: 'Lucro', valor: data.lucroReal },
                { name: 'Previsão', valor: data.financeSnapshot.forecast },
              ]}
              margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
            >
              <XAxis dataKey="name" stroke="#A1A1AA" tickLine={false} axisLine={false} />
              <YAxis stroke="#A1A1AA" tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }} />
              <Bar dataKey="valor" fill="#c5a059" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="sf-card tall">
          <h3>Custo operacional</h3>
          <div className="formula-row"><span>Custo fixo mensal</span><strong>{formatCurrency(data.despesasFixas)}</strong></div>
          <div className="formula-row"><span>Média variável</span><strong>{formatCurrency(data.mediaVariavel)}</strong></div>
          <div className="formula-row"><span>Depreciação mensal</span><strong>{formatCurrency(data.depreciacaoMensal)}</strong></div>
          <div className="formula-total"><span>Total</span><strong>{formatCurrency(data.custoOperacional)}</strong></div>
        </div>

        <div className="sf-card tall">
          <h3>Lucro real</h3>
          <div className="formula-row positive"><span>Receita bruta</span><strong>{formatCurrency(data.receitaBruta)}</strong></div>
          <div className="formula-row"><span>Custos fixos</span><strong>-{formatCurrency(data.despesasFixas)}</strong></div>
          <div className="formula-row"><span>Custos variáveis</span><strong>-{formatCurrency(data.despesasVariaveis)}</strong></div>
          <div className="formula-row"><span>Depreciação</span><strong>-{formatCurrency(data.depreciacaoMensal)}</strong></div>
          <div className="formula-total"><span>Lucro real</span><strong>{formatCurrency(data.lucroReal)}</strong></div>
          <p className="sf-muted">Margem de lucro: {data.margemLucro.toFixed(1)}%</p>
        </div>

        <div className="sf-card tall">
          <h3>Próximos vencimentos</h3>
          {data.proximosVencimentos.length === 0 && <p className="sf-muted">Nenhum vencimento pendente.</p>}
          {data.proximosVencimentos.map((item) => (
            <div className="compact-row" key={item.id}>
              <span>{item.descricao}</span>
              <strong>{getTransactionDate(item)}</strong>
            </div>
          ))}
          <div className="formula-total soft">
            <span>Maior categoria</span>
            <strong>{data.maiorCategoria ? `${data.maiorCategoria[0]} (${formatCurrency(data.maiorCategoria[1])})` : 'Sem dados'}</strong>
          </div>
        </div>
      </div>

      <Modal isOpen={configOpen} onClose={() => setConfigOpen(false)} title="Configurar distribuição">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {['salario', 'empresa', 'reserva'].map((key) => (
            <label key={key} style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'capitalize' }}>
              {key === 'salario' ? 'Salário' : key === 'empresa' ? 'Empresa' : 'Reserva'} (%)
              <input
                type="number"
                value={data.financasConfig[key]}
                onChange={(event) => data.setFinancasConfig({ ...data.financasConfig, [key]: Number(event.target.value) })}
                style={{ width: '100%', marginTop: '6px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: '#fff' }}
              />
            </label>
          ))}
          <button className="sf-primary-button wide" onClick={saveConfig}>Salvar configuração</button>
        </div>
      </Modal>
    </div>
  );
}

function Receitas() {
  const { clientes, receitaBruta, contasAReceber, inadimplente } = useFinanceData();
  
  const linhas = useMemo(() => {
    return clientes.flatMap((client) =>
      (client.pagamentos || []).map((payment, index) => ({
        id: `receita-${client.projectId || client.id || 'cli'}-${index}`,
        cliente: client.nome || 'Cliente',
        data: payment.data || '-',
        valor: parseCurrency(payment.valor),
        evento: client.tipo || '-',
      }))
    );
  }, [clientes]);

  return (
    <div className="sf-finance-section">
      <SectionHeader title="Receitas" subtitle="Entradas vindas dos pagamentos de clientes e contas a receber." />
      <div className="sf-metric-grid">
        <Metric icon={ArrowUpCircle} label="Receita bruta do mês" value={receitaBruta} tone="positive" />
        <Metric icon={CircleDollarSign} label="Contas a receber" value={contasAReceber} />
        <Metric icon={CalendarClock} label="Recebimentos atrasados" value={inadimplente} tone="negative" />
      </div>
      <SimpleTable
        columns={['Cliente', 'Evento', 'Data', 'Valor']}
        rows={linhas}
        render={(row) => [row.cliente, row.evento, row.data, formatCurrency(row.valor)]}
        empty="Nenhuma receita registrada em clientes."
      />
    </div>
  );
}

function Investimentos() {
  const { equipamentos } = useFinanceData();
  const totalInvestido = useMemo(() => equipamentos.reduce((sum, item) => sum + Number(item.valorCompra ?? item.valor ?? 0), 0), [equipamentos]);
  const depreciacaoMensal = useMemo(() => getEquipmentMonthlyDepreciation(equipamentos), [equipamentos]);
  const valorAtual = useMemo(() => equipamentos.reduce((sum, item) => sum + calculateDepreciation(item).currentBookValue, 0), [equipamentos]);

  return (
    <div className="sf-finance-section">
      <SectionHeader title="Investimentos em Equipamentos" subtitle="Patrimônio, valor de compra, depreciação e valor contábil atual." />
      <div className="sf-metric-grid">
        <Metric icon={Package} label="Total investido" value={totalInvestido} />
        <Metric icon={LineChart} label="Depreciação mensal" value={depreciacaoMensal} tone="warning" />
        <Metric icon={BriefcaseBusiness} label="Valor atual estimado" value={valorAtual} tone="positive" />
      </div>
      <SimpleTable
        columns={['Equipamento', 'Compra', 'Depreciação mensal', 'Valor atual']}
        rows={equipamentos}
        render={(item) => {
          const depreciation = calculateDepreciation(item);
          return [
            item.nome,
            formatCurrency(depreciation.purchaseValue),
            formatCurrency(depreciation.monthlyDepreciation),
            formatCurrency(depreciation.currentBookValue),
          ];
        }}
        empty="Nenhum equipamento cadastrado ainda."
      />
    </div>
  );
}

function RelatoriosFinanceiros() {
  const { transacoes, equipamentos } = useFinanceData();
  
  const reports = useMemo(() => {
    const expenses = transacoes.filter(isExpense);
    return {
      Mensal: groupBySum(expenses, (item) => monthKey(getTransactionDate(item))),
      Categoria: groupBySum(expenses, (item) => item.categoria),
      Evento: groupBySum(expenses, (item) => item.eventoRelacionado),
      Fornecedor: groupBySum(expenses, (item) => item.fornecedor),
      Equipamento: groupBySum(equipamentos, (item) => item.nome, (item) => Number(item.valorCompra ?? item.valor ?? 0)),
    };
  }, [transacoes, equipamentos]);

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="Relatórios"
        subtitle="Bases preparadas para exportação futura em PDF e Excel."
        action={<span className="sf-export-chip">PDF / Excel em breve</span>}
      />
      <div className="sf-report-grid">
        {Object.entries(reports).map(([title, data]) => (
          <ReportBlock key={title} title={title} data={data} />
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="sf-section-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone = 'neutral' }) {
  return (
    <div className={`sf-card metric ${tone}`}>
      <div className="metric-label">
        <Icon size={18} /> {label}
      </div>
      <strong>{formatCurrency(value)}</strong>
    </div>
  );
}

function SimpleTable({ columns, rows, render, empty }) {
  return (
    <div className="sf-table-card">
      <table className="sf-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {render(row).map((cell, index) => <td key={`${row.id}-${index}`}>{cell}</td>)}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="empty">{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReportBlock({ title, data }) {
  const entries = useMemo(() => Object.entries(data).filter(([, value]) => value > 0).slice(0, 8), [data]);
  
  return (
    <div className="sf-card report">
      <h3>{title}</h3>
      {entries.length === 0 && <p>Nenhum dado para exibir.</p>}
      {entries.map(([label, value]) => (
        <div className="report-row" key={label}>
          <span>{label}</span>
          <strong>{formatCurrency(value)}</strong>
        </div>
      ))}
    </div>
  );
}