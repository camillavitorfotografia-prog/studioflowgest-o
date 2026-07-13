import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  DollarSign,
  Flame,
  Goal,
  Megaphone,
  Snowflake,
  Target,
  ThermometerSun,
  TrendingUp,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react';
import { ACTIVE_LEAD_STATUSES, getStatusTitle } from '../../data/crm';
import {
  formatCurrency,
  parseCurrency,
  parseDate,
} from '../../utils/formatters';

const periodFilters = {
  hoje: (date, now) => date.toDateString() === now.toDateString(),

  este_mes: (date, now) => (
    date.getMonth() === now.getMonth()
    && date.getFullYear() === now.getFullYear()
  ),

  ultimos_3: (date, now) => {
    const start = new Date(
      now.getFullYear(),
      now.getMonth() - 2,
      1,
    );

    return date >= start && date <= now;
  },

  ano: (date, now) => (
    date.getFullYear() === now.getFullYear()
  ),
};

const APPROVED_STATUSES = [
  'aprovado',
  'evento_realizado',
  'finalizado',
];


const SALES_GOAL_STORAGE_KEY = 'studioflow_crm_sales_goal';

const DEFAULT_SALES_GOAL = {
  revenue: 10000,
  contracts: 3,
};

const PRIORITY_SCORE = {
  baixa: 1,
  media: 2,
  alta: 3,
  urgente: 4,
};

const TEMPERATURE_SCORE = {
  frio: 1,
  morno: 2,
  quente: 3,
};

const clampPercentage = (value) => (
  Math.max(0, Math.min(100, Number(value) || 0))
);

const readSalesGoal = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(SALES_GOAL_STORAGE_KEY) || 'null',
    );

    return {
      revenue: Math.max(
        0,
        Number(saved?.revenue ?? DEFAULT_SALES_GOAL.revenue),
      ),
      contracts: Math.max(
        0,
        Number(saved?.contracts ?? DEFAULT_SALES_GOAL.contracts),
      ),
    };
  } catch {
    return DEFAULT_SALES_GOAL;
  }
};

const getForecastScore = (lead = {}) => {
  const probability = clampPercentage(
    lead.probabilidadeFechamento ?? 50,
  );

  const priority = PRIORITY_SCORE[lead.prioridade || 'media'] || 2;
  const temperature = TEMPERATURE_SCORE[lead.temperatura || 'morno'] || 2;

  return (
    probability
    + (priority * 8)
    + (temperature * 6)
  );
};

const TEMPERATURE_CONFIG = {
  frio: {
    label: 'Frios',
    color: '#60a5fa',
    icon: <Snowflake size={18} />,
  },
  morno: {
    label: 'Mornos',
    color: '#fbbf24',
    icon: <ThermometerSun size={18} />,
  },
  quente: {
    label: 'Quentes',
    color: '#f87171',
    icon: <Flame size={18} />,
  },
};

const normalizeDateOnly = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
};

const normalizeText = (value, fallback = 'Nao informado') => {
  const normalized = String(value || '').trim();

  return normalized || fallback;
};

const getFollowupDate = (lead) => {
  return parseDate(
    lead.dataProximoFollowup
    || lead.dataProximoRetorno
    || lead.data_proximo_followup
    || lead.data_proximo_retorno,
  );
};

const getLeadPeriodDate = (lead) => {
  return parseDate(
    lead.createdAt
    || lead.created_at
    || lead.dataPrimeiroContato
    || lead.data_primeiro_contato
    || lead.dataPedido
    || lead.dataEvento,
  );
};

const buildPerformanceRanking = ({
  leads,
  field,
  approvedStatuses,
}) => {
  const map = leads.reduce((accumulator, lead) => {
    const key = normalizeText(lead[field]);

    if (!accumulator[key]) {
      accumulator[key] = {
        name: key,
        leads: 0,
        approved: 0,
        potential: 0,
        closedRevenue: 0,
      };
    }

    accumulator[key].leads += 1;

    const value = parseCurrency(lead.valorOrcamento);

    if (approvedStatuses.includes(lead.status)) {
      accumulator[key].approved += 1;
      accumulator[key].closedRevenue += value;
    } else if (ACTIVE_LEAD_STATUSES.includes(lead.status)) {
      accumulator[key].potential += value;
    }

    return accumulator;
  }, {});

  return Object.values(map)
    .map((item) => ({
      ...item,
      conversion: item.leads > 0
        ? Math.round((item.approved / item.leads) * 100)
        : 0,
    }))
    .sort((first, second) => (
      second.approved - first.approved
      || second.conversion - first.conversion
      || second.leads - first.leads
    ));
};

const buildReasonRanking = (leads) => {
  const map = leads.reduce((accumulator, lead) => {
    let reason = '';

    if (lead.status === 'perdido') {
      reason = normalizeText(
        lead.motivoPerda || lead.motivo_perda,
        'Motivo da perda nao informado',
      );
    }

    if (lead.status === 'cancelado') {
      reason = normalizeText(
        lead.motivoCancelamento || lead.motivo_cancelamento,
        'Motivo do cancelamento nao informado',
      );
    }

    if (!reason) return accumulator;

    accumulator[reason] = (accumulator[reason] || 0) + 1;

    return accumulator;
  }, {});

  return Object.entries(map)
    .map(([reason, quantity]) => ({
      reason,
      quantity,
    }))
    .sort((first, second) => second.quantity - first.quantity);
};


const getLeadLastActivityDate = (lead = {}) => {
  const history = Array.isArray(lead.historico)
    ? lead.historico
    : [];

  const latestHistoryDate = history
    .map((item) => parseDate(item?.data))
    .filter(Boolean)
    .sort((first, second) => second.getTime() - first.getTime())[0];

  return latestHistoryDate || parseDate(
    lead.dataUltimoContato
    || lead.data_ultimo_contato
    || lead.updatedAt
    || lead.updated_at
    || lead.createdAt
    || lead.created_at,
  );
};

const getDaysSince = (date, now = new Date()) => {
  const normalizedDate = normalizeDateOnly(date);
  const normalizedNow = normalizeDateOnly(now);

  if (!normalizedDate || !normalizedNow) return null;

  return Math.max(
    0,
    Math.floor(
      (normalizedNow.getTime() - normalizedDate.getTime())
      / (1000 * 60 * 60 * 24),
    ),
  );
};

