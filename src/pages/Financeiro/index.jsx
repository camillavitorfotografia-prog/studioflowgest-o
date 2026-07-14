import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowRightLeft,
  BarChart3,
  BellRing,
  BookOpen,
  BriefcaseBusiness,
  Calculator,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  Gauge,
  Landmark,
  LineChart,
  MessageCircle,
  Package,
  PiggyBank,
  Receipt,
  Repeat2,
  Save,
  Scale,
  Search,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  TrendingUp,
  Upload,
  Users,
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
import {
  dateToInput,
  formatDateBR,
  inputToDate,
  inputToMonth,
  maskCurrency,
  maskDate,
  maskMonth,
  monthToInput,
} from '../../utils/masks';
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
  appendFinancialAudit,
  getTransactionCompetence,
  isInternalTransfer,
} from '../../utils/financeEngine';

const tabs = [
  { id: 'dashboard', label: 'Painel', icon: BarChart3 },
  { id: 'receitas', label: 'Receitas', icon: ArrowUpCircle },
  { id: 'fixas', label: 'Despesas Fixas', icon: Receipt },
  { id: 'variaveis', label: 'Despesas Variáveis', icon: ArrowDownCircle },
  { id: 'fluxo', label: 'Fluxo de Caixa', icon: LineChart },
  { id: 'agenda-financeira', label: 'Agenda Financeira', icon: CalendarClock },
  { id: 'simulador', label: 'Simulador', icon: Gauge },
  { id: 'comparativo', label: 'Comparativo', icon: Scale },
  { id: 'planejamento', label: 'Planejamento', icon: Target },
  { id: 'controle', label: 'Controle', icon: SlidersHorizontal },
  { id: 'ferramentas', label: 'Ferramentas', icon: Calculator },
  { id: 'diagnostico', label: 'Diagnóstico', icon: Gauge },
  { id: 'operacoes', label: 'Operações', icon: Landmark },
  { id: 'dre', label: 'DRE', icon: FileSpreadsheet },
  { id: 'inteligencia', label: 'Inteligência', icon: Sparkles },
  { id: 'equipamentos', label: 'Investimentos', icon: Package },
  { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
];

const FINANCE_GOAL_STORAGE_KEY = 'studioflow_finance_monthly_goal';
const FINANCE_BUDGET_STORAGE_KEY = 'studioflow_finance_category_budgets';
const FINANCE_CLOSINGS_STORAGE_KEY = 'studioflow_finance_month_closings';
const FINANCE_TAX_RATE_STORAGE_KEY = 'studioflow_finance_tax_rate';
const FINANCE_RESERVE_MONTHS_STORAGE_KEY = 'studioflow_finance_reserve_months';
const FINANCE_RECONCILIATION_STORAGE_KEY = 'studioflow_finance_reconciliation';
const FINANCE_SERVICE_GOALS_STORAGE_KEY = 'studioflow_finance_service_goals';
const FINANCE_ALERTS_READ_STORAGE_KEY = 'studioflow_finance_alerts_read';
const FINANCE_ANNUAL_GOAL_STORAGE_KEY = 'studioflow_finance_annual_goal';
const FINANCE_SAVINGS_GOALS_STORAGE_KEY = 'studioflow_finance_savings_goals';
const FINANCE_JOURNAL_STORAGE_KEY = 'studioflow_finance_journal';
const FINANCE_ACCOUNTS_STORAGE_KEY = 'studioflow_finance_accounts';
const FINANCE_CARDS_STORAGE_KEY = 'studioflow_finance_cards';
const FINANCE_COMMISSIONS_STORAGE_KEY = 'studioflow_finance_commissions';

const readFinanceAccounts = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(FINANCE_ACCOUNTS_STORAGE_KEY) || '[]',
    );

    if (Array.isArray(saved) && saved.length > 0) {
      return saved;
    }
  } catch {
    // Continua com as contas padrão.
  }

  return [
    {
      id: 'empresa',
      name: 'Caixa da empresa',
      type: 'Empresa',
      initialBalance: 0,
    },
    {
      id: 'reserva',
      name: 'Fundo de reserva',
      type: 'Reserva',
      initialBalance: 0,
    },
    {
      id: 'salario',
      name: 'Salários',
      type: 'Salário',
      initialBalance: 0,
    },
  ];
};

const readFinanceCards = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(FINANCE_CARDS_STORAGE_KEY) || '[]',
    );

    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const readFinanceCommissions = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(FINANCE_COMMISSIONS_STORAGE_KEY) || '[]',
    );

    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const readFinanceJournal = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(FINANCE_JOURNAL_STORAGE_KEY) || '[]',
    );

    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const readAnnualGoal = () => {
  const value = Number(
    localStorage.getItem(FINANCE_ANNUAL_GOAL_STORAGE_KEY) || 360000,
  );

  return Number.isFinite(value) && value > 0 ? value : 360000;
};

const readSavingsGoals = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(FINANCE_SAVINGS_GOALS_STORAGE_KEY) || '[]',
    );

    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const readReconciliationState = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(FINANCE_RECONCILIATION_STORAGE_KEY) || '{}',
    );

    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
};

const readServiceGoals = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(FINANCE_SERVICE_GOALS_STORAGE_KEY) || '{}',
    );

    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
};

const readFinanceAlertsState = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(FINANCE_ALERTS_READ_STORAGE_KEY) || '{}',
    );

    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
};

const readMonthClosings = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(FINANCE_CLOSINGS_STORAGE_KEY) || '{}',
    );

    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
};

const readTaxRate = () => {
  const value = Number(
    localStorage.getItem(FINANCE_TAX_RATE_STORAGE_KEY) || 6,
  );

  return Number.isFinite(value) && value >= 0 ? value : 6;
};

const readReserveMonthsTarget = () => {
  const value = Number(
    localStorage.getItem(FINANCE_RESERVE_MONTHS_STORAGE_KEY) || 3,
  );

  return Number.isFinite(value) && value > 0 ? value : 3;
};

const readCategoryBudgets = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(FINANCE_BUDGET_STORAGE_KEY) || '{}',
    );

    return saved && typeof saved === 'object'
      ? saved
      : {};
  } catch {
    return {};
  }
};

const downloadCsv = (filename, rows = []) => {
  if (!rows.length) {
    alert('Não existem dados para exportar.');
    return;
  }

  const columns = [
    ...new Set(
      rows.flatMap((row) => Object.keys(row)),
    ),
  ];

  const escapeValue = (value) => {
    const normalized = value === null || value === undefined
      ? ''
      : String(value);

    return `"${normalized.replace(/"/g, '""')}"`;
  };

  const csv = [
    columns.map(escapeValue).join(';'),
    ...rows.map((row) => (
      columns
        .map((column) => escapeValue(row[column]))
        .join(';')
    )),
  ].join('\n');

  const blob = new Blob(
    [`\ufeff${csv}`],
    { type: 'text/csv;charset=utf-8;' },
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
};

const readMonthlyGoal = () => {
  const saved = Number(
    localStorage.getItem(FINANCE_GOAL_STORAGE_KEY) || 30000,
  );

  return Number.isFinite(saved) && saved > 0
    ? saved
    : 30000;
};

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

function MoneyInput({
  value,
  onChange,
  style,
  placeholder = 'R$ 0,00',
  ...props
}) {
  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value || ''}
      onChange={(event) => {
        onChange(maskCurrency(event.target.value));
      }}
      placeholder={placeholder}
      style={{
        ...inputStyle,
        ...style,
      }}
    />
  );
}

function DateInput({
  value,
  onChange,
  style,
  placeholder = 'dd/mm/aaaa',
  ...props
}) {
  const [displayValue, setDisplayValue] = useState(
    dateToInput(value),
  );

  useEffect(() => {
    setDisplayValue(dateToInput(value));
  }, [value]);

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={10}
      value={displayValue}
      placeholder={placeholder}
      onChange={(event) => {
        const masked = maskDate(event.target.value);
        setDisplayValue(masked);

        if (!masked) {
          onChange('');
          return;
        }

        const isoDate = inputToDate(masked);

        if (isoDate) {
          onChange(isoDate);
        }
      }}
      onBlur={() => {
        if (displayValue && !inputToDate(displayValue)) {
          setDisplayValue(dateToInput(value));
        }
      }}
      style={{
        ...inputStyle,
        ...style,
      }}
    />
  );
}

