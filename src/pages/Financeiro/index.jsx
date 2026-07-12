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
  Plus,
  Trash2,
  Edit2,
  PackagePlus,
  Undo2,
  XCircle,
  Tag,
  CreditCard,
} from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Modal from '../../components/Modal';
import { getDbStudioData, subscribeDbUpdates } from '../../utils/dbData';
import { isSupabaseConfigured, supabase } from '../../utils/supabase';
import { readStorage, writeStorage, STORAGE_KEYS, createId } from '../../utils/storage';
import { maskCurrency } from '../../utils/masks';
import Despesas from './Despesas';
import {
  FINANCE_STORAGE_KEYS,
  FIXED_EXPENSE_CATEGORIES,
  VARIABLE_EXPENSE_CATEGORIES,
  AVULSA_INCOME_CATEGORIES,
  PAYMENT_METHODS,
  formatCurrency,
  getTransactionDate,
  deriveFinancialStatus,
  generateRecurrentExpenses,
  getConsolidatedFinances,
  calculateFinancialIndicators,
  parseCurrency,
  getEquipmentMonthlyDepreciation,
  calculateDepreciation,
  getAverageVariableExpenses,
  groupBySum,
  normalizeDistributionConfig,
  loadDistributionConfig,
  saveDistributionConfig,
  monthKey,
  isDistributionConfigValid,
  PAYMENT_DISTRIBUTION_ROW_TYPE,
} from '../../utils/financeEngine';

const tabs = [
  { id: 'dashboard', label: 'Painel', icon: BarChart3 },
  { id: 'receitas', label: 'Receitas', icon: ArrowUpCircle },
  { id: 'fixas', label: 'Despesas Fixas', icon: Receipt },
  { id: 'variaveis', label: 'Despesas Variáveis', icon: ArrowDownCircle },
  { id: 'equipamentos', label: 'Investimentos', icon: Package },
  { id: 'relatorios', label: 'Relatórios', icon: FileSpreadsheet },
];

const inputStyle = {
  width: '100%',
  background: 'var(--bg-main)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-main)',
  padding: '12px',
  borderRadius: '8px',
  fontSize: '0.9rem',
  outline: 'none',
};

const labelStyle = {
  color: 'var(--text-secondary)',
  fontSize: '0.75rem',
  marginBottom: '6px',
  display: 'block',
  fontWeight: '600',
};