const getLeadHealthIssues = (lead = {}, now = new Date()) => {
  const issues = [];
  const followupDate = normalizeDateOnly(getFollowupDate(lead));
  const today = normalizeDateOnly(now);
  const lastActivityDate = getLeadLastActivityDate(lead);
  const daysSinceActivity = getDaysSince(lastActivityDate, now);
  const isActive = ACTIVE_LEAD_STATUSES.includes(lead.status);
  const isHot = (lead.temperatura || 'morno') === 'quente';
  const probability = clampPercentage(
    lead.probabilidadeFechamento ?? 50,
  );

  if (!isActive) {
    return {
      issues,
      daysSinceActivity,
      severity: 0,
      health: 'encerrado',
    };
  }

  if (!followupDate) {
    issues.push({
      key: 'sem_followup',
      label: 'Sem próximo passo',
      severity: 3,
    });
  } else if (
    today
    && followupDate.getTime() < today.getTime()
  ) {
    issues.push({
      key: 'followup_atrasado',
      label: 'Follow-up atrasado',
      severity: 4,
    });
  }

  if (
    daysSinceActivity !== null
    && daysSinceActivity >= 14
  ) {
    issues.push({
      key: 'parado',
      label: `Parado há ${daysSinceActivity} dias`,
      severity: 4,
    });
  } else if (
    daysSinceActivity !== null
    && daysSinceActivity >= 7
  ) {
    issues.push({
      key: 'esfriando',
      label: `Sem atividade há ${daysSinceActivity} dias`,
      severity: 3,
    });
  }

  if (
    isHot
    && (
      !followupDate
      || (daysSinceActivity !== null && daysSinceActivity >= 4)
    )
  ) {
    issues.push({
      key: 'quente_esfriando',
      label: 'Lead quente pode esfriar',
      severity: 4,
    });
  }

  if (
    probability >= 70
    && !followupDate
  ) {
    issues.push({
      key: 'alta_chance_sem_acao',
      label: 'Alta chance sem ação agendada',
      severity: 4,
    });
  }

  const severity = issues.reduce(
    (total, issue) => total + issue.severity,
    0,
  );

  let health = 'saudavel';

  if (severity >= 8) health = 'critico';
  else if (severity >= 4) health = 'atencao';

  return {
    issues,
    daysSinceActivity,
    severity,
    health,
  };
};

const getStatusEntryDate = (lead = {}) => {
  const history = Array.isArray(lead.historico)
    ? lead.historico
    : [];

  const statusChanges = history
    .filter((item) => (
      item?.tipo === 'alteracao_status'
      && item.novoStatus === lead.status
    ))
    .map((item) => parseDate(item.data))
    .filter(Boolean)
    .sort((first, second) => second.getTime() - first.getTime());

  return statusChanges[0] || parseDate(
    lead.createdAt
    || lead.created_at
    || lead.dataPrimeiroContato
    || lead.data_primeiro_contato,
  );
};

const buildFunnelHealth = (leads = []) => {
  const now = new Date();
  const activeLeads = leads.filter((lead) => (
    ACTIVE_LEAD_STATUSES.includes(lead.status)
  ));

  const leadHealth = activeLeads
    .map((lead) => ({
      lead,
      ...getLeadHealthIssues(lead, now),
    }))
    .sort((first, second) => (
      second.severity - first.severity
      || (second.daysSinceActivity || 0)
      - (first.daysSinceActivity || 0)
    ));

  const noNextStep = leadHealth.filter((item) => (
    item.issues.some((issue) => issue.key === 'sem_followup')
  ));

  const stalled = leadHealth.filter((item) => (
    item.issues.some((issue) => issue.key === 'parado')
  ));

  const hotCooling = leadHealth.filter((item) => (
    item.issues.some((issue) => issue.key === 'quente_esfriando')
  ));

  const critical = leadHealth.filter(
    (item) => item.health === 'critico',
  );

  const stageMap = activeLeads.reduce((accumulator, lead) => {
    const status = lead.status || 'novo';
    const entryDate = getStatusEntryDate(lead);
    const daysInStage = getDaysSince(entryDate, now) || 0;

    if (!accumulator[status]) {
      accumulator[status] = {
        status,
        title: getStatusTitle(status),
        quantity: 0,
        totalDays: 0,
        stalledCount: 0,
      };
    }

    accumulator[status].quantity += 1;
    accumulator[status].totalDays += daysInStage;

    if (daysInStage >= 10) {
      accumulator[status].stalledCount += 1;
    }

    return accumulator;
  }, {});

  const stageHealth = Object.values(stageMap)
    .map((item) => ({
      ...item,
      averageDays: item.quantity > 0
        ? Math.round(item.totalDays / item.quantity)
        : 0,
      stalledPercentage: item.quantity > 0
        ? Math.round((item.stalledCount / item.quantity) * 100)
        : 0,
    }))
    .sort((first, second) => (
      second.averageDays - first.averageDays
      || second.quantity - first.quantity
    ));

  const maxStageQuantity = Math.max(
    0,
    ...stageHealth.map((item) => item.quantity),
  );

  const bottlenecks = stageHealth.filter((item) => (
    item.averageDays >= 7
    || item.stalledPercentage >= 40
    || (
      maxStageQuantity >= 3
      && item.quantity === maxStageQuantity
    )
  ));

  const recommendations = [];

  if (critical.length > 0) {
    recommendations.push(
      `Priorize ${critical.length} lead(s) crítico(s) antes das demais oportunidades.`,
    );
  }

  if (noNextStep.length > 0) {
    recommendations.push(
      `Agende o próximo passo de ${noNextStep.length} lead(s) sem follow-up.`,
    );
  }

  if (stalled.length > 0) {
    recommendations.push(
      `Retome ${stalled.length} lead(s) parados há 14 dias ou mais.`,
    );
  }

  if (hotCooling.length > 0) {
    recommendations.push(
      `Entre em contato com ${hotCooling.length} lead(s) quente(s) antes que esfriem.`,
    );
  }

  if (bottlenecks.length > 0) {
    recommendations.push(
      `Revise a etapa ${bottlenecks[0].title}, principal gargalo atual do funil.`,
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'O funil está saudável. Continue registrando o próximo passo de cada lead.',
    );
  }

  const healthScore = activeLeads.length > 0
    ? Math.max(
      0,
      Math.round(
        100
        - ((critical.length / activeLeads.length) * 45)
        - ((noNextStep.length / activeLeads.length) * 25)
        - ((stalled.length / activeLeads.length) * 20),
      ),
    )
    : 100;

  return {
    activeCount: activeLeads.length,
    critical,
    noNextStep,
    stalled,
    hotCooling,
    stageHealth,
    bottlenecks,
    recommendations,
    healthScore,
    leadHealth: leadHealth.slice(0, 8),
  };
};

