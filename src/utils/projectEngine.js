import { normalizeName, normalizePhone } from './clientIdentity.js';
import { readStorage, STORAGE_KEYS } from './storage.js';
import {
  getConsolidatedFinances,
  calculateProjectFinancials,
} from './financeEngine.js';

export const COMMERCIAL_STATUSES = [
  'novo_contato',
  'orcamento_elaboracao',
  'orcamento_enviado',
  'aguardando_retorno',
  'negociacao',
  'aprovado',
  'contrato_pendente',
  'contratado',
  'perdido',
  'cancelado',
];

export const OPERATIONAL_PIPELINE = Object.freeze([
  {
    id: 'novo',
    titulo: 'Novo',
  },
  {
    id: 'planejamento',
    titulo: 'Planejamento',
  },
  {
    id: 'pre_producao',
    titulo: 'Pré-produção',
  },
  {
    id: 'aguardando_evento',
    titulo: 'Aguardando evento',
  },
  {
    id: 'evento_realizado',
    titulo: 'Evento realizado',
  },
  {
    id: 'selecao',
    titulo: 'Seleção',
  },
  {
    id: 'edicao',
    titulo: 'Edição',
  },
  {
    id: 'revisao',
    titulo: 'Revisão',
  },
  {
    id: 'entrega',
    titulo: 'Entrega',
  },
  {
    id: 'finalizado',
    titulo: 'Finalizado',
  },
  {
    id: 'cancelado',
    titulo: 'Cancelado',
  },
]);

export const PRODUCTION_STATUSES = OPERATIONAL_PIPELINE.map(
  (item) => item.id,
);

export const PRIORITIES = [
  'baixa',
  'normal',
  'alta',
  'urgente',
];

export const SERVICE_TYPES = [
  'Fotografia',
  'Filmagem',
  'Fotografia e filmagem',
  'Outro',
];

export const PROJECT_CATEGORIES = [
  'Casamento',
  'Ensaio de casal',
  'Pré-wedding',
  'Gestante',
  'Família',
  'Formatura',
  'Aniversário',
  'Evento',
  'Corporativo',
  'Editorial',
  'Outro',
];

const legacyCommercial = {
  novo: 'novo_contato',
  orcamento: 'orcamento_enviado',
  'em negociacao': 'negociacao',
  fechado: 'contratado',
  contrato_fechado: 'contratado',
  recusado: 'perdido',
  cancelado: 'cancelado',
};

const legacyProduction = {
  contrato_fechado: 'novo',
  agendado: 'aguardando_evento',
  fotografando: 'evento_realizado',
  aguardando_backup: 'evento_realizado',
  backup_concluido: 'selecao',
  pronto_entrega: 'entrega',
  entregue: 'entrega',
  pausado: 'planejamento',
  edicao: 'edicao',
  revisao: 'revisao',
  selecao: 'selecao',
  finalizado: 'finalizado',
  cancelado: 'cancelado',
};

const key = (value) => (
  normalizeName(value).replace(/\s+/g, '_')
);

export const normalizeCommercialStatus = (
  value,
  fallback = 'novo_contato',
) => (
  COMMERCIAL_STATUSES.includes(key(value))
    ? key(value)
    : (
      legacyCommercial[normalizeName(value)]
      || value
      || fallback
    )
);

export const normalizeProductionStatus = (
  value,
  fallback = 'novo',
) => {
  const normalized = key(value);

  if (PRODUCTION_STATUSES.includes(normalized)) {
    return normalized;
  }

  return legacyProduction[normalized] || fallback;
};

export const calculateDeliveryDate = (
  eventDate,
  days,
) => {
  if (
    !eventDate
    || Number(days) < 0
    || !Number.isFinite(Number(days))
  ) {
    return '';
  }

  const date = new Date(`${eventDate}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  date.setDate(date.getDate() + Number(days));

  return date.toISOString().slice(0, 10);
};

export const deliveryState = (
  project,
  reference = new Date(),
) => {
  const due = project.dataPrevistaEntrega
    ? new Date(`${project.dataPrevistaEntrega}T23:59:59`)
    : null;

  const status = normalizeProductionStatus(
    project.statusProducao || project.status,
  );

  if (
    !due
    || Number.isNaN(due.getTime())
    || status === 'entrega'
    || status === 'finalizado'
  ) {
    return {
      daysRemaining: null,
      overdue: false,
      upcoming: false,
    };
  }

  const daysRemaining = Math.ceil(
    (due - reference) / 86400000,
  );

  return {
    daysRemaining,
    overdue: daysRemaining < 0,
    upcoming: (
      daysRemaining >= 0
      && daysRemaining <= 7
    ),
  };
};

export const calculateProjectValues = (
  project = {},
) => {
  const contracts = readStorage(
    STORAGE_KEYS.contracts,
    [],
  );

  const transactions = readStorage(
    STORAGE_KEYS.finances,
    [],
  );

  const clients = readStorage(
    STORAGE_KEYS.clients,
    [],
  );

  const consolidated = getConsolidatedFinances({
    contracts,
    transactions,
    clients,
  });

  const financials = calculateProjectFinancials({
    project,
    contracts,
    receitasAvulsas: consolidated.receitasAvulsas,
    despesas: consolidated.despesas,
  });

  const valorContratado = (
    financials.receitaContratada
    || Number(
      project.valorContratado
      || project.valor_contratado
      || 0,
    )
  );

  const valorRecebido = financials.receitaRecebida;

  const saldoPendente = Math.max(
    0,
    valorContratado - valorRecebido,
  );

  const margemEstimada = valorContratado > 0
    ? (
      financials.lucroEstimado
      / valorContratado
    ) * 100
    : 0;

  const margemReal = valorRecebido > 0
    ? (
      financials.lucroReal
      / valorRecebido
    ) * 100
    : 0;

  return {
    valorContratado,
    valorRecebido,
    saldoPendente,
    custoEstimado: financials.custoEstimado,
    custoReal: financials.custoReal,
    lucroEstimado: financials.lucroEstimado,
    lucroReal: financials.lucroReal,
    margemEstimada,
    margemReal,
    pontoEquilibrio: financials.custoEstimado,
  };
};

export const projectMatchesSearch = (
  project,
  client,
  query,
) => {
  const text = normalizeName(query);
  const digits = normalizePhone(query);

  return (
    !text
    || [
      project.titulo,
      project.categoria,
      project.tipoServico,
      project.cidade,
      project.local,
      project.statusComercial,
      project.statusProducao,
      client?.nome,
    ].some((value) => (
      normalizeName(value).includes(text)
    ))
    || (
      digits
      && normalizePhone(
        client?.telefone || client?.whatsapp,
      ).includes(digits)
    )
  );
};