function useFinanceData() {
  const [financasConfig, setFinancasConfig] = useState(() =>
    JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.config) || '{"salario": 35, "empresa": 45, "reserva": 20}'),
  );
  
  const [dataState, setDataState] = useState({
    transacoes: [],
    equipamentos: [],
    contracts: [],
    clients: [],
    projects: [],
  });

  const loadAll = async () => {
    const config = await loadDistributionConfig();
    setFinancasConfig(config);

    const rawTransactions = readStorage(STORAGE_KEYS.finances, []);
    const rawRecurrences = readStorage(STORAGE_KEYS.recurrences, []);
    const projects = readStorage(STORAGE_KEYS.projects, []);
    const clients = readStorage(STORAGE_KEYS.clients, []);
    const contracts = readStorage(STORAGE_KEYS.contracts, []);
    const equipment = readStorage(STORAGE_KEYS.equipment, []);

    // Geração idempotente de competências recorrentes
    const newRecurrents = generateRecurrentExpenses(rawRecurrences, rawTransactions, new Date());
    let currentTransactions = rawTransactions;
    if (newRecurrents.length > 0) {
      currentTransactions = [...rawTransactions, ...newRecurrents];
      writeStorage(STORAGE_KEYS.finances, currentTransactions);
      
      if (isSupabaseConfigured) {
        try {
          const toDbPayload = (expense) => ({
            id: String(expense.id),
            project_id: expense.trabalhoId || null,
            descricao: expense.descricao,
            nome: expense.descricao,
            categoria: expense.categoria,
            valor: expense.valor,
            data: expense.vencimento,
            data_vencimento: expense.vencimento,
            tipo: expense.tipo,
            tipo_geral: expense.tipoGeral,
            status: expense.status,
            forma_pagamento: expense.formaPagamento,
            conta_origem: expense.contaOrigem,
            fornecedor: expense.fornecedor,
            observacoes: expense.observacoes,
            recurrence_id: expense.recorrenciaId || null,
            recorrente: true,
            updated_at: new Date().toISOString(),
          });
          void supabase.from('financas').upsert(newRecurrents.map(toDbPayload));
        } catch (e) {
          console.error(e);
        }
      }
    }

    setDataState({
      transacoes: currentTransactions,
      equipamentos: equipment,
      contracts,
      clients,
      projects,
    });
  };

  useEffect(() => {
    loadAll();
    window.addEventListener('focus', loadAll);
    const unsubscribe = subscribeDbUpdates(loadAll);
    return () => {
      window.removeEventListener('focus', loadAll);
      unsubscribe();
    };
  }, []);

  const computed = useMemo(() => {
    const { transacoes, equipamentos, contracts, clients, projects } = dataState;
    const now = new Date();
    const currentMonth = monthKey(now);

    const consolidated = getConsolidatedFinances({ contracts, transactions: transacoes, clients });
    const indicators = calculateFinancialIndicators({
      receitasContratuais: consolidated.receitasContratuais,
      receitasAvulsas: consolidated.receitasAvulsas,
      despesas: consolidated.despesas,
      referenceDate: now,
    });

    const localSaldos = { salario: 0, empresa: 0, reserva: 0 };
    
    consolidated.todasReceitas.forEach((r) => {
      const statusDerivado = deriveFinancialStatus(r);
      if (statusDerivado === 'recebida') {
        const dest = r.contaOrigem || 'empresa';
        if (dest in localSaldos) localSaldos[dest] += r.valor || 0;
      }
    });

    consolidated.despesas.forEach((d) => {
      const statusDerivado = deriveFinancialStatus(d);
      if (statusDerivado === 'paga') {
        const origin = d.contaOrigem || 'empresa';
        if (origin in localSaldos) localSaldos[origin] -= d.valor || 0;
      }
    });

    const saldos = {
      salario: Math.round(localSaldos.salario * 100) / 100,
      empresa: Math.round(localSaldos.empresa * 100) / 100,
      reserva: Math.round(localSaldos.reserva * 100) / 100,
    };

    localStorage.setItem(FINANCE_STORAGE_KEYS.balances, JSON.stringify(saldos));

    const despesasFixas = consolidated.despesas
      .filter((d) => d.tipo === 'fixa' && d.vencimento && d.vencimento.slice(0, 7) === currentMonth)
      .reduce((sum, d) => sum + (d.valor || 0), 0);
    const despesasVariaveis = consolidated.despesas
      .filter((d) => d.tipo === 'variavel' && d.vencimento && d.vencimento.slice(0, 7) === currentMonth)
      .reduce((sum, d) => sum + (d.valor || 0), 0);

    const depreciacaoMensal = getEquipmentMonthlyDepreciation(equipamentos);
    const mediaVariavel = getAverageVariableExpenses(transacoes);
    const custoOperacional = despesasFixas + mediaVariavel + depreciacaoMensal;

    const receitaBruta = indicators.receitasRecebidasMes;
    
    const despesasPagasNoMes = consolidated.despesas
      .filter((d) => {
        const statusDerivado = deriveFinancialStatus(d);
        return statusDerivado === 'paga' && d.dataPagamento && d.dataPagamento.slice(0, 7) === currentMonth;
      })
      .reduce((sum, d) => sum + (d.valor || 0), 0);

    const lucroReal = receitaBruta - despesasPagasNoMes - depreciacaoMensal;
    const margemLucro = receitaBruta > 0 ? (lucroReal / receitaBruta) * 100 : 0;
    const fluxoCaixa = receitaBruta - despesasPagasNoMes;

    const proximosVencimentos = consolidated.despesas
      .filter((d) => {
        const statusDerivado = deriveFinancialStatus(d);
        return statusDerivado !== 'paga' && statusDerivado !== 'cancelada';
      })
      .sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento))
      .slice(0, 5);

    const despesasMes = consolidated.despesas
      .filter((d) => d.vencimento && d.vencimento.slice(0, 7) === currentMonth && d.status !== 'cancelada');
    const despesasPorCategoria = groupBySum(despesasMes, (item) => item.categoria);
    const maiorCategoria = Object.entries(despesasPorCategoria).sort((a, b) => b[1] - a[1])[0];

    const totalDespesas = consolidated.despesas
      .filter((d) => deriveFinancialStatus(d) === 'paga')
      .reduce((sum, d) => sum + (d.valor || 0), 0);

    const totalRecebidoHistorico = consolidated.todasReceitas
      .filter((r) => deriveFinancialStatus(r) === 'recebida')
      .reduce((sum, r) => sum + (r.valor || 0), 0);

    const resultadoLiquido = totalRecebidoHistorico - totalDespesas;

    const financeSnapshot = {
      forecast: fluxoCaixa + indicators.totalAReceber,
      distribution: normalizeDistributionConfig(financasConfig),
    };

    return {
      saldos,
      transacoes,
      equipamentos,
      financasConfig,
      setFinancasConfig,
      receitaBruta,
      receitaContratada: indicators.receitasPrevistasMes,
      receitaRecebida: totalRecebidoHistorico,
      contasAReceber: indicators.totalAReceber,
      inadimplente: indicators.receitasVencidas,
      despesasFixas,
      despesasVariaveis,
      totalDespesas,
      resultadoLiquido,
      depreciacaoMensal,
      mediaVariavel,
      custoOperacional,
      lucroReal,
      margemLucro,
      fluxoCaixa,
      contasAPagar: indicators.totalAPagar,
      proximosVencimentos,
      maiorCategoria,
      financeSnapshot,
      consolidated,
      projects,
      clients,
      loadAll,
    };
  }, [dataState, financasConfig]);

  return computed;
}