const getHistoryDateByPredicate = (
  lead = {},
  predicate,
) => {
  const history = Array.isArray(lead.historico)
    ? lead.historico
    : [];

  return history
    .filter(predicate)
    .map((item) => parseDate(item.data))
    .filter(Boolean)
    .sort((first, second) => first.getTime() - second.getTime())[0]
    || null;
};

const getHoursBetween = (firstDate, secondDate) => {
  if (!firstDate || !secondDate) return null;

  return Math.max(
    0,
    (secondDate.getTime() - firstDate.getTime())
    / (1000 * 60 * 60),
  );
};

const getCommercialVelocity = (leads = []) => {
  const firstResponseHours = [];
  const budgetHours = [];
  const closingDays = [];
  const contactsPerClosing = [];

  leads.forEach((lead) => {
    const createdDate = parseDate(
      lead.createdAt
      || lead.created_at
      || lead.dataPrimeiroContato
      || lead.data_primeiro_contato,
    );

    const firstContactDate = getHistoryDateByPredicate(
      lead,
      (item) => item?.tipo === 'contato',
    ) || parseDate(
      lead.dataPrimeiroContato
      || lead.data_primeiro_contato,
    );

    const budgetDate = getHistoryDateByPredicate(
      lead,
      (item) => (
        item?.tipo === 'alteracao_status'
        && ['orcamento_enviado', 'proposta_enviada'].includes(
          item.novoStatus,
        )
      ),
    ) || parseDate(
      lead.dataOrcamento
      || lead.data_orcamento,
    );

    const approvalDate = getHistoryDateByPredicate(
      lead,
      (item) => (
        item?.tipo === 'alteracao_status'
        && APPROVED_STATUSES.includes(item.novoStatus)
      ),
    );

    const contactCount = (
      Array.isArray(lead.historico)
        ? lead.historico.filter(
          (item) => item?.tipo === 'contato',
        ).length
        : 0
    );

    const responseHours = getHoursBetween(
      createdDate,
      firstContactDate,
    );

    if (responseHours !== null) {
      firstResponseHours.push(responseHours);
    }

    const timeToBudget = getHoursBetween(
      createdDate,
      budgetDate,
    );

    if (timeToBudget !== null) {
      budgetHours.push(timeToBudget);
    }

    if (
      APPROVED_STATUSES.includes(lead.status)
      && createdDate
      && approvalDate
    ) {
      const hoursToClose = getHoursBetween(
        createdDate,
        approvalDate,
      );

      if (hoursToClose !== null) {
        closingDays.push(hoursToClose / 24);
      }

      contactsPerClosing.push(contactCount);
    }
  });

  const average = (values) => (
    values.length > 0
      ? values.reduce((sum, value) => sum + value, 0)
        / values.length
      : null
  );

  return {
    averageFirstResponseHours: average(firstResponseHours),
    averageBudgetHours: average(budgetHours),
    averageClosingDays: average(closingDays),
    averageContactsToClose: average(contactsPerClosing),
    measuredResponses: firstResponseHours.length,
    measuredBudgets: budgetHours.length,
    measuredClosings: closingDays.length,
  };
};

const formatVelocityTime = (hours) => {
  if (hours === null) return 'Sem dados';

  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }

  return `${(hours / 24).toFixed(1)} dias`;
};