function MonthInput({
  value,
  onChange,
  style,
  placeholder = 'mm/aaaa',
  ...props
}) {
  const [displayValue, setDisplayValue] = useState(
    monthToInput(value),
  );

  useEffect(() => {
    setDisplayValue(monthToInput(value));
  }, [value]);

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={7}
      value={displayValue}
      placeholder={placeholder}
      onChange={(event) => {
        const masked = maskMonth(event.target.value);
        setDisplayValue(masked);

        if (!masked) {
          onChange('');
          return;
        }

        const isoMonth = inputToMonth(masked);

        if (isoMonth) {
          onChange(isoMonth);
        }
      }}
      onBlur={() => {
        if (displayValue && !inputToMonth(displayValue)) {
          setDisplayValue(monthToInput(value));
        }
      }}
      style={{
        ...inputStyle,
        ...style,
      }}
    />
  );
}

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

    transacoes
      .filter(isInternalTransfer)
      .forEach((transfer) => {
        const value = Number(transfer.valor || 0);

        if (transfer.transferDirection === 'out') {
          const origin = transfer.contaOrigem || 'empresa';
          if (origin in localSaldos) localSaldos[origin] -= value;
        }

        if (transfer.transferDirection === 'in') {
          const destination = transfer.contaDestino
            || transfer.contaOrigem
            || 'empresa';

          if (destination in localSaldos) {
            localSaldos[destination] += value;
          }
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
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertsRead, setAlertsRead] = useState(readFinanceAlertsState);
  const financeData = useFinanceData();

  const financeAlerts = useMemo(() => {
    const alerts = [];
    const today = new Date().toISOString().slice(0, 10);
    const sevenDays = new Date();
    sevenDays.setDate(sevenDays.getDate() + 7);
    const sevenDaysValue = sevenDays.toISOString().slice(0, 10);

    (financeData.consolidated?.todasReceitas || []).forEach((item) => {
      const status = deriveFinancialStatus(item);

      if (status === 'vencida') {
        alerts.push({
          id: `receita-vencida-${item.id}`,
          severity: 'critical',
          title: 'Recebimento vencido',
          description: `${item.descricao || 'Receita'} · ${formatCurrency(item.valor)}`,
          date: item.vencimento || '',
          tab: 'receitas',
        });
      } else if (
        !['recebida', 'cancelada'].includes(status)
        && item.vencimento
        && item.vencimento >= today
        && item.vencimento <= sevenDaysValue
      ) {
        alerts.push({
          id: `receita-proxima-${item.id}-${item.vencimento}`,
          severity: 'attention',
          title: 'Recebimento próximo',
          description: `${item.descricao || 'Receita'} vence em ${item.vencimento}`,
          date: item.vencimento,
          tab: 'receitas',
        });
      }
    });

    (financeData.consolidated?.despesas || []).forEach((item) => {
      const status = deriveFinancialStatus(item);

      if (status === 'vencida') {
        alerts.push({
          id: `despesa-vencida-${item.id}`,
          severity: 'critical',
          title: 'Conta vencida',
          description: `${item.descricao || 'Despesa'} · ${formatCurrency(item.valor)}`,
          date: item.vencimento || '',
          tab: item.tipo === 'fixa' ? 'fixas' : 'variaveis',
        });
      }
    });

    if (
      financeData.custoOperacional > 0
      && financeData.saldos.reserva < financeData.custoOperacional
    ) {
      alerts.push({
        id: 'reserva-baixa',
        severity: 'warning',
        title: 'Reserva abaixo de um mês',
        description: `Reserva atual: ${formatCurrency(financeData.saldos.reserva)}.`,
        date: today,
        tab: 'planejamento',
      });
    }

    if (financeData.lucroReal < 0) {
      alerts.push({
        id: `lucro-negativo-${today.slice(0, 7)}`,
        severity: 'critical',
        title: 'Resultado mensal negativo',
        description: `Lucro real estimado: ${formatCurrency(financeData.lucroReal)}.`,
        date: today,
        tab: 'dashboard',
      });
    }

    return alerts.sort((first, second) => (
      (second.severity === 'critical' ? 2 : 1)
      - (first.severity === 'critical' ? 2 : 1)
    ));
  }, [financeData]);

  const unreadFinanceAlerts = financeAlerts.filter(
    (item) => !alertsRead[item.id],
  );

  const markFinanceAlertRead = (id) => {
    const next = {
      ...alertsRead,
      [id]: true,
    };

    setAlertsRead(next);
    localStorage.setItem(
      FINANCE_ALERTS_READ_STORAGE_KEY,
      JSON.stringify(next),
    );
  };

  const markAllFinanceAlertsRead = () => {
    const next = { ...alertsRead };

    financeAlerts.forEach((item) => {
      next[item.id] = true;
    });

    setAlertsRead(next);
    localStorage.setItem(
      FINANCE_ALERTS_READ_STORAGE_KEY,
      JSON.stringify(next),
    );
  };

  return (
    <div className="sf-finance-page">
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: '8px',
        }}
      >
        <button
          type="button"
          className="sf-secondary-button"
          onClick={() => setAlertsOpen(true)}
          style={{
            position: 'relative',
          }}
        >
          <BellRing size={16} />
          Alertas

          {unreadFinanceAlerts.length > 0 && (
            <span
              style={{
                minWidth: '20px',
                height: '20px',
                padding: '0 5px',
                borderRadius: '999px',
                background: 'var(--color-danger)',
                color: '#111',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.65rem',
                fontWeight: 900,
              }}
            >
              {unreadFinanceAlerts.length}
            </span>
          )}
        </button>
      </div>

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
      {activeTab === 'fluxo' && <FluxoCaixa data={financeData} />}
      {activeTab === 'agenda-financeira' && <AgendaFinanceira data={financeData} />}
      {activeTab === 'simulador' && <SimuladorFinanceiro data={financeData} />}
      {activeTab === 'comparativo' && <ComparativoFinanceiro data={financeData} />}
      {activeTab === 'planejamento' && <PlanejamentoFinanceiro data={financeData} />}
      {activeTab === 'controle' && <ControleFinanceiro data={financeData} />}
      {activeTab === 'ferramentas' && <FerramentasFinanceiras data={financeData} />}
      {activeTab === 'diagnostico' && <DiagnosticoFinanceiro data={financeData} />}
      {activeTab === 'operacoes' && <OperacoesFinanceiras data={financeData} />}
      {activeTab === 'dre' && <DreFinanceira data={financeData} />}
      {activeTab === 'inteligencia' && <InteligenciaFinanceira data={financeData} />}
      {activeTab === 'equipamentos' && <Investimentos data={financeData} />}
      {activeTab === 'relatorios' && <RelatoriosFinanceiros data={financeData} />}

      <Modal
        isOpen={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        title="Central de alertas financeiros"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {unreadFinanceAlerts.length > 0 && (
            <button
              type="button"
              className="sf-secondary-button"
              onClick={markAllFinanceAlertsRead}
            >
              Marcar todas como lidas
            </button>
          )}

          {financeAlerts.length > 0 ? (
            financeAlerts.map((item) => {
              const read = Boolean(alertsRead[item.id]);

              return (
                <div
                  key={item.id}
                  style={{
                    padding: '11px',
                    borderRadius: '9px',
                    border: `1px solid ${
                      item.severity === 'critical'
                        ? 'rgba(248,113,113,.35)'
                        : 'rgba(251,191,36,.3)'
                    }`,
                    background: read
                      ? 'rgba(255,255,255,.02)'
                      : item.severity === 'critical'
                        ? 'rgba(248,113,113,.07)'
                        : 'rgba(251,191,36,.06)',
                    opacity: read ? 0.62 : 1,
                  }}
                >
                  <strong
                    style={{
                      color: item.severity === 'critical'
                        ? 'var(--color-danger)'
                        : 'var(--color-warning)',
                      fontSize: '0.78rem',
                    }}
                  >
                    {item.title}
                  </strong>

                  <div
                    className="sf-muted"
                    style={{
                      marginTop: '5px',
                      fontSize: '0.7rem',
                      lineHeight: 1.45,
                    }}
                  >
                    {item.description}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: '7px',
                      flexWrap: 'wrap',
                      marginTop: '9px',
                    }}
                  >
                    <button
                      type="button"
                      className="sf-secondary-button"
                      onClick={() => {
                        markFinanceAlertRead(item.id);
                        setActiveTab(item.tab);
                        setAlertsOpen(false);
                      }}
                    >
                      Abrir área
                    </button>

                    {!read && (
                      <button
                        type="button"
                        className="sf-secondary-button"
                        onClick={() => markFinanceAlertRead(item.id)}
                      >
                        Marcar como lida
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="sf-muted">
              Nenhum alerta financeiro neste momento.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function FinanceDashboard({ data }) {
  const [configOpen, setConfigOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [configError, setConfigError] = useState('');
  const [monthlyGoal, setMonthlyGoal] = useState(readMonthlyGoal);
  const [goalDraft, setGoalDraft] = useState(() => (
    maskCurrency(String(Math.round(readMonthlyGoal() * 100)))
  ));

  const saveConfig = async () => {
    if (!isDistributionConfigValid(data.financasConfig)) {
      setConfigError(
        'A soma dos percentuais deve ser exatamente 100%.',
      );
      return;
    }

    try {
      const saved = await saveDistributionConfig(
        data.financasConfig,
      );

      data.setFinancasConfig(saved);
      window.dispatchEvent(new Event('sf_storage_update'));
      setConfigError('');
      setConfigOpen(false);
    } catch (error) {
      setConfigError(error.message);
    }
  };

  const saveMonthlyGoal = () => {
    const value = parseCurrency(goalDraft);

    if (value <= 0) {
      alert('Informe uma meta mensal maior que zero.');
      return;
    }

    localStorage.setItem(
      FINANCE_GOAL_STORAGE_KEY,
      String(value),
    );

    setMonthlyGoal(value);
    setGoalOpen(false);
  };

  const executive = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);
    const next30 = new Date(now);
    next30.setDate(next30.getDate() + 30);
    const next30Date = next30.toISOString().slice(0, 10);

    const revenues = data.consolidated.todasReceitas || [];
    const expenses = data.consolidated.despesas || [];

    const receivedMonth = revenues
      .filter((item) => {
        const status = deriveFinancialStatus(item);
        const receiptDate = (
          item.dataRecebimento
          || item.dataPagamento
          || item.vencimento
          || ''
        );

        return (
          status === 'recebida'
          && receiptDate.slice(0, 7) === currentMonth
        );
      })
      .reduce((sum, item) => sum + Number(item.valor || 0), 0);

    const paidMonth = expenses
      .filter((item) => {
        const status = deriveFinancialStatus(item);
        const paidDate = (
          item.dataPagamento
          || item.vencimento
          || ''
        );

        return (
          status === 'paga'
          && paidDate.slice(0, 7) === currentMonth
        );
      })
      .reduce((sum, item) => sum + Number(item.valor || 0), 0);

    const receivableNext30 = revenues
      .filter((item) => {
        const status = deriveFinancialStatus(item);
        const due = item.vencimento || '';

        return (
          !['recebida', 'cancelada'].includes(status)
          && due
          && due >= today
          && due <= next30Date
        );
      })
      .reduce((sum, item) => sum + Number(item.valor || 0), 0);

    const payableNext30 = expenses
      .filter((item) => {
        const status = deriveFinancialStatus(item);
        const due = item.vencimento || '';

        return (
          !['paga', 'cancelada'].includes(status)
          && due
          && due >= today
          && due <= next30Date
        );
      })
      .reduce((sum, item) => sum + Number(item.valor || 0), 0);

    const overdueRevenues = revenues.filter((item) => (
      deriveFinancialStatus(item) === 'vencida'
    ));

    const overdueExpenses = expenses.filter((item) => (
      deriveFinancialStatus(item) === 'vencida'
    ));

    const overdueRevenueTotal = overdueRevenues.reduce(
      (sum, item) => sum + Number(item.valor || 0),
      0,
    );

    const overdueExpenseTotal = overdueExpenses.reduce(
      (sum, item) => sum + Number(item.valor || 0),
      0,
    );

    const totalBalance = (
      data.saldos.empresa
      + data.saldos.reserva
      + data.saldos.salario
    );

    const monthProfit = receivedMonth
      - paidMonth
      - data.depreciacaoMensal;

    const margin = receivedMonth > 0
      ? (monthProfit / receivedMonth) * 100
      : 0;

    const goalProgress = monthlyGoal > 0
      ? Math.min(100, (receivedMonth / monthlyGoal) * 100)
      : 0;

    const goalRemaining = Math.max(
      0,
      monthlyGoal - receivedMonth,
    );

    const reserveCoverage = data.custoOperacional > 0
      ? data.saldos.reserva / data.custoOperacional
      : 0;

    const projected30 = (
      totalBalance
      + receivableNext30
      - payableNext30
    );

    const health = [
      {
        label: 'Receita',
        status: goalProgress >= 80
          ? 'Excelente'
          : goalProgress >= 50
            ? 'Atenção'
            : 'Baixa',
        tone: goalProgress >= 80
          ? 'positive'
          : goalProgress >= 50
            ? 'warning'
            : 'negative',
        detail: `${goalProgress.toFixed(0)}% da meta mensal`,
      },
      {
        label: 'Lucro',
        status: margin >= 25
          ? 'Excelente'
          : margin >= 10
            ? 'Atenção'
            : 'Baixo',
        tone: margin >= 25
          ? 'positive'
          : margin >= 10
            ? 'warning'
            : 'negative',
        detail: `Margem de ${margin.toFixed(1)}%`,
      },
      {
        label: 'Fluxo de caixa',
        status: projected30 >= 0
          ? 'Saudável'
          : 'Crítico',
        tone: projected30 >= 0
          ? 'positive'
          : 'negative',
        detail: `Projeção de ${formatCurrency(projected30)}`,
      },
      {
        label: 'Reserva',
        status: reserveCoverage >= 3
          ? 'Excelente'
          : reserveCoverage >= 1
            ? 'Atenção'
            : 'Baixa',
        tone: reserveCoverage >= 3
          ? 'positive'
          : reserveCoverage >= 1
            ? 'warning'
            : 'negative',
        detail: `${reserveCoverage.toFixed(1)} mês(es) de cobertura`,
      },
      {
        label: 'Inadimplência',
        status: overdueRevenueTotal === 0
          ? 'Excelente'
          : overdueRevenueTotal <= monthlyGoal * 0.1
            ? 'Atenção'
            : 'Alta',
        tone: overdueRevenueTotal === 0
          ? 'positive'
          : overdueRevenueTotal <= monthlyGoal * 0.1
            ? 'warning'
            : 'negative',
        detail: formatCurrency(overdueRevenueTotal),
      },
    ];

    const attention = [];

    if (overdueRevenues.length > 0) {
      attention.push({
        id: 'overdue-revenues',
        tone: 'negative',
        title: `${overdueRevenues.length} recebimento(s) vencido(s)`,
        description: `${formatCurrency(overdueRevenueTotal)} aguardando cobrança.`,
      });
    }

    if (overdueExpenses.length > 0) {
      attention.push({
        id: 'overdue-expenses',
        tone: 'warning',
        title: `${overdueExpenses.length} conta(s) vencida(s)`,
        description: `${formatCurrency(overdueExpenseTotal)} pendente(s) de pagamento.`,
      });
    }

    if (goalRemaining > 0) {
      attention.push({
        id: 'goal',
        tone: goalProgress >= 70 ? 'positive' : 'warning',
        title: `${goalProgress.toFixed(0)}% da meta mensal atingida`,
        description: `Faltam ${formatCurrency(goalRemaining)} para alcançar a meta.`,
      });
    }

    if (reserveCoverage < 1) {
      attention.push({
        id: 'reserve',
        tone: 'negative',
        title: 'Reserva abaixo do custo operacional mensal',
        description: `Cobertura atual de ${reserveCoverage.toFixed(1)} mês.`,
      });
    }

    if (projected30 < 0) {
      attention.push({
        id: 'cash',
        tone: 'negative',
        title: 'Fluxo projetado negativo nos próximos 30 dias',
        description: `Projeção de ${formatCurrency(projected30)}.`,
      });
    }

    return {
      today,
      receivedMonth,
      paidMonth,
      receivableNext30,
      payableNext30,
      overdueRevenues,
      overdueExpenses,
      overdueRevenueTotal,
      overdueExpenseTotal,
      totalBalance,
      monthProfit,
      margin,
      goalProgress,
      goalRemaining,
      reserveCoverage,
      projected30,
      health,
      attention,
    };
  }, [
    data.consolidated,
    data.custoOperacional,
    data.depreciacaoMensal,
    data.saldos,
    monthlyGoal,
  ]);

  const accountRows = [
    {
      id: 'reserva',
      destino: 'Fundo / Reserva',
      saldo: data.saldos.reserva,
    },
    {
      id: 'empresa',
      destino: 'Caixa da empresa',
      saldo: data.saldos.empresa,
    },
    {
      id: 'salario',
      destino: 'Salários',
      saldo: data.saldos.salario,
    },
  ];

  const movementRows = useMemo(() => {
    const list = [];

    data.consolidated.todasReceitas.forEach((revenue) => {
      if (deriveFinancialStatus(revenue) === 'recebida') {
        list.push({
          id: `income-${revenue.id}`,
          destino: revenue.contaOrigem || 'empresa',
          natureza: 'Entrada',
          origem: revenue.descricao,
          cliente: revenue.clienteNome || '-',
          valor: revenue.valor,
          data: (
            revenue.dataRecebimento
            || revenue.vencimento
            || ''
          ),
        });
      }
    });

    data.consolidated.despesas.forEach((expense) => {
      if (deriveFinancialStatus(expense) === 'paga') {
        list.push({
          id: `expense-${expense.id}`,
          destino: expense.contaOrigem || 'empresa',
          natureza: 'Saída',
          origem: expense.descricao,
          cliente: '-',
          valor: expense.valor,
          data: (
            expense.dataPagamento
            || expense.vencimento
            || ''
          ),
        });
      }
    });

    return list
      .sort((first, second) => (
        String(second.data || '').localeCompare(
          String(first.data || ''),
        )
      ))
      .slice(0, 10);
  }, [data.consolidated]);

  const forecastChart = [
    {
      name: 'Saldo atual',
      valor: executive.totalBalance,
    },
    {
      name: 'Receber 30d',
      valor: executive.receivableNext30,
    },
    {
      name: 'Pagar 30d',
      valor: executive.payableNext30,
    },
    {
      name: 'Saldo projetado',
      valor: executive.projected30,
    },
  ];

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="Painel Financeiro Executivo"
        subtitle="Caixa, lucro, meta, cobranças e próximos 30 dias em uma única visão."
        action={
          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <button
              className="sf-secondary-button"
              onClick={() => setGoalOpen(true)}
            >
              <Target size={16} />
              Meta mensal
            </button>

            <button
              className="sf-secondary-button"
              onClick={() => setConfigOpen(true)}
            >
              <Settings size={16} />
              Distribuição
            </button>
          </div>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '10px',
        }}
      >
        <ExecutiveMetric
          icon={Wallet}
          label="Saldo total hoje"
          value={executive.totalBalance}
          tone={executive.totalBalance >= 0 ? 'positive' : 'negative'}
        />

        <ExecutiveMetric
          icon={ArrowUpCircle}
          label="Recebido no mês"
          value={executive.receivedMonth}
          tone="positive"
        />

        <ExecutiveMetric
          icon={CircleDollarSign}
          label="A receber em 30 dias"
          value={executive.receivableNext30}
        />

        <ExecutiveMetric
          icon={ArrowDownCircle}
          label="A pagar em 30 dias"
          value={executive.payableNext30}
          tone="warning"
        />

        <ExecutiveMetric
          icon={TrendingUp}
          label="Lucro real do mês"
          value={executive.monthProfit}
          tone={executive.monthProfit >= 0 ? 'positive' : 'negative'}
          detail={`Margem ${executive.margin.toFixed(1)}%`}
        />

        <ExecutiveMetric
          icon={Target}
          label="Meta mensal"
          value={monthlyGoal}
          detail={`${executive.goalProgress.toFixed(0)}% atingido`}
        />
      </div>

      <div
        className="sf-card"
        style={{
          padding: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: '9px',
          }}
        >
          <div>
            <strong
              style={{
                fontSize: '0.88rem',
              }}
            >
              Progresso da meta
            </strong>

            <div
              className="sf-muted"
              style={{
                marginTop: '4px',
              }}
            >
              {formatCurrency(executive.receivedMonth)} de{' '}
              {formatCurrency(monthlyGoal)}
            </div>
          </div>

          <strong
            style={{
              color: executive.goalProgress >= 100
                ? 'var(--color-success)'
                : 'var(--color-highlight)',
            }}
          >
            {executive.goalProgress.toFixed(1)}%
          </strong>
        </div>

        <div
          style={{
            height: '10px',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${executive.goalProgress}%`,
              height: '100%',
              borderRadius: '999px',
              background: executive.goalProgress >= 100
                ? 'var(--color-success)'
                : 'var(--color-highlight)',
              transition: 'width .25s ease',
            }}
          />
        </div>

        <div
          className="sf-muted"
          style={{
            marginTop: '8px',
          }}
        >
          {executive.goalRemaining > 0
            ? `Ainda faltam ${formatCurrency(executive.goalRemaining)} para alcançar a meta.`
            : 'Meta mensal alcançada.'}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '12px',
        }}
      >
        <div className="sf-card tall">
          <h3
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <ShieldCheck size={18} />
            Saúde financeira
          </h3>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {executive.health.map((item) => (
              <HealthRow
                key={item.label}
                item={item}
              />
            ))}
          </div>
        </div>

        <div className="sf-card tall">
          <h3
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <AlertTriangle size={18} />
            O que merece sua atenção
          </h3>

          {executive.attention.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {executive.attention.map((item) => (
                <AttentionRow
                  key={item.id}
                  item={item}
                />
              ))}
            </div>
          ) : (
            <p className="sf-muted">
              Nenhum alerta financeiro crítico neste momento.
            </p>
          )}
        </div>
      </div>

      <div className="sf-panel-grid">
        <div className="sf-card tall">
          <h3>Fluxo dos próximos 30 dias</h3>

          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={forecastChart}
              margin={{
                top: 8,
                right: 8,
                left: -18,
                bottom: 0,
              }}
            >
              <XAxis
                dataKey="name"
                stroke="#A1A1AA"
                tickLine={false}
                axisLine={false}
              />

              <YAxis
                stroke="#A1A1AA"
                tickFormatter={(value) => (
                  `R$ ${Math.round(value / 1000)}k`
                )}
              />

              <Tooltip
                formatter={(value) => formatCurrency(value)}
                contentStyle={{
                  background: '#111',
                  border: '1px solid #333',
                  borderRadius: 8,
                }}
              />

              <Bar
                dataKey="valor"
                fill="#c5a059"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>

          <div className="formula-total soft">
            <span>Saldo projetado</span>
            <strong
              style={{
                color: executive.projected30 >= 0
                  ? 'var(--color-success)'
                  : 'var(--color-danger)',
              }}
            >
              {formatCurrency(executive.projected30)}
            </strong>
          </div>
        </div>

        <div className="sf-card tall">
          <h3>Regra dos Três</h3>

          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={[
                  {
                    name: 'Salário',
                    value: data.financeSnapshot.distribution.salario,
                    color: '#10b981',
                  },
                  {
                    name: 'Reserva',
                    value: data.financeSnapshot.distribution.reserva,
                    color: '#c5a059',
                  },
                  {
                    name: 'Empresa',
                    value: data.financeSnapshot.distribution.empresa,
                    color: '#2563eb',
                  },
                ]}
                dataKey="value"
                innerRadius={58}
                outerRadius={82}
                paddingAngle={4}
                stroke="none"
              >
                {[
                  { color: '#10b981' },
                  { color: '#c5a059' },
                  { color: '#2563eb' },
                ].map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                  />
                ))}
              </Pie>

              <Tooltip
                formatter={(value) => `${Number(value).toFixed(1)}%`}
                contentStyle={{
                  background: '#111',
                  border: '1px solid #333',
                  borderRadius: 8,
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="formula-row">
            <span>Salário</span>
            <strong>
              {data.financeSnapshot.distribution.salario.toFixed(1)}%
            </strong>
          </div>

          <div className="formula-row">
            <span>Fundo de reserva</span>
            <strong>
              {data.financeSnapshot.distribution.reserva.toFixed(1)}%
            </strong>
          </div>

          <div className="formula-row">
            <span>Caixa da empresa</span>
            <strong>
              {data.financeSnapshot.distribution.empresa.toFixed(1)}%
            </strong>
          </div>
        </div>

        <div className="sf-card tall">
          <h3>Custo operacional</h3>

          <div className="formula-row">
            <span>Custo fixo mensal</span>
            <strong>{formatCurrency(data.despesasFixas)}</strong>
          </div>

          <div className="formula-row">
            <span>Média variável</span>
            <strong>{formatCurrency(data.mediaVariavel)}</strong>
          </div>

          <div className="formula-row">
            <span>Depreciação mensal</span>
            <strong>{formatCurrency(data.depreciacaoMensal)}</strong>
          </div>

          <div className="formula-total">
            <span>Total</span>
            <strong>{formatCurrency(data.custoOperacional)}</strong>
          </div>
        </div>

        <div className="sf-card tall">
          <h3>Próximos vencimentos</h3>

          {data.proximosVencimentos.length === 0 && (
            <p className="sf-muted">
              Nenhum vencimento pendente.
            </p>
          )}

          {data.proximosVencimentos.map((item) => (
            <div className="compact-row" key={item.id}>
              <span>{item.descricao}</span>
              <strong>{formatDateBR(item.vencimento)}</strong>
            </div>
          ))}

          <div className="formula-total soft">
            <span>Maior categoria</span>
            <strong>
              {data.maiorCategoria
                ? `${data.maiorCategoria[0]} (${formatCurrency(data.maiorCategoria[1])})`
                : 'Sem dados'}
            </strong>
          </div>
        </div>
      </div>

      <SimpleTable
        columns={['Conta', 'Saldo atual']}
        rows={accountRows}
        render={(row) => [
          row.destino,
          formatCurrency(row.saldo),
        ]}
        empty="Nenhuma conta financeira ativa."
      />

      <SimpleTable
        columns={[
          'Conta',
          'Movimento',
          'Origem',
          'Cliente',
          'Valor',
        ]}
        rows={movementRows}
        render={(row) => [
          row.destino,
          row.natureza,
          row.origem,
          row.cliente,
          formatCurrency(row.valor),
        ]}
        empty="Nenhuma movimentação encontrada."
      />

      <Modal
        isOpen={goalOpen}
        onClose={() => setGoalOpen(false)}
        title="Configurar meta mensal"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <Field label="Meta de faturamento mensal">
            <input
              style={inputStyle}
              value={goalDraft}
              onChange={(event) => {
                setGoalDraft(maskCurrency(event.target.value));
              }}
              placeholder="R$ 30.000,00"
            />
          </Field>

          <div className="formula-row">
            <span>Recebido neste mês</span>
            <strong>
              {formatCurrency(executive.receivedMonth)}
            </strong>
          </div>

          <div className="formula-row">
            <span>Falta para a meta</span>
            <strong>
              {formatCurrency(
                Math.max(
                  0,
                  parseCurrency(goalDraft)
                  - executive.receivedMonth,
                ),
              )}
            </strong>
          </div>

          <button
            className="sf-primary-button wide"
            onClick={saveMonthlyGoal}
          >
            Salvar meta
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        title="Configurar distribuição"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {['salario', 'empresa', 'reserva'].map((key) => (
            <label
              key={key}
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                textTransform: 'capitalize',
              }}
            >
              {key === 'salario'
                ? 'Salário'
                : key === 'empresa'
                  ? 'Empresa'
                  : 'Reserva'}{' '}
              (%)

              <input
                type="number"
                value={data.financasConfig[key]}
                onChange={(event) => {
                  data.setFinancasConfig({
                    ...data.financasConfig,
                    [key]: Number(event.target.value),
                  });
                }}
                style={{
                  width: '100%',
                  marginTop: '6px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-main)',
                  color: '#fff',
                }}
              />
            </label>
          ))}

          <div className="formula-row">
            <span>Total</span>
            <strong>
              {[
                'salario',
                'empresa',
                'reserva',
              ].reduce(
                (sum, key) => (
                  sum + Number(data.financasConfig[key] || 0)
                ),
                0,
              ).toFixed(1)}
              %
            </strong>
          </div>

          {configError && (
            <p
              className="sf-muted"
              style={{
                color: 'var(--color-danger)',
                margin: 0,
              }}
            >
              {configError}
            </p>
          )}

          <button
            className="sf-primary-button wide"
            onClick={() => void saveConfig()}
          >
            Salvar configuração
          </button>
        </div>
      </Modal>
    </div>
  );
}

function ExecutiveMetric({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
  detail = '',
}) {
  return (
    <div className={`sf-card metric ${tone}`}>
      <div className="metric-label">
        <Icon size={18} />
        {label}
      </div>

      <strong>{formatCurrency(value)}</strong>

      {detail && (
        <span
          className="sf-muted"
          style={{
            fontSize: '0.7rem',
            marginTop: '5px',
          }}
        >
          {detail}
        </span>
      )}
    </div>
  );
}

function HealthRow({ item }) {
  const colors = {
    positive: 'var(--color-success)',
    warning: 'var(--color-warning)',
    negative: 'var(--color-danger)',
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '10px',
        alignItems: 'center',
        padding: '10px',
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
      }}
    >
      <div>
        <strong
          style={{
            fontSize: '0.78rem',
          }}
        >
          {item.label}
        </strong>

        <div
          className="sf-muted"
          style={{
            fontSize: '0.68rem',
            marginTop: '4px',
          }}
        >
          {item.detail}
        </div>
      </div>

      <strong
        style={{
          color: colors[item.tone],
          fontSize: '0.72rem',
        }}
      >
        {item.status}
      </strong>
    </div>
  );
}

function AttentionRow({ item }) {
  const colors = {
    positive: 'var(--color-success)',
    warning: 'var(--color-warning)',
    negative: 'var(--color-danger)',
  };

  return (
    <div
      style={{
        padding: '10px',
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid var(--border-color)',
        borderLeft: `3px solid ${colors[item.tone]}`,
        borderRadius: '8px',
      }}
    >
      <strong
        style={{
          color: colors[item.tone],
          fontSize: '0.76rem',
        }}
      >
        {item.title}
      </strong>

      <div
        className="sf-muted"
        style={{
          fontSize: '0.69rem',
          lineHeight: 1.45,
          marginTop: '5px',
        }}
      >
        {item.description}
      </div>
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('todos');
  const [clientFilter, setClientFilter] = useState('');

  const list = useMemo(() => (
    data.consolidated.todasReceitas.map((revenue) => ({
      ...revenue,
      statusDerivado: deriveFinancialStatus(revenue),
    }))
  ), [data.consolidated]);

  const filteredList = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7);
    const currentYear = today.toISOString().slice(0, 4);

    return list
      .filter((revenue) => {
        if (
          statusFilter
          && revenue.statusDerivado !== statusFilter
        ) {
          return false;
        }

        if (
          typeFilter === 'contratual'
          && revenue.tipo !== 'receita_contrato'
        ) {
          return false;
        }

        if (
          typeFilter === 'avulsa'
          && revenue.tipo === 'receita_contrato'
        ) {
          return false;
        }

        if (
          clientFilter
          && String(
            revenue.clienteId
            || revenue.clientId
            || '',
          ) !== String(clientFilter)
        ) {
          return false;
        }

        const referenceDate = (
          revenue.dataRecebimento
          || revenue.vencimento
          || ''
        );

        if (
          periodFilter === 'mes'
          && referenceDate.slice(0, 7) !== currentMonth
        ) {
          return false;
        }

        if (
          periodFilter === 'ano'
          && referenceDate.slice(0, 4) !== currentYear
        ) {
          return false;
        }

        if (
          normalizedSearch
          && ![
            revenue.descricao,
            revenue.categoria,
            revenue.clienteNome,
            revenue.formaPagamento,
            revenue.tipo,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(normalizedSearch)
        ) {
          return false;
        }

        return true;
      })
      .sort((first, second) => (
        String(second.vencimento || '').localeCompare(
          String(first.vencimento || ''),
        )
      ));
  }, [
    clientFilter,
    list,
    periodFilter,
    search,
    statusFilter,
    typeFilter,
  ]);

  const collectionCenter = useMemo(() => {
    const today = new Date();
    const todayValue = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowValue = tomorrow.toISOString().slice(0, 10);
    const sevenDays = new Date(today);
    sevenDays.setDate(sevenDays.getDate() + 7);
    const sevenDaysValue = sevenDays.toISOString().slice(0, 10);

    const active = list.filter(
      (revenue) => revenue.statusDerivado !== 'cancelada',
    );

    const overdue = active.filter(
      (revenue) => revenue.statusDerivado === 'vencida',
    );

    const dueToday = active.filter((revenue) => (
      !['recebida', 'vencida'].includes(revenue.statusDerivado)
      && revenue.vencimento === todayValue
    ));

    const dueTomorrow = active.filter((revenue) => (
      !['recebida', 'vencida'].includes(revenue.statusDerivado)
      && revenue.vencimento === tomorrowValue
    ));

    const dueSevenDays = active.filter((revenue) => (
      !['recebida', 'vencida'].includes(revenue.statusDerivado)
      && revenue.vencimento > todayValue
      && revenue.vencimento <= sevenDaysValue
    ));

    const receivedToday = active.filter((revenue) => (
      revenue.statusDerivado === 'recebida'
      && (
        revenue.dataRecebimento
        || revenue.dataPagamento
        || revenue.vencimento
      ) === todayValue
    ));

    const sum = (items) => items.reduce(
      (total, item) => total + Number(item.valor || 0),
      0,
    );

    return {
      overdue,
      dueToday,
      dueTomorrow,
      dueSevenDays,
      receivedToday,
      overdueTotal: sum(overdue),
      dueTodayTotal: sum(dueToday),
      dueTomorrowTotal: sum(dueTomorrow),
      dueSevenDaysTotal: sum(dueSevenDays),
      receivedTodayTotal: sum(receivedToday),
    };
  }, [list]);

  const receivableAging = useMemo(() => {
    const today = new Date();
    const oneDay = 1000 * 60 * 60 * 24;
    const buckets = {
      aVencer: [],
      ate7: [],
      de8a30: [],
      acima30: [],
    };

    list
      .filter((item) => (
        !['recebida', 'cancelada'].includes(item.statusDerivado)
        && item.vencimento
      ))
      .forEach((item) => {
        const due = new Date(`${item.vencimento}T00:00:00`);
        const days = Math.floor(
          (today.getTime() - due.getTime()) / oneDay,
        );

        if (days < 0) buckets.aVencer.push(item);
        else if (days <= 7) buckets.ate7.push(item);
        else if (days <= 30) buckets.de8a30.push(item);
        else buckets.acima30.push(item);
      });

    const sum = (items) => items.reduce(
      (total, item) => total + Number(item.valor || 0),
      0,
    );

    return {
      aVencer: {
        count: buckets.aVencer.length,
        total: sum(buckets.aVencer),
      },
      ate7: {
        count: buckets.ate7.length,
        total: sum(buckets.ate7),
      },
      de8a30: {
        count: buckets.de8a30.length,
        total: sum(buckets.de8a30),
      },
      acima30: {
        count: buckets.acima30.length,
        total: sum(buckets.acima30),
      },
    };
  }, [list]);

  const revenueInsights = useMemo(() => {
    const byCategory = groupBySum(
      filteredList.filter(
        (item) => item.statusDerivado !== 'cancelada',
      ),
      (item) => item.categoria || 'Sem categoria',
    );

    const byClient = groupBySum(
      filteredList.filter(
        (item) => item.statusDerivado !== 'cancelada',
      ),
      (item) => item.clienteNome || 'Sem cliente',
    );

    const byMonth = groupBySum(
      filteredList.filter(
        (item) => item.statusDerivado !== 'cancelada',
      ),
      (item) => (
        item.vencimento
          ? item.vencimento.slice(0, 7)
          : 'Sem data'
      ),
    );

    return {
      byCategory,
      byClient,
      byMonth,
    };
  }, [filteredList]);

  const totalMensalPrevisto = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);

    return list
      .filter((revenue) => (
        revenue.statusDerivado !== 'cancelada'
        && revenue.vencimento
        && revenue.vencimento.slice(0, 7) === currentMonth
      ))
      .reduce(
        (sum, revenue) => sum + Number(revenue.valor || 0),
        0,
      );
  }, [list]);

  const filteredTotal = useMemo(() => (
    filteredList
      .filter((item) => item.statusDerivado !== 'cancelada')
      .reduce(
        (sum, item) => sum + Number(item.valor || 0),
        0,
      )
  ), [filteredList]);

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


  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setTypeFilter('');
    setPeriodFilter('todos');
    setClientFilter('');
  };

  return (
    <div className="sf-finance-section">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          flexWrap: 'wrap',
          marginBottom: '12px',
        }}
      >
        <SectionHeader
          title="Receitas e Cobranças"
          subtitle="Acompanhe contratos, receitas avulsas, vencimentos e cobranças em um único lugar."
        />

        <button
          className="sf-primary-button"
          onClick={openCreateModal}
        >
          <Plus size={18} />
          Nova receita avulsa
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(165px, 1fr))',
          gap: '10px',
        }}
      >
        <CollectionMetric
          icon={AlertTriangle}
          label="Vencidas"
          count={collectionCenter.overdue.length}
          value={collectionCenter.overdueTotal}
          tone="negative"
          onClick={() => setStatusFilter('vencida')}
        />

        <CollectionMetric
          icon={CalendarClock}
          label="Vencem hoje"
          count={collectionCenter.dueToday.length}
          value={collectionCenter.dueTodayTotal}
          tone="warning"
        />

        <CollectionMetric
          icon={CalendarClock}
          label="Vencem amanhã"
          count={collectionCenter.dueTomorrow.length}
          value={collectionCenter.dueTomorrowTotal}
        />

        <CollectionMetric
          icon={TrendingUp}
          label="Próximos 7 dias"
          count={collectionCenter.dueSevenDays.length}
          value={collectionCenter.dueSevenDaysTotal}
        />

        <CollectionMetric
          icon={ArrowUpCircle}
          label="Recebidas hoje"
          count={collectionCenter.receivedToday.length}
          value={collectionCenter.receivedTodayTotal}
          tone="positive"
        />
      </div>

      <div className="sf-metric-grid">
        <Metric
          icon={ArrowUpCircle}
          label="Faturamento no mês"
          value={data.receitaBruta}
          tone="positive"
        />

        <Metric
          icon={CircleDollarSign}
          label="Previsto no mês"
          value={totalMensalPrevisto}
        />

        <Metric
          icon={CalendarClock}
          label="Recebimentos vencidos"
          value={data.inadimplente}
          tone="negative"
        />

        <Metric
          icon={Users}
          label="Total filtrado"
          value={filteredTotal}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '10px',
        }}
      >
        <CollectionMetric
          icon={CalendarClock}
          label="A vencer"
          count={receivableAging.aVencer.count}
          value={receivableAging.aVencer.total}
        />

        <CollectionMetric
          icon={AlertTriangle}
          label="Atrasadas até 7 dias"
          count={receivableAging.ate7.count}
          value={receivableAging.ate7.total}
          tone="warning"
        />

        <CollectionMetric
          icon={AlertTriangle}
          label="Atrasadas de 8 a 30 dias"
          count={receivableAging.de8a30.count}
          value={receivableAging.de8a30.total}
          tone="negative"
        />

        <CollectionMetric
          icon={XCircle}
          label="Atrasadas há mais de 30 dias"
          count={receivableAging.acima30.count}
          value={receivableAging.acima30.total}
          tone="negative"
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(220px, 1.5fr) repeat(4, minmax(135px, .8fr)) auto',
          gap: '9px',
          alignItems: 'center',
        }}
      >
        <label
          style={{
            minHeight: '42px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 10px',
            background: 'var(--bg-card, #111)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
          }}
        >
          <Search
            size={16}
            color="var(--text-secondary)"
          />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar receita, cliente ou categoria..."
            style={{
              width: '100%',
              minWidth: 0,
              background: 'transparent',
              color: 'var(--text-main)',
              border: 0,
              outline: 0,
            }}
          />
        </label>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          style={inputStyle}
        >
          <option value="">Todos os status</option>
          <option value="prevista">Previstas</option>
          <option value="pendente">Pendentes</option>
          <option value="vencida">Vencidas</option>
          <option value="recebida">Recebidas</option>
          <option value="cancelada">Canceladas</option>
        </select>

        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          style={inputStyle}
        >
          <option value="">Todos os tipos</option>
          <option value="contratual">Contratuais</option>
          <option value="avulsa">Avulsas</option>
        </select>

        <select
          value={periodFilter}
          onChange={(event) => setPeriodFilter(event.target.value)}
          style={inputStyle}
        >
          <option value="todos">Todo o período</option>
          <option value="mes">Este mês</option>
          <option value="ano">Este ano</option>
        </select>

        <select
          value={clientFilter}
          onChange={(event) => setClientFilter(event.target.value)}
          style={inputStyle}
        >
          <option value="">Todos os clientes</option>

          {data.clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.nome}
            </option>
          ))}
        </select>

        {(search
          || statusFilter
          || typeFilter
          || periodFilter !== 'todos'
          || clientFilter) && (
          <button
            type="button"
            className="sf-secondary-button"
            onClick={clearFilters}
          >
            Limpar
          </button>
        )}
      </div>

      <SimpleTable
        columns={[
          'Descrição / Categoria',
          'Tipo',
          'Cliente',
          'Vencimento',
          'Status',
          'Valor',
          'Ações',
        ]}
        rows={filteredList}
        render={(row) => [
          <div>
            <strong>{row.descricao}</strong>

            <small
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: 'var(--text-secondary)',
                fontSize: '0.75rem',
                marginTop: '3px',
              }}
            >
              <Tag size={10} />
              {row.categoria || 'Geral'}
            </small>
          </div>,

          <span className="sf-pill">
            {row.tipo === 'receita_contrato'
              ? 'Contratual'
              : 'Avulsa'}
          </span>,

          row.clienteNome || '-',
          formatDateBR(row.vencimento) || '-',

          <span
            className={`sf-status ${row.statusDerivado.toLowerCase()}`}
          >
            {row.statusDerivado}
          </span>,

          <strong
            style={{
              color: 'var(--color-success)',
            }}
          >
            {formatCurrency(row.valor)}
          </strong>,

          <div className="sf-actions">
            {row.tipo !== 'receita_contrato'
              && row.statusDerivado !== 'recebida'
              && row.statusDerivado !== 'cancelada' && (
                <button
                  title="Dar recebimento"
                  onClick={() => receiveIncome(row)}
                >
                  <PackagePlus size={17} />
                </button>
              )}

            {row.tipo !== 'receita_contrato'
              && row.statusDerivado === 'recebida' && (
                <button
                  title="Reverter recebimento"
                  onClick={() => reverseIncome(row)}
                >
                  <Undo2
                    size={17}
                    style={{
                      color: 'var(--color-highlight)',
                    }}
                  />
                </button>
              )}

            {row.tipo !== 'receita_contrato'
              && row.statusDerivado !== 'cancelada'
              && row.statusDerivado !== 'recebida' && (
                <button
                  title="Cancelar receita"
                  onClick={() => cancelIncome(row)}
                >
                  <XCircle
                    size={17}
                    style={{
                      color: 'var(--color-warning)',
                    }}
                  />
                </button>
              )}

            <button
              title="Editar"
              onClick={() => openEditModal(row)}
              disabled={row.tipo === 'receita_contrato'}
            >
              <Edit2 size={17} />
            </button>

            <button
              title="Excluir"
              onClick={() => removeReceita(row)}
              disabled={row.tipo === 'receita_contrato'}
            >
              <Trash2 size={17} />
            </button>
          </div>,
        ]}
        empty="Nenhuma receita corresponde aos filtros."
      />

      <div
        className="sf-report-grid"
        style={{
          marginTop: '4px',
        }}
      >
        <ReportBlock
          title="Receita por categoria"
          data={revenueInsights.byCategory}
        />

        <ReportBlock
          title="Receita por cliente"
          data={revenueInsights.byClient}
        />

        <ReportBlock
          title="Receita por mês"
          data={revenueInsights.byMonth}
        />
      </div>

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
              <DateInput
                value={formData.vencimento}
                onChange={(value) => {
                  setFormData({
                    ...formData,
                    vencimento: value,
                  });
                }}
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

function CollectionMetric({
  icon: Icon,
  label,
  count,
  value,
  tone = 'neutral',
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`sf-card metric ${tone}`}
      style={{
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div className="metric-label">
        <Icon size={18} />
        {label}
      </div>

      <strong>{formatCurrency(value)}</strong>

      <span
        className="sf-muted"
        style={{
          fontSize: '0.7rem',
          marginTop: '5px',
        }}
      >
        {count} lançamento(s)
      </span>
    </button>
  );
}

function FluxoCaixa({ data }) {
  const [period, setPeriod] = useState('6');

  const cashFlow = useMemo(() => {
    const monthsCount = Math.max(3, Number(period || 6));
    const today = new Date();
    const rows = [];

    for (let offset = monthsCount - 1; offset >= 0; offset -= 1) {
      const reference = new Date(
        today.getFullYear(),
        today.getMonth() - offset,
        1,
      );

      const key = monthKey(reference);
      const label = reference.toLocaleDateString('pt-BR', {
        month: 'short',
        year: '2-digit',
      });

      const received = data.consolidated.todasReceitas
        .filter((item) => {
          const status = deriveFinancialStatus(item);
          const date = (
            item.dataRecebimento
            || item.dataPagamento
            || item.vencimento
            || ''
          );

          return (
            status === 'recebida'
            && date.slice(0, 7) === key
          );
        })
        .reduce(
          (sum, item) => sum + Number(item.valor || 0),
          0,
        );

      const expected = data.consolidated.todasReceitas
        .filter((item) => (
          deriveFinancialStatus(item) !== 'cancelada'
          && String(item.vencimento || '').slice(0, 7) === key
        ))
        .reduce(
          (sum, item) => sum + Number(item.valor || 0),
          0,
        );

      const paid = data.consolidated.despesas
        .filter((item) => {
          const status = deriveFinancialStatus(item);
          const date = (
            item.dataPagamento
            || item.vencimento
            || ''
          );

          return (
            status === 'paga'
            && date.slice(0, 7) === key
          );
        })
        .reduce(
          (sum, item) => sum + Number(item.valor || 0),
          0,
        );

      const payable = data.consolidated.despesas
        .filter((item) => (
          deriveFinancialStatus(item) !== 'cancelada'
          && String(item.vencimento || '').slice(0, 7) === key
        ))
        .reduce(
          (sum, item) => sum + Number(item.valor || 0),
          0,
        );

      rows.push({
        key,
        label,
        received,
        expected,
        paid,
        payable,
        realized: received - paid,
        projected: expected - payable,
      });
    }

    return rows;
  }, [
    data.consolidated.despesas,
    data.consolidated.todasReceitas,
    period,
  ]);

  const summary = useMemo(() => (
    cashFlow.reduce(
      (accumulator, row) => ({
        received: accumulator.received + row.received,
        expected: accumulator.expected + row.expected,
        paid: accumulator.paid + row.paid,
        payable: accumulator.payable + row.payable,
        realized: accumulator.realized + row.realized,
        projected: accumulator.projected + row.projected,
      }),
      {
        received: 0,
        expected: 0,
        paid: 0,
        payable: 0,
        realized: 0,
        projected: 0,
      },
    )
  ), [cashFlow]);

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="Fluxo de Caixa"
        subtitle="Compare o realizado com o previsto e acompanhe a evolução mensal."
        action={
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            style={{
              ...inputStyle,
              width: 'auto',
              minWidth: '150px',
            }}
          >
            <option value="3">Últimos 3 meses</option>
            <option value="6">Últimos 6 meses</option>
            <option value="12">Últimos 12 meses</option>
          </select>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '10px',
        }}
      >
        <ExecutiveMetric
          icon={ArrowUpCircle}
          label="Entradas realizadas"
          value={summary.received}
          tone="positive"
        />

        <ExecutiveMetric
          icon={ArrowDownCircle}
          label="Saídas realizadas"
          value={summary.paid}
          tone="negative"
        />

        <ExecutiveMetric
          icon={TrendingUp}
          label="Resultado realizado"
          value={summary.realized}
          tone={summary.realized >= 0 ? 'positive' : 'negative'}
        />

        <ExecutiveMetric
          icon={CalendarClock}
          label="Resultado previsto"
          value={summary.projected}
          tone={summary.projected >= 0 ? 'positive' : 'warning'}
        />
      </div>

      <div className="sf-card tall">
        <h3>Evolução mensal</h3>

        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={cashFlow}
            margin={{
              top: 8,
              right: 8,
              left: -10,
              bottom: 0,
            }}
          >
            <XAxis
              dataKey="label"
              stroke="#A1A1AA"
              tickLine={false}
              axisLine={false}
            />

            <YAxis
              stroke="#A1A1AA"
              tickFormatter={(value) => (
                `R$ ${Math.round(value / 1000)}k`
              )}
            />

            <Tooltip
              formatter={(value) => formatCurrency(value)}
              contentStyle={{
                background: '#111',
                border: '1px solid #333',
                borderRadius: 8,
              }}
            />

            <Bar
              dataKey="received"
              name="Entradas realizadas"
              fill="#34d399"
              radius={[4, 4, 0, 0]}
            />

            <Bar
              dataKey="paid"
              name="Saídas realizadas"
              fill="#f87171"
              radius={[4, 4, 0, 0]}
            />

            <Bar
              dataKey="projected"
              name="Resultado previsto"
              fill="#c5a059"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="sf-card tall">
        <h3>Projeção dos próximos 12 meses</h3>

        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={Array.from({ length: 12 }, (_, index) => {
              const reference = new Date();
              reference.setMonth(reference.getMonth() + index);

              const key = monthKey(reference);
              const label = reference.toLocaleDateString('pt-BR', {
                month: 'short',
                year: '2-digit',
              });

              const expectedIncome = data.consolidated.todasReceitas
                .filter((item) => (
                  deriveFinancialStatus(item) !== 'cancelada'
                  && String(item.vencimento || '').slice(0, 7) === key
                ))
                .reduce(
                  (sum, item) => sum + Number(item.valor || 0),
                  0,
                );

              const expectedExpenses = data.consolidated.despesas
                .filter((item) => (
                  deriveFinancialStatus(item) !== 'cancelada'
                  && String(item.vencimento || '').slice(0, 7) === key
                ))
                .reduce(
                  (sum, item) => sum + Number(item.valor || 0),
                  0,
                );

              return {
                label,
                entradas: expectedIncome,
                saidas: expectedExpenses,
                saldo: expectedIncome - expectedExpenses,
              };
            })}
            margin={{
              top: 8,
              right: 8,
              left: -10,
              bottom: 0,
            }}
          >
            <XAxis
              dataKey="label"
              stroke="#A1A1AA"
              tickLine={false}
              axisLine={false}
            />

            <YAxis
              stroke="#A1A1AA"
              tickFormatter={(value) => (
                `R$ ${Math.round(value / 1000)}k`
              )}
            />

            <Tooltip
              formatter={(value) => formatCurrency(value)}
              contentStyle={{
                background: '#111',
                border: '1px solid #333',
                borderRadius: 8,
              }}
            />

            <Bar
              dataKey="entradas"
              fill="#34d399"
              radius={[4, 4, 0, 0]}
            />

            <Bar
              dataKey="saidas"
              fill="#f87171"
              radius={[4, 4, 0, 0]}
            />

            <Bar
              dataKey="saldo"
              fill="#c5a059"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <SimpleTable
        columns={[
          'Mês',
          'Entradas',
          'Saídas',
          'Realizado',
          'Previsto',
        ]}
        rows={cashFlow}
        render={(row) => [
          row.label,
          formatCurrency(row.received),
          formatCurrency(row.paid),
          <strong
            style={{
              color: row.realized >= 0
                ? 'var(--color-success)'
                : 'var(--color-danger)',
            }}
          >
            {formatCurrency(row.realized)}
          </strong>,
          formatCurrency(row.projected),
        ]}
        empty="Nenhum dado de fluxo de caixa."
      />
    </div>
  );
}

function AgendaFinanceira({ data }) {
  const [days, setDays] = useState('30');

  const items = useMemo(() => {
    const today = new Date();
    const todayValue = today.toISOString().slice(0, 10);
    const limit = new Date(today);
    limit.setDate(limit.getDate() + Number(days || 30));
    const limitValue = limit.toISOString().slice(0, 10);

    const revenues = data.consolidated.todasReceitas
      .filter((item) => (
        deriveFinancialStatus(item) !== 'cancelada'
        && item.vencimento
        && item.vencimento >= todayValue
        && item.vencimento <= limitValue
      ))
      .map((item) => ({
        id: `agenda-receita-${item.id}`,
        type: 'Receita',
        description: item.descricao || 'Receita',
        client: item.clienteNome || '-',
        date: item.vencimento,
        value: Number(item.valor || 0),
        status: deriveFinancialStatus(item),
      }));

    const expenses = data.consolidated.despesas
      .filter((item) => (
        deriveFinancialStatus(item) !== 'cancelada'
        && item.vencimento
        && item.vencimento >= todayValue
        && item.vencimento <= limitValue
      ))
      .map((item) => ({
        id: `agenda-despesa-${item.id}`,
        type: 'Despesa',
        description: item.descricao || 'Despesa',
        client: item.fornecedor || '-',
        date: item.vencimento,
        value: -Number(item.valor || 0),
        status: deriveFinancialStatus(item),
      }));

    return [...revenues, ...expenses].sort(
      (first, second) => first.date.localeCompare(second.date),
    );
  }, [
    data.consolidated.despesas,
    data.consolidated.todasReceitas,
    days,
  ]);

  const summary = useMemo(() => {
    const income = items
      .filter((item) => item.value > 0)
      .reduce((sum, item) => sum + item.value, 0);

    const expense = items
      .filter((item) => item.value < 0)
      .reduce((sum, item) => sum + Math.abs(item.value), 0);

    return {
      income,
      expense,
      balance: income - expense,
    };
  }, [items]);

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="Agenda Financeira"
        subtitle="Vencimentos de receitas e despesas organizados por data."
        action={
          <select
            value={days}
            onChange={(event) => setDays(event.target.value)}
            style={{
              ...inputStyle,
              width: 'auto',
              minWidth: '150px',
            }}
          >
            <option value="7">Próximos 7 dias</option>
            <option value="30">Próximos 30 dias</option>
            <option value="60">Próximos 60 dias</option>
            <option value="90">Próximos 90 dias</option>
          </select>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '10px',
        }}
      >
        <ExecutiveMetric
          icon={ArrowUpCircle}
          label="Entradas previstas"
          value={summary.income}
          tone="positive"
        />
        <ExecutiveMetric
          icon={ArrowDownCircle}
          label="Saídas previstas"
          value={summary.expense}
          tone="negative"
        />
        <ExecutiveMetric
          icon={Wallet}
          label="Saldo do período"
          value={summary.balance}
          tone={summary.balance >= 0 ? 'positive' : 'negative'}
        />
      </div>

      <SimpleTable
        columns={[
          'Data',
          'Tipo',
          'Descrição',
          'Cliente / Fornecedor',
          'Status',
          'Valor',
        ]}
        rows={items}
        render={(row) => [
          row.date,
          <span className="sf-pill">{row.type}</span>,
          row.description,
          row.client,
          <span className={`sf-status ${String(row.status).toLowerCase()}`}>
            {row.status}
          </span>,
          <strong
            style={{
              color: row.value >= 0
                ? 'var(--color-success)'
                : 'var(--color-danger)',
            }}
          >
            {formatCurrency(row.value)}
          </strong>,
        ]}
        empty="Nenhum vencimento no período selecionado."
      />
    </div>
  );
}

function SimuladorFinanceiro({ data }) {
  const [revenueChange, setRevenueChange] = useState(0);
  const [expenseChange, setExpenseChange] = useState(0);
  const [investment, setInvestment] = useState('');

  const scenario = useMemo(() => {
    const baseRevenue = Number(data.receitaBruta || 0);
    const baseExpenses = Number(
      data.despesasFixas
      + data.despesasVariaveis
      + data.depreciacaoMensal,
    );

    const projectedRevenue = (
      baseRevenue * (1 + Number(revenueChange || 0) / 100)
    );

    const projectedExpenses = (
      baseExpenses * (1 + Number(expenseChange || 0) / 100)
      + parseCurrency(investment)
    );

    const currentProfit = baseRevenue - baseExpenses;
    const projectedProfit = projectedRevenue - projectedExpenses;
    const projectedMargin = projectedRevenue > 0
      ? (projectedProfit / projectedRevenue) * 100
      : 0;

    return {
      currentProfit,
      projectedRevenue,
      projectedExpenses,
      projectedProfit,
      projectedMargin,
      difference: projectedProfit - currentProfit,
    };
  }, [
    data.depreciacaoMensal,
    data.despesasFixas,
    data.despesasVariaveis,
    data.receitaBruta,
    expenseChange,
    investment,
    revenueChange,
  ]);

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="Simulador Financeiro"
        subtitle="Teste cenários antes de aumentar preços, custos ou fazer investimentos."
      />

      <div className="sf-card" style={{ padding: '16px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '12px',
          }}
        >
          <Field label="Variação da receita (%)">
            <input
              type="number"
              value={revenueChange}
              onChange={(event) => {
                setRevenueChange(Number(event.target.value));
              }}
              style={inputStyle}
            />
          </Field>

          <Field label="Variação das despesas (%)">
            <input
              type="number"
              value={expenseChange}
              onChange={(event) => {
                setExpenseChange(Number(event.target.value));
              }}
              style={inputStyle}
            />
          </Field>

          <Field label="Novo investimento">
            <MoneyInput
              value={investment}
              onChange={setInvestment}
              style={{
                color: 'var(--color-highlight)',
                fontWeight: 700,
              }}
            />
          </Field>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '10px',
        }}
      >
        <ExecutiveMetric
          icon={ArrowUpCircle}
          label="Receita projetada"
          value={scenario.projectedRevenue}
          tone="positive"
        />
        <ExecutiveMetric
          icon={ArrowDownCircle}
          label="Despesas projetadas"
          value={scenario.projectedExpenses}
          tone="negative"
        />
        <ExecutiveMetric
          icon={TrendingUp}
          label="Lucro projetado"
          value={scenario.projectedProfit}
          tone={scenario.projectedProfit >= 0 ? 'positive' : 'negative'}
        />
        <ExecutiveMetric
          icon={Gauge}
          label="Margem projetada"
          value={scenario.projectedMargin}
          detail={`${scenario.projectedMargin.toFixed(1)}%`}
        />
      </div>

      <div className="sf-card" style={{ padding: '16px' }}>
        <div className="formula-row">
          <span>Lucro atual</span>
          <strong>{formatCurrency(scenario.currentProfit)}</strong>
        </div>
        <div className="formula-row">
          <span>Lucro projetado</span>
          <strong>{formatCurrency(scenario.projectedProfit)}</strong>
        </div>
        <div className="formula-total">
          <span>Impacto do cenário</span>
          <strong
            style={{
              color: scenario.difference >= 0
                ? 'var(--color-success)'
                : 'var(--color-danger)',
            }}
          >
            {formatCurrency(scenario.difference)}
          </strong>
        </div>
      </div>
    </div>
  );
}

function ComparativoFinanceiro({ data }) {
  const [referenceMonth, setReferenceMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );

  const comparison = useMemo(() => {
    const [year, month] = referenceMonth.split('-').map(Number);
    const previousDate = new Date(year, month - 2, 1);
    const previousMonth = monthKey(previousDate);

    const calculate = (key) => {
      const revenues = data.consolidated.todasReceitas
        .filter((item) => (
          deriveFinancialStatus(item) !== 'cancelada'
          && String(
            item.dataRecebimento
            || item.vencimento
            || '',
          ).slice(0, 7) === key
        ));

      const expenses = data.consolidated.despesas
        .filter((item) => (
          deriveFinancialStatus(item) !== 'cancelada'
          && String(
            item.dataPagamento
            || item.vencimento
            || '',
          ).slice(0, 7) === key
        ));

      const revenue = revenues.reduce(
        (sum, item) => sum + Number(item.valor || 0),
        0,
      );

      const expense = expenses.reduce(
        (sum, item) => sum + Number(item.valor || 0),
        0,
      );

      const profit = revenue - expense;
      const margin = revenue > 0
        ? (profit / revenue) * 100
        : 0;

      return {
        revenue,
        expense,
        profit,
        margin,
      };
    };

    const current = calculate(referenceMonth);
    const previous = calculate(previousMonth);

    const delta = (currentValue, previousValue) => (
      previousValue === 0
        ? currentValue === 0
          ? 0
          : 100
        : ((currentValue - previousValue) / Math.abs(previousValue)) * 100
    );

    return {
      current,
      previous,
      deltas: {
        revenue: delta(current.revenue, previous.revenue),
        expense: delta(current.expense, previous.expense),
        profit: delta(current.profit, previous.profit),
        margin: current.margin - previous.margin,
      },
    };
  }, [
    data.consolidated.despesas,
    data.consolidated.todasReceitas,
    referenceMonth,
  ]);

  const rows = [
    {
      id: 'revenue',
      label: 'Receita',
      current: comparison.current.revenue,
      previous: comparison.previous.revenue,
      delta: comparison.deltas.revenue,
      inverse: false,
    },
    {
      id: 'expense',
      label: 'Despesas',
      current: comparison.current.expense,
      previous: comparison.previous.expense,
      delta: comparison.deltas.expense,
      inverse: true,
    },
    {
      id: 'profit',
      label: 'Lucro',
      current: comparison.current.profit,
      previous: comparison.previous.profit,
      delta: comparison.deltas.profit,
      inverse: false,
    },
    {
      id: 'margin',
      label: 'Margem',
      current: comparison.current.margin,
      previous: comparison.previous.margin,
      delta: comparison.deltas.margin,
      inverse: false,
      percentage: true,
    },
  ];

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="Comparativo Mensal"
        subtitle="Compare receita, despesas, lucro e margem com o mês anterior."
        action={
          <MonthInput
            value={referenceMonth}
            onChange={setReferenceMonth}
            style={{
              width: '150px',
            }}
          />
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '10px',
        }}
      >
        {rows.map((row) => {
          const isPositive = row.inverse
            ? row.delta <= 0
            : row.delta >= 0;

          return (
            <div
              key={row.id}
              className="sf-card"
              style={{ padding: '14px' }}
            >
              <span
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '0.72rem',
                }}
              >
                {row.label}
              </span>

              <strong
                style={{
                  display: 'block',
                  marginTop: '8px',
                  fontSize: '1.15rem',
                }}
              >
                {row.percentage
                  ? `${row.current.toFixed(1)}%`
                  : formatCurrency(row.current)}
              </strong>

              <div
                style={{
                  marginTop: '6px',
                  color: isPositive
                    ? 'var(--color-success)'
                    : 'var(--color-danger)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                }}
              >
                {row.delta >= 0 ? '+' : ''}
                {row.delta.toFixed(1)}
                {row.percentage ? ' p.p.' : '%'} em relação ao mês anterior
              </div>
            </div>
          );
        })}
      </div>

      <SimpleTable
        columns={[
          'Indicador',
          'Mês selecionado',
          'Mês anterior',
          'Variação',
        ]}
        rows={rows}
        render={(row) => [
          row.label,
          row.percentage
            ? `${row.current.toFixed(1)}%`
            : formatCurrency(row.current),
          row.percentage
            ? `${row.previous.toFixed(1)}%`
            : formatCurrency(row.previous),
          `${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(1)}${row.percentage ? ' p.p.' : '%'}`,
        ]}
        empty="Nenhum dado para comparação."
      />
    </div>
  );
}

function PlanejamentoFinanceiro({ data }) {
  const [referenceMonth, setReferenceMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );

  const [budgets, setBudgets] = useState(readCategoryBudgets);
  const [draftCategory, setDraftCategory] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [taxRate, setTaxRate] = useState(readTaxRate);
  const [reserveMonthsTarget, setReserveMonthsTarget] = useState(
    readReserveMonthsTarget,
  );

  const spentByCategory = useMemo(() => (
    groupBySum(
      data.consolidated.despesas.filter((item) => (
        deriveFinancialStatus(item) !== 'cancelada'
        && String(item.vencimento || '').slice(0, 7)
          === referenceMonth
      )),
      (item) => item.categoria || 'Outras',
    )
  ), [
    data.consolidated.despesas,
    referenceMonth,
  ]);

  const categoriesList = useMemo(() => (
    [
      ...new Set([
        ...FIXED_EXPENSE_CATEGORIES,
        ...VARIABLE_EXPENSE_CATEGORIES,
        ...Object.keys(spentByCategory),
        ...Object.keys(budgets),
      ]),
    ].sort((first, second) => (
      first.localeCompare(second, 'pt-BR')
    ))
  ), [budgets, spentByCategory]);

  const rows = useMemo(() => (
    categoriesList.map((category) => {
      const limit = Number(budgets[category] || 0);
      const spent = Number(spentByCategory[category] || 0);
      const remaining = limit - spent;
      const progress = limit > 0
        ? Math.min(100, (spent / limit) * 100)
        : 0;

      return {
        id: category,
        category,
        limit,
        spent,
        remaining,
        progress,
        exceeded: limit > 0 && spent > limit,
      };
    })
  ), [
    budgets,
    categoriesList,
    spentByCategory,
  ]);

  const totalBudget = rows.reduce(
    (sum, row) => sum + row.limit,
    0,
  );

  const totalSpent = rows.reduce(
    (sum, row) => sum + row.spent,
    0,
  );

  const saveBudget = () => {
    const value = parseCurrency(draftValue);

    if (!draftCategory) {
      alert('Selecione uma categoria.');
      return;
    }

    if (value <= 0) {
      alert('Informe um limite maior que zero.');
      return;
    }

    const next = {
      ...budgets,
      [draftCategory]: value,
    };

    setBudgets(next);
    localStorage.setItem(
      FINANCE_BUDGET_STORAGE_KEY,
      JSON.stringify(next),
    );

    setDraftCategory('');
    setDraftValue('');
  };

  const removeBudget = (category) => {
    const next = { ...budgets };
    delete next[category];

    setBudgets(next);
    localStorage.setItem(
      FINANCE_BUDGET_STORAGE_KEY,
      JSON.stringify(next),
    );
  };

  const currentMonthRevenue = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);

    return data.consolidated.todasReceitas
      .filter((item) => (
        deriveFinancialStatus(item) !== 'cancelada'
        && String(
          item.dataRecebimento
          || item.vencimento
          || '',
        ).slice(0, 7) === currentMonth
      ))
      .reduce(
        (sum, item) => sum + Number(item.valor || 0),
        0,
      );
  }, [data.consolidated.todasReceitas]);

  const taxProvision = (
    currentMonthRevenue * Number(taxRate || 0) / 100
  );

  const reserveTarget = (
    data.custoOperacional * Number(reserveMonthsTarget || 0)
  );

  const reserveGap = Math.max(
    0,
    reserveTarget - data.saldos.reserva,
  );

  const savePlanningParameters = () => {
    localStorage.setItem(
      FINANCE_TAX_RATE_STORAGE_KEY,
      String(Math.max(0, Number(taxRate || 0))),
    );

    localStorage.setItem(
      FINANCE_RESERVE_MONTHS_STORAGE_KEY,
      String(Math.max(1, Number(reserveMonthsTarget || 1))),
    );
  };

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="Planejamento Orçamentário"
        subtitle="Defina limites por categoria e acompanhe o consumo do orçamento mensal."
        action={
          <MonthInput
            value={referenceMonth}
            onChange={setReferenceMonth}
            style={{
              width: '150px',
            }}
          />
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '10px',
        }}
      >
        <ExecutiveMetric
          icon={Target}
          label="Orçamento total"
          value={totalBudget}
        />

        <ExecutiveMetric
          icon={ArrowDownCircle}
          label="Total utilizado"
          value={totalSpent}
          tone="warning"
        />

        <ExecutiveMetric
          icon={Wallet}
          label="Saldo disponível"
          value={totalBudget - totalSpent}
          tone={
            totalBudget - totalSpent >= 0
              ? 'positive'
              : 'negative'
          }
        />
      </div>

      <div className="sf-card" style={{ padding: '14px' }}>
        <h3 style={{ marginTop: 0 }}>Impostos e reserva</h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px',
          }}
        >
          <Field label="Alíquota estimada de impostos (%)">
            <input
              type="number"
              min="0"
              value={taxRate}
              onChange={(event) => {
                setTaxRate(Number(event.target.value));
              }}
              style={inputStyle}
            />
          </Field>

          <Field label="Meta de reserva (meses de custo)">
            <input
              type="number"
              min="1"
              value={reserveMonthsTarget}
              onChange={(event) => {
                setReserveMonthsTarget(Number(event.target.value));
              }}
              style={inputStyle}
            />
          </Field>

          <button
            type="button"
            className="sf-primary-button"
            onClick={savePlanningParameters}
            style={{
              alignSelf: 'end',
              minHeight: '43px',
            }}
          >
            Salvar parâmetros
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '10px',
            marginTop: '12px',
          }}
        >
          <ExecutiveMetric
            icon={Receipt}
            label="Provisão de impostos"
            value={taxProvision}
            tone="warning"
          />

          <ExecutiveMetric
            icon={PiggyBank}
            label="Meta da reserva"
            value={reserveTarget}
          />

          <ExecutiveMetric
            icon={Wallet}
            label="Falta para a reserva"
            value={reserveGap}
            tone={reserveGap > 0 ? 'warning' : 'positive'}
          />
        </div>
      </div>

      <div className="sf-card" style={{ padding: '14px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(180px, 1fr) minmax(150px, .7fr) auto',
            gap: '9px',
          }}
        >
          <select
            value={draftCategory}
            onChange={(event) => {
              setDraftCategory(event.target.value);
            }}
            style={inputStyle}
          >
            <option value="">Selecione a categoria</option>

            {categoriesList.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <input
            value={draftValue}
            onChange={(event) => {
              setDraftValue(maskCurrency(event.target.value));
            }}
            placeholder="Limite mensal"
            style={inputStyle}
          />

          <button
            type="button"
            className="sf-primary-button"
            onClick={saveBudget}
          >
            Salvar limite
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '10px',
        }}
      >
        {rows
          .filter((row) => row.limit > 0 || row.spent > 0)
          .map((row) => (
            <div
              key={row.id}
              className="sf-card"
              style={{
                padding: '13px',
                borderColor: row.exceeded
                  ? 'var(--color-danger)'
                  : undefined,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '10px',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <strong>{row.category}</strong>

                  <div
                    className="sf-muted"
                    style={{
                      fontSize: '0.68rem',
                      marginTop: '4px',
                    }}
                  >
                    {formatCurrency(row.spent)} de{' '}
                    {formatCurrency(row.limit)}
                  </div>
                </div>

                {row.limit > 0 && (
                  <button
                    type="button"
                    onClick={() => removeBudget(row.category)}
                    style={{
                      background: 'transparent',
                      border: 0,
                      color: 'var(--color-danger)',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              <div
                style={{
                  height: '8px',
                  marginTop: '10px',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,.06)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${row.progress}%`,
                    height: '100%',
                    background: row.exceeded
                      ? 'var(--color-danger)'
                      : row.progress >= 80
                        ? 'var(--color-warning)'
                        : 'var(--color-success)',
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: '8px',
                  color: row.remaining >= 0
                    ? 'var(--text-secondary)'
                    : 'var(--color-danger)',
                  fontSize: '0.68rem',
                }}
              >
                {row.remaining >= 0
                  ? `Restam ${formatCurrency(row.remaining)}`
                  : `Limite excedido em ${formatCurrency(Math.abs(row.remaining))}`}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function ControleFinanceiro({ data }) {
  const [reconciliation, setReconciliation] = useState(
    readReconciliationState,
  );
  const [serviceGoals, setServiceGoals] = useState(readServiceGoals);
  const [goalService, setGoalService] = useState('');
  const [goalValue, setGoalValue] = useState('');
  const closings = useMemo(readMonthClosings, []);

  const breakEven = useMemo(() => {
    const fixedCost = Number(
      data.despesasFixas + data.depreciacaoMensal,
    );

    const contributionMargin = data.receitaBruta > 0
      ? Math.max(
        0.01,
        (
          data.receitaBruta - data.despesasVariaveis
        ) / data.receitaBruta,
      )
      : 0.5;

    const value = fixedCost / contributionMargin;
    const averageTicket = (
      data.consolidated.todasReceitas.length > 0
        ? data.consolidated.todasReceitas.reduce(
          (sum, item) => sum + Number(item.valor || 0),
          0,
        ) / data.consolidated.todasReceitas.length
        : 0
    );

    return {
      fixedCost,
      contributionMargin,
      value,
      contracts: averageTicket > 0
        ? Math.ceil(value / averageTicket)
        : 0,
      averageTicket,
    };
  }, [
    data.consolidated.todasReceitas,
    data.depreciacaoMensal,
    data.despesasFixas,
    data.despesasVariaveis,
    data.receitaBruta,
  ]);

  const reconciliationRows = useMemo(() => {
    const revenues = data.consolidated.todasReceitas
      .filter((item) => deriveFinancialStatus(item) === 'recebida')
      .map((item) => ({
        id: `receita-${item.id}`,
        type: 'Receita',
        description: item.descricao || 'Receita',
        date: item.dataRecebimento || item.vencimento || '',
        value: Number(item.valor || 0),
      }));

    const expenses = data.consolidated.despesas
      .filter((item) => deriveFinancialStatus(item) === 'paga')
      .map((item) => ({
        id: `despesa-${item.id}`,
        type: 'Despesa',
        description: item.descricao || 'Despesa',
        date: item.dataPagamento || item.vencimento || '',
        value: -Number(item.valor || 0),
      }));

    return [...revenues, ...expenses]
      .sort((first, second) => (
        String(second.date).localeCompare(String(first.date))
      ))
      .slice(0, 100);
  }, [
    data.consolidated.despesas,
    data.consolidated.todasReceitas,
  ]);

  const reconciledCount = reconciliationRows.filter(
    (item) => reconciliation[item.id],
  ).length;

  const toggleReconciliation = (id) => {
    const next = {
      ...reconciliation,
      [id]: !reconciliation[id],
    };

    setReconciliation(next);
    localStorage.setItem(
      FINANCE_RECONCILIATION_STORAGE_KEY,
      JSON.stringify(next),
    );
  };

  const revenueByService = useMemo(() => (
    groupBySum(
      data.consolidated.todasReceitas.filter(
        (item) => deriveFinancialStatus(item) !== 'cancelada',
      ),
      (item) => (
        item.tipoServico
        || item.categoria
        || 'Outros'
      ),
    )
  ), [data.consolidated.todasReceitas]);

  const serviceNames = useMemo(() => (
    [
      ...new Set([
        ...Object.keys(revenueByService),
        ...Object.keys(serviceGoals),
      ]),
    ].sort((first, second) => (
      first.localeCompare(second, 'pt-BR')
    ))
  ), [revenueByService, serviceGoals]);

  const saveServiceGoal = () => {
    const value = parseCurrency(goalValue);

    if (!goalService || value <= 0) {
      alert('Selecione um serviço e informe uma meta válida.');
      return;
    }

    const next = {
      ...serviceGoals,
      [goalService]: value,
    };

    setServiceGoals(next);
    localStorage.setItem(
      FINANCE_SERVICE_GOALS_STORAGE_KEY,
      JSON.stringify(next),
    );

    setGoalService('');
    setGoalValue('');
  };

  const closingRows = Object.values(closings)
    .sort((first, second) => (
      String(second.month).localeCompare(String(first.month))
    ));

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="Controle Financeiro"
        subtitle="Ponto de equilíbrio, conciliação, fechamentos e metas por serviço."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(175px, 1fr))',
          gap: '10px',
        }}
      >
        <ExecutiveMetric
          icon={Scale}
          label="Ponto de equilíbrio"
          value={breakEven.value}
          tone="warning"
          detail={`${breakEven.contracts} venda(s) no ticket médio`}
        />

        <ExecutiveMetric
          icon={CircleDollarSign}
          label="Ticket médio"
          value={breakEven.averageTicket}
        />

        <ExecutiveMetric
          icon={Gauge}
          label="Margem de contribuição"
          value={breakEven.contributionMargin * 100}
          detail={`${(breakEven.contributionMargin * 100).toFixed(1)}%`}
        />

        <ExecutiveMetric
          icon={CheckCircle2}
          label="Itens conciliados"
          value={reconciledCount}
          detail={`${reconciliationRows.length} movimentação(ões)`}
        />
      </div>

      <div className="sf-card tall">
        <h3>Metas por serviço</h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(180px, 1fr) minmax(150px, .7fr) auto',
            gap: '9px',
          }}
        >
          <select
            value={goalService}
            onChange={(event) => setGoalService(event.target.value)}
            style={inputStyle}
          >
            <option value="">Selecione o serviço</option>

            {serviceNames.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>

          <input
            value={goalValue}
            onChange={(event) => {
              setGoalValue(maskCurrency(event.target.value));
            }}
            placeholder="Meta mensal"
            style={inputStyle}
          />

          <button
            type="button"
            className="sf-primary-button"
            onClick={saveServiceGoal}
          >
            Salvar meta
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '9px',
            marginTop: '12px',
          }}
        >
          {serviceNames.map((service) => {
            const goal = Number(serviceGoals[service] || 0);
            const realized = Number(revenueByService[service] || 0);
            const progress = goal > 0
              ? Math.min(100, (realized / goal) * 100)
              : 0;

            if (goal <= 0 && realized <= 0) return null;

            return (
              <div
                key={service}
                style={{
                  padding: '11px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '9px',
                  background: 'rgba(255,255,255,.02)',
                }}
              >
                <strong>{service}</strong>

                <div
                  className="sf-muted"
                  style={{
                    marginTop: '5px',
                    fontSize: '0.68rem',
                  }}
                >
                  {formatCurrency(realized)} de {formatCurrency(goal)}
                </div>

                <div
                  style={{
                    height: '8px',
                    marginTop: '9px',
                    borderRadius: '999px',
                    overflow: 'hidden',
                    background: 'rgba(255,255,255,.06)',
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: progress >= 100
                        ? 'var(--color-success)'
                        : 'var(--color-highlight)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sf-card tall">
        <h3>Conciliação financeira</h3>

        <div
          className="sf-muted"
          style={{
            marginBottom: '10px',
          }}
        >
          Marque os lançamentos que já foram conferidos no extrato bancário.
        </div>

        <SimpleTable
          columns={[
            'Conferido',
            'Data',
            'Tipo',
            'Descrição',
            'Valor',
          ]}
          rows={reconciliationRows}
          render={(row) => [
            <input
              type="checkbox"
              checked={Boolean(reconciliation[row.id])}
              onChange={() => toggleReconciliation(row.id)}
            />,
            row.date,
            row.type,
            row.description,
            <strong
              style={{
                color: row.value >= 0
                  ? 'var(--color-success)'
                  : 'var(--color-danger)',
              }}
            >
              {formatCurrency(row.value)}
            </strong>,
          ]}
          empty="Nenhuma movimentação paga ou recebida."
        />
      </div>

      <div className="sf-card tall">
        <h3>Histórico de fechamentos</h3>

        <SimpleTable
          columns={[
            'Competência',
            'Fechado em',
            'Receita',
            'Lucro líquido',
            'Margem',
          ]}
          rows={closingRows}
          render={(row) => [
            row.month,
            new Date(row.closedAt).toLocaleString('pt-BR'),
            formatCurrency(row.grossRevenue),
            formatCurrency(row.netProfit),
            `${Number(row.margin || 0).toFixed(1)}%`,
          ]}
          empty="Nenhum mês foi fechado ainda."
        />
      </div>
    </div>
  );
}


function FerramentasFinanceiras({ data }) {
  const [annualGoal, setAnnualGoal] = useState(readAnnualGoal);
  const [annualGoalDraft, setAnnualGoalDraft] = useState(() => (
    maskCurrency(String(Math.round(readAnnualGoal() * 100)))
  ));
  const [pricing, setPricing] = useState({
    hours: 8,
    hourlyValue: maskCurrency(250),
    directCosts: maskCurrency(800),
    taxRate: 6,
    desiredMargin: 30,
  });
  const [savingsGoals, setSavingsGoals] = useState(readSavingsGoals);
  const [goalDraft, setGoalDraft] = useState({
    name: '',
    target: '',
    current: '',
    deadline: '',
  });
  const [backupMessage, setBackupMessage] = useState('');

  const annualSummary = useMemo(() => {
    const currentYear = String(new Date().getFullYear());

    const realized = data.consolidated.todasReceitas
      .filter((item) => {
        const status = deriveFinancialStatus(item);
        const date = (
          item.dataRecebimento
          || item.dataPagamento
          || item.vencimento
          || ''
        );

        return status === 'recebida' && date.slice(0, 4) === currentYear;
      })
      .reduce((sum, item) => sum + Number(item.valor || 0), 0);

    const progress = annualGoal > 0
      ? Math.min(100, (realized / annualGoal) * 100)
      : 0;

    const remainingMonths = Math.max(1, 12 - new Date().getMonth());

    return {
      realized,
      progress,
      remaining: Math.max(0, annualGoal - realized),
      requiredMonthly: Math.max(0, annualGoal - realized) / remainingMonths,
    };
  }, [annualGoal, data.consolidated.todasReceitas]);

  const pricingResult = useMemo(() => {
    const labor = Number(pricing.hours || 0)
      * parseCurrency(pricing.hourlyValue);
    const subtotal = labor + parseCurrency(pricing.directCosts);
    const taxRate = Number(pricing.taxRate || 0) / 100;
    const marginRate = Number(pricing.desiredMargin || 0) / 100;
    const denominator = Math.max(0.01, 1 - taxRate - marginRate);
    const minimumPrice = subtotal / denominator;
    const taxes = minimumPrice * taxRate;
    const profit = minimumPrice - subtotal - taxes;

    return {
      labor,
      subtotal,
      profit,
      minimumPrice,
    };
  }, [pricing]);

  const anomalies = useMemo(() => {
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const previousMonths = Array.from({ length: 3 }, (_, index) => (
      monthKey(new Date(now.getFullYear(), now.getMonth() - index - 1, 1))
    ));

    const currentByCategory = groupBySum(
      data.consolidated.despesas.filter((item) => (
        deriveFinancialStatus(item) !== 'cancelada'
        && String(item.vencimento || '').slice(0, 7) === currentMonth
      )),
      (item) => item.categoria || 'Outras',
    );

    const historicByCategory = {};

    previousMonths.forEach((month) => {
      const monthData = groupBySum(
        data.consolidated.despesas.filter((item) => (
          deriveFinancialStatus(item) !== 'cancelada'
          && String(item.vencimento || '').slice(0, 7) === month
        )),
        (item) => item.categoria || 'Outras',
      );

      Object.entries(monthData).forEach(([category, value]) => {
        if (!historicByCategory[category]) {
          historicByCategory[category] = [];
        }

        historicByCategory[category].push(Number(value || 0));
      });
    });

    return Object.entries(currentByCategory)
      .map(([category, current]) => {
        const history = historicByCategory[category] || [];
        const average = history.length
          ? history.reduce((sum, value) => sum + value, 0) / history.length
          : 0;
        const variation = average > 0
          ? ((current - average) / average) * 100
          : 0;

        return {
          id: category,
          category,
          current,
          average,
          variation,
          alert: average > 0 && variation >= 25,
        };
      })
      .filter((item) => item.alert)
      .sort((first, second) => second.variation - first.variation);
  }, [data.consolidated.despesas]);

  const saveAnnualGoal = () => {
    const value = parseCurrency(annualGoalDraft);

    if (value <= 0) {
      alert('Informe uma meta anual válida.');
      return;
    }

    setAnnualGoal(value);
    localStorage.setItem(FINANCE_ANNUAL_GOAL_STORAGE_KEY, String(value));
  };

  const addSavingsGoal = () => {
    const target = parseCurrency(goalDraft.target);
    const current = parseCurrency(goalDraft.current);

    if (!goalDraft.name.trim() || target <= 0) {
      alert('Informe um nome e um valor objetivo.');
      return;
    }

    const next = [
      {
        id: createId('financial-goal'),
        name: goalDraft.name.trim(),
        target,
        current: Math.max(0, current),
        deadline: goalDraft.deadline || '',
        createdAt: new Date().toISOString(),
      },
      ...savingsGoals,
    ];

    setSavingsGoals(next);
    localStorage.setItem(
      FINANCE_SAVINGS_GOALS_STORAGE_KEY,
      JSON.stringify(next),
    );
    setGoalDraft({
      name: '',
      target: '',
      current: '',
      deadline: '',
    });
  };

  const updateSavingsGoal = (id, current) => {
    const next = savingsGoals.map((goal) => (
      goal.id === id
        ? { ...goal, current: Math.max(0, current) }
        : goal
    ));

    setSavingsGoals(next);
    localStorage.setItem(
      FINANCE_SAVINGS_GOALS_STORAGE_KEY,
      JSON.stringify(next),
    );
  };

  const removeSavingsGoal = (id) => {
    const next = savingsGoals.filter((goal) => goal.id !== id);

    setSavingsGoals(next);
    localStorage.setItem(
      FINANCE_SAVINGS_GOALS_STORAGE_KEY,
      JSON.stringify(next),
    );
  };

  const exportBackup = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      finances: readStorage(STORAGE_KEYS.finances, []),
      recurrences: readStorage(STORAGE_KEYS.recurrences, []),
      distribution: data.financasConfig,
      annualGoal,
      categoryBudgets: readCategoryBudgets(),
      serviceGoals: readServiceGoals(),
      savingsGoals,
      closings: readMonthClosings(),
      reconciliation: readReconciliationState(),
    };

    const blob = new Blob(
      [JSON.stringify(payload, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `studioflow-financeiro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setBackupMessage('Backup financeiro exportado com sucesso.');
  };

  const importBackup = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());

      if (!payload || !Array.isArray(payload.finances)) {
        throw new Error('Arquivo de backup inválido.');
      }

      const confirmed = window.confirm(
        'A importação substituirá os dados financeiros locais. Deseja continuar?',
      );

      if (!confirmed) return;

      writeStorage(STORAGE_KEYS.finances, payload.finances);

      if (Array.isArray(payload.recurrences)) {
        writeStorage(STORAGE_KEYS.recurrences, payload.recurrences);
      }

      if (payload.distribution) {
        localStorage.setItem(
          FINANCE_STORAGE_KEYS.config,
          JSON.stringify(payload.distribution),
        );
      }

      if (payload.annualGoal) {
        localStorage.setItem(
          FINANCE_ANNUAL_GOAL_STORAGE_KEY,
          String(payload.annualGoal),
        );
      }

      if (payload.categoryBudgets) {
        localStorage.setItem(
          FINANCE_BUDGET_STORAGE_KEY,
          JSON.stringify(payload.categoryBudgets),
        );
      }

      if (payload.serviceGoals) {
        localStorage.setItem(
          FINANCE_SERVICE_GOALS_STORAGE_KEY,
          JSON.stringify(payload.serviceGoals),
        );
      }

      if (Array.isArray(payload.savingsGoals)) {
        localStorage.setItem(
          FINANCE_SAVINGS_GOALS_STORAGE_KEY,
          JSON.stringify(payload.savingsGoals),
        );
      }

      if (payload.closings) {
        localStorage.setItem(
          FINANCE_CLOSINGS_STORAGE_KEY,
          JSON.stringify(payload.closings),
        );
      }

      if (payload.reconciliation) {
        localStorage.setItem(
          FINANCE_RECONCILIATION_STORAGE_KEY,
          JSON.stringify(payload.reconciliation),
        );
      }

      setBackupMessage('Backup importado. Atualizando dados...');
      await data.loadAll();
      window.dispatchEvent(new Event('sf_storage_update'));
    } catch (error) {
      alert(error.message || 'Não foi possível importar o backup.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="Ferramentas Financeiras"
        subtitle="Precificação, meta anual, objetivos, anomalias e backup."
      />

      <div className="sf-card tall">
        <h3>Calculadora de preço mínimo</h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '10px',
        }}>
          {[
            ['hours', 'Horas de trabalho', 'number'],
            ['hourlyValue', 'Valor da hora', 'money'],
            ['directCosts', 'Custos diretos', 'money'],
            ['taxRate', 'Impostos (%)', 'number'],
            ['desiredMargin', 'Margem desejada (%)', 'number'],
          ].map(([field, label, type]) => (
            <Field key={field} label={label}>
              {type === 'money' ? (
                <MoneyInput
                  value={pricing[field]}
                  onChange={(value) => {
                    setPricing({
                      ...pricing,
                      [field]: value,
                    });
                  }}
                />
              ) : (
                <input
                  type="number"
                  min="0"
                  value={pricing[field]}
                  onChange={(event) => {
                    setPricing({
                      ...pricing,
                      [field]: Number(event.target.value),
                    });
                  }}
                  style={inputStyle}
                />
              )}
            </Field>
          ))}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '10px',
          marginTop: '12px',
        }}>
          <ExecutiveMetric icon={BriefcaseBusiness} label="Mão de obra" value={pricingResult.labor} />
          <ExecutiveMetric icon={Receipt} label="Custos + mão de obra" value={pricingResult.subtotal} tone="warning" />
          <ExecutiveMetric icon={CircleDollarSign} label="Preço mínimo recomendado" value={pricingResult.minimumPrice} tone="positive" />
          <ExecutiveMetric icon={TrendingUp} label="Lucro estimado" value={pricingResult.profit} tone="positive" />
        </div>
      </div>

      <div className="sf-card tall">
        <h3>Meta anual</h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, 1fr) auto',
          gap: '10px',
        }}>
          <input
            value={annualGoalDraft}
            onChange={(event) => {
              setAnnualGoalDraft(maskCurrency(event.target.value));
            }}
            style={inputStyle}
          />

          <button type="button" className="sf-primary-button" onClick={saveAnnualGoal}>
            Salvar meta
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '10px',
          marginTop: '12px',
        }}>
          <ExecutiveMetric icon={Target} label="Meta anual" value={annualGoal} />
          <ExecutiveMetric icon={ArrowUpCircle} label="Realizado no ano" value={annualSummary.realized} tone="positive" />
          <ExecutiveMetric icon={CalendarClock} label="Falta realizar" value={annualSummary.remaining} tone="warning" />
          <ExecutiveMetric icon={TrendingUp} label="Média mensal necessária" value={annualSummary.requiredMonthly} />
        </div>

        <div style={{
          height: '10px',
          marginTop: '12px',
          borderRadius: '999px',
          background: 'rgba(255,255,255,.06)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${annualSummary.progress}%`,
            height: '100%',
            background: annualSummary.progress >= 100
              ? 'var(--color-success)'
              : 'var(--color-highlight)',
          }} />
        </div>
      </div>

      <div className="sf-card tall">
        <h3>Objetivos financeiros</h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, 1.2fr) repeat(3, minmax(130px, .7fr)) auto',
          gap: '9px',
        }}>
          <input
            value={goalDraft.name}
            onChange={(event) => {
              setGoalDraft({ ...goalDraft, name: event.target.value });
            }}
            placeholder="Ex.: Nova câmera"
            style={inputStyle}
          />
          <input
            value={goalDraft.target}
            onChange={(event) => {
              setGoalDraft({
                ...goalDraft,
                target: maskCurrency(event.target.value),
              });
            }}
            placeholder="Valor objetivo"
            style={inputStyle}
          />
          <input
            value={goalDraft.current}
            onChange={(event) => {
              setGoalDraft({
                ...goalDraft,
                current: maskCurrency(event.target.value),
              });
            }}
            placeholder="Valor atual"
            style={inputStyle}
          />
          <DateInput
            value={goalDraft.deadline}
            onChange={(value) => {
              setGoalDraft({
                ...goalDraft,
                deadline: value,
              });
            }}
          />
          <button type="button" className="sf-primary-button" onClick={addSavingsGoal}>
            Adicionar
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '10px',
          marginTop: '12px',
        }}>
          {savingsGoals.map((goal) => {
            const progress = goal.target > 0
              ? Math.min(100, (goal.current / goal.target) * 100)
              : 0;

            return (
              <div key={goal.id} style={{
                padding: '12px',
                background: 'rgba(255,255,255,.02)',
                border: '1px solid var(--border-color)',
                borderRadius: '9px',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}>
                  <div>
                    <strong>{goal.name}</strong>
                    <div className="sf-muted" style={{ marginTop: '4px', fontSize: '0.68rem' }}>
                      {formatCurrency(goal.current)} de {formatCurrency(goal.target)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSavingsGoal(goal.id)}
                    style={{
                      background: 'transparent',
                      color: 'var(--color-danger)',
                      border: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div style={{
                  height: '8px',
                  marginTop: '9px',
                  borderRadius: '999px',
                  overflow: 'hidden',
                  background: 'rgba(255,255,255,.06)',
                }}>
                  <div style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: progress >= 100
                      ? 'var(--color-success)'
                      : 'var(--color-highlight)',
                  }} />
                </div>

                <MoneyInput
                  value={maskCurrency(Number(goal.current || 0))}
                  onChange={(value) => {
                    updateSavingsGoal(
                      goal.id,
                      parseCurrency(value),
                    );
                  }}
                  style={{
                    marginTop: '10px',
                  }}
                />

                {goal.deadline && (
                  <div className="sf-muted" style={{ marginTop: '6px', fontSize: '0.66rem' }}>
                    Prazo: {formatDateBR(goal.deadline)}
                  </div>
                )}
              </div>
            );
          })}

          {savingsGoals.length === 0 && (
            <p className="sf-muted">Nenhum objetivo financeiro cadastrado.</p>
          )}
        </div>
      </div>

      <div className="sf-card tall">
        <h3>Anomalias de despesas</h3>

        {anomalies.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {anomalies.map((item) => (
              <div key={item.id} style={{
                padding: '11px',
                borderRadius: '9px',
                background: 'rgba(248,113,113,.05)',
                border: '1px solid rgba(248,113,113,.22)',
              }}>
                <strong style={{ color: 'var(--color-danger)' }}>
                  {item.category}: +{item.variation.toFixed(1)}%
                </strong>
                <div className="sf-muted" style={{ marginTop: '5px', fontSize: '0.7rem' }}>
                  Atual: {formatCurrency(item.current)} · Média anterior: {formatCurrency(item.average)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="sf-muted">
            Nenhuma categoria está 25% acima da média dos últimos três meses.
          </p>
        )}
      </div>

      <div className="sf-card tall">
        <h3>Backup financeiro</h3>

        <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
          <button type="button" className="sf-secondary-button" onClick={exportBackup}>
            <Save size={16} />
            Exportar backup
          </button>

          <label className="sf-secondary-button" style={{ cursor: 'pointer' }}>
            <Upload size={16} />
            Importar backup
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                void importBackup(event);
              }}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {backupMessage && (
          <div className="sf-muted" style={{ marginTop: '9px' }}>
            {backupMessage}
          </div>
        )}
      </div>
    </div>
  );
}