export default function Financeiro() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const financeData = useFinanceData();

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

      {activeTab === 'dashboard' && <FinanceDashboard data={financeData} />}
      {activeTab === 'receitas' && <Receitas data={financeData} />}
      {activeTab === 'fixas' && <Despesas area="fixa" />}
      {activeTab === 'variaveis' && <Despesas area="variavel" />}
      {activeTab === 'equipamentos' && <Investimentos data={financeData} />}
      {activeTab === 'relatorios' && <RelatoriosFinanceiros data={financeData} />}
    </div>
  );
}

function FinanceDashboard({ data }) {
  const [configOpen, setConfigOpen] = useState(false);
  const [configError, setConfigError] = useState('');

  const saveConfig = async () => {
    if (!isDistributionConfigValid(data.financasConfig)) {
      setConfigError('A soma dos percentuais deve ser exatamente 100%.');
      return;
    }
    try {
      const saved = await saveDistributionConfig(data.financasConfig);
      data.setFinancasConfig(saved);
      window.dispatchEvent(new Event('sf_storage_update'));
      setConfigError('');
      setConfigOpen(false);
    } catch (error) {
      setConfigError(error.message);
    }
  };

  const accountRows = [
    { id: 'reserva', destino: 'Fundo / Reserva', entradas: 0, saidas: 0, saldo: data.saldos.reserva },
    { id: 'empresa', destino: 'Caixa da empresa', entradas: 0, saidas: 0, saldo: data.saldos.empresa },
    { id: 'salario', destino: 'Salários', entradas: 0, saidas: 0, saldo: data.saldos.salario },
  ];

  const movementRows = useMemo(() => {
    const list = [];
    data.consolidated.todasReceitas.forEach((r) => {
      const statusDerivado = deriveFinancialStatus(r);
      if (statusDerivado === 'recebida') {
        list.push({
          id: r.id,
          destino: r.contaOrigem || 'empresa',
          natureza: 'Entrada',
          origem: r.descricao,
          cliente: r.clienteNome || '-',
          valor: r.valor,
        });
      }
    });

    data.consolidated.despesas.forEach((d) => {
      const statusDerivado = deriveFinancialStatus(d);
      if (statusDerivado === 'paga') {
        list.push({
          id: d.id,
          destino: d.contaOrigem || 'empresa',
          natureza: 'Saída',
          origem: d.descricao,
          cliente: '-',
          valor: d.valor,
        });
      }
    });

    return list.slice(0, 10);
  }, [data.consolidated]);

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
        <Metric icon={BriefcaseBusiness} label="Receita prevista no mês" value={data.receitaContratada} />
        <Metric icon={ArrowUpCircle} label="Receita recebida no mês" value={data.receitaBruta} tone="positive" />
        <Metric icon={CircleDollarSign} label="Contas a receber (total)" value={data.contasAReceber} />
        <Metric icon={ArrowDownCircle} label="Total de despesas (histórico)" value={data.totalDespesas} tone="negative" />
        <Metric icon={PiggyBank} label="Fundo acumulado" value={data.saldos.reserva} />
        <Metric icon={BriefcaseBusiness} label="Caixa da empresa" value={data.saldos.empresa} />
        <Metric icon={CircleDollarSign} label="Salários acumulados" value={data.saldos.salario} />
        <Metric icon={Wallet} label="Resultado líquido" value={data.resultadoLiquido} tone={data.resultadoLiquido >= 0 ? 'positive' : 'negative'} />
      </div>

      <SimpleTable
        columns={['Destino', 'Saldo atual']}
        rows={accountRows}
        render={(row) => [row.destino, formatCurrency(row.saldo)]}
        empty="Nenhuma conta financeira ativa."
      />

      <SimpleTable
        columns={['Destino', 'Movimento', 'Origem', 'Cliente', 'Valor']}
        rows={movementRows}
        render={(row) => [
          row.destino,
          row.natureza,
          row.origem,
          row.cliente,
          formatCurrency(row.valor),
        ]}
        empty="Nenhuma entrada ou saída distribuída."
      />

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
                { name: 'Prevista', valor: data.receitaContratada },
                { name: 'Recebida', valor: data.receitaBruta },
                { name: 'Despesas', valor: data.despesasFixas + data.despesasVariaveis },
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
              <strong>{item.vencimento}</strong>
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
          <div className="formula-row">
            <span>Total</span>
            <strong>{['salario', 'empresa', 'reserva'].reduce((sum, key) => sum + Number(data.financasConfig[key] || 0), 0).toFixed(1)}%</strong>
          </div>
          {configError && <p className="sf-muted" style={{ color: 'var(--color-danger)', margin: 0 }}>{configError}</p>}
          <button className="sf-primary-button wide" onClick={() => void saveConfig()}>Salvar configuração</button>
        </div>
      </Modal>
    </div>
  );
}