export default function CRMStats({ leads }) {
  const [periodo, setPeriodo] = useState('este_mes');
  const [salesGoal, setSalesGoal] = useState(readSalesGoal);
  const [isEditingGoal, setIsEditingGoal] = useState(false);

  useEffect(() => {
    localStorage.setItem(
      SALES_GOAL_STORAGE_KEY,
      JSON.stringify(salesGoal),
    );
  }, [salesGoal]);

  const dashboard = useMemo(() => {
    const now = new Date();
    const today = normalizeDateOnly(now);
    const filter = periodFilters[periodo] || periodFilters.este_mes;

    const filtered = leads.filter((lead) => {
      const date = getLeadPeriodDate(lead);

      return date
        ? filter(date, now)
        : true;
    });

    const total = filtered.length;

    const approvedLeads = filtered.filter((lead) => (
      APPROVED_STATUSES.includes(lead.status)
    ));

    const pendingLeads = filtered.filter((lead) => (
      ACTIVE_LEAD_STATUSES.includes(lead.status)
    ));

    const lostLeads = filtered.filter((lead) => (
      lead.status === 'perdido'
    ));

    const canceledLeads = filtered.filter((lead) => (
      lead.status === 'cancelado'
    ));

    const aprovados = approvedLeads.length;
    const pendentes = pendingLeads.length;
    const perdidos = lostLeads.length;
    const cancelados = canceledLeads.length;

    const decisoesComerciais = (
      aprovados
      + perdidos
      + cancelados
    );

    const conversao = decisoesComerciais > 0
      ? Math.round((aprovados / decisoesComerciais) * 100)
      : 0;

    const valoresAprovados = approvedLeads
      .map((lead) => parseCurrency(lead.valorOrcamento))
      .filter((value) => value > 0);

    const receitaFechada = valoresAprovados.reduce(
      (totalValue, value) => totalValue + value,
      0,
    );

    const ticketMedio = valoresAprovados.length > 0
      ? receitaFechada / valoresAprovados.length
      : 0;

    const potencial = pendingLeads.reduce(
      (totalValue, lead) => (
        totalValue + parseCurrency(lead.valorOrcamento)
      ),
      0,
    );

    const weightedPotential = pendingLeads.reduce(
      (totalValue, lead) => {
        const value = parseCurrency(lead.valorOrcamento);
        const probability = Math.max(
          0,
          Math.min(
            100,
            Number(lead.probabilidadeFechamento ?? 50),
          ),
        );

        return totalValue + (value * probability / 100);
      },
      0,
    );

    const followupsHoje = pendingLeads.filter((lead) => {
      const followupDate = normalizeDateOnly(
        getFollowupDate(lead),
      );

      return Boolean(
        followupDate
        && today
        && followupDate.getTime() === today.getTime(),
      );
    }).length;

    const followupsAtrasados = pendingLeads.filter((lead) => {
      const followupDate = normalizeDateOnly(
        getFollowupDate(lead),
      );

      return Boolean(
        followupDate
        && today
        && followupDate.getTime() < today.getTime(),
      );
    }).length;

    const originRanking = buildPerformanceRanking({
      leads: filtered,
      field: 'origem',
      approvedStatuses: APPROVED_STATUSES,
    });

    const campaignRanking = buildPerformanceRanking({
      leads: filtered,
      field: 'campanha',
      approvedStatuses: APPROVED_STATUSES,
    });

    const reasonRanking = buildReasonRanking(filtered);

    const temperatureSummary = Object.keys(TEMPERATURE_CONFIG).map(
      (temperature) => {
        const temperatureLeads = filtered.filter((lead) => (
          (lead.temperatura || 'morno') === temperature
        ));

        const approved = temperatureLeads.filter((lead) => (
          APPROVED_STATUSES.includes(lead.status)
        )).length;

        const potentialValue = temperatureLeads
          .filter((lead) => ACTIVE_LEAD_STATUSES.includes(lead.status))
          .reduce(
            (sum, lead) => sum + parseCurrency(lead.valorOrcamento),
            0,
          );

        return {
          temperature,
          quantity: temperatureLeads.length,
          approved,
          conversion: temperatureLeads.length > 0
            ? Math.round((approved / temperatureLeads.length) * 100)
            : 0,
          potentialValue,
          ...TEMPERATURE_CONFIG[temperature],
        };
      },
    );

    const statusMap = filtered.reduce((accumulator, lead) => {
      const status = lead.status || 'novo';

      accumulator[status] = (accumulator[status] || 0) + 1;

      return accumulator;
    }, {});

    const stageRanking = Object.entries(statusMap)
      .map(([status, quantity]) => ({
        status,
        title: getStatusTitle(status),
        quantity,
        percentage: total > 0
          ? Math.round((quantity / total) * 100)
          : 0,
      }))
      .sort((first, second) => second.quantity - first.quantity);

    const topOrigin = originRanking[0] || null;
    const topCampaign = campaignRanking.find(
      (item) => item.name !== 'Nao informado',
    ) || campaignRanking[0] || null;

    const likelyToClose = pendingLeads
      .map((lead) => {
        const value = parseCurrency(lead.valorOrcamento);
        const probability = clampPercentage(
          lead.probabilidadeFechamento ?? 50,
        );

        return {
          ...lead,
          forecastValue: value * probability / 100,
          probability,
          forecastScore: getForecastScore(lead),
        };
      })
      .sort((first, second) => (
        second.forecastScore - first.forecastScore
        || second.forecastValue - first.forecastValue
      ))
      .slice(0, 6);

    const closingSoon = likelyToClose.filter((lead) => (
      lead.probability >= 70
      || lead.temperatura === 'quente'
      || ['alta', 'urgente'].includes(lead.prioridade)
    ));

    const projectedContracts = pendingLeads.reduce(
      (sum, lead) => (
        sum + (clampPercentage(
          lead.probabilidadeFechamento ?? 50,
        ) / 100)
      ),
      0,
    );

    const revenueGoalProgress = salesGoal.revenue > 0
      ? clampPercentage(
        (receitaFechada / salesGoal.revenue) * 100,
      )
      : 0;

    const contractsGoalProgress = salesGoal.contracts > 0
      ? clampPercentage(
        (aprovados / salesGoal.contracts) * 100,
      )
      : 0;

    const revenueToGoal = Math.max(
      0,
      salesGoal.revenue - receitaFechada,
    );

    const contractsToGoal = Math.max(
      0,
      salesGoal.contracts - aprovados,
    );

    const projectedRevenueWithPipeline = (
      receitaFechada + weightedPotential
    );

    const funnelHealth = buildFunnelHealth(filtered);
    const commercialVelocity = getCommercialVelocity(filtered);

    const stats = [
      {
        title: 'Leads',
        value: total,
        icon: <Users size={20} />,
        color: '#fff',
      },
      {
        title: 'Conversao',
        value: `${conversao}%`,
        icon: <TrendingUp size={20} />,
        color: '#34d399',
      },
      {
        title: 'Contratos fechados',
        value: aprovados,
        icon: <CheckCircle size={20} />,
        color: '#60a5fa',
      },
      {
        title: 'Ticket medio',
        value: formatCurrency(ticketMedio),
        icon: <DollarSign size={20} />,
        color: '#c5a059',
        compact: true,
      },
      {
        title: 'Pendentes',
        value: pendentes,
        icon: <Clock size={20} />,
        color: '#fb923c',
      },
      {
        title: 'Perdidos',
        value: perdidos,
        icon: <XCircle size={20} />,
        color: '#f87171',
      },
      {
        title: 'Cancelados',
        value: cancelados,
        icon: <XCircle size={20} />,
        color: '#ef4444',
      },
      {
        title: 'Potencial aberto',
        value: formatCurrency(potencial),
        icon: <DollarSign size={20} />,
        color: '#c5a059',
        compact: true,
      },
      {
        title: 'Potencial ponderado',
        value: formatCurrency(weightedPotential),
        icon: <Target size={20} />,
        color: '#a78bfa',
        compact: true,
      },
      {
        title: 'Follow-ups hoje',
        value: followupsHoje,
        icon: <Clock size={20} />,
        color: '#a78bfa',
      },
      {
        title: 'Follow-ups atrasados',
        value: followupsAtrasados,
        icon: <Clock size={20} />,
        color: followupsAtrasados > 0
          ? '#f87171'
          : '#34d399',
      },
    ];

    return {
      stats,
      originRanking,
      campaignRanking,
      reasonRanking,
      temperatureSummary,
      stageRanking,
      topOrigin,
      topCampaign,
      aprovados,
      receitaFechada,
      total,
      likelyToClose,
      closingSoon,
      projectedContracts,
      projectedRevenueWithPipeline,
      revenueGoalProgress,
      contractsGoalProgress,
      revenueToGoal,
      contractsToGoal,
      funnelHealth,
      commercialVelocity,
    };
  }, [leads, periodo, salesGoal]);

  return (
    <section
      className="crm-stats-panel"
      style={{
        background: '#0a0a0a',
        padding: '24px',
        borderRadius: '16px',
        border: '1px solid #1a1a1a',
        marginBottom: '24px',
      }}
    >
      <div
        className="crm-stats-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            fontSize: '1.1rem',
            color: '#fff',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <BarChart3 size={20} color="#c5a059" />
          Relatorio Comercial
        </h2>

        <select
          value={periodo}
          onChange={(event) => setPeriodo(event.target.value)}
          style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            color: '#bbb',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          <option value="hoje">Hoje</option>
          <option value="este_mes">Este mes</option>
          <option value="ultimos_3">Ultimos 3 meses</option>
          <option value="ano">Ano</option>
        </select>
      </div>

      <div
        className="crm-stats-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
          gap: '16px',
        }}
      >
        {dashboard.stats.map((stat) => (
          <StatCard key={stat.title} stat={stat} />
        ))}
      </div>

      <ReportPanel
        title="Velocidade comercial"
        description="Mede quanto tempo o atendimento leva para responder, enviar proposta e fechar."
        icon={<Clock size={18} color="#60a5fa" />}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '12px',
          }}
        >
          <VelocityMetric
            label="Tempo até o primeiro contato"
            value={formatVelocityTime(
              dashboard.commercialVelocity.averageFirstResponseHours,
            )}
            detail={`${dashboard.commercialVelocity.measuredResponses} lead(s) medido(s)`}
            target="Meta sugerida: até 2h"
            good={
              dashboard.commercialVelocity.averageFirstResponseHours !== null
              && dashboard.commercialVelocity.averageFirstResponseHours <= 2
            }
          />

          <VelocityMetric
            label="Tempo até enviar orçamento"
            value={formatVelocityTime(
              dashboard.commercialVelocity.averageBudgetHours,
            )}
            detail={`${dashboard.commercialVelocity.measuredBudgets} lead(s) medido(s)`}
            target="Meta sugerida: até 24h"
            good={
              dashboard.commercialVelocity.averageBudgetHours !== null
              && dashboard.commercialVelocity.averageBudgetHours <= 24
            }
          />

          <VelocityMetric
            label="Tempo médio até fechar"
            value={
              dashboard.commercialVelocity.averageClosingDays === null
                ? 'Sem dados'
                : `${dashboard.commercialVelocity.averageClosingDays.toFixed(1)} dias`
            }
            detail={`${dashboard.commercialVelocity.measuredClosings} fechamento(s) medido(s)`}
            target="Use para comparar períodos"
            good={
              dashboard.commercialVelocity.averageClosingDays !== null
              && dashboard.commercialVelocity.averageClosingDays <= 14
            }
          />

          <VelocityMetric
            label="Contatos para converter"
            value={
              dashboard.commercialVelocity.averageContactsToClose === null
                ? 'Sem dados'
                : dashboard.commercialVelocity.averageContactsToClose.toFixed(1)
            }
            detail="Média de contatos nos leads fechados"
            target="Ajuda a ajustar a cadência"
            good={
              dashboard.commercialVelocity.averageContactsToClose !== null
              && dashboard.commercialVelocity.averageContactsToClose <= 5
            }
          />
        </div>
      </ReportPanel>

      <ReportPanel
        title="Saúde do funil"
        description="Diagnóstico dos leads parados, gargalos e oportunidades sem próximo passo."
        icon={<ActivityIcon score={dashboard.funnelHealth.healthScore} />}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
          }}
        >
          <FunnelHealthMetric
            label="Saúde geral"
            value={`${dashboard.funnelHealth.healthScore}%`}
            detail={
              dashboard.funnelHealth.healthScore >= 80
                ? 'Funil saudável'
                : dashboard.funnelHealth.healthScore >= 55
                  ? 'Requer atenção'
                  : 'Situação crítica'
            }
            color={
              dashboard.funnelHealth.healthScore >= 80
                ? '#34d399'
                : dashboard.funnelHealth.healthScore >= 55
                  ? '#fbbf24'
                  : '#f87171'
            }
          />

          <FunnelHealthMetric
            label="Leads críticos"
            value={dashboard.funnelHealth.critical.length}
            detail="Oportunidades com vários sinais de risco."
            color="#f87171"
          />

          <FunnelHealthMetric
            label="Sem próximo passo"
            value={dashboard.funnelHealth.noNextStep.length}
            detail="Leads ativos sem follow-up agendado."
            color="#fbbf24"
          />

          <FunnelHealthMetric
            label="Parados há 14+ dias"
            value={dashboard.funnelHealth.stalled.length}
            detail="Oportunidades sem atividade recente."
            color="#fb923c"
          />

          <FunnelHealthMetric
            label="Quentes esfriando"
            value={dashboard.funnelHealth.hotCooling.length}
            detail="Leads quentes sem ação rápida."
            color="#fb7185"
          />

          <FunnelHealthMetric
            label="Gargalos"
            value={dashboard.funnelHealth.bottlenecks.length}
            detail="Etapas com acúmulo ou demora excessiva."
            color="#a78bfa"
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '14px',
            marginTop: '16px',
          }}
        >
          <div
            style={{
              background: '#0d0d0d',
              border: '1px solid #222',
              borderRadius: '10px',
              padding: '14px',
            }}
          >
            <div
              style={{
                color: '#fff',
                fontSize: '0.88rem',
                fontWeight: 700,
                marginBottom: '10px',
              }}
            >
              Leads que precisam de atenção
            </div>

            {dashboard.funnelHealth.leadHealth.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '9px',
                }}
              >
                {dashboard.funnelHealth.leadHealth.map((item) => (
                  <div
                    key={item.lead.id}
                    style={{
                      background: item.health === 'critico'
                        ? '#1b0d0d'
                        : '#111',
                      border: item.health === 'critico'
                        ? '1px solid #472020'
                        : '1px solid #242424',
                      borderRadius: '9px',
                      padding: '11px',
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
                      <div
                        style={{
                          color: '#ddd',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          wordBreak: 'break-word',
                        }}
                      >
                        {item.lead.nome || 'Lead sem nome'}
                      </div>

                      <span
                        style={{
                          color: item.health === 'critico'
                            ? '#f87171'
                            : item.health === 'atencao'
                              ? '#fbbf24'
                              : '#34d399',
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.health}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        marginTop: '8px',
                      }}
                    >
                      {item.issues.map((issue) => (
                        <span
                          key={`${item.lead.id}-${issue.key}`}
                          style={{
                            background: '#181818',
                            border: '1px solid #303030',
                            color: '#aaa',
                            borderRadius: '999px',
                            padding: '4px 7px',
                            fontSize: '0.66rem',
                          }}
                        >
                          {issue.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="Nenhum lead ativo precisa de atenção." />
            )}
          </div>

          <div
            style={{
              background: '#0d0d0d',
              border: '1px solid #222',
              borderRadius: '10px',
              padding: '14px',
            }}
          >
            <div
              style={{
                color: '#fff',
                fontSize: '0.88rem',
                fontWeight: 700,
                marginBottom: '10px',
              }}
            >
              Recomendações práticas
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
              }}
            >
              {dashboard.funnelHealth.recommendations.map(
                (recommendation, index) => (
                  <div
                    key={`${recommendation}-${index}`}
                    style={{
                      display: 'flex',
                      gap: '9px',
                      alignItems: 'flex-start',
                      background: '#111',
                      border: '1px solid #242424',
                      borderRadius: '9px',
                      padding: '11px',
                    }}
                  >
                    <span
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '999px',
                        background: '#18130a',
                        border: '1px solid #3a2d16',
                        color: '#c5a059',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </span>

                    <span
                      style={{
                        color: '#bbb',
                        fontSize: '0.78rem',
                        lineHeight: 1.5,
                      }}
                    >
                      {recommendation}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: '16px',
          }}
        >
          <div
            style={{
              color: '#fff',
              fontSize: '0.88rem',
              fontWeight: 700,
              marginBottom: '10px',
            }}
          >
            Tempo médio e acúmulo por etapa
          </div>

          {dashboard.funnelHealth.stageHealth.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '10px',
              }}
            >
              {dashboard.funnelHealth.stageHealth.map((stage) => (
                <div
                  key={stage.status}
                  style={{
                    background: dashboard.funnelHealth.bottlenecks.some(
                      (item) => item.status === stage.status,
                    )
                      ? '#18130a'
                      : '#0d0d0d',
                    border: dashboard.funnelHealth.bottlenecks.some(
                      (item) => item.status === stage.status,
                    )
                      ? '1px solid #493817'
                      : '1px solid #222',
                    borderRadius: '9px',
                    padding: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <span
                      style={{
                        color: '#ddd',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      {stage.title}
                    </span>

                    <span
                      style={{
                        color: '#c5a059',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                      }}
                    >
                      {stage.quantity} lead(s)
                    </span>
                  </div>

                  <div
                    style={{
                      color: '#888',
                      fontSize: '0.72rem',
                      lineHeight: 1.5,
                      marginTop: '7px',
                    }}
                  >
                    Média de {stage.averageDays} dia(s) nesta etapa
                  </div>

                  <div
                    style={{
                      color: stage.stalledPercentage >= 40
                        ? '#f87171'
                        : '#777',
                      fontSize: '0.7rem',
                      marginTop: '4px',
                    }}
                  >
                    {stage.stalledPercentage}% estão há 10 dias ou mais
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="Nenhuma etapa ativa disponível para análise." />
          )}
        </div>
      </ReportPanel>

      <ReportPanel
        title="Previsao de vendas"
        description="Projecao baseada em valor, prioridade, temperatura e probabilidade de fechamento."
        icon={<TrendingUp size={18} color="#34d399" />}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '12px',
          }}
        >
          <ForecastMetric
            label="Receita projetada"
            value={formatCurrency(dashboard.projectedRevenueWithPipeline)}
            detail="Receita fechada mais o potencial ponderado dos leads ativos."
            color="#34d399"
          />

          <ForecastMetric
            label="Contratos projetados"
            value={dashboard.projectedContracts.toFixed(1)}
            detail="Estimativa calculada pela probabilidade de cada lead."
            color="#60a5fa"
          />

          <ForecastMetric
            label="Leads com alta chance"
            value={dashboard.closingSoon.length}
            detail="Leads quentes, prioritarios ou com probabilidade acima de 70%."
            color="#fbbf24"
          />
        </div>

        <div
          style={{
            marginTop: '16px',
            background: '#0d0d0d',
            border: '1px solid #222',
            borderRadius: '10px',
            padding: '14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                }}
              >
                Metas comerciais
              </div>

              <div
                style={{
                  color: '#666',
                  fontSize: '0.76rem',
                  marginTop: '4px',
                }}
              >
                As metas ficam salvas neste navegador.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsEditingGoal((current) => !current)}
              style={{
                background: '#171717',
                color: '#ddd',
                border: '1px solid #333',
                padding: '8px 11px',
                borderRadius: '7px',
                cursor: 'pointer',
                fontSize: '0.76rem',
                fontWeight: 700,
              }}
            >
              {isEditingGoal ? 'Concluir' : 'Editar metas'}
            </button>
          </div>

          {isEditingGoal && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '10px',
                marginBottom: '14px',
              }}
            >
              <label>
                <span
                  style={{
                    color: '#777',
                    fontSize: '0.72rem',
                    display: 'block',
                    marginBottom: '5px',
                  }}
                >
                  Meta de faturamento
                </span>

                <input
                  type="number"
                  min="0"
                  step="100"
                  value={salesGoal.revenue}
                  onChange={(event) => {
                    setSalesGoal((current) => ({
                      ...current,
                      revenue: Math.max(
                        0,
                        Number(event.target.value) || 0,
                      ),
                    }));
                  }}
                  style={{
                    width: '100%',
                    background: '#111',
                    border: '1px solid #333',
                    borderRadius: '7px',
                    color: '#fff',
                    padding: '10px',
                    boxSizing: 'border-box',
                  }}
                />
              </label>

              <label>
                <span
                  style={{
                    color: '#777',
                    fontSize: '0.72rem',
                    display: 'block',
                    marginBottom: '5px',
                  }}
                >
                  Meta de contratos
                </span>

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={salesGoal.contracts}
                  onChange={(event) => {
                    setSalesGoal((current) => ({
                      ...current,
                      contracts: Math.max(
                        0,
                        Number(event.target.value) || 0,
                      ),
                    }));
                  }}
                  style={{
                    width: '100%',
                    background: '#111',
                    border: '1px solid #333',
                    borderRadius: '7px',
                    color: '#fff',
                    padding: '10px',
                    boxSizing: 'border-box',
                  }}
                />
              </label>
            </div>
          )}

          <GoalProgress
            label="Meta de faturamento"
            current={formatCurrency(dashboard.receitaFechada)}
            target={formatCurrency(salesGoal.revenue)}
            percentage={dashboard.revenueGoalProgress}
            remaining={dashboard.revenueToGoal > 0
              ? `Faltam ${formatCurrency(dashboard.revenueToGoal)}`
              : 'Meta atingida'}
          />

          <GoalProgress
            label="Meta de contratos"
            current={`${dashboard.aprovados} fechado(s)`}
            target={`${salesGoal.contracts} contrato(s)`}
            percentage={dashboard.contractsGoalProgress}
            remaining={dashboard.contractsToGoal > 0
              ? `Faltam ${dashboard.contractsToGoal} contrato(s)`
              : 'Meta atingida'}
          />
        </div>

        <div
          style={{
            marginTop: '16px',
          }}
        >
          <div
            style={{
              color: '#fff',
              fontSize: '0.88rem',
              fontWeight: 700,
              marginBottom: '10px',
            }}
          >
            Leads com maior chance de fechamento
          </div>

          {dashboard.likelyToClose.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '10px',
              }}
            >
              {dashboard.likelyToClose.map((lead) => (
                <div
                  key={lead.id}
                  style={{
                    background: '#0d0d0d',
                    border: '1px solid #222',
                    borderRadius: '9px',
                    padding: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '10px',
                    }}
                  >
                    <div
                      style={{
                        color: '#ddd',
                        fontWeight: 700,
                        fontSize: '0.84rem',
                        wordBreak: 'break-word',
                      }}
                    >
                      {lead.nome || 'Lead sem nome'}
                    </div>

                    <span
                      style={{
                        color: lead.probability >= 70
                          ? '#34d399'
                          : '#fbbf24',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {lead.probability}%
                    </span>
                  </div>

                  <div
                    style={{
                      color: '#777',
                      fontSize: '0.74rem',
                      marginTop: '6px',
                    }}
                  >
                    {lead.tipoServico || 'Servico nao informado'}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '10px',
                      marginTop: '10px',
                      color: '#aaa',
                      fontSize: '0.74rem',
                    }}
                  >
                    <span>
                      {lead.temperatura || 'morno'} · {lead.prioridade || 'media'}
                    </span>

                    <span>
                      {formatCurrency(lead.forecastValue)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="Nenhum lead ativo disponivel para previsao." />
          )}
        </div>
      </ReportPanel>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
          marginTop: '20px',
        }}
      >
        <HighlightCard
          label="Receita dos contratos fechados"
          value={formatCurrency(dashboard.receitaFechada)}
          valueColor="#34d399"
          description="Soma dos orcamentos dos leads convertidos no periodo."
        />

        <HighlightCard
          label="Principal origem dos fechamentos"
          value={dashboard.topOrigin
            ? dashboard.topOrigin.name
            : 'Sem fechamentos no periodo'}
          valueColor="#c5a059"
          description={dashboard.topOrigin
            ? `${dashboard.topOrigin.approved} contrato(s), com conversao de ${dashboard.topOrigin.conversion}%.`
            : 'A origem principal aparecera quando houver contratos fechados.'}
        />

        <HighlightCard
          label="Campanha com melhor desempenho"
          value={dashboard.topCampaign
            ? dashboard.topCampaign.name
            : 'Sem campanhas no periodo'}
          valueColor="#a78bfa"
          description={dashboard.topCampaign
            ? `${dashboard.topCampaign.approved} fechamento(s), ${dashboard.topCampaign.leads} lead(s) e conversao de ${dashboard.topCampaign.conversion}%.`
            : 'Cadastre campanhas nos leads para acompanhar o desempenho.'}
        />
      </div>

      <ReportPanel
        title="Conversao por etapa"
        description="Distribuicao atual dos leads dentro do pipeline."
        icon={<Target size={18} color="#c5a059" />}
      >
        {dashboard.stageRanking.length > 0 ? (
          <RankingBars
            items={dashboard.stageRanking.map((item) => ({
              key: item.status,
              label: item.title,
              right: `${item.quantity} · ${item.percentage}%`,
              percentage: item.percentage,
            }))}
          />
        ) : (
          <EmptyState text="Ainda nao existem leads no periodo selecionado." />
        )}
      </ReportPanel>

      <ReportPanel
        title="Temperatura comercial"
        description="Comparacao entre leads frios, mornos e quentes."
        icon={<ThermometerSun size={18} color="#c5a059" />}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '12px',
          }}
        >
          {dashboard.temperatureSummary.map((item) => (
            <div
              key={item.temperature}
              style={{
                background: '#0d0d0d',
                border: '1px solid #222',
                borderRadius: '10px',
                padding: '14px',
              }}
            >
              <div
                style={{
                  color: item.color,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  fontWeight: 700,
                  fontSize: '0.86rem',
                }}
              >
                {item.icon}
                {item.label}
              </div>

              <div
                style={{
                  color: '#fff',
                  fontSize: '1.35rem',
                  fontWeight: 800,
                  marginTop: '10px',
                }}
              >
                {item.quantity}
              </div>

              <div
                style={{
                  color: '#777',
                  fontSize: '0.76rem',
                  lineHeight: 1.5,
                  marginTop: '6px',
                }}
              >
                {item.approved} fechamento(s) · {item.conversion}% de conversao
              </div>

              <div
                style={{
                  color: '#aaa',
                  fontSize: '0.76rem',
                  marginTop: '5px',
                }}
              >
                Potencial: {formatCurrency(item.potentialValue)}
              </div>
            </div>
          ))}
        </div>
      </ReportPanel>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
          marginTop: '16px',
        }}
      >
        <ReportPanel
          title="Desempenho por origem"
          description="Leads, fechamentos e conversao por canal."
          icon={<Users size={18} color="#c5a059" />}
          noMargin
        >
          <PerformanceTable items={dashboard.originRanking} />
        </ReportPanel>

        <ReportPanel
          title="Desempenho por campanha"
          description="Compare quais campanhas geram mais oportunidades."
          icon={<Megaphone size={18} color="#c5a059" />}
          noMargin
        >
          <PerformanceTable items={dashboard.campaignRanking} />
        </ReportPanel>
      </div>

      <ReportPanel
        title="Motivos de perda e cancelamento"
        description="Razoes mais frequentes para oportunidades nao convertidas."
        icon={<AlertTriangle size={18} color="#f87171" />}
      >
        {dashboard.reasonRanking.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {dashboard.reasonRanking.map((item, index) => (
              <div
                key={`${item.reason}-${index}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '14px',
                  background: '#0d0d0d',
                  border: '1px solid #222',
                  borderRadius: '9px',
                  padding: '12px',
                }}
              >
                <span
                  style={{
                    color: '#bbb',
                    fontSize: '0.82rem',
                    lineHeight: 1.45,
                  }}
                >
                  {item.reason}
                </span>

                <span
                  style={{
                    minWidth: '30px',
                    height: '26px',
                    borderRadius: '999px',
                    background: '#241111',
                    border: '1px solid #4a2020',
                    color: '#f87171',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    padding: '0 8px',
                  }}
                >
                  {item.quantity}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="Nenhum motivo de perda ou cancelamento registrado no periodo." />
        )}
      </ReportPanel>
    </section>
  );
}

function VelocityMetric({
  label,
  value,
  detail,
  target,
  good,
}) {
  const color = value === 'Sem dados'
    ? '#888'
    : good
      ? '#34d399'
      : '#fbbf24';

  return (
    <div
      style={{
        background: '#0d0d0d',
        border: '1px solid #222',
        borderRadius: '10px',
        padding: '14px',
      }}
    >
      <div
        style={{
          color: '#777',
          fontSize: '0.73rem',
          marginBottom: '7px',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color,
          fontSize: '1.22rem',
          fontWeight: 800,
        }}
      >
        {value}
      </div>

      <div
        style={{
          color: '#777',
          fontSize: '0.7rem',
          marginTop: '6px',
        }}
      >
        {detail}
      </div>

      <div
        style={{
          color: '#5f5f5f',
          fontSize: '0.68rem',
          marginTop: '4px',
        }}
      >
        {target}
      </div>
    </div>
  );
}

function ActivityIcon({ score }) {
  const color = score >= 80
    ? '#34d399'
    : score >= 55
      ? '#fbbf24'
      : '#f87171';

  return <TrendingUp size={18} color={color} />;
}

function FunnelHealthMetric({
  label,
  value,
  detail,
  color,
}) {
  return (
    <div
      style={{
        background: '#0d0d0d',
        border: '1px solid #222',
        borderRadius: '10px',
        padding: '14px',
      }}
    >
      <div
        style={{
          color: '#777',
          fontSize: '0.73rem',
          marginBottom: '7px',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color,
          fontSize: '1.25rem',
          fontWeight: 800,
        }}
      >
        {value}
      </div>

      <div
        style={{
          color: '#666',
          fontSize: '0.71rem',
          lineHeight: 1.45,
          marginTop: '6px',
        }}
      >
        {detail}
      </div>
    </div>
  );
}

function ForecastMetric({
  label,
  value,
  detail,
  color,
}) {
  return (
    <div
      style={{
        background: '#0d0d0d',
        border: '1px solid #222',
        borderRadius: '10px',
        padding: '14px',
      }}
    >
      <div
        style={{
          color: '#777',
          fontSize: '0.74rem',
          marginBottom: '7px',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color,
          fontSize: '1.25rem',
          fontWeight: 800,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>

      <div
        style={{
          color: '#666',
          fontSize: '0.72rem',
          lineHeight: 1.45,
          marginTop: '6px',
        }}
      >
        {detail}
      </div>
    </div>
  );
}

function GoalProgress({
  label,
  current,
  target,
  percentage,
  remaining,
}) {
  return (
    <div
      style={{
        marginTop: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '6px',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            color: '#bbb',
            fontSize: '0.78rem',
            fontWeight: 700,
          }}
        >
          {label}
        </div>

        <div
          style={{
            color: '#777',
            fontSize: '0.72rem',
          }}
        >
          {current} de {target}
        </div>
      </div>

      <div
        style={{
          width: '100%',
          height: '8px',
          borderRadius: '999px',
          background: '#1d1d1d',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${clampPercentage(percentage)}%`,
            height: '100%',
            borderRadius: '999px',
            background: percentage >= 100 ? '#34d399' : '#c5a059',
            transition: 'width 0.25s ease',
          }}
        />
      </div>

      <div
        style={{
          color: percentage >= 100 ? '#34d399' : '#888',
          fontSize: '0.72rem',
          marginTop: '5px',
        }}
      >
        {Math.round(percentage)}% · {remaining}
      </div>
    </div>
  );
}

function StatCard({ stat }) {
  return (
    <div
      className="crm-stat-card"
      style={{
        background: '#111',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid #222',
        minHeight: '92px',
      }}
    >
      <div
        style={{
          color: '#888',
          fontSize: '0.8rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px',
        }}
      >
        {stat.icon}
        {stat.title}
      </div>

      <div
        style={{
          fontSize: stat.compact ? '1.1rem' : '1.5rem',
          fontWeight: 700,
          color: stat.color,
          wordBreak: 'break-word',
        }}
      >
        {stat.value}
      </div>
    </div>
  );
}

function HighlightCard({
  label,
  value,
  valueColor,
  description,
}) {
  return (
    <div
      style={{
        background: '#111',
        border: '1px solid #222',
        borderRadius: '12px',
        padding: '18px',
      }}
    >
      <div
        style={{
          color: '#888',
          fontSize: '0.78rem',
          marginBottom: '8px',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: valueColor,
          fontSize: '1.2rem',
          fontWeight: 700,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>

      <div
        style={{
          color: '#666',
          fontSize: '0.78rem',
          marginTop: '6px',
          lineHeight: 1.45,
        }}
      >
        {description}
      </div>
    </div>
  );
}

function ReportPanel({
  title,
  description,
  icon,
  children,
  noMargin = false,
}) {
  return (
    <div
      style={{
        background: '#111',
        border: '1px solid #222',
        borderRadius: '12px',
        padding: '18px',
        marginTop: noMargin ? 0 : '16px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          marginBottom: '16px',
        }}
      >
        <span
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: '#171717',
            border: '1px solid #292929',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </span>

        <div>
          <h3
            style={{
              color: '#fff',
              fontSize: '0.95rem',
              margin: 0,
            }}
          >
            {title}
          </h3>

          <p
            style={{
              color: '#666',
              fontSize: '0.78rem',
              margin: '5px 0 0',
              lineHeight: 1.4,
            }}
          >
            {description}
          </p>
        </div>
      </div>

      {children}
    </div>
  );
}

function RankingBars({ items }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      {items.map((item) => (
        <div key={item.key}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '6px',
            }}
          >
            <span
              style={{
                color: '#bbb',
                fontSize: '0.84rem',
                fontWeight: 600,
              }}
            >
              {item.label}
            </span>

            <span
              style={{
                color: '#888',
                fontSize: '0.78rem',
                whiteSpace: 'nowrap',
              }}
            >
              {item.right}
            </span>
          </div>

          <div
            style={{
              width: '100%',
              height: '7px',
              borderRadius: '999px',
              background: '#1d1d1d',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.max(0, Math.min(100, item.percentage))}%`,
                height: '100%',
                borderRadius: '999px',
                background: '#c5a059',
                transition: 'width 0.25s ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PerformanceTable({ items }) {
  if (items.length === 0) {
    return <EmptyState text="Nenhum dado disponivel no periodo." />;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {items.map((item) => (
        <div
          key={item.name}
          style={{
            background: '#0d0d0d',
            border: '1px solid #222',
            borderRadius: '9px',
            padding: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <div
              style={{
                color: '#ddd',
                fontSize: '0.84rem',
                fontWeight: 700,
                wordBreak: 'break-word',
              }}
            >
              {item.name}
            </div>

            <div
              style={{
                color: '#34d399',
                fontSize: '0.8rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {item.conversion}%
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
              marginTop: '10px',
            }}
          >
            <MiniMetric label="Leads" value={item.leads} />
            <MiniMetric label="Fechados" value={item.approved} />
            <MiniMetric
              label="Receita"
              value={formatCurrency(item.closedRevenue)}
              compact
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniMetric({ label, value, compact = false }) {
  return (
    <div>
      <div
        style={{
          color: '#666',
          fontSize: '0.68rem',
          marginBottom: '3px',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: '#aaa',
          fontSize: compact ? '0.72rem' : '0.82rem',
          fontWeight: 700,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div
      style={{
        color: '#666',
        fontSize: '0.84rem',
        border: '1px dashed #292929',
        borderRadius: '9px',
        padding: '14px',
        textAlign: 'center',
      }}
    >
      {text}
    </div>
  );
}