function DiagnosticoFinanceiro({ data }) {
  const [journal, setJournal] = useState(readFinanceJournal);
  const [journalText, setJournalText] = useState('');
  const [journalType, setJournalType] = useState('Observação');

  const analysis = useMemo(() => {
    const revenues = data.consolidated.todasReceitas || [];
    const expenses = data.consolidated.despesas || [];

    const received = revenues.filter(
      (item) => deriveFinancialStatus(item) === 'recebida',
    );

    const paid = expenses.filter(
      (item) => deriveFinancialStatus(item) === 'paga',
    );

    const paymentMethods = {};

    received.forEach((item) => {
      const key = (
        item.formaPagamento
        || item.forma_pagamento
        || 'Não informado'
      );

      paymentMethods[key] = (
        paymentMethods[key] || 0
      ) + Number(item.valor || 0);
    });

    paid.forEach((item) => {
      const key = (
        item.formaPagamento
        || item.forma_pagamento
        || 'Não informado'
      );

      paymentMethods[key] = (
        paymentMethods[key] || 0
      ) - Number(item.valor || 0);
    });

    const totalBalance = (
      Number(data.saldos.empresa || 0)
      + Number(data.saldos.reserva || 0)
      + Number(data.saldos.salario || 0)
    );

    const monthlyBurn = Math.max(
      0,
      Number(data.custoOperacional || 0),
    );

    const runwayMonths = monthlyBurn > 0
      ? totalBalance / monthlyBurn
      : 0;

    const byClient = groupBySum(
      revenues.filter(
        (item) => deriveFinancialStatus(item) !== 'cancelada',
      ),
      (item) => item.clienteNome || 'Sem cliente',
    );

    const clientEntries = Object.entries(byClient)
      .sort((first, second) => second[1] - first[1]);

    const totalClientRevenue = clientEntries.reduce(
      (sum, [, value]) => sum + Number(value || 0),
      0,
    );

    const largestClient = clientEntries[0] || null;

    const largestClientShare = (
      largestClient && totalClientRevenue > 0
        ? (largestClient[1] / totalClientRevenue) * 100
        : 0
    );

    const topThreeShare = totalClientRevenue > 0
      ? (
        clientEntries
          .slice(0, 3)
          .reduce(
            (sum, [, value]) => sum + Number(value || 0),
            0,
          )
        / totalClientRevenue
      ) * 100
      : 0;

    const recurring = revenues.filter((item) => (
      item.recorrente === true
      || Boolean(item.recorrenciaId)
      || Boolean(item.recurrence_id)
      || String(item.categoria || '')
        .toLowerCase()
        .includes('recorr')
    ));

    const recurringValue = recurring
      .filter((item) => deriveFinancialStatus(item) !== 'cancelada')
      .reduce(
        (sum, item) => sum + Number(item.valor || 0),
        0,
      );

    const activeRevenue = revenues
      .filter((item) => deriveFinancialStatus(item) !== 'cancelada')
      .reduce(
        (sum, item) => sum + Number(item.valor || 0),
        0,
      );

    const recurringShare = activeRevenue > 0
      ? (recurringValue / activeRevenue) * 100
      : 0;

    return {
      paymentMethods,
      totalBalance,
      monthlyBurn,
      runwayMonths,
      byClient,
      clientEntries,
      largestClient,
      largestClientShare,
      topThreeShare,
      recurringCount: recurring.length,
      recurringValue,
      recurringShare,
    };
  }, [
    data.consolidated.despesas,
    data.consolidated.todasReceitas,
    data.custoOperacional,
    data.saldos.empresa,
    data.saldos.reserva,
    data.saldos.salario,
  ]);

  const addJournalEntry = () => {
    const text = journalText.trim();

    if (!text) {
      alert('Digite uma observação financeira.');
      return;
    }

    const next = [
      {
        id: createId('finance-journal'),
        type: journalType,
        text,
        createdAt: new Date().toISOString(),
      },
      ...journal,
    ];

    setJournal(next);
    localStorage.setItem(
      FINANCE_JOURNAL_STORAGE_KEY,
      JSON.stringify(next),
    );
    setJournalText('');
  };

  const removeJournalEntry = (id) => {
    const next = journal.filter((item) => item.id !== id);

    setJournal(next);
    localStorage.setItem(
      FINANCE_JOURNAL_STORAGE_KEY,
      JSON.stringify(next),
    );
  };

  const paymentRows = Object.entries(analysis.paymentMethods)
    .map(([method, value]) => ({
      id: method,
      method,
      value,
    }))
    .sort((first, second) => (
      Math.abs(second.value) - Math.abs(first.value)
    ));

  const clientRows = analysis.clientEntries
    .slice(0, 10)
    .map(([client, value]) => ({
      id: client,
      client,
      value,
      share: (
        analysis.clientEntries.reduce(
          (sum, [, current]) => sum + Number(current || 0),
          0,
        ) > 0
          ? (
            value
            / analysis.clientEntries.reduce(
              (sum, [, current]) => sum + Number(current || 0),
              0,
            )
          ) * 100
          : 0
      ),
    }));

  const concentrationRisk = (
    analysis.largestClientShare >= 50
      ? 'Alto'
      : analysis.largestClientShare >= 30
        ? 'Moderado'
        : 'Baixo'
  );

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="Diagnóstico Financeiro"
        subtitle="Estabilidade, concentração, recorrência, meios de pagamento e histórico de decisões."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(175px, 1fr))',
          gap: '10px',
        }}
      >
        <ExecutiveMetric
          icon={TimerReset}
          label="Runway financeiro"
          value={analysis.runwayMonths}
          detail={`${analysis.runwayMonths.toFixed(1)} mês(es)`}
          tone={
            analysis.runwayMonths >= 6
              ? 'positive'
              : analysis.runwayMonths >= 3
                ? 'warning'
                : 'negative'
          }
        />

        <ExecutiveMetric
          icon={Wallet}
          label="Saldo disponível"
          value={analysis.totalBalance}
          tone={analysis.totalBalance >= 0 ? 'positive' : 'negative'}
        />

        <ExecutiveMetric
          icon={ArrowDownCircle}
          label="Custo mensal"
          value={analysis.monthlyBurn}
          tone="warning"
        />

        <ExecutiveMetric
          icon={Users}
          label="Concentração do maior cliente"
          value={analysis.largestClientShare}
          detail={`${analysis.largestClientShare.toFixed(1)}% · risco ${concentrationRisk}`}
          tone={
            concentrationRisk === 'Alto'
              ? 'negative'
              : concentrationRisk === 'Moderado'
                ? 'warning'
                : 'positive'
          }
        />

        <ExecutiveMetric
          icon={TrendingUp}
          label="Receita recorrente"
          value={analysis.recurringValue}
          detail={`${analysis.recurringShare.toFixed(1)}% da receita`}
          tone={analysis.recurringShare >= 30 ? 'positive' : 'neutral'}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '12px',
        }}
      >
        <div className="sf-card tall">
          <h3>Análise por forma de pagamento</h3>

          <SimpleTable
            columns={['Forma', 'Saldo líquido']}
            rows={paymentRows}
            render={(row) => [
              row.method,
              <strong
                style={{
                  color: row.value >= 0
                    ? 'var(--color-success)'
                    : 'var(--color-danger)',
                }}
              >
                {formatCurrency(row.value)}
              </strong>,
            ]}
            empty="Nenhum dado por forma de pagamento."
          />
        </div>

        <div className="sf-card tall">
          <h3>Risco de concentração</h3>

          <div className="formula-row">
            <span>Maior cliente</span>
            <strong>
              {analysis.largestClient
                ? analysis.largestClient[0]
                : 'Sem dados'}
            </strong>
          </div>

          <div className="formula-row">
            <span>Participação do maior cliente</span>
            <strong>{analysis.largestClientShare.toFixed(1)}%</strong>
          </div>

          <div className="formula-row">
            <span>Participação dos 3 maiores</span>
            <strong>{analysis.topThreeShare.toFixed(1)}%</strong>
          </div>

          <div className="formula-total">
            <span>Nível de risco</span>
            <strong
              style={{
                color: concentrationRisk === 'Alto'
                  ? 'var(--color-danger)'
                  : concentrationRisk === 'Moderado'
                    ? 'var(--color-warning)'
                    : 'var(--color-success)',
              }}
            >
              {concentrationRisk}
            </strong>
          </div>
        </div>

        <div className="sf-card tall">
          <h3>Receita recorrente</h3>

          <div className="formula-row">
            <span>Lançamentos identificados</span>
            <strong>{analysis.recurringCount}</strong>
          </div>

          <div className="formula-row">
            <span>Valor recorrente</span>
            <strong>{formatCurrency(analysis.recurringValue)}</strong>
          </div>

          <div className="formula-total">
            <span>Participação na receita</span>
            <strong>{analysis.recurringShare.toFixed(1)}%</strong>
          </div>
        </div>
      </div>

      <SimpleTable
        columns={['Cliente', 'Receita', 'Participação']}
        rows={clientRows}
        render={(row) => [
          row.client,
          formatCurrency(row.value),
          `${row.share.toFixed(1)}%`,
        ]}
        empty="Nenhuma receita por cliente disponível."
      />

      <div className="sf-card tall">
        <h3
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
          }}
        >
          <BookOpen size={18} />
          Diário financeiro
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(140px, .6fr) minmax(220px, 1.6fr) auto',
            gap: '9px',
          }}
        >
          <select
            value={journalType}
            onChange={(event) => setJournalType(event.target.value)}
            style={inputStyle}
          >
            <option>Observação</option>
            <option>Decisão</option>
            <option>Alerta</option>
            <option>Planejamento</option>
          </select>

          <input
            value={journalText}
            onChange={(event) => setJournalText(event.target.value)}
            placeholder="Registre uma decisão financeira..."
            style={inputStyle}
          />

          <button
            type="button"
            className="sf-primary-button"
            onClick={addJournalEntry}
          >
            Registrar
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            marginTop: '12px',
          }}
        >
          {journal.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '10px',
                padding: '11px',
                background: 'rgba(255,255,255,.02)',
                border: '1px solid var(--border-color)',
                borderRadius: '9px',
              }}
            >
              <div>
                <strong
                  style={{
                    color: item.type === 'Alerta'
                      ? 'var(--color-danger)'
                      : item.type === 'Decisão'
                        ? 'var(--color-highlight)'
                        : 'var(--text-main)',
                    fontSize: '0.75rem',
                  }}
                >
                  {item.type}
                </strong>

                <div
                  style={{
                    marginTop: '5px',
                    fontSize: '0.76rem',
                    lineHeight: 1.5,
                  }}
                >
                  {item.text}
                </div>

                <div
                  className="sf-muted"
                  style={{
                    marginTop: '5px',
                    fontSize: '0.65rem',
                  }}
                >
                  {new Date(item.createdAt).toLocaleString('pt-BR')}
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeJournalEntry(item.id)}
                style={{
                  background: 'transparent',
                  color: 'var(--color-danger)',
                  border: 0,
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          {journal.length === 0 && (
            <p className="sf-muted">
              Nenhuma anotação financeira registrada.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}


function OperacoesFinanceiras({ data }) {
  const [section, setSection] = useState('contas');
  const [accounts, setAccounts] = useState(readFinanceAccounts);
  const [cards, setCards] = useState(readFinanceCards);
  const [commissions, setCommissions] = useState(readFinanceCommissions);

  const [accountDraft, setAccountDraft] = useState({
    name: '',
    type: 'Banco',
    initialBalance: '',
  });

  const [transferDraft, setTransferDraft] = useState({
    from: 'empresa',
    to: 'reserva',
    value: '',
    date: new Date().toISOString().slice(0, 10),
    description: 'Transferência entre contas',
  });

  const [installmentDraft, setInstallmentDraft] = useState({
    description: '',
    category: 'Outras',
    totalValue: '',
    installments: 2,
    firstDueDate: new Date().toISOString().slice(0, 10),
    account: 'empresa',
    supplier: '',
  });

  const [cardDraft, setCardDraft] = useState({
    name: '',
    closingDay: 5,
    dueDay: 12,
    limit: '',
    account: 'empresa',
  });

  const [cardPurchaseDraft, setCardPurchaseDraft] = useState({
    cardId: '',
    description: '',
    category: 'Outras',
    totalValue: '',
    installments: 1,
    purchaseDate: new Date().toISOString().slice(0, 10),
  });

  const [commissionDraft, setCommissionDraft] = useState({
    projectId: '',
    professional: '',
    role: 'Fotógrafo',
    calculation: 'percentual',
    percentage: 10,
    fixedValue: '',
    status: 'pendente',
  });

  const persistAccounts = (next) => {
    setAccounts(next);
    localStorage.setItem(
      FINANCE_ACCOUNTS_STORAGE_KEY,
      JSON.stringify(next),
    );
  };

  const persistCards = (next) => {
    setCards(next);
    localStorage.setItem(
      FINANCE_CARDS_STORAGE_KEY,
      JSON.stringify(next),
    );
  };

  const persistCommissions = (next) => {
    setCommissions(next);
    localStorage.setItem(
      FINANCE_COMMISSIONS_STORAGE_KEY,
      JSON.stringify(next),
    );
  };

  const accountBalances = useMemo(() => {
    const balances = {};

    accounts.forEach((account) => {
      balances[account.id] = Number(
        account.initialBalance || 0,
      );
    });

    balances.empresa = (
      Number(balances.empresa || 0)
      + Number(data.saldos.empresa || 0)
    );

    balances.reserva = (
      Number(balances.reserva || 0)
      + Number(data.saldos.reserva || 0)
    );

    balances.salario = (
      Number(balances.salario || 0)
      + Number(data.saldos.salario || 0)
    );

    data.transacoes
      .filter((item) => {
        const accountId = item.contaOrigem || '';
        return (
          accountId
          && !['empresa', 'reserva', 'salario'].includes(accountId)
        );
      })
      .forEach((item) => {
        const accountId = item.contaOrigem;
        const status = deriveFinancialStatus(item);
        const value = Number(item.valor || 0);

        if (
          !isInternalTransfer(item)
          && status === 'recebida'
        ) {
          balances[accountId] = Number(
            balances[accountId] || 0,
          ) + value;
        }

        if (
          !isInternalTransfer(item)
          && status === 'paga'
        ) {
          balances[accountId] = Number(
            balances[accountId] || 0,
          ) - value;
        }
      });

    return balances;
  }, [
    accounts,
    data.saldos.empresa,
    data.saldos.reserva,
    data.saldos.salario,
    data.transacoes,
  ]);

  const addAccount = () => {
    const name = accountDraft.name.trim();
    const initialBalance = parseCurrency(accountDraft.initialBalance);

    if (!name) {
      alert('Informe o nome da conta.');
      return;
    }

    const next = [
      ...accounts,
      {
        id: createId('finance-account'),
        name,
        type: accountDraft.type,
        initialBalance,
        createdAt: new Date().toISOString(),
      },
    ];

    persistAccounts(next);
    setAccountDraft({
      name: '',
      type: 'Banco',
      initialBalance: '',
    });
  };

  const removeAccount = (id) => {
    if (['empresa', 'reserva', 'salario'].includes(id)) {
      alert('As contas padrão não podem ser excluídas.');
      return;
    }

    persistAccounts(accounts.filter((item) => item.id !== id));
  };

  const addTransfer = async () => {
    const value = parseCurrency(transferDraft.value);

    if (
      !transferDraft.from
      || !transferDraft.to
      || transferDraft.from === transferDraft.to
      || value <= 0
    ) {
      alert('Informe contas diferentes e um valor válido.');
      return;
    }

    const current = readStorage(STORAGE_KEYS.finances, []);
    const transferId = createId('transfer');

    const rows = [
      {
        id: `${transferId}-saida`,
        tipo: 'transferencia_interna',
        tipoGeral: 'Transferencia',
        transferDirection: 'out',
        descricao: transferDraft.description || 'Transferência',
        categoria: 'Transferência',
        valor: value,
        competencia: transferDraft.date.slice(0, 7),
        vencimento: transferDraft.date,
        dataPagamento: transferDraft.date,
        status: 'paga',
        formaPagamento: 'Transferência',
        contaOrigem: transferDraft.from,
        contaDestino: transferDraft.to,
        transferId,
        observacoes: 'Saída de transferência interna',
      },
      {
        id: `${transferId}-entrada`,
        tipo: 'transferencia_interna',
        tipoGeral: 'Transferencia',
        transferDirection: 'in',
        descricao: transferDraft.description || 'Transferência',
        categoria: 'Transferência',
        valor: value,
        competencia: transferDraft.date.slice(0, 7),
        vencimento: transferDraft.date,
        dataRecebimento: transferDraft.date,
        status: 'recebida',
        formaPagamento: 'Transferência',
        contaOrigem: transferDraft.to,
        contaDestino: transferDraft.from,
        transferId,
        observacoes: 'Entrada de transferência interna',
      },
    ];

    writeStorage(
      STORAGE_KEYS.finances,
      [...current, ...rows],
    );

    appendFinancialAudit({
      action: 'internal_transfer_created',
      entity: 'transfer',
      entityId: transferId,
      after: rows,
      details: {
        from: transferDraft.from,
        to: transferDraft.to,
        value,
      },
    });

    await data.loadAll();
    window.dispatchEvent(new Event('sf_storage_update'));

    setTransferDraft({
      from: 'empresa',
      to: 'reserva',
      value: '',
      date: new Date().toISOString().slice(0, 10),
      description: 'Transferência entre contas',
    });
  };

  const createInstallments = async () => {
    const totalValue = parseCurrency(installmentDraft.totalValue);
    const installments = Math.max(
      1,
      Number(installmentDraft.installments || 1),
    );

    if (!installmentDraft.description.trim() || totalValue <= 0) {
      alert('Informe descrição e valor total.');
      return;
    }

    const firstDate = new Date(
      `${installmentDraft.firstDueDate}T00:00:00`,
    );

    const baseValue = Math.floor(
      (totalValue / installments) * 100,
    ) / 100;

    const rows = Array.from(
      { length: installments },
      (_, index) => {
        const dueDate = new Date(
          firstDate.getFullYear(),
          firstDate.getMonth() + index,
          firstDate.getDate(),
        );

        const value = index === installments - 1
          ? Number(
            (
              totalValue
              - baseValue * (installments - 1)
            ).toFixed(2),
          )
          : baseValue;

        return {
          id: createId('expense-installment'),
          tipo: 'variavel',
          tipoGeral: 'despesa',
          descricao: `${installmentDraft.description} — ${index + 1}/${installments}`,
          categoria: installmentDraft.category,
          valor: value,
          competencia: dueDate.toISOString().slice(0, 7),
          vencimento: dueDate.toISOString().slice(0, 10),
          status: 'pendente',
          formaPagamento: 'Parcelado',
          contaOrigem: installmentDraft.account,
          fornecedor: installmentDraft.supplier,
          parcelamentoId: createId('installment-group'),
          numeroParcela: index + 1,
          totalParcelas: installments,
          valorTotalCompra: totalValue,
          observacoes: 'Parcela gerada pelo centro de operações financeiras.',
        };
      },
    );

    const groupId = createId('installment-group');
    rows.forEach((row) => {
      row.parcelamentoId = groupId;
    });

    const current = readStorage(STORAGE_KEYS.finances, []);

    writeStorage(
      STORAGE_KEYS.finances,
      [...current, ...rows],
    );

    appendFinancialAudit({
      action: 'installment_purchase_created',
      entity: 'installment_group',
      entityId: groupId,
      after: rows,
      details: {
        totalValue,
        installments,
      },
    });

    await data.loadAll();
    window.dispatchEvent(new Event('sf_storage_update'));

    setInstallmentDraft({
      description: '',
      category: 'Outras',
      totalValue: '',
      installments: 2,
      firstDueDate: new Date().toISOString().slice(0, 10),
      account: 'empresa',
      supplier: '',
    });
  };

  const addCard = () => {
    const name = cardDraft.name.trim();

    if (!name) {
      alert('Informe o nome do cartão.');
      return;
    }

    const next = [
      ...cards,
      {
        id: createId('finance-card'),
        name,
        closingDay: Math.max(
          1,
          Math.min(28, Number(cardDraft.closingDay || 1)),
        ),
        dueDay: Math.max(
          1,
          Math.min(28, Number(cardDraft.dueDay || 1)),
        ),
        limit: parseCurrency(cardDraft.limit),
        account: cardDraft.account,
        purchases: [],
        createdAt: new Date().toISOString(),
      },
    ];

    persistCards(next);

    setCardDraft({
      name: '',
      closingDay: 5,
      dueDay: 12,
      limit: '',
      account: 'empresa',
    });
  };

  const removeCard = (id) => {
    persistCards(cards.filter((card) => card.id !== id));
  };

  const addCardPurchase = async () => {
    const card = cards.find(
      (item) => item.id === cardPurchaseDraft.cardId,
    );

    const totalValue = parseCurrency(
      cardPurchaseDraft.totalValue,
    );

    const installments = Math.max(
      1,
      Number(cardPurchaseDraft.installments || 1),
    );

    if (
      !card
      || !cardPurchaseDraft.description.trim()
      || totalValue <= 0
    ) {
      alert('Selecione o cartão e informe a compra.');
      return;
    }

    const purchaseDate = new Date(
      `${cardPurchaseDraft.purchaseDate}T00:00:00`,
    );

    const invoiceMonthOffset = (
      purchaseDate.getDate() > Number(card.closingDay)
        ? 1
        : 0
    );

    const baseValue = Math.floor(
      (totalValue / installments) * 100,
    ) / 100;

    const purchaseId = createId('card-purchase');

    const rows = Array.from(
      { length: installments },
      (_, index) => {
        const dueDate = new Date(
          purchaseDate.getFullYear(),
          purchaseDate.getMonth() + invoiceMonthOffset + index,
          Number(card.dueDay),
        );

        const value = index === installments - 1
          ? Number(
            (
              totalValue
              - baseValue * (installments - 1)
            ).toFixed(2),
          )
          : baseValue;

        return {
          id: createId('card-installment'),
          tipo: 'variavel',
          tipoGeral: 'despesa',
          descricao: `${cardPurchaseDraft.description} — ${index + 1}/${installments}`,
          categoria: cardPurchaseDraft.category,
          valor: value,
          competencia: dueDate.toISOString().slice(0, 7),
          vencimento: dueDate.toISOString().slice(0, 10),
          status: 'pendente',
          formaPagamento: `Cartão — ${card.name}`,
          contaOrigem: card.account,
          cartaoId: card.id,
          compraCartaoId: purchaseId,
          numeroParcela: index + 1,
          totalParcelas: installments,
          valorTotalCompra: totalValue,
          observacoes: 'Compra lançada pelo controle de cartão.',
        };
      },
    );

    const current = readStorage(STORAGE_KEYS.finances, []);

    writeStorage(
      STORAGE_KEYS.finances,
      [...current, ...rows],
    );

    appendFinancialAudit({
      action: 'card_purchase_created',
      entity: 'card_purchase',
      entityId: purchaseId,
      after: rows,
      details: {
        cardId: card.id,
        totalValue,
        installments,
      },
    });

    const nextCards = cards.map((item) => (
      item.id === card.id
        ? {
          ...item,
          purchases: [
            ...(item.purchases || []),
            {
              id: purchaseId,
              description: cardPurchaseDraft.description,
              category: cardPurchaseDraft.category,
              totalValue,
              installments,
              purchaseDate: cardPurchaseDraft.purchaseDate,
            },
          ],
        }
        : item
    ));

    persistCards(nextCards);

    await data.loadAll();
    window.dispatchEvent(new Event('sf_storage_update'));

    setCardPurchaseDraft({
      cardId: card.id,
      description: '',
      category: 'Outras',
      totalValue: '',
      installments: 1,
      purchaseDate: new Date().toISOString().slice(0, 10),
    });
  };

  const cardSummaries = useMemo(() => (
    cards.map((card) => {
      const cardExpenses = data.consolidated.despesas.filter(
        (item) => item.cartaoId === card.id,
      );

      const open = cardExpenses
        .filter((item) => (
          !['paga', 'cancelada'].includes(
            deriveFinancialStatus(item),
          )
        ))
        .reduce(
          (sum, item) => sum + Number(item.valor || 0),
          0,
        );

      const usedLimit = cardExpenses
        .filter((item) => deriveFinancialStatus(item) !== 'cancelada')
        .reduce(
          (sum, item) => sum + Number(item.valor || 0),
          0,
        );

      return {
        ...card,
        open,
        usedLimit,
        available: Math.max(
          0,
          Number(card.limit || 0) - usedLimit,
        ),
      };
    })
  ), [cards, data.consolidated.despesas]);

  const overdueCollections = useMemo(() => (
    data.consolidated.todasReceitas
      .filter((item) => (
        deriveFinancialStatus(item) === 'vencida'
      ))
      .sort((first, second) => (
        String(first.vencimento || '').localeCompare(
          String(second.vencimento || ''),
        )
      ))
  ), [data.consolidated.todasReceitas]);

  const openWhatsAppCollection = (revenue) => {
    const client = data.clients.find((item) => (
      String(item.id) === String(
        revenue.clienteId || revenue.clientId,
      )
    ));

    const phone = String(
      client?.whatsapp
      || client?.telefone
      || revenue.telefone
      || '',
    ).replace(/\D/g, '');

    const fullPhone = phone.startsWith('55')
      ? phone
      : phone
        ? `55${phone}`
        : '';

    const name = (
      revenue.clienteNome
      || client?.nome
      || 'cliente'
    );

    const message = [
      `Olá, ${name}. Tudo bem?`,
      '',
      `Passando para lembrar que o pagamento de ${formatCurrency(revenue.valor)} referente a “${revenue.descricao || 'serviço contratado'}” venceu em ${revenue.vencimento || 'data não informada'}.`,
      '',
      'Caso o pagamento já tenha sido realizado, pode desconsiderar esta mensagem. Se precisar de alguma informação, estou à disposição.',
    ].join('\n');

    const url = fullPhone
      ? `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const projectRevenue = useMemo(() => {
    const result = {};

    data.consolidated.todasReceitas.forEach((item) => {
      const projectId = item.trabalhoId || item.projectId;

      if (!projectId) return;

      result[String(projectId)] = (
        Number(result[String(projectId)] || 0)
        + Number(item.valor || 0)
      );
    });

    return result;
  }, [data.consolidated.todasReceitas]);

  const addCommission = () => {
    const project = data.projects.find((item) => (
      String(item.id) === String(commissionDraft.projectId)
    ));

    if (!project || !commissionDraft.professional.trim()) {
      alert('Selecione o projeto e informe o profissional.');
      return;
    }

    const revenue = Number(
      projectRevenue[String(project.id)] || 0,
    );

    const percentage = Number(
      commissionDraft.percentage || 0,
    );

    const fixedValue = parseCurrency(
      commissionDraft.fixedValue,
    );

    const value = commissionDraft.calculation === 'percentual'
      ? revenue * percentage / 100
      : fixedValue;

    const next = [
      {
        id: createId('commission'),
        projectId: project.id,
        projectName: `${project.clienteNome || 'Cliente'} — ${project.tipoServico || 'Projeto'}`,
        professional: commissionDraft.professional.trim(),
        role: commissionDraft.role,
        calculation: commissionDraft.calculation,
        percentage,
        fixedValue,
        value,
        status: commissionDraft.status,
        createdAt: new Date().toISOString(),
      },
      ...commissions,
    ];

    persistCommissions(next);

    setCommissionDraft({
      projectId: '',
      professional: '',
      role: 'Fotógrafo',
      calculation: 'percentual',
      percentage: 10,
      fixedValue: '',
      status: 'pendente',
    });
  };

  const markCommissionPaid = async (commission) => {
    const paidAt = new Date().toISOString().slice(0, 10);

    const next = commissions.map((item) => (
      item.id === commission.id
        ? {
          ...item,
          status: 'paga',
          paidAt,
        }
        : item
    ));

    persistCommissions(next);

    const current = readStorage(STORAGE_KEYS.finances, []);

    const alreadyExists = current.some(
      (item) => item.comissaoId === commission.id,
    );

    if (!alreadyExists) {
      writeStorage(
        STORAGE_KEYS.finances,
        [
          ...current,
          {
            id: createId('commission-expense'),
            tipo: 'variavel',
            tipoGeral: 'despesa',
            descricao: `Comissão — ${commission.professional}`,
            categoria: 'Equipe / Comissão',
            valor: Number(commission.value || 0),
            vencimento: paidAt,
            dataPagamento: paidAt,
            status: 'paga',
            formaPagamento: 'Transferência',
            contaOrigem: 'empresa',
            trabalhoId: commission.projectId,
            comissaoId: commission.id,
            fornecedor: commission.professional,
            observacoes: `${commission.role} · ${commission.projectName}`,
          },
        ],
      );
    }

    await data.loadAll();
    window.dispatchEvent(new Event('sf_storage_update'));
  };

  const pendingCommissionTotal = commissions
    .filter((item) => item.status !== 'paga')
    .reduce(
      (sum, item) => sum + Number(item.value || 0),
      0,
    );

  const operationsTabs = [
    ['contas', 'Contas'],
    ['parcelamento', 'Parcelamento'],
    ['cartoes', 'Cartões'],
    ['cobrancas', 'Cobranças'],
    ['comissoes', 'Comissões'],
  ];

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="Operações Financeiras"
        subtitle="Contas, transferências, parcelamentos, cartões, cobranças e equipe."
      />

      <div
        style={{
          display: 'flex',
          gap: '7px',
          flexWrap: 'wrap',
        }}
      >
        {operationsTabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={
              section === id
                ? 'sf-primary-button'
                : 'sf-secondary-button'
            }
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'contas' && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '10px',
            }}
          >
            {accounts.map((account) => (
              <div
                key={account.id}
                className="sf-card"
                style={{
                  padding: '13px',
                }}
              >
                <span className="sf-muted">{account.type}</span>

                <strong
                  style={{
                    display: 'block',
                    marginTop: '6px',
                  }}
                >
                  {account.name}
                </strong>

                <div
                  style={{
                    marginTop: '8px',
                    color: (
                      accountBalances[account.id] >= 0
                        ? 'var(--color-success)'
                        : 'var(--color-danger)'
                    ),
                    fontSize: '1rem',
                    fontWeight: 800,
                  }}
                >
                  {formatCurrency(
                    accountBalances[account.id] || 0,
                  )}
                </div>

                {!['empresa', 'reserva', 'salario'].includes(
                  account.id,
                ) && (
                  <button
                    type="button"
                    onClick={() => removeAccount(account.id)}
                    style={{
                      marginTop: '9px',
                      background: 'transparent',
                      color: 'var(--color-danger)',
                      border: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={15} />
                    Excluir
                  </button>
                )}
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '12px',
            }}
          >
            <div className="sf-card tall">
              <h3>Nova conta</h3>

              <div
                style={{
                  display: 'grid',
                  gap: '9px',
                }}
              >
                <input
                  value={accountDraft.name}
                  onChange={(event) => {
                    setAccountDraft({
                      ...accountDraft,
                      name: event.target.value,
                    });
                  }}
                  placeholder="Nome da conta"
                  style={inputStyle}
                />

                <select
                  value={accountDraft.type}
                  onChange={(event) => {
                    setAccountDraft({
                      ...accountDraft,
                      type: event.target.value,
                    });
                  }}
                  style={inputStyle}
                >
                  <option>Banco</option>
                  <option>Pix</option>
                  <option>Dinheiro</option>
                  <option>Reserva</option>
                  <option>Carteira digital</option>
                </select>

                <input
                  value={accountDraft.initialBalance}
                  onChange={(event) => {
                    setAccountDraft({
                      ...accountDraft,
                      initialBalance: maskCurrency(
                        event.target.value,
                      ),
                    });
                  }}
                  placeholder="Saldo inicial"
                  style={inputStyle}
                />

                <button
                  type="button"
                  className="sf-primary-button"
                  onClick={addAccount}
                >
                  Adicionar conta
                </button>
              </div>
            </div>

            <div className="sf-card tall">
              <h3
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                }}
              >
                <ArrowRightLeft size={18} />
                Transferir entre contas
              </h3>

              <div
                style={{
                  display: 'grid',
                  gap: '9px',
                }}
              >
                <select
                  value={transferDraft.from}
                  onChange={(event) => {
                    setTransferDraft({
                      ...transferDraft,
                      from: event.target.value,
                    });
                  }}
                  style={inputStyle}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      De: {account.name}
                    </option>
                  ))}
                </select>

                <select
                  value={transferDraft.to}
                  onChange={(event) => {
                    setTransferDraft({
                      ...transferDraft,
                      to: event.target.value,
                    });
                  }}
                  style={inputStyle}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      Para: {account.name}
                    </option>
                  ))}
                </select>

                <input
                  value={transferDraft.value}
                  onChange={(event) => {
                    setTransferDraft({
                      ...transferDraft,
                      value: maskCurrency(event.target.value),
                    });
                  }}
                  placeholder="Valor"
                  style={inputStyle}
                />

                <DateInput
                  value={transferDraft.date}
                  onChange={(value) => {
                    setTransferDraft({
                      ...transferDraft,
                      date: value,
                    });
                  }}
                />

                <button
                  type="button"
                  className="sf-primary-button"
                  onClick={() => void addTransfer()}
                >
                  Realizar transferência
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {section === 'parcelamento' && (
        <div className="sf-card tall">
          <h3
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <Repeat2 size={18} />
            Criar despesa parcelada
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '10px',
            }}
          >
            <Field label="Descrição">
              <input
                value={installmentDraft.description}
                onChange={(event) => {
                  setInstallmentDraft({
                    ...installmentDraft,
                    description: event.target.value,
                  });
                }}
                style={inputStyle}
              />
            </Field>

            <Field label="Categoria">
              <select
                value={installmentDraft.category}
                onChange={(event) => {
                  setInstallmentDraft({
                    ...installmentDraft,
                    category: event.target.value,
                  });
                }}
                style={inputStyle}
              >
                {VARIABLE_EXPENSE_CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </Field>

            <Field label="Valor total">
              <input
                value={installmentDraft.totalValue}
                onChange={(event) => {
                  setInstallmentDraft({
                    ...installmentDraft,
                    totalValue: maskCurrency(
                      event.target.value,
                    ),
                  });
                }}
                style={inputStyle}
              />
            </Field>

            <Field label="Quantidade de parcelas">
              <input
                type="number"
                min="1"
                max="60"
                value={installmentDraft.installments}
                onChange={(event) => {
                  setInstallmentDraft({
                    ...installmentDraft,
                    installments: Number(event.target.value),
                  });
                }}
                style={inputStyle}
              />
            </Field>

            <Field label="Primeiro vencimento">
              <DateInput
                value={installmentDraft.firstDueDate}
                onChange={(value) => {
                  setInstallmentDraft({
                    ...installmentDraft,
                    firstDueDate: value,
                  });
                }}
              />
            </Field>

            <Field label="Conta">
              <select
                value={installmentDraft.account}
                onChange={(event) => {
                  setInstallmentDraft({
                    ...installmentDraft,
                    account: event.target.value,
                  });
                }}
                style={inputStyle}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Fornecedor">
              <input
                value={installmentDraft.supplier}
                onChange={(event) => {
                  setInstallmentDraft({
                    ...installmentDraft,
                    supplier: event.target.value,
                  });
                }}
                style={inputStyle}
              />
            </Field>
          </div>

          <button
            type="button"
            className="sf-primary-button"
            onClick={() => void createInstallments()}
            style={{
              marginTop: '12px',
            }}
          >
            Gerar parcelas
          </button>
        </div>
      )}

      {section === 'cartoes' && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
            }}
          >
            {cardSummaries.map((card) => (
              <div
                key={card.id}
                className="sf-card"
                style={{
                  padding: '13px',
                }}
              >
                <strong>{card.name}</strong>

                <div className="formula-row">
                  <span>Fatura aberta</span>
                  <strong>{formatCurrency(card.open)}</strong>
                </div>

                <div className="formula-row">
                  <span>Limite disponível</span>
                  <strong>{formatCurrency(card.available)}</strong>
                </div>

                <div className="formula-row">
                  <span>Fecha / vence</span>
                  <strong>
                    Dia {card.closingDay} / {card.dueDay}
                  </strong>
                </div>

                <button
                  type="button"
                  onClick={() => removeCard(card.id)}
                  style={{
                    marginTop: '8px',
                    background: 'transparent',
                    color: 'var(--color-danger)',
                    border: 0,
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={15} />
                  Excluir
                </button>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '12px',
            }}
          >
            <div className="sf-card tall">
              <h3>Novo cartão</h3>

              <div
                style={{
                  display: 'grid',
                  gap: '9px',
                }}
              >
                <input
                  value={cardDraft.name}
                  onChange={(event) => {
                    setCardDraft({
                      ...cardDraft,
                      name: event.target.value,
                    });
                  }}
                  placeholder="Nome do cartão"
                  style={inputStyle}
                />

                <input
                  type="number"
                  min="1"
                  max="28"
                  value={cardDraft.closingDay}
                  onChange={(event) => {
                    setCardDraft({
                      ...cardDraft,
                      closingDay: Number(event.target.value),
                    });
                  }}
                  placeholder="Dia de fechamento"
                  style={inputStyle}
                />

                <input
                  type="number"
                  min="1"
                  max="28"
                  value={cardDraft.dueDay}
                  onChange={(event) => {
                    setCardDraft({
                      ...cardDraft,
                      dueDay: Number(event.target.value),
                    });
                  }}
                  placeholder="Dia de vencimento"
                  style={inputStyle}
                />

                <input
                  value={cardDraft.limit}
                  onChange={(event) => {
                    setCardDraft({
                      ...cardDraft,
                      limit: maskCurrency(event.target.value),
                    });
                  }}
                  placeholder="Limite"
                  style={inputStyle}
                />

                <select
                  value={cardDraft.account}
                  onChange={(event) => {
                    setCardDraft({
                      ...cardDraft,
                      account: event.target.value,
                    });
                  }}
                  style={inputStyle}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="sf-primary-button"
                  onClick={addCard}
                >
                  Adicionar cartão
                </button>
              </div>
            </div>

            <div className="sf-card tall">
              <h3>Lançar compra no cartão</h3>

              <div
                style={{
                  display: 'grid',
                  gap: '9px',
                }}
              >
                <select
                  value={cardPurchaseDraft.cardId}
                  onChange={(event) => {
                    setCardPurchaseDraft({
                      ...cardPurchaseDraft,
                      cardId: event.target.value,
                    });
                  }}
                  style={inputStyle}
                >
                  <option value="">Selecione o cartão</option>

                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>

                <input
                  value={cardPurchaseDraft.description}
                  onChange={(event) => {
                    setCardPurchaseDraft({
                      ...cardPurchaseDraft,
                      description: event.target.value,
                    });
                  }}
                  placeholder="Descrição da compra"
                  style={inputStyle}
                />

                <select
                  value={cardPurchaseDraft.category}
                  onChange={(event) => {
                    setCardPurchaseDraft({
                      ...cardPurchaseDraft,
                      category: event.target.value,
                    });
                  }}
                  style={inputStyle}
                >
                  {VARIABLE_EXPENSE_CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>

                <input
                  value={cardPurchaseDraft.totalValue}
                  onChange={(event) => {
                    setCardPurchaseDraft({
                      ...cardPurchaseDraft,
                      totalValue: maskCurrency(
                        event.target.value,
                      ),
                    });
                  }}
                  placeholder="Valor total"
                  style={inputStyle}
                />

                <input
                  type="number"
                  min="1"
                  max="60"
                  value={cardPurchaseDraft.installments}
                  onChange={(event) => {
                    setCardPurchaseDraft({
                      ...cardPurchaseDraft,
                      installments: Number(event.target.value),
                    });
                  }}
                  style={inputStyle}
                />

                <DateInput
                  value={cardPurchaseDraft.purchaseDate}
                  onChange={(value) => {
                    setCardPurchaseDraft({
                      ...cardPurchaseDraft,
                      purchaseDate: value,
                    });
                  }}
                />

                <button
                  type="button"
                  className="sf-primary-button"
                  onClick={() => void addCardPurchase()}
                >
                  Lançar compra
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {section === 'cobrancas' && (
        <div className="sf-card tall">
          <h3
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <MessageCircle size={18} />
            Central de cobranças por WhatsApp
          </h3>

          <SimpleTable
            columns={[
              'Cliente',
              'Descrição',
              'Vencimento',
              'Valor',
              'Ação',
            ]}
            rows={overdueCollections}
            render={(row) => [
              row.clienteNome || '-',
              row.descricao,
              formatDateBR(row.vencimento) || '-',
              formatCurrency(row.valor),
              <button
                type="button"
                className="sf-secondary-button"
                onClick={() => openWhatsAppCollection(row)}
              >
                <MessageCircle size={15} />
                Cobrar
              </button>,
            ]}
            empty="Nenhum recebimento vencido."
          />
        </div>
      )}

      {section === 'comissoes' && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '10px',
            }}
          >
            <ExecutiveMetric
              icon={Users}
              label="Comissões cadastradas"
              value={commissions.length}
            />

            <ExecutiveMetric
              icon={CalendarClock}
              label="Comissões pendentes"
              value={pendingCommissionTotal}
              tone="warning"
            />

            <ExecutiveMetric
              icon={CheckCircle2}
              label="Comissões pagas"
              value={
                commissions
                  .filter((item) => item.status === 'paga')
                  .reduce(
                    (sum, item) => sum + Number(item.value || 0),
                    0,
                  )
              }
              tone="positive"
            />
          </div>

          <div className="sf-card tall">
            <h3>Nova comissão</h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(170px, 1fr))',
                gap: '10px',
              }}
            >
              <select
                value={commissionDraft.projectId}
                onChange={(event) => {
                  setCommissionDraft({
                    ...commissionDraft,
                    projectId: event.target.value,
                  });
                }}
                style={inputStyle}
              >
                <option value="">Selecione o projeto</option>

                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.clienteNome || 'Cliente'} —{' '}
                    {project.tipoServico || 'Projeto'}
                  </option>
                ))}
              </select>

              <input
                value={commissionDraft.professional}
                onChange={(event) => {
                  setCommissionDraft({
                    ...commissionDraft,
                    professional: event.target.value,
                  });
                }}
                placeholder="Profissional"
                style={inputStyle}
              />

              <select
                value={commissionDraft.role}
                onChange={(event) => {
                  setCommissionDraft({
                    ...commissionDraft,
                    role: event.target.value,
                  });
                }}
                style={inputStyle}
              >
                <option>Fotógrafo</option>
                <option>Videomaker</option>
                <option>Assistente</option>
                <option>Editor</option>
                <option>Drone</option>
                <option>Outro</option>
              </select>

              <select
                value={commissionDraft.calculation}
                onChange={(event) => {
                  setCommissionDraft({
                    ...commissionDraft,
                    calculation: event.target.value,
                  });
                }}
                style={inputStyle}
              >
                <option value="percentual">
                  Percentual da receita
                </option>
                <option value="fixo">
                  Valor fixo
                </option>
              </select>

              {commissionDraft.calculation === 'percentual' ? (
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={commissionDraft.percentage}
                  onChange={(event) => {
                    setCommissionDraft({
                      ...commissionDraft,
                      percentage: Number(event.target.value),
                    });
                  }}
                  placeholder="Percentual"
                  style={inputStyle}
                />
              ) : (
                <input
                  value={commissionDraft.fixedValue}
                  onChange={(event) => {
                    setCommissionDraft({
                      ...commissionDraft,
                      fixedValue: maskCurrency(
                        event.target.value,
                      ),
                    });
                  }}
                  placeholder="Valor fixo"
                  style={inputStyle}
                />
              )}

              <button
                type="button"
                className="sf-primary-button"
                onClick={addCommission}
              >
                Adicionar comissão
              </button>
            </div>
          </div>

          <SimpleTable
            columns={[
              'Projeto',
              'Profissional',
              'Função',
              'Cálculo',
              'Valor',
              'Status',
              'Ação',
            ]}
            rows={commissions}
            render={(row) => [
              row.projectName,
              row.professional,
              row.role,
              row.calculation === 'percentual'
                ? `${row.percentage}%`
                : 'Valor fixo',
              formatCurrency(row.value),
              <span className={`sf-status ${row.status}`}>
                {row.status}
              </span>,
              row.status !== 'paga' ? (
                <button
                  type="button"
                  className="sf-secondary-button"
                  onClick={() => void markCommissionPaid(row)}
                >
                  Marcar paga
                </button>
              ) : (
                row.paidAt || 'Pago'
              ),
            ]}
            empty="Nenhuma comissão cadastrada."
          />
        </>
      )}
    </div>
  );
}

function DreFinanceira({ data }) {
  const [referenceMonth, setReferenceMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [closings, setClosings] = useState(readMonthClosings);

  const dre = useMemo(() => {
    const revenues = data.consolidated.todasReceitas.filter(
      (item) => (
        deriveFinancialStatus(item) !== 'cancelada'
        && StringgetTransactionCompetence(item)
          === referenceMonth
      ),
    );

    const expenses = data.consolidated.despesas.filter(
      (item) => (
        deriveFinancialStatus(item) !== 'cancelada'
        && StringgetTransactionCompetence(item)
          === referenceMonth
      ),
    );

    const grossRevenue = revenues.reduce(
      (sum, item) => sum + Number(item.valor || 0),
      0,
    );

    const fixedExpenses = expenses
      .filter((item) => item.tipo === 'fixa')
      .reduce(
        (sum, item) => sum + Number(item.valor || 0),
        0,
      );

    const variableExpenses = expenses
      .filter((item) => item.tipo === 'variavel')
      .reduce(
        (sum, item) => sum + Number(item.valor || 0),
        0,
      );

    const taxes = expenses
      .filter((item) => (
        String(item.categoria || '')
          .toLowerCase()
          .includes('imposto')
        || String(item.categoria || '')
          .toLowerCase()
          .includes('mei')
      ))
      .reduce(
        (sum, item) => sum + Number(item.valor || 0),
        0,
      );

    const operationalCost = (
      fixedExpenses
      + variableExpenses
      + data.depreciacaoMensal
    );

    const grossProfit = grossRevenue - variableExpenses;
    const operatingProfit = (
      grossRevenue
      - fixedExpenses
      - variableExpenses
      - data.depreciacaoMensal
    );

    const netProfit = operatingProfit - taxes;
    const margin = grossRevenue > 0
      ? (netProfit / grossRevenue) * 100
      : 0;

    return {
      grossRevenue,
      fixedExpenses,
      variableExpenses,
      depreciation: data.depreciacaoMensal,
      taxes,
      operationalCost,
      grossProfit,
      operatingProfit,
      netProfit,
      margin,
    };
  }, [
    data.consolidated.despesas,
    data.consolidated.todasReceitas,
    data.depreciacaoMensal,
    referenceMonth,
  ]);

  const currentClosing = closings[referenceMonth] || null;

  const closeMonth = () => {
    const snapshot = {
      month: referenceMonth,
      closedAt: new Date().toISOString(),
      grossRevenue: dre.grossRevenue,
      fixedExpenses: dre.fixedExpenses,
      variableExpenses: dre.variableExpenses,
      depreciation: dre.depreciation,
      taxes: dre.taxes,
      netProfit: dre.netProfit,
      margin: dre.margin,
    };

    const next = {
      ...closings,
      [referenceMonth]: snapshot,
    };

    setClosings(next);
    localStorage.setItem(
      FINANCE_CLOSINGS_STORAGE_KEY,
      JSON.stringify(next),
    );
  };

  const reopenMonth = () => {
    const next = {
      ...closings,
    };

    delete next[referenceMonth];

    setClosings(next);
    localStorage.setItem(
      FINANCE_CLOSINGS_STORAGE_KEY,
      JSON.stringify(next),
    );
  };

  const rows = [
    {
      id: 'revenue',
      label: 'Receita bruta',
      value: dre.grossRevenue,
      tone: 'positive',
    },
    {
      id: 'variable',
      label: '(-) Despesas variáveis',
      value: -dre.variableExpenses,
      tone: 'negative',
    },
    {
      id: 'gross',
      label: 'Lucro bruto',
      value: dre.grossProfit,
      tone: dre.grossProfit >= 0 ? 'positive' : 'negative',
      strong: true,
    },
    {
      id: 'fixed',
      label: '(-) Despesas fixas',
      value: -dre.fixedExpenses,
      tone: 'negative',
    },
    {
      id: 'depreciation',
      label: '(-) Depreciação',
      value: -dre.depreciation,
      tone: 'negative',
    },
    {
      id: 'operating',
      label: 'Resultado operacional',
      value: dre.operatingProfit,
      tone: dre.operatingProfit >= 0
        ? 'positive'
        : 'negative',
      strong: true,
    },
    {
      id: 'taxes',
      label: '(-) Impostos / MEI',
      value: -dre.taxes,
      tone: 'negative',
    },
    {
      id: 'net',
      label: 'Lucro líquido',
      value: dre.netProfit,
      tone: dre.netProfit >= 0 ? 'positive' : 'negative',
      strong: true,
    },
  ];

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="DRE Automática"
        subtitle="Demonstrativo de resultado com receita, custos, despesas e lucro líquido."
        action={
          <MonthInput
            value={referenceMonth}
            onChange={setReferenceMonth}
            style={{
              width: '150px',
            }}
          />
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '10px',
        }}
      >
        <ExecutiveMetric
          icon={ArrowUpCircle}
          label="Receita bruta"
          value={dre.grossRevenue}
          tone="positive"
        />

        <ExecutiveMetric
          icon={ArrowDownCircle}
          label="Custo operacional"
          value={dre.operationalCost}
          tone="negative"
        />

        <ExecutiveMetric
          icon={TrendingUp}
          label="Lucro líquido"
          value={dre.netProfit}
          tone={dre.netProfit >= 0 ? 'positive' : 'negative'}
        />

        <ExecutiveMetric
          icon={Gauge}
          label="Margem líquida"
          value={dre.margin}
          detail={`${dre.margin.toFixed(1)}%`}
        />
      </div>

      <div
        className="sf-card"
        style={{
          padding: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong>
            {currentClosing ? 'Mês fechado' : 'Mês aberto'}
          </strong>

          <div
            className="sf-muted"
            style={{
              marginTop: '4px',
              fontSize: '0.7rem',
            }}
          >
            {currentClosing
              ? `Fechado em ${new Date(currentClosing.closedAt).toLocaleString('pt-BR')}`
              : 'Faça o fechamento para guardar um retrato oficial do período.'}
          </div>
        </div>

        <button
          type="button"
          className={currentClosing
            ? 'sf-secondary-button'
            : 'sf-primary-button'}
          onClick={currentClosing ? reopenMonth : closeMonth}
        >
          {currentClosing ? 'Reabrir mês' : 'Fechar mês'}
        </button>
      </div>

      <div
        className="sf-card"
        style={{
          padding: '16px',
        }}
      >
        <h3
          style={{
            marginTop: 0,
          }}
        >
          Demonstrativo
        </h3>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                padding: row.strong ? '12px' : '9px 12px',
                background: row.strong
                  ? 'rgba(201,160,89,.06)'
                  : 'rgba(255,255,255,.02)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
              }}
            >
              <span
                style={{
                  fontWeight: row.strong ? 800 : 500,
                }}
              >
                {row.label}
              </span>

              <strong
                style={{
                  color: row.tone === 'positive'
                    ? 'var(--color-success)'
                    : 'var(--color-danger)',
                }}
              >
                {formatCurrency(row.value)}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InteligenciaFinanceira({ data }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const intelligence = useMemo(() => {
    const revenues = data.consolidated.todasReceitas || [];
    const expenses = data.consolidated.despesas || [];

    const byServiceRevenue = groupBySum(
      revenues.filter(
        (item) => deriveFinancialStatus(item) !== 'cancelada',
      ),
      (item) => (
        item.tipoServico
        || item.categoria
        || 'Outros'
      ),
    );

    const byClientRevenue = groupBySum(
      revenues.filter(
        (item) => deriveFinancialStatus(item) !== 'cancelada',
      ),
      (item) => item.clienteNome || 'Sem cliente',
    );

    const projectCosts = groupBySum(
      expenses.filter(
        (item) => (
          deriveFinancialStatus(item) !== 'cancelada'
          && item.trabalhoId
        ),
      ),
      (item) => String(item.trabalhoId),
    );

    const projectRevenue = groupBySum(
      revenues.filter(
        (item) => (
          deriveFinancialStatus(item) !== 'cancelada'
          && (item.trabalhoId || item.projectId)
        ),
      ),
      (item) => String(
        item.trabalhoId || item.projectId,
      ),
    );

    const profitability = data.projects
      .map((project) => {
        const id = String(project.id);
        const revenue = projectRevenue[id] || 0;
        const cost = projectCosts[id] || 0;

        return {
          id,
          name: `${project.clienteNome || 'Cliente'} — ${project.tipoServico || 'Projeto'}`,
          revenue,
          cost,
          profit: revenue - cost,
          margin: revenue > 0
            ? ((revenue - cost) / revenue) * 100
            : 0,
        };
      })
      .filter((item) => item.revenue > 0 || item.cost > 0)
      .sort((first, second) => second.profit - first.profit);

    const topService = Object.entries(byServiceRevenue)
      .sort((first, second) => second[1] - first[1])[0];

    const mostProfitable = profitability[0];
    const leastProfitable = profitability
      .slice()
      .sort((first, second) => first.profit - second.profit)[0];

    const overdueReceivables = revenues
      .filter((item) => (
        deriveFinancialStatus(item) === 'vencida'
      ));

    const totalOverdue = overdueReceivables.reduce(
      (sum, item) => sum + Number(item.valor || 0),
      0,
    );

    const suggestions = [];

    if (totalOverdue > 0) {
      suggestions.push(
        `Existem ${formatCurrency(totalOverdue)} em recebimentos vencidos. Priorize as cobranças antes de planejar novos investimentos.`,
      );
    }

    if (data.margemLucro < 15) {
      suggestions.push(
        `A margem atual está em ${data.margemLucro.toFixed(1)}%. Revise custos variáveis e preços dos serviços.`,
      );
    }

    if (data.saldos.reserva < data.custoOperacional) {
      suggestions.push(
        'A reserva está abaixo de um mês de custo operacional. Direcione uma parcela maior das próximas entradas para o fundo.',
      );
    }

    if (leastProfitable && leastProfitable.profit < 0) {
      suggestions.push(
        `${leastProfitable.name} está com prejuízo estimado de ${formatCurrency(Math.abs(leastProfitable.profit))}.`,
      );
    }

    return {
      byServiceRevenue,
      byClientRevenue,
      profitability,
      topService,
      mostProfitable,
      leastProfitable,
      overdueReceivables,
      totalOverdue,
      suggestions,
    };
  }, [
    data.consolidated.despesas,
    data.consolidated.todasReceitas,
    data.custoOperacional,
    data.margemLucro,
    data.projects,
    data.saldos.reserva,
  ]);

  const ask = () => {
    const normalized = question
      .trim()
      .toLowerCase();

    if (!normalized) {
      setAnswer('Digite uma pergunta sobre lucro, serviços, custos ou recebimentos.');
      return;
    }

    if (
      normalized.includes('mais lucrativo')
      || normalized.includes('maior lucro')
    ) {
      setAnswer(
        intelligence.mostProfitable
          ? `${intelligence.mostProfitable.name} é o projeto mais lucrativo, com ${formatCurrency(intelligence.mostProfitable.profit)} de lucro estimado e margem de ${intelligence.mostProfitable.margin.toFixed(1)}%.`
          : 'Ainda não existem dados suficientes de receita e custo por projeto.',
      );
      return;
    }

    if (
      normalized.includes('serviço')
      && normalized.includes('vende')
    ) {
      setAnswer(
        intelligence.topService
          ? `${intelligence.topService[0]} é o serviço/categoria com maior receita, somando ${formatCurrency(intelligence.topService[1])}.`
          : 'Ainda não existem dados suficientes por serviço.',
      );
      return;
    }

    if (
      normalized.includes('vencido')
      || normalized.includes('cobrar')
      || normalized.includes('inadimpl')
    ) {
      setAnswer(
        `${intelligence.overdueReceivables.length} recebimento(s) estão vencidos, totalizando ${formatCurrency(intelligence.totalOverdue)}.`,
      );
      return;
    }

    if (
      normalized.includes('custo')
      && normalized.includes('empresa')
    ) {
      setAnswer(
        `O custo operacional estimado é ${formatCurrency(data.custoOperacional)} por mês, incluindo fixos, média variável e depreciação.`,
      );
      return;
    }

    if (
      normalized.includes('reserva')
    ) {
      const coverage = data.custoOperacional > 0
        ? data.saldos.reserva / data.custoOperacional
        : 0;

      setAnswer(
        `A reserva atual é ${formatCurrency(data.saldos.reserva)}, equivalente a ${coverage.toFixed(1)} mês(es) de custo operacional.`,
      );
      return;
    }

    setAnswer(
      [
        `Receita recebida no mês: ${formatCurrency(data.receitaBruta)}.`,
        `Lucro real estimado: ${formatCurrency(data.lucroReal)}.`,
        `Margem: ${data.margemLucro.toFixed(1)}%.`,
        `Contas a receber: ${formatCurrency(data.contasAReceber)}.`,
      ].join('\n'),
    );
  };

  return (
    <div className="sf-finance-section">
      <SectionHeader
        title="Inteligência Financeira"
        subtitle="Análises automáticas sobre lucro, serviços, projetos, custos e inadimplência."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '10px',
        }}
      >
        <IntelligenceMetric
          label="Serviço com maior receita"
          value={
            intelligence.topService
              ? intelligence.topService[0]
              : 'Sem dados'
          }
          detail={
            intelligence.topService
              ? formatCurrency(intelligence.topService[1])
              : ''
          }
        />

        <IntelligenceMetric
          label="Projeto mais lucrativo"
          value={
            intelligence.mostProfitable
              ? intelligence.mostProfitable.name
              : 'Sem dados'
          }
          detail={
            intelligence.mostProfitable
              ? formatCurrency(
                intelligence.mostProfitable.profit,
              )
              : ''
          }
        />

        <IntelligenceMetric
          label="Recebimentos vencidos"
          value={intelligence.overdueReceivables.length}
          detail={formatCurrency(intelligence.totalOverdue)}
          tone={intelligence.totalOverdue > 0 ? 'negative' : 'positive'}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '12px',
        }}
      >
        <div className="sf-card tall">
          <h3>Recomendações automáticas</h3>

          {intelligence.suggestions.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {intelligence.suggestions.map((suggestion) => (
                <div
                  key={suggestion}
                  style={{
                    padding: '10px',
                    background: 'rgba(255,255,255,.025)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.76rem',
                    lineHeight: 1.5,
                  }}
                >
                  {suggestion}
                </div>
              ))}
            </div>
          ) : (
            <p className="sf-muted">
              Nenhuma recomendação crítica no momento.
            </p>
          )}
        </div>

        <div className="sf-card tall">
          <h3>Pergunte ao Financeiro</h3>

          <div
            style={{
              display: 'flex',
              gap: '8px',
            }}
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') ask();
              }}
              placeholder="Ex.: qual projeto é mais lucrativo?"
              style={inputStyle}
            />

            <button
              type="button"
              className="sf-primary-button"
              onClick={ask}
            >
              Perguntar
            </button>
          </div>

          {answer && (
            <div
              style={{
                marginTop: '12px',
                padding: '12px',
                background: 'rgba(201,160,89,.06)',
                border: '1px solid rgba(201,160,89,.18)',
                borderRadius: '8px',
                color: 'var(--text-main)',
                whiteSpace: 'pre-wrap',
                fontSize: '0.78rem',
                lineHeight: 1.55,
              }}
            >
              {answer}
            </div>
          )}
        </div>
      </div>

      <div
        className="sf-report-grid"
        style={{
          marginTop: '4px',
        }}
      >
        <ReportBlock
          title="Ranking de serviços"
          data={intelligence.byServiceRevenue}
        />

        <ReportBlock
          title="Ranking de clientes"
          data={intelligence.byClientRevenue}
        />
      </div>

      <SimpleTable
        columns={[
          'Projeto',
          'Receita',
          'Custos',
          'Lucro',
          'Margem',
        ]}
        rows={intelligence.profitability}
        render={(row) => [
          row.name,
          formatCurrency(row.revenue),
          formatCurrency(row.cost),
          <strong
            style={{
              color: row.profit >= 0
                ? 'var(--color-success)'
                : 'var(--color-danger)',
            }}
          >
            {formatCurrency(row.profit)}
          </strong>,
          `${row.margin.toFixed(1)}%`,
        ]}
        empty="Nenhum projeto com receita ou custo vinculado."
      />
    </div>
  );
}

function IntelligenceMetric({
  label,
  value,
  detail = '',
  tone = 'neutral',
}) {
  const color = tone === 'negative'
    ? 'var(--color-danger)'
    : tone === 'positive'
      ? 'var(--color-success)'
      : 'var(--color-highlight)';

  return (
    <div className="sf-card">
      <span
        style={{
          color: 'var(--text-secondary)',
          fontSize: '0.72rem',
        }}
      >
        {label}
      </span>

      <strong
        style={{
          display: 'block',
          marginTop: '8px',
          color,
          fontSize: '1rem',
        }}
      >
        {value}
      </strong>

      {detail && (
        <small
          style={{
            display: 'block',
            marginTop: '5px',
            color: 'var(--text-secondary)',
          }}
        >
          {detail}
        </small>
      )}
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
        subtitle="Relatórios consolidados com exportação em CSV."
        action={
          <button
            type="button"
            className="sf-secondary-button"
            onClick={() => {
              const rows = [
                ...data.consolidated.todasReceitas.map((item) => ({
                  tipo: 'Receita',
                  descricao: item.descricao || '',
                  categoria: item.categoria || '',
                  cliente: item.clienteNome || '',
                  vencimento: item.vencimento || '',
                  status: deriveFinancialStatus(item),
                  valor: Number(item.valor || 0),
                })),
                ...data.consolidated.despesas.map((item) => ({
                  tipo: 'Despesa',
                  descricao: item.descricao || '',
                  categoria: item.categoria || '',
                  cliente: '',
                  vencimento: item.vencimento || '',
                  status: deriveFinancialStatus(item),
                  valor: -Number(item.valor || 0),
                })),
              ];

              downloadCsv(
                `studioflow-financeiro-${new Date().toISOString().slice(0, 10)}.csv`,
                rows,
              );
            }}
          >
            <Download size={16} />
            Exportar CSV
          </button>
        }
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

function SimpleTable({
  columns = [],
  rows = [],
  render = () => [],
  empty = 'Nenhum dado disponível.',
}) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeRows = Array.isArray(rows) ? rows : [];

  return (
    <div className="sf-table-card">
      <table className="sf-table">
        <thead>
          <tr>
            {safeColumns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {safeRows.map((row, idx) => {
            const cells = render(row);

            return (
              <tr key={row?.id || `row-${idx}`}>
                {(Array.isArray(cells) ? cells : []).map(
                  (cell, index) => (
                    <td key={`${row?.id || idx}-${index}`}>
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            );
          })}

          {safeRows.length === 0 && (
            <tr>
              <td
                colSpan={Math.max(1, safeColumns.length)}
                className="empty"
              >
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReportBlock({
  title,
  dataBlock,
  data,
}) {
  const safeData = useMemo(() => {
    const source = dataBlock ?? data;

    return (
      source
      && typeof source === 'object'
      && !Array.isArray(source)
    )
      ? source
      : {};
  }, [data, dataBlock]);

  const entries = useMemo(() => (
    Object.entries(safeData)
      .filter(([, value]) => Number(value || 0) > 0)
      .sort((first, second) => (
        Number(second[1] || 0) - Number(first[1] || 0)
      ))
      .slice(0, 8)
  ), [safeData]);

  return (
    <div className="sf-card report">
      <h3>{title}</h3>

      {entries.length === 0 && (
        <p>Nenhum dado para exibir.</p>
      )}

      {entries.map(([label, value]) => (
        <div className="report-row" key={label}>
          <span>{label}</span>
          <strong>{formatCurrency(Number(value || 0))}</strong>
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