const emptyAvulsaForm = {
  id: null,
  descricao: '',
  categoria: 'Serviço adicional',
  valor: '',
  vencimento: '',
  dataRecebimento: '',
  status: 'prevista',
  clienteId: '',
  trabalhoId: '',
  formaPagamento: 'Pix',
  observacoes: '',
  contaOrigem: 'empresa',
};

function Receitas({ data }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyAvulsaForm);

  const list = useMemo(() => {
    return data.consolidated.todasReceitas.map((r) => ({
      ...r,
      statusDerivado: deriveFinancialStatus(r),
    }));
  }, [data.consolidated]);

  const totalMensalPrevisto = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return list
      .filter((r) => r.statusDerivado !== 'cancelada' && r.vencimento && r.vencimento.slice(0, 7) === currentMonth)
      .reduce((sum, r) => sum + (r.valor || 0), 0);
  }, [list]);

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({
      ...emptyAvulsaForm,
      vencimento: new Date().toISOString().slice(0, 10),
    });
    setModalOpen(true);
  };

  const openEditModal = (r) => {
    if (r.tipo === 'receita_contrato') {
      alert('Receita contratual não pode ser alterada pela área financeira. Use a aba de Documentos/Contratos.');
      return;
    }
    setEditingId(r.id);
    const valStr = String(Math.round((r.valor || 0) * 100));
    setFormData({
      ...emptyAvulsaForm,
      ...r,
      valor: maskCurrency(valStr),
      vencimento: r.vencimento || '',
      dataRecebimento: r.dataRecebimento || '',
    });
    setModalOpen(true);
  };

  const saveReceita = () => {
    const val = parseCurrency(formData.valor);
    if (!formData.descricao || String(formData.descricao).trim() === '') {
      alert('Descrição obrigatória.');
      return;
    }
    if (val <= 0) {
      alert('Valor válido e não negativo obrigatório.');
      return;
    }
    if (!formData.vencimento) {
      alert('Vencimento válido obrigatório.');
      return;
    }

    const baseReceita = {
      id: editingId || `receita-avulsa-${Date.now()}`,
      descricao: formData.descricao,
      categoria: formData.categoria || 'Serviço adicional',
      valor: val,
      vencimento: formData.vencimento,
      dataRecebimento: formData.status === 'recebida' ? formData.dataRecebimento || formData.vencimento : '',
      status: formData.status || 'prevista',
      clienteId: formData.clienteId || '',
      trabalhoId: formData.trabalhoId || '',
      formaPagamento: formData.formaPagamento || 'Pix',
      observacoes: formData.observacoes || '',
      tipo: 'receita_avulsa',
      tipoGeral: 'Entrada',
      contaOrigem: formData.contaOrigem || 'empresa',
      criadoEm: formData.criadoEm || new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };

    const transactions = readStorage(STORAGE_KEYS.finances, []);
    let nextTransactions;
    if (editingId) {
      nextTransactions = transactions.map((t) => String(t.id) === String(editingId) ? baseReceita : t);
    } else {
      nextTransactions = [baseReceita, ...transactions];
    }

    writeStorage(STORAGE_KEYS.finances, nextTransactions);

    if (isSupabaseConfigured) {
      try {
        const toDbPayload = (r) => ({
          id: String(r.id),
          project_id: r.trabalhoId || null,
          cliente_id: r.clienteId || null,
          descricao: r.descricao,
          nome: r.descricao,
          categoria: r.categoria,
          valor: r.valor,
          data: r.vencimento,
          data_vencimento: r.vencimento,
          tipo: r.tipo,
          tipo_geral: r.tipoGeral,
          status: r.status,
          forma_pagamento: r.formaPagamento,
          conta_origem: r.contaOrigem,
          observacoes: r.observacoes,
          updated_at: new Date().toISOString(),
        });
        void supabase.from('financas').upsert([toDbPayload(baseReceita)]);
      } catch (e) {
        console.error(e);
      }
    }

    setModalOpen(false);
    data.loadAll();
  };

  const removeReceita = async (r) => {
    if (r.tipo === 'receita_contrato') {
      alert('Receita contratual não pode ser excluída pela área financeira. Use o Contrato de origem.');
      return;
    }
    if (r.statusDerivado === 'recebida') {
      alert('Receitas recebidas devem ser revertidas ou canceladas antes da exclusão.');
      return;
    }
    const confirmed = window.confirm('Deseja excluir esta receita avulsa?');
    if (!confirmed) return;

    const transactions = readStorage(STORAGE_KEYS.finances, []);
    const nextTransactions = transactions.filter((t) => String(t.id) !== String(r.id));
    writeStorage(STORAGE_KEYS.finances, nextTransactions);

    if (isSupabaseConfigured) {
      try {
        await supabase.from('financas').delete().eq('id', String(r.id));
      } catch (e) {
        console.error(e);
      }
    }

    data.loadAll();
  };

  const receiveIncome = async (r) => {
    if (r.tipo === 'receita_contrato') {
      alert('Para receber parcelas de contratos, utilize a aba de Documentos/Contratos.');
      return;
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    const transactions = readStorage(STORAGE_KEYS.finances, []);
    const nextTransactions = transactions.map((t) => {
      if (String(t.id) === String(r.id)) {
        return {
          ...t,
          status: 'recebida',
          dataRecebimento: todayStr,
          atualizadoEm: new Date().toISOString(),
        };
      }
      return t;
    });
    writeStorage(STORAGE_KEYS.finances, nextTransactions);

    if (isSupabaseConfigured) {
      try {
        await supabase.from('financas').update({
          status: 'recebida',
          data: todayStr,
          updated_at: new Date().toISOString(),
        }).eq('id', String(r.id));
      } catch (e) {
        console.error(e);
      }
    }

    data.loadAll();
  };

  const reverseIncome = async (r) => {
    if (r.tipo === 'receita_contrato') {
      alert('Receita contratual deve ser revertida no Contrato de origem.');
      return;
    }
    const transactions = readStorage(STORAGE_KEYS.finances, []);
    const nextTransactions = transactions.map((t) => {
      if (String(t.id) === String(r.id)) {
        return {
          ...t,
          status: 'prevista',
          dataRecebimento: '',
          atualizadoEm: new Date().toISOString(),
        };
      }
      return t;
    });
    writeStorage(STORAGE_KEYS.finances, nextTransactions);

    if (isSupabaseConfigured) {
      try {
        await supabase.from('financas').update({
          status: 'prevista',
          data_pagamento: null,
          updated_at: new Date().toISOString(),
        }).eq('id', String(r.id));
      } catch (e) {
        console.error(e);
      }
    }

    data.loadAll();
  };

  const cancelIncome = async (r) => {
    if (r.tipo === 'receita_contrato') {
      alert('Receitas de contratos devem ser canceladas no Contrato de origem.');
      return;
    }
    const transactions = readStorage(STORAGE_KEYS.finances, []);
    const nextTransactions = transactions.map((t) => {
      if (String(t.id) === String(r.id)) {
        return {
          ...t,
          status: 'cancelada',
          atualizadoEm: new Date().toISOString(),
        };
      }
      return t;
    });
    writeStorage(STORAGE_KEYS.finances, nextTransactions);

    if (isSupabaseConfigured) {
      try {
        await supabase.from('financas').update({
          status: 'cancelada',
          updated_at: new Date().toISOString(),
        }).eq('id', String(r.id));
      } catch (e) {
        console.error(e);
      }
    }

    data.loadAll();
  };

  return (
    <div className="sf-finance-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <SectionHeader title="Receitas" subtitle="Acompanhe entradas contratuais e gerencie suas receitas avulsas." />
        <button className="sf-primary-button" onClick={openCreateModal}>
          <Plus size={18} /> Nova receita avulsa
        </button>
      </div>

      <div className="sf-metric-grid">
        <Metric icon={ArrowUpCircle} label="Faturamento no mês" value={data.receitaBruta} tone="positive" />
        <Metric icon={CircleDollarSign} label="Previsto no mês" value={totalMensalPrevisto} />
        <Metric icon={CalendarClock} label="Recebimentos vencidos" value={data.inadimplente} tone="negative" />
      </div>

      <SimpleTable
        columns={['Descrição / Categoria', 'Tipo', 'Cliente', 'Vencimento', 'Status', 'Valor', 'Ações']}
        rows={list}
        render={(row) => [
          <div>
            <strong>{row.descricao}</strong>
            <small style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '3px' }}>
              <Tag size={10} /> {row.categoria || 'Geral'}
            </small>
          </div>,
          <span className="sf-pill">{row.tipo === 'receita_contrato' ? 'Contratual' : 'Avulsa'}</span>,
          row.clienteNome || '-',
          row.vencimento || '-',
          <span className={`sf-status ${row.statusDerivado.toLowerCase()}`}>{row.statusDerivado}</span>,
          <strong style={{ color: 'var(--color-success)' }}>{formatCurrency(row.valor)}</strong>,
          <div className="sf-actions">
            {row.tipo !== 'receita_contrato' && row.statusDerivado !== 'recebida' && row.statusDerivado !== 'cancelada' && (
              <button title="Dar recebimento" onClick={() => receiveIncome(row)}>
                <PackagePlus size={17} />
              </button>
            )}
            {row.tipo !== 'receita_contrato' && row.statusDerivado === 'recebida' && (
              <button title="Reverter recebimento" onClick={() => reverseIncome(row)}>
                <Undo2 size={17} style={{ color: 'var(--color-highlight)' }} />
              </button>
            )}
            {row.tipo !== 'receita_contrato' && row.statusDerivado !== 'cancelada' && row.statusDerivado !== 'recebida' && (
              <button title="Cancelar receita" onClick={() => cancelIncome(row)}>
                <XCircle size={17} style={{ color: 'var(--color-warning)' }} />
              </button>
            )}
            <button title="Editar" onClick={() => openEditModal(row)} disabled={row.tipo === 'receita_contrato'}>
              <Edit2 size={17} />
            </button>
            <button title="Excluir" onClick={() => removeReceita(row)} disabled={row.tipo === 'receita_contrato'}>
              <Trash2 size={17} />
            </button>
          </div>
        ]}
        empty="Nenhuma receita registrada."
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={`${editingId ? 'Editar' : 'Nova'} Receita Avulsa`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <label style={{ ...labelStyle, color: 'var(--text-main)' }}>Para qual saldo destinar?</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {['empresa', 'salario', 'reserva'].map((account) => (
                <button
                  key={account}
                  type="button"
                  onClick={() => setFormData({ ...formData, contaOrigem: account })}
                  className={formData.contaOrigem === account ? 'sf-account active' : 'sf-account'}
                >
                  <strong>{account}</strong>
                  <span>{formatCurrency(data.saldos[account] || 0)}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <Field label="Descrição">
              <input
                style={inputStyle}
                value={formData.descricao}
                onChange={(event) => setFormData({ ...formData, descricao: event.target.value })}
              />
            </Field>
            <Field label="Valor">
              <input
                style={{ ...inputStyle, color: 'var(--color-success)', fontWeight: 700 }}
                value={formData.valor}
                onChange={(event) => setFormData({ ...formData, valor: maskCurrency(event.target.value) })}
                placeholder="R$ 0,00"
              />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Categoria">
              <select style={inputStyle} value={formData.categoria} onChange={(event) => setFormData({ ...formData, categoria: event.target.value })}>
                {AVULSA_INCOME_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Data de vencimento">
              <input
                type="date"
                style={inputStyle}
                value={formData.vencimento}
                onChange={(event) => setFormData({ ...formData, vencimento: event.target.value })}
              />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Status">
              <select style={inputStyle} value={formData.status} onChange={(event) => setFormData({ ...formData, status: event.target.value })}>
                <option value="prevista">Prevista</option>
                <option value="pendente">Pendente</option>
                <option value="recebida">Recebida</option>
              </select>
            </Field>
            <Field label="Forma de pagamento">
              <select style={inputStyle} value={formData.formaPagamento} onChange={(event) => setFormData({ ...formData, formaPagamento: event.target.value })}>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Cliente vinculado">
              <select style={inputStyle} value={formData.clienteId} onChange={(event) => setFormData({ ...formData, clienteId: event.target.value })}>
                <option value="">Nenhum...</option>
                {data.clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.nome}</option>
                ))}
              </select>
            </Field>
            <Field label="Trabalho vinculado">
              <select style={inputStyle} value={formData.trabalhoId} onChange={(event) => setFormData({ ...formData, trabalhoId: event.target.value })}>
                <option value="">Nenhum...</option>
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.clienteNome} - {project.tipoServico}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Observações">
            <textarea
              style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
              value={formData.observacoes}
              onChange={(event) => setFormData({ ...formData, observacoes: event.target.value })}
            />
          </Field>

          <button className="sf-primary-button wide" onClick={saveReceita}>
            Salvar receita
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Investimentos({ data }) {
  const totalInvestido = useMemo(() => data.equipamentos.reduce((sum, item) => sum + Number(item.valorCompra ?? item.valor ?? 0), 0), [data.equipamentos]);
  const depreciacaoMensal = useMemo(() => getEquipmentMonthlyDepreciation(data.equipamentos), [data.equipamentos]);
  const valorAtual = useMemo(() => data.equipamentos.reduce((sum, item) => sum + calculateDepreciation(item).currentBookValue, 0), [data.equipamentos]);

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
        rows={data.equipamentos}
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

function RelatoriosFinanceiros({ data }) {
  const reports = useMemo(() => {
    const expenses = data.consolidated.despesas.filter((d) => d.statusDerivado !== 'cancelada');
    return {
      Mensal: groupBySum(expenses, (item) => monthKey(getTransactionDate(item))),
      Categoria: groupBySum(expenses, (item) => item.categoria),
      Trabalho: groupBySum(expenses, (item) => {
        if (!item.trabalhoId) return 'Despesa Geral';
        const p = data.projects.find((proj) => String(proj.id) === String(item.trabalhoId));
        return p ? `${p.clienteNome} (${p.tipoServico})` : 'Trabalho removido';
      }),
      Fornecedor: groupBySum(expenses, (item) => item.fornecedor),
      Equipamento: groupBySum(data.equipamentos, (item) => item.nome, (item) => Number(item.valorCompra ?? item.valor ?? 0)),
    };
  }, [data.consolidated.despesas, data.projects, data.equipamentos]);

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="Relatórios"
        subtitle="Bases preparadas para exportação futura em PDF e Excel."
        action={<span className="sf-export-chip">PDF / Excel em breve</span>}
      />
      <div className="sf-report-grid">
        {Object.entries(reports).map(([title, dataBlock]) => (
          <ReportBlock key={title} title={title} data={dataBlock} />
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
          {rows.map((row, idx) => (
            <tr key={row.id || `row-${idx}`}>
              {render(row).map((cell, index) => <td key={`${row.id || idx}-${index}`}>{cell}</td>)}
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

function ReportBlock({ title, dataBlock }) {
  const entries = useMemo(() => Object.entries(dataBlock).filter(([, value]) => value > 0).slice(0, 8), [dataBlock]);
  
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

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}
