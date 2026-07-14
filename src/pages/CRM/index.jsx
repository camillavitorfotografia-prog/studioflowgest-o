import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Bot,
  CalendarClock,
  Calculator,
  CheckCircle2,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  MessageCircle,
  NotebookPen,
  PlayCircle,
  Plus,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CRMStats from './CRMStats';
import KanbanBoard from './KanbanBoard';
import Modal from '../../components/Modal';
import LeadForm from './LeadForm';
import {
  CRM_STATUSES,
  LEAD_ORIGINS,
  SERVICE_TYPES,
  getStatusTitle,
  normalizeLeadStatus,
} from '../../data/crm';
import { isSupabaseConfigured, supabase } from '../../utils/supabase';
import {
  convertLeadToClientProject,
  isMissingRelationError,
  mapLeadFromDb,
  saveLeadRow,
} from '../../utils/dbData';
import { inputToDate } from '../../utils/masks';
import { parseCurrency } from '../../utils/formatters';
import {
  createId,
  readStorage,
  STORAGE_KEYS,
  writeStorage,
} from '../../utils/storage';
import {
  useKeyboardShortcuts,
  AutoSaveIndicator,
} from '../../components/PremiumUXKit';
import './CRM.css';

const CONTACT_TYPES = [
  'WhatsApp',
  'Ligacao',
  'E-mail',
  'Reuniao',
  'Observacao',
];

const CONTACT_RESULTS = [
  'Aguardando resposta',
  'Cliente respondeu',
  'Orcamento solicitado',
  'Orcamento enviado',
  'Reuniao agendada',
  'Em negociacao',
  'Contrato fechado',
  'Sem interesse',
  'Nao respondeu',
  'Outro',
];

const WHATSAPP_TEMPLATES = [
  {
    id: 'primeiro_contato',
    title: 'Primeiro contato',
    message: (name) => (
      `Olá, ${name}! Tudo bem? Aqui é a Camilla, da Camilla Vitor Fotografia. `
      + 'Recebi seu contato e quero entender melhor o que vocês estão planejando. '
      + 'Pode me contar um pouco sobre a data, o local e o tipo de cobertura que procuram?'
    ),
  },
  {
    id: 'envio_orcamento',
    title: 'Envio de orçamento',
    message: (name) => (
      `Olá, ${name}! Preparei o orçamento com base no que conversamos. `
      + 'Estou enviando para você analisar com calma. '
      + 'Depois me conte o que achou e se ficou alguma dúvida.'
    ),
  },
  {
    id: 'followup',
    title: 'Follow-up',
    message: (name) => (
      `Olá, ${name}! Passando para saber se você conseguiu analisar o orçamento que enviei. `
      + 'Ficou alguma dúvida ou existe algum ponto que gostaria de ajustar?'
    ),
  },
  {
    id: 'retomada',
    title: 'Retomar conversa',
    message: (name) => (
      `Olá, ${name}! Tudo bem? Nossa conversa ficou em aberto e resolvi passar por aqui. `
      + 'Vocês ainda estão procurando fotografia e filme para esse momento?'
    ),
  },
];

const getLeadFirstName = (lead = {}) => (
  String(lead.nome || 'cliente').trim().split(/\s+/)[0] || 'cliente'
);

const normalizeLeadPhone = (value = '') => (
  String(value || '').replace(/\D/g, '')
);

const normalizeLeadEmail = (value = '') => (
  String(value || '').trim().toLowerCase()
);

const findDuplicateLead = (
  leads = [],
  candidate = {},
  ignoredId = '',
) => {
  const candidatePhone = normalizeLeadPhone(
    candidate.whatsapp || candidate.telefone,
  );

  const candidateEmail = normalizeLeadEmail(
    candidate.email,
  );

  return leads.find((lead) => {
    if (String(lead.id) === String(ignoredId || '')) {
      return false;
    }

    const leadPhone = normalizeLeadPhone(
      lead.whatsapp || lead.telefone,
    );

    const leadEmail = normalizeLeadEmail(lead.email);

    return (
      candidatePhone
      && leadPhone
      && candidatePhone === leadPhone
    ) || (
      candidateEmail
      && leadEmail
      && candidateEmail === leadEmail
    );
  }) || null;
};


const getWhatsAppNumber = (lead) => {
  const safeLead = lead || {};
  const digits = String(
    safeLead.whatsapp || safeLead.telefone || '',
  ).replace(/\D/g, '');

  if (!digits) return '';

  return digits.startsWith('55') ? digits : `55${digits}`;
};

const getLocalDateTimeInputValue = () => {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60000;

  return new Date(now.getTime() - timezoneOffset)
    .toISOString()
    .slice(0, 16);
};

const getLocalDateInputValue = () => {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60000;

  return new Date(now.getTime() - timezoneOffset)
    .toISOString()
    .slice(0, 10);
};

const createEmptyContactForm = () => ({
  tipoContato: 'WhatsApp',
  dataContato: getLocalDateTimeInputValue(),
  descricao: '',
  resultado: 'Aguardando resposta',
  proximoFollowup: '',
});

const createEmptyStatusReasonForm = () => ({
  leadId: '',
  status: '',
  motivo: '',
});

const createEmptyTaskForm = () => ({
  leadId: '',
  titulo: '',
  prazo: getLocalDateInputValue(),
  prioridade: 'media',
  responsavel: 'Camilla',
});


const createEmptyQuickNoteForm = () => ({
  leadId: '',
  texto: '',
});

const getLeadTasks = (lead = {}) => {
  const history = Array.isArray(lead.historico)
    ? lead.historico
    : [];

  const tasks = new Map();

  history.forEach((item) => {
    if (item?.tipo !== 'tarefa_comercial' || !item.tarefaId) {
      return;
    }

    const currentTask = tasks.get(item.tarefaId) || {
      id: item.tarefaId,
      leadId: lead.id,
      leadName: lead.nome || 'Lead sem nome',
      lead,
      titulo: item.titulo || 'Tarefa comercial',
      prazo: item.prazo || '',
      prioridade: item.prioridade || 'media',
      responsavel: item.responsavel || 'Camilla',
      concluida: false,
      criadaEm: item.data || '',
      concluidaEm: '',
    };

    if (item.tarefaAcao === 'criada') {
      tasks.set(item.tarefaId, {
        ...currentTask,
        titulo: item.titulo || currentTask.titulo,
        prazo: item.prazo || currentTask.prazo,
        prioridade: item.prioridade || currentTask.prioridade,
        responsavel: item.responsavel || currentTask.responsavel,
        concluida: false,
        criadaEm: item.data || currentTask.criadaEm,
      });
    }

    if (item.tarefaAcao === 'concluida') {
      tasks.set(item.tarefaId, {
        ...currentTask,
        concluida: true,
        concluidaEm: item.data || '',
      });
    }
  });

  return [...tasks.values()];
};

const getTaskCategory = (task = {}) => {
  if (task.concluida) return 'concluida';

  const dueDate = parseDateOnly(task.prazo);

  if (!dueDate) return 'sem_prazo';

  const today = parseDateOnly(new Date());

  if (!today) return 'proxima';

  if (dueDate.getTime() < today.getTime()) return 'atrasada';
  if (dueDate.getTime() === today.getTime()) return 'hoje';

  return 'proxima';
};

const TASK_PRIORITY_LABELS = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
};

const TASK_PRIORITY_COLORS = {
  baixa: '#9ca3af',
  media: '#60a5fa',
  alta: '#fbbf24',
  urgente: '#f87171',
};

const createEmptyFilters = () => ({
  search: '',
  service: '',
  origin: '',
  campaign: '',
  status: '',
  followup: '',
  priority: '',
  temperature: '',
});

const normalizeSearchText = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const getLeadFollowupValue = (lead = {}) => (
  lead.dataProximoFollowup
  || lead.dataProximoRetorno
  || lead.data_proximo_followup
  || lead.data_proximo_retorno
  || ''
);

const parseDateOnly = (value) => {
  if (!value) return null;

  const normalizedValue = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    const [year, month, day] = normalizedValue.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) return null;

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
};

const getFollowupCategory = (lead) => {
  const followupDate = parseDateOnly(getLeadFollowupValue(lead));

  if (!followupDate) return 'sem_followup';

  const today = new Date();
  const normalizedToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  if (followupDate.getTime() < normalizedToday.getTime()) {
    return 'atrasado';
  }

  if (followupDate.getTime() === normalizedToday.getTime()) {
    return 'hoje';
  }

  return 'proximos';
};

const formatDateInputValue = (date) => {
  const timezoneOffset = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - timezoneOffset)
    .toISOString()
    .slice(0, 10);
};

const getDaysBetween = (firstDate, secondDate) => {
  if (!firstDate || !secondDate) return 0;

  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  return Math.max(
    0,
    Math.floor(
      (secondDate.getTime() - firstDate.getTime())
      / millisecondsPerDay,
    ),
  );
};

const CRM_AUTOMATION_RULES_STORAGE_KEY = 'studioflow_crm_automation_rules';
const CRM_AUDIT_ACTOR_STORAGE_KEY = 'studioflow_crm_audit_actor';

const DEFAULT_AUTOMATION_RULES = {
  novo_lead: 0,
  orcamento_enviado: 3,
  em_negociacao: 2,
  aguardando_retorno: 3,
  leadQuenteParadoDias: 4,
  avisoOrcamentoDias: 5,
  followupAtrasadoAtivo: true,
  tarefaAtrasadaAtiva: true,
};

const readAutomationRules = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(CRM_AUTOMATION_RULES_STORAGE_KEY) || '{}',
    );

    return {
      ...DEFAULT_AUTOMATION_RULES,
      ...(saved && typeof saved === 'object' ? saved : {}),
    };
  } catch {
    return DEFAULT_AUTOMATION_RULES;
  }
};

const readAuditActor = () => (
  localStorage.getItem(CRM_AUDIT_ACTOR_STORAGE_KEY)
  || 'Camilla'
);

const createEmptyDocumentForm = () => ({
  leadId: '',
  titulo: '',
  tipoDocumento: 'Orçamento',
  url: '',
  observacao: '',
});

const getLeadDocuments = (lead = {}) => {
  const historyDocuments = (
    Array.isArray(lead.historico)
      ? lead.historico
      : []
  )
    .filter((item) => item?.tipo === 'documento')
    .map((item) => ({
      id: item.documentoId || item.id,
      titulo: item.titulo || 'Documento',
      tipoDocumento: item.tipoDocumento || 'Outro',
      url: item.url || '',
      observacao: item.observacao || '',
      data: item.data || '',
      usuario: item.usuario || item.responsavel || 'Camilla',
      origem: 'historico',
    }));

  const attachments = (
    Array.isArray(lead.anexos)
      ? lead.anexos
      : []
  ).map((item, index) => ({
    id: item.id || `anexo-${lead.id}-${index}`,
    titulo: item.nome || item.name || item.titulo || `Anexo ${index + 1}`,
    tipoDocumento: item.tipo || item.type || 'Anexo',
    url: item.url || item.link || '',
    observacao: item.observacao || '',
    data: item.data || item.createdAt || '',
    usuario: item.usuario || 'Camilla',
    origem: 'anexo',
  }));

  return [...historyDocuments, ...attachments]
    .sort((first, second) => (
      String(second.data || '').localeCompare(
        String(first.data || ''),
      )
    ));
};

const buildLeadJourney = (lead = {}) => {
  const history = Array.isArray(lead.historico)
    ? lead.historico
    : [];

  const items = history.map((item, index) => ({
    id: item.id || `historico-${index}-${item.data || ''}`,
    date: item.data || lead.updatedAt || lead.createdAt || '',
    title: getHistoryTitle(item),
    description: getHistoryDescription(item),
    category: getHistoryCategory(item),
    actor: item.usuario
      || item.responsavel
      || item.auditoria?.usuario
      || 'Camilla',
    source: item,
  }));

  if (lead.createdAt) {
    items.push({
      id: `journey-created-${lead.id}`,
      date: lead.createdAt,
      title: 'Lead entrou no CRM',
      description: `${lead.tipoServico || 'Serviço'} · ${lead.origem || 'Origem não informada'}`,
      category: 'criacao',
      actor: 'Sistema',
    });
  }

  if (lead.dataOrcamento) {
    items.push({
      id: `journey-budget-${lead.id}-${lead.dataOrcamento}`,
      date: lead.dataOrcamento,
      title: 'Orçamento registrado',
      description: `Valor: ${formatSummaryCurrency(parseCurrency(lead.valorOrcamento))}`,
      category: 'orcamento',
      actor: 'Sistema',
    });
  }

  if (lead.dataEvento) {
    items.push({
      id: `journey-event-${lead.id}-${lead.dataEvento}`,
      date: lead.dataEvento,
      title: 'Data do evento',
      description: `${lead.tipoServico || 'Serviço'} em ${lead.cidade || 'local não informado'}`,
      category: 'evento',
      actor: 'Sistema',
    });
  }

  return items.sort((first, second) => (
    String(second.date || '').localeCompare(
      String(first.date || ''),
    )
  ));
};

const FOLLOWUP_STAGE_RULES = {
  novo: {
    title: 'Primeiro contato',
    delayDays: 0,
    sequenceStep: 1,
    description: 'Lead novo deve receber o primeiro contato no mesmo dia.',
  },
  novo_lead: {
    title: 'Primeiro contato',
    delayDays: 0,
    sequenceStep: 1,
    description: 'Lead novo deve receber o primeiro contato no mesmo dia.',
  },
  contato_iniciado: {
    title: 'Confirmar interesse',
    delayDays: 2,
    sequenceStep: 2,
    description: 'Retome em até 2 dias caso ainda não exista resposta.',
  },
  aguardando_resposta: {
    title: 'Segundo contato',
    delayDays: 3,
    sequenceStep: 2,
    description: 'Faça uma nova tentativa após 3 dias sem resposta.',
  },
  orcamento_enviado: {
    title: 'Follow-up do orçamento',
    delayDays: 3,
    sequenceStep: 2,
    description: 'Confirme se o orçamento foi recebido e tire dúvidas.',
  },
  proposta_enviada: {
    title: 'Follow-up da proposta',
    delayDays: 3,
    sequenceStep: 2,
    description: 'Confirme se a proposta foi analisada.',
  },
  negociacao: {
    title: 'Avançar negociação',
    delayDays: 2,
    sequenceStep: 3,
    description: 'Retome em até 2 dias para conduzir a decisão.',
  },
  em_negociacao: {
    title: 'Avançar negociação',
    delayDays: 2,
    sequenceStep: 3,
    description: 'Retome em até 2 dias para conduzir a decisão.',
  },
  reuniao_agendada: {
    title: 'Confirmar reunião',
    delayDays: 1,
    sequenceStep: 3,
    description: 'Confirme horário, pauta e presença antes da reunião.',
  },
};

const getFollowupStageRule = (lead = {}) => {
  const status = normalizeLeadStatus(lead.status);
  const storedRules = readAutomationRules();
  const baseRule = FOLLOWUP_STAGE_RULES[status]
    || {
      title: 'Manter conversa ativa',
      delayDays: 2,
      sequenceStep: 1,
      description: 'Mantenha um próximo passo definido para este lead.',
    };

  const configuredDelay = Number(storedRules[status]);

  return {
    ...baseRule,
    delayDays: Number.isFinite(configuredDelay)
      ? Math.max(0, configuredDelay)
      : baseRule.delayDays,
  };
};

const getSmartFollowupSuggestion = (lead = {}) => {
  const today = parseDateOnly(new Date());
  const followupDate = parseDateOnly(getLeadFollowupValue(lead));
  const lastContactDate = parseDateOnly(
    lead.dataUltimoContato
    || lead.data_ultimo_contato
    || lead.updatedAt
    || lead.updated_at
    || lead.createdAt
    || lead.created_at,
  );

  const daysWithoutContact = (
    today && lastContactDate
      ? getDaysBetween(lastContactDate, today)
      : 0
  );

  const isOverdue = Boolean(
    followupDate
    && today
    && followupDate.getTime() < today.getTime(),
  );

  const hasNoFollowup = !followupDate;
  const isHot = (lead.temperatura || 'morno') === 'quente';
  const isPriority = ['alta', 'urgente'].includes(
    lead.prioridade || 'media',
  );

  let urgencyScore = 0;

  if (isOverdue) urgencyScore += 50;
  if (hasNoFollowup) urgencyScore += 25;
  if (daysWithoutContact >= 7) urgencyScore += 35;
  else if (daysWithoutContact >= 4) urgencyScore += 20;
  else if (daysWithoutContact >= 2) urgencyScore += 10;
  if (isHot) urgencyScore += 20;
  if (isPriority) urgencyScore += 20;
  urgencyScore += Math.round(
    Number(lead.probabilidadeFechamento ?? 50) / 10,
  );

  const stageRule = getFollowupStageRule(lead);
  const suggestedDate = new Date();

  if (!isOverdue) {
    let delayDays = stageRule.delayDays;

    if (isPriority || isHot || daysWithoutContact >= 7) {
      delayDays = 0;
    } else if (daysWithoutContact >= 4) {
      delayDays = Math.min(delayDays, 1);
    }

    suggestedDate.setDate(
      suggestedDate.getDate() + delayDays,
    );
  }

  const firstName = getLeadFirstName(lead);
  const status = normalizeLeadStatus(lead.status);

  let message = (
    `Olá, ${firstName}! Tudo bem? Passando para dar continuidade à nossa conversa. `
    + 'Ficou alguma dúvida ou existe alguma informação que eu possa atualizar para você?'
  );

  if (status === 'novo') {
    message = (
      `Olá, ${firstName}! Tudo bem? Aqui é a Camilla, da Camilla Vitor Fotografia. `
      + 'Recebi seu contato e gostaria de entender melhor o que vocês estão planejando. '
      + 'Pode me contar sobre a data, o local e o tipo de cobertura que procuram?'
    );
  } else if (
    ['orcamento_enviado', 'proposta_enviada'].includes(status)
  ) {
    message = (
      `Olá, ${firstName}! Passando para saber se você conseguiu analisar o orçamento. `
      + 'Ficou alguma dúvida ou existe algum ponto que gostaria de ajustar?'
    );
  } else if (
    ['negociacao', 'em_negociacao'].includes(status)
    || isHot
  ) {
    message = (
      `Olá, ${firstName}! Tudo bem? Queria retomar nossa conversa e saber como vocês estão `
      + 'se sentindo em relação à proposta. Posso ajudar em algum ponto para avançarmos?'
    );
  } else if (daysWithoutContact >= 7) {
    message = (
      `Olá, ${firstName}! Tudo bem? Nossa conversa ficou em aberto e resolvi passar por aqui. `
      + 'Vocês ainda estão procurando fotografia e filme para esse momento?'
    );
  }

  let reason = stageRule.description;

  if (isOverdue) {
    reason = 'O retorno está atrasado e precisa de atenção.';
  } else if (hasNoFollowup && daysWithoutContact >= 4) {
    reason = `Lead sem retorno agendado e sem contato há ${daysWithoutContact} dias.`;
  } else if (hasNoFollowup) {
    reason = 'Lead ativo sem próximo follow-up agendado.';
  } else if (daysWithoutContact >= 7) {
    reason = `Conversa parada há ${daysWithoutContact} dias.`;
  } else if (isHot || isPriority) {
    reason = 'Lead com alta prioridade comercial.';
  }

  return {
    urgencyScore,
    suggestedDate: formatDateInputValue(suggestedDate),
    message,
    reason,
    daysWithoutContact,
    isOverdue,
    hasNoFollowup,
    ruleTitle: stageRule.title,
    sequenceStep: stageRule.sequenceStep,
    stageDescription: stageRule.description,
  };
};

const buildCommercialSnapshot = (leadData = {}) => ({
  indicacao: leadData.indicacao || '',
  indicacaoClienteId: leadData.indicacaoClienteId || '',
  campanha: leadData.campanha || '',
  dataPrimeiroContato: inputToDate(leadData.dataPrimeiroContato) || null,
  dataUltimoContato: inputToDate(leadData.dataUltimoContato) || null,
  dataProximoFollowup: inputToDate(leadData.dataProximoFollowup) || null,
  motivoPerda: leadData.motivoPerda || '',
  motivoCancelamento: leadData.motivoCancelamento || '',
  prioridade: leadData.prioridade || 'media',
  temperatura: leadData.temperatura || 'morno',
  probabilidadeFechamento: Number(leadData.probabilidadeFechamento ?? 50),
  validadeOrcamentoDias: Math.max(
    1,
    Number(leadData.validadeOrcamentoDias || 30),
  ),
  anexos: Array.isArray(leadData.anexos) ? leadData.anexos : [],
});

const leadPayload = (leadData, now) => ({
  nome: leadData.nome || '',
  email: leadData.email || '',
  tipo_servico: leadData.tipoServico || 'Casamento',
  servico: leadData.tipoServico || 'Casamento',
  data_evento: inputToDate(leadData.dataEvento) || null,
  data_orcamento: inputToDate(leadData.dataOrcamento) || null,
  origem: leadData.origem || 'Instagram',
  indicacao: leadData.indicacao || '',
  indicacao_cliente_id: leadData.indicacaoClienteId || null,
  campanha: leadData.campanha || '',
  data_primeiro_contato: inputToDate(leadData.dataPrimeiroContato) || null,
  data_ultimo_contato: inputToDate(leadData.dataUltimoContato) || null,
  data_proximo_followup: inputToDate(leadData.dataProximoFollowup) || null,
  motivo_perda: leadData.motivoPerda || '',
  motivo_cancelamento: leadData.motivoCancelamento || '',
  prioridade: leadData.prioridade || 'media',
  temperatura: leadData.temperatura || 'morno',
  probabilidade_fechamento: Number(leadData.probabilidadeFechamento ?? 50),
  anexos: Array.isArray(leadData.anexos) ? leadData.anexos : [],
  telefone: leadData.telefone || '',
  whatsapp: leadData.whatsapp || leadData.telefone || '',
  cidade: leadData.cidade || '',
  observacoes: leadData.observacoes || '',
  status: normalizeLeadStatus(leadData.status),
  valor_orcamento: parseCurrency(leadData.valorOrcamento),
  updated_at: now,
});

const saveLeadToDb = async ({ id, payload }) => {
  return saveLeadRow({ id, payload });
};

const readLocalLeads = () => (
  readStorage(STORAGE_KEYS.leads, [])
    .map(mapLeadFromDb)
    .map(enrichLeadBudgetFields)
);

const saveLeadLocal = ({ id, payload }) => {
  const leads = readLocalLeads();
  const now = payload.updated_at || new Date().toISOString();

  const nextLead = mapLeadFromDb({
    id: id || createId('lead'),
    ...payload,
    created_at: payload.created_at || now,
    updated_at: now,
  });

  const nextLeads = id
    ? leads.map((lead) => (
      lead.id === id ? nextLead : lead
    ))
    : [nextLead, ...leads];

  writeStorage(STORAGE_KEYS.leads, nextLeads);

  return nextLead;
};

const formatDisplayDate = (value) => {
  if (!value) return 'Nao informado';

  const normalizedValue = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    const [year, month, day] = normalizedValue.split('-');

    return `${day}/${month}/${year}`;
  }

  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return normalizedValue;
  }

  return date.toLocaleDateString('pt-BR');
};

const formatDisplayDateTime = (value) => {
  if (!value) return 'Data nao informada';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString('pt-BR');
};

const getHistoryTitle = (item = {}) => {
  if (item.tipo === 'contato') {
    return item.tipoContato
      ? `Contato por ${item.tipoContato}`
      : 'Contato registrado';
  }

  return item.acao || 'Atualizacao registrada';
};

const getHistoryDescription = (item = {}) => {
  if (item.tipo === 'contato') {
    return item.descricao || '';
  }

  if (item.tipo === 'alteracao_status' && item.motivo) {
    return item.motivo;
  }

  if (
    item.tipo === 'nota_rapida'
    || item.tipo === 'followup_automatico'
  ) {
    return item.descricao || '';
  }

  if (item.tipo === 'tarefa_comercial') {
    const details = [
      item.titulo,
      item.responsavel
        ? `Responsável: ${item.responsavel}`
        : '',
      item.prazo
        ? `Prazo: ${formatDisplayDate(item.prazo)}`
        : '',
    ].filter(Boolean);

    return details.join(' · ');
  }

  return item.descricao || '';
};

const createEmptyHistoryFilters = () => ({
  search: '',
  type: '',
  period: 'todos',
});

const getHistoryCategory = (item = {}) => {
  if (item.tipo === 'contato') return 'contato';
  if (item.tipo === 'nota_rapida') return 'nota';
  if (item.tipo === 'tarefa_comercial') return 'tarefa';
  if (item.tipo === 'alteracao_status') return 'status';

  if (
    item.tipo === 'followup_automatico'
    || item.proximoFollowup
  ) {
    return 'followup';
  }

  return 'outro';
};

const isHistoryItemInsidePeriod = (item = {}, period = 'todos') => {
  if (period === 'todos') return true;

  const itemDate = new Date(item.data);

  if (Number.isNaN(itemDate.getTime())) return false;

  const now = new Date();
  const limitDate = new Date(now);

  if (period === '7_dias') {
    limitDate.setDate(limitDate.getDate() - 7);
  } else if (period === '30_dias') {
    limitDate.setDate(limitDate.getDate() - 30);
  } else if (period === '90_dias') {
    limitDate.setDate(limitDate.getDate() - 90);
  } else {
    return true;
  }

  return itemDate.getTime() >= limitDate.getTime();
};

const getHistorySearchContent = (item = {}) => (
  [
    getHistoryTitle(item),
    getHistoryDescription(item),
    item.acao,
    item.tipoContato,
    item.resultado,
    item.motivo,
    item.titulo,
    item.responsavel,
    item.statusAnterior,
    item.novoStatus,
  ]
    .filter(Boolean)
    .join(' ')
);


const formatSummaryCurrency = (value) => (
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
);

const getBudgetValidityFromLead = (lead = {}) => {
  const history = Array.isArray(lead.historico)
    ? lead.historico
    : [];

  const latestConfig = history
    .filter((item) => (
      item?.orcamentoValidade
      || item?.tipo === 'renovacao_orcamento'
    ))
    .slice()
    .sort((first, second) => (
      String(second.data || '').localeCompare(
        String(first.data || ''),
      )
    ))[0];

  const sentDate = (
    latestConfig?.orcamentoValidade?.dataEnvio
    || latestConfig?.dataEnvioOrcamento
    || lead.dataOrcamento
    || lead.data_orcamento
    || ''
  );

  const validityDays = Math.max(
    1,
    Number(
      latestConfig?.orcamentoValidade?.validadeDias
      ?? latestConfig?.validadeOrcamentoDias
      ?? lead.validadeOrcamentoDias
      ?? 30,
    ),
  );

  const sent = parseDateOnly(sentDate);
  let expirationDate = null;

  if (sent) {
    expirationDate = new Date(sent);
    expirationDate.setDate(
      expirationDate.getDate() + validityDays,
    );
  }

  return {
    sentDate,
    validityDays,
    expirationDate,
    expirationValue: expirationDate
      ? formatDateInputValue(expirationDate)
      : '',
  };
};

const enrichLeadBudgetFields = (lead = {}) => {
  const budget = getBudgetValidityFromLead(lead);

  return {
    ...lead,
    validadeOrcamentoDias: budget.validityDays,
    dataVencimentoOrcamento: budget.expirationValue,
  };
};

const getBudgetStatus = (lead = {}) => {
  const budget = getBudgetValidityFromLead(lead);
  const today = parseDateOnly(new Date());
  const expiration = parseDateOnly(budget.expirationDate);

  if (!today || !expiration) {
    return {
      key: 'sem_data',
      label: 'Sem vencimento calculado',
      daysRemaining: null,
      ...budget,
    };
  }

  const difference = Math.ceil(
    (expiration.getTime() - today.getTime())
    / (1000 * 60 * 60 * 24),
  );

  if (difference < 0) {
    return {
      key: 'vencido',
      label: `Vencido há ${Math.abs(difference)} dia(s)`,
      daysRemaining: difference,
      ...budget,
    };
  }

  if (difference <= 5) {
    return {
      key: 'vencendo',
      label: difference === 0
        ? 'Vence hoje'
        : `Vence em ${difference} dia(s)`,
      daysRemaining: difference,
      ...budget,
    };
  }

  return {
    key: 'valido',
    label: `Válido por mais ${difference} dia(s)`,
    daysRemaining: difference,
    ...budget,
  };
};

const getStudioFlowLeadScore = (lead = {}) => {
  const probability = Math.max(
    0,
    Math.min(
      100,
      Number(lead.probabilidadeFechamento ?? 50),
    ),
  );

  const temperaturePoints = {
    frio: 4,
    morno: 12,
    quente: 22,
  }[lead.temperatura || 'morno'] || 12;

  const priorityPoints = {
    baixa: 2,
    media: 8,
    alta: 15,
    urgente: 20,
  }[lead.prioridade || 'media'] || 8;

  const followupCategory = getFollowupCategory(lead);
  const followupPoints = {
    atrasado: -18,
    hoje: 8,
    proximos: 12,
    sem_followup: -10,
  }[followupCategory] || 0;

  const suggestion = getSmartFollowupSuggestion(lead);
  const activityPoints = suggestion.daysWithoutContact >= 14
    ? -20
    : suggestion.daysWithoutContact >= 7
      ? -12
      : suggestion.daysWithoutContact >= 3
        ? -4
        : 8;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (probability * 0.55)
        + temperaturePoints
        + priorityPoints
        + followupPoints
        + activityPoints,
      ),
    ),
  );
};

const normalizeAssistantQuestion = (value = '') => (
  normalizeSearchText(value)
    .replace(/[?!.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const buildStudioFlowAssistantData = (
  leads = [],
  automationRules = DEFAULT_AUTOMATION_RULES,
) => {
  const activeLeads = leads.filter((lead) => (
    !['aprovado', 'perdido', 'cancelado'].includes(lead.status)
  ));

  const scoredLeads = activeLeads
    .map((lead) => ({
      lead,
      score: getStudioFlowLeadScore(lead),
      suggestion: getSmartFollowupSuggestion(lead),
      budget: getBudgetStatus(lead),
    }))
    .sort((first, second) => (
      second.score - first.score
    ));

  const followupsOverdue = activeLeads.filter(
    (lead) => getFollowupCategory(lead) === 'atrasado',
  );

  const followupsToday = activeLeads.filter(
    (lead) => getFollowupCategory(lead) === 'hoje',
  );

  const withoutFollowup = activeLeads.filter(
    (lead) => getFollowupCategory(lead) === 'sem_followup',
  );

  const hotStalled = scoredLeads.filter(({ lead, suggestion }) => (
    (lead.temperatura || 'morno') === 'quente'
    && suggestion.daysWithoutContact >= Number(
        automationRules.leadQuenteParadoDias || 4,
      )
  ));

  const budgetsExpiring = scoredLeads.filter(({ budget }) => (
    budget.key === 'vencendo'
  ));

  const budgetsExpired = scoredLeads.filter(({ budget }) => (
    budget.key === 'vencido'
  ));

  const pendingTasks = leads
    .flatMap((lead) => getLeadTasks(lead))
    .filter((task) => !task.concluida);

  const overdueTasks = pendingTasks.filter(
    (task) => getTaskCategory(task) === 'atrasada',
  );

  const todayTasks = pendingTasks.filter(
    (task) => getTaskCategory(task) === 'hoje',
  );

  const approvedLeads = leads.filter(
    (lead) => lead.status === 'aprovado',
  );

  const closedRevenue = approvedLeads.reduce(
    (total, lead) => (
      total + parseCurrency(lead.valorOrcamento)
    ),
    0,
  );

  const weightedPipeline = activeLeads.reduce(
    (total, lead) => (
      total
      + (
        parseCurrency(lead.valorOrcamento)
        * Math.max(
          0,
          Math.min(
            100,
            Number(lead.probabilidadeFechamento ?? 50),
          ),
        )
        / 100
      )
    ),
    0,
  );

  const attentionItems = [
    ...followupsOverdue.map((lead) => ({
      id: `assistant-followup-${lead.id}`,
      lead,
      type: 'followup',
      title: 'Follow-up atrasado',
      description: `${lead.nome || 'Lead sem nome'} precisa de retorno.`,
      severity: 100,
    })),
    ...overdueTasks.map((task) => ({
      id: `assistant-task-${task.id}`,
      lead: task.lead,
      task,
      type: 'task',
      title: 'Tarefa atrasada',
      description: task.titulo,
      severity: 95,
    })),
    ...budgetsExpired.map(({ lead, budget }) => ({
      id: `assistant-budget-${lead.id}`,
      lead,
      type: 'budget',
      title: 'Orçamento vencido',
      description: `${lead.nome || 'Lead sem nome'}: ${budget.label}.`,
      severity: 90,
    })),
    ...hotStalled.map(({ lead, suggestion }) => ({
      id: `assistant-hot-${lead.id}`,
      lead,
      type: 'hot',
      title: 'Lead quente parado',
      description: `${lead.nome || 'Lead sem nome'} está há ${suggestion.daysWithoutContact} dias sem contato.`,
      severity: 85,
    })),
    ...budgetsExpiring.map(({ lead, budget }) => ({
      id: `assistant-expiring-${lead.id}`,
      lead,
      type: 'budget',
      title: 'Orçamento vencendo',
      description: `${lead.nome || 'Lead sem nome'}: ${budget.label}.`,
      severity: 80,
    })),
    ...followupsToday.map((lead) => ({
      id: `assistant-today-${lead.id}`,
      lead,
      type: 'followup',
      title: 'Follow-up para hoje',
      description: `${lead.nome || 'Lead sem nome'} tem retorno agendado.`,
      severity: 75,
    })),
    ...todayTasks.map((task) => ({
      id: `assistant-task-today-${task.id}`,
      lead: task.lead,
      task,
      type: 'task',
      title: 'Tarefa para hoje',
      description: task.titulo,
      severity: 70,
    })),
  ]
    .sort((first, second) => second.severity - first.severity)
    .slice(0, 10);

  return {
    activeLeads,
    scoredLeads,
    followupsOverdue,
    followupsToday,
    withoutFollowup,
    hotStalled,
    budgetsExpiring,
    budgetsExpired,
    pendingTasks,
    overdueTasks,
    todayTasks,
    approvedLeads,
    closedRevenue,
    weightedPipeline,
    attentionItems,
  };
};

const buildAssistantLeadList = (
  items = [],
  emptyText = 'Nenhum lead encontrado.',
) => {
  if (!items.length) return emptyText;

  return items
    .slice(0, 6)
    .map((item, index) => {
      const lead = item.lead || item;
      const extra = item.score !== undefined
        ? ` — score ${item.score}/100`
        : '';

      return `${index + 1}. ${lead.nome || 'Lead sem nome'}${extra}`;
    })
    .join('\n');
};

const answerStudioFlowQuestion = ({
  question,
  data,
}) => {
  const normalized = normalizeAssistantQuestion(question);

  if (!normalized) {
    return 'Digite uma pergunta sobre leads, follow-ups, orçamentos, tarefas ou previsão de vendas.';
  }

  if (
    normalized.includes('quem devo responder')
    || normalized.includes('quem responder hoje')
    || normalized.includes('precisa da minha atencao')
    || normalized.includes('prioridade hoje')
  ) {
    if (!data.attentionItems.length) {
      return 'Não há nenhuma ação comercial crítica registrada para hoje.';
    }

    return [
      `Existem ${data.attentionItems.length} ações prioritárias:`,
      '',
      ...data.attentionItems.slice(0, 6).map(
        (item, index) => (
          `${index + 1}. ${item.title}: ${item.description}`
        ),
      ),
    ].join('\n');
  }

  if (
    normalized.includes('maior chance')
    || normalized.includes('mais chance de fechar')
    || normalized.includes('melhores leads')
  ) {
    return [
      'Leads com maior chance de fechamento:',
      '',
      buildAssistantLeadList(data.scoredLeads),
    ].join('\n');
  }

  if (
    normalized.includes('followup atrasado')
    || normalized.includes('follow ups atrasados')
    || normalized.includes('retornos atrasados')
  ) {
    return [
      `${data.followupsOverdue.length} follow-up(s) atrasado(s):`,
      '',
      buildAssistantLeadList(data.followupsOverdue),
    ].join('\n');
  }

  if (
    normalized.includes('sem followup')
    || normalized.includes('sem proximo passo')
  ) {
    return [
      `${data.withoutFollowup.length} lead(s) sem próximo passo:`,
      '',
      buildAssistantLeadList(data.withoutFollowup),
    ].join('\n');
  }

  if (
    normalized.includes('orcamento')
    && (
      normalized.includes('vencer')
      || normalized.includes('vencendo')
      || normalized.includes('vencido')
    )
  ) {
    const expiringText = buildAssistantLeadList(
      data.budgetsExpiring,
      'Nenhum orçamento vencendo nos próximos dias.',
    );

    const expiredText = buildAssistantLeadList(
      data.budgetsExpired,
      'Nenhum orçamento vencido.',
    );

    return [
      'Orçamentos vencendo:',
      expiringText,
      '',
      'Orçamentos vencidos:',
      expiredText,
    ].join('\n');
  }

  if (
    normalized.includes('lead quente')
    || normalized.includes('leads quentes')
    || normalized.includes('esfriando')
  ) {
    return [
      `${data.hotStalled.length} lead(s) quente(s) exigem atenção:`,
      '',
      buildAssistantLeadList(data.hotStalled),
    ].join('\n');
  }

  if (
    normalized.includes('quanto vou faturar')
    || normalized.includes('previsao de faturamento')
    || normalized.includes('receita prevista')
    || normalized.includes('faturamento previsto')
  ) {
    return [
      `Receita já fechada: ${formatSummaryCurrency(data.closedRevenue)}`,
      `Pipeline ponderado: ${formatSummaryCurrency(data.weightedPipeline)}`,
      `Projeção total: ${formatSummaryCurrency(
        data.closedRevenue + data.weightedPipeline,
      )}`,
    ].join('\n');
  }

  if (
    normalized.includes('tarefas atrasadas')
    || normalized.includes('tarefas para hoje')
    || normalized.includes('minhas tarefas')
  ) {
    return [
      `Tarefas atrasadas: ${data.overdueTasks.length}`,
      `Tarefas para hoje: ${data.todayTasks.length}`,
      `Total pendente: ${data.pendingTasks.length}`,
    ].join('\n');
  }

  if (
    normalized.includes('resumo')
    || normalized.includes('como esta o crm')
    || normalized.includes('situacao comercial')
  ) {
    return [
      'Resumo comercial:',
      '',
      `Leads ativos: ${data.activeLeads.length}`,
      `Follow-ups atrasados: ${data.followupsOverdue.length}`,
      `Follow-ups para hoje: ${data.followupsToday.length}`,
      `Sem próximo passo: ${data.withoutFollowup.length}`,
      `Orçamentos vencidos: ${data.budgetsExpired.length}`,
      `Orçamentos vencendo: ${data.budgetsExpiring.length}`,
      `Tarefas atrasadas: ${data.overdueTasks.length}`,
      `Receita fechada: ${formatSummaryCurrency(data.closedRevenue)}`,
      `Pipeline ponderado: ${formatSummaryCurrency(data.weightedPipeline)}`,
    ].join('\n');
  }

  return [
    'Ainda não reconheci essa pergunta.',
    '',
    'Tente perguntar:',
    '• Quem devo responder hoje?',
    '• Quais leads têm maior chance de fechar?',
    '• Quais orçamentos estão vencendo?',
    '• Quanto vou faturar?',
    '• Quais tarefas estão atrasadas?',
  ].join('\n');
};

const CRM_NOTIFICATIONS_STORAGE_KEY = 'studioflow_crm_notifications_read';

const readNotificationState = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(CRM_NOTIFICATIONS_STORAGE_KEY) || '{}',
    );

    return saved && typeof saved === 'object'
      ? saved
      : {};
  } catch {
    return {};
  }
};

const getNotificationSeverityWeight = (severity = 'info') => ({
  critical: 4,
  warning: 3,
  attention: 2,
  info: 1,
}[severity] || 1);

const buildCrmNotifications = (
  leads = [],
  automationRules = DEFAULT_AUTOMATION_RULES,
) => {
  const notifications = [];

  leads.forEach((lead) => {
    const active = ![
      'aprovado',
      'evento_realizado',
      'finalizado',
      'perdido',
      'cancelado',
    ].includes(lead.status);

    const followupCategory = getFollowupCategory(lead);
    const suggestion = getSmartFollowupSuggestion(lead);
    const budget = getBudgetStatus(lead);

    if (
      active
      && automationRules.followupAtrasadoAtivo
      && followupCategory === 'atrasado'
    ) {
      notifications.push({
        id: `followup-atrasado-${lead.id}-${getLeadFollowupValue(lead)}`,
        lead,
        type: 'followup',
        severity: 'critical',
        title: 'Follow-up atrasado',
        description: `${lead.nome || 'Lead sem nome'} precisa de retorno comercial.`,
        date: getLeadFollowupValue(lead),
        actionLabel: 'Abrir lead',
      });
    }

    if (active && followupCategory === 'hoje') {
      notifications.push({
        id: `followup-hoje-${lead.id}-${getLeadFollowupValue(lead)}`,
        lead,
        type: 'followup',
        severity: 'attention',
        title: 'Follow-up para hoje',
        description: `${lead.nome || 'Lead sem nome'} tem retorno agendado para hoje.`,
        date: getLeadFollowupValue(lead),
        actionLabel: 'Abrir lead',
      });
    }

    if (
      active
      && (lead.temperatura || 'morno') === 'quente'
      && suggestion.daysWithoutContact >= 4
    ) {
      notifications.push({
        id: `lead-quente-parado-${lead.id}-${suggestion.daysWithoutContact}`,
        lead,
        type: 'hot',
        severity: suggestion.daysWithoutContact >= 7
          ? 'critical'
          : 'warning',
        title: 'Lead quente parado',
        description: `${lead.nome || 'Lead sem nome'} está há ${suggestion.daysWithoutContact} dias sem contato.`,
        date: lead.dataUltimoContato || lead.updatedAt || '',
        actionLabel: 'Retomar contato',
      });
    }

    if (budget.key === 'vencido') {
      notifications.push({
        id: `orcamento-vencido-${lead.id}-${budget.expirationValue}`,
        lead,
        type: 'budget',
        severity: 'critical',
        title: 'Orçamento vencido',
        description: `${lead.nome || 'Lead sem nome'}: ${budget.label}.`,
        date: budget.expirationValue,
        actionLabel: 'Renovar orçamento',
      });
    }

    if (
      budget.key === 'vencendo'
      && budget.daysRemaining <= Number(
        automationRules.avisoOrcamentoDias || 5,
      )
    ) {
      notifications.push({
        id: `orcamento-vencendo-${lead.id}-${budget.expirationValue}`,
        lead,
        type: 'budget',
        severity: 'warning',
        title: 'Orçamento próximo do vencimento',
        description: `${lead.nome || 'Lead sem nome'}: ${budget.label}.`,
        date: budget.expirationValue,
        actionLabel: 'Ver orçamento',
      });
    }

    getLeadTasks(lead)
      .filter((task) => !task.concluida)
      .forEach((task) => {
        const category = getTaskCategory(task);

        if (!['atrasada', 'hoje'].includes(category)) return;

        if (
          category === 'atrasada'
          && !automationRules.tarefaAtrasadaAtiva
        ) {
          return;
        }

        notifications.push({
          id: `tarefa-${category}-${lead.id}-${task.id}`,
          lead,
          task,
          type: 'task',
          severity: category === 'atrasada'
            ? 'critical'
            : 'attention',
          title: category === 'atrasada'
            ? 'Tarefa atrasada'
            : 'Tarefa para hoje',
          description: `${task.titulo} · ${lead.nome || 'Lead sem nome'}`,
          date: task.prazo,
          actionLabel: category === 'atrasada'
            ? 'Concluir tarefa'
            : 'Abrir tarefa',
        });
      });
  });

  return notifications.sort((first, second) => {
    const severityDifference = (
      getNotificationSeverityWeight(second.severity)
      - getNotificationSeverityWeight(first.severity)
    );

    if (severityDifference !== 0) return severityDifference;

    const firstDate = parseDateOnly(first.date);
    const secondDate = parseDateOnly(second.date);

    if (!firstDate && !secondDate) return 0;
    if (!firstDate) return 1;
    if (!secondDate) return -1;

    return firstDate.getTime() - secondDate.getTime();
  });
};

const getRecoveryMessage = (lead = {}) => {
  const firstName = getLeadFirstName(lead);
  const service = lead.tipoServico || 'esse momento';

  if (lead.status === 'cancelado') {
    return (
      `Olá, ${firstName}! Tudo bem? Lembrei da nossa conversa sobre ${service} `
      + 'e quis saber se os planos de vocês mudaram ou se existe algo em que eu possa ajudar agora.'
    );
  }

  if (lead.status === 'perdido') {
    return (
      `Olá, ${firstName}! Tudo bem? Nossa conversa sobre ${service} ficou em aberto `
      + 'e resolvi passar por aqui. Vocês já definiram essa parte ou ainda posso ajudar com alguma informação?'
    );
  }

  return (
    `Olá, ${firstName}! Tudo bem? Faz algum tempo desde nossa última conversa sobre ${service}. `
    + 'Queria saber se vocês ainda estão organizando esse momento e se posso ajudar em algum ponto.'
  );
};

const getRecoveryOpportunity = (lead = {}) => {
  const today = parseDateOnly(new Date());
  const lastContactDate = parseDateOnly(
    lead.dataUltimoContato
    || lead.data_ultimo_contato
    || lead.updatedAt
    || lead.updated_at
    || lead.createdAt
    || lead.created_at,
  );

  const daysWithoutContact = (
    today && lastContactDate
      ? getDaysBetween(lastContactDate, today)
      : 0
  );

  const isClosed = ['perdido', 'cancelado'].includes(lead.status);
  const isStalled = (
    !['aprovado', 'perdido', 'cancelado'].includes(lead.status)
    && daysWithoutContact >= 14
  );

  if (!isClosed && !isStalled) return null;

  const probability = Math.max(
    0,
    Math.min(
      100,
      Number(lead.probabilidadeFechamento ?? 50),
    ),
  );

  const temperatureWeight = {
    frio: 0,
    morno: 12,
    quente: 25,
  }[lead.temperatura || 'morno'] || 0;

  const priorityWeight = {
    baixa: 0,
    media: 8,
    alta: 18,
    urgente: 25,
  }[lead.prioridade || 'media'] || 0;

  const value = parseCurrency(lead.valorOrcamento);
  const valueWeight = Math.min(20, Math.round(value / 1000));
  const recencyWeight = daysWithoutContact <= 30
    ? 20
    : daysWithoutContact <= 90
      ? 12
      : 5;

  const recoveryScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (probability * 0.45)
        + temperatureWeight
        + priorityWeight
        + valueWeight
        + recencyWeight,
      ),
    ),
  );

  const reason = lead.status === 'perdido'
    ? lead.motivoPerda || lead.motivo_perda || 'Motivo não informado'
    : lead.status === 'cancelado'
      ? lead.motivoCancelamento
        || lead.motivo_cancelamento
        || 'Motivo não informado'
      : `Sem contato há ${daysWithoutContact} dias`;

  return {
    lead,
    isClosed,
    isStalled,
    daysWithoutContact,
    recoveryScore,
    reason,
    value,
    message: getRecoveryMessage(lead),
  };
};

const getLeadAutomaticSummary = (lead = {}) => {
  const history = Array.isArray(lead.historico)
    ? lead.historico
    : [];

  const contacts = history.filter(
    (item) => item?.tipo === 'contato',
  );

  const notes = history
    .filter((item) => item?.tipo === 'nota_rapida')
    .slice()
    .sort((first, second) => (
      String(second.data || '').localeCompare(
        String(first.data || ''),
      )
    ));

  const pendingTasks = getLeadTasks(lead).filter(
    (task) => !task.concluida,
  );

  const overdueTasks = pendingTasks.filter(
    (task) => getTaskCategory(task) === 'atrasada',
  );

  const todayTasks = pendingTasks.filter(
    (task) => getTaskCategory(task) === 'hoje',
  );

  const lastContactDate = parseDateOnly(
    lead.dataUltimoContato
    || lead.data_ultimo_contato,
  );

  const today = parseDateOnly(new Date());

  const daysWithoutContact = (
    lastContactDate && today
      ? getDaysBetween(lastContactDate, today)
      : null
  );

  const followupCategory = getFollowupCategory(lead);
  const suggestion = getSmartFollowupSuggestion(lead);
  const probability = Math.max(
    0,
    Math.min(
      100,
      Number(lead.probabilidadeFechamento ?? 50),
    ),
  );

  const alerts = [];

  if (followupCategory === 'atrasado') {
    alerts.push('Follow-up atrasado');
  }

  if (followupCategory === 'sem_followup') {
    alerts.push('Sem próximo follow-up');
  }

  if (overdueTasks.length > 0) {
    alerts.push(
      `${overdueTasks.length} tarefa(s) atrasada(s)`,
    );
  }

  if (todayTasks.length > 0) {
    alerts.push(
      `${todayTasks.length} tarefa(s) para hoje`,
    );
  }

  if (
    daysWithoutContact !== null
    && daysWithoutContact >= 7
  ) {
    alerts.push(
      `Sem contato há ${daysWithoutContact} dias`,
    );
  }

  let commercialReading = (
    'Lead em acompanhamento. Mantenha o próximo passo definido e registre cada interação.'
  );

  if (lead.status === 'aprovado') {
    commercialReading = (
      'Lead aprovado. A etapa comercial foi concluída e o atendimento pode seguir como cliente.'
    );
  } else if (
    ['perdido', 'cancelado'].includes(lead.status)
  ) {
    commercialReading = (
      'Lead encerrado. Consulte o motivo registrado antes de uma possível retomada.'
    );
  } else if (
    (lead.temperatura || 'morno') === 'quente'
    && probability >= 70
  ) {
    commercialReading = (
      'Lead com forte potencial de fechamento. Priorize contato pessoal e conduza para uma decisão.'
    );
  } else if (alerts.length > 0) {
    commercialReading = (
      'Lead exige atenção. Resolva os itens pendentes antes que a oportunidade esfrie.'
    );
  } else if (probability >= 60) {
    commercialReading = (
      'Lead bem encaminhado. Mantenha o ritmo e reforce os diferenciais da proposta.'
    );
  }

  return {
    contactsCount: contacts.length,
    pendingTasksCount: pendingTasks.length,
    overdueTasksCount: overdueTasks.length,
    daysWithoutContact,
    latestNote: notes[0] || null,
    nextAction: suggestion.reason,
    suggestedDate: suggestion.suggestedDate,
    alerts,
    commercialReading,
    probability,
    budgetValue: parseCurrency(lead.valorOrcamento),
    followupCategory,
  };
};

export default function CRM() {
  const navigate = useNavigate();

  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [editingLead, setEditingLead] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactForm, setContactForm] = useState(createEmptyContactForm);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [isStatusReasonModalOpen, setIsStatusReasonModalOpen] = useState(false);
  const [statusReasonForm, setStatusReasonForm] = useState(createEmptyStatusReasonForm);
  const [isSavingStatusReason, setIsSavingStatusReason] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState(createEmptyTaskForm);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [isTaskCenterOpen, setIsTaskCenterOpen] = useState(true);
  const [isQuickNoteModalOpen, setIsQuickNoteModalOpen] = useState(false);
  const [quickNoteForm, setQuickNoteForm] = useState(createEmptyQuickNoteForm);
  const [isSavingQuickNote, setIsSavingQuickNote] = useState(false);
  const [historyFilters, setHistoryFilters] = useState(
    createEmptyHistoryFilters,
  );
  const [leadDetailTab, setLeadDetailTab] = useState('visao-geral');
  const [isLeadSummaryExpanded, setIsLeadSummaryExpanded] = useState(false);
  const [isDailyActionsOpen, setIsDailyActionsOpen] = useState(true);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [isAutomationRulesOpen, setIsAutomationRulesOpen] = useState(false);
  const [automationRules, setAutomationRules] = useState(
    readAutomationRules,
  );
  const [auditActor, setAuditActor] = useState(readAuditActor);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [documentForm, setDocumentForm] = useState(createEmptyDocumentForm);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [notificationReadState, setNotificationReadState] = useState(
    readNotificationState,
  );
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState('');
  const [assistantAnswer, setAssistantAnswer] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [isCommercialAgendaOpen, setIsCommercialAgendaOpen] = useState(true);
  const [renewingBudgetLeadId, setRenewingBudgetLeadId] = useState('');
  const [isRecoveryCenterOpen, setIsRecoveryCenterOpen] = useState(true);
  const [reopeningLeadId, setReopeningLeadId] = useState('');
  const [filters, setFilters] = useState(createEmptyFilters);
  const [isFollowupCenterOpen, setIsFollowupCenterOpen] = useState(true);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppLead, setWhatsAppLead] = useState(null);
  const [whatsAppTemplateId, setWhatsAppTemplateId] = useState(
    WHATSAPP_TEMPLATES[0].id,
  );
  const [whatsAppMessage, setWhatsAppMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved');
  const [isLoading, setIsLoading] = useState(true);

  const fetchLeads = async () => {
    try {
      const localLeads = readLocalLeads();

      setLeads(localLeads);

      return localLeads;
    } catch (error) {
      console.error(
        'Erro ao carregar leads locais:',
        error.message,
      );

      setLeads([]);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const load = () => {
      if (!active) return;
      void fetchLeads();
    };

    setTimeout(load, 0);
    window.addEventListener('focus', load);
    window.addEventListener('sf_storage_update', load);
    window.addEventListener('storage', load);

    return () => {
      active = false;
      window.removeEventListener('focus', load);
      window.removeEventListener('sf_storage_update', load);
      window.removeEventListener('storage', load);
    };
  }, []);

  useKeyboardShortcuts({
    n: () => {
      setEditingLead(null);
      setIsModalOpen(true);
    },

    escape: () => {
      setIsModalOpen(false);
      setIsContactModalOpen(false);
      setIsStatusReasonModalOpen(false);
      setIsTaskModalOpen(false);
      setTaskForm(createEmptyTaskForm());
      setIsQuickNoteModalOpen(false);
      setQuickNoteForm(createEmptyQuickNoteForm());
      setHistoryFilters(createEmptyHistoryFilters());
      setIsWhatsAppModalOpen(false);
      setWhatsAppLead(null);
      setIsAssistantOpen(false);
      setAssistantQuestion('');
      setAssistantAnswer('');
      setIsNotificationCenterOpen(false);
      setIsAutomationRulesOpen(false);
      setIsDocumentModalOpen(false);
      setDocumentForm(createEmptyDocumentForm());
      setStatusReasonForm(createEmptyStatusReasonForm());
      setSelectedLead(null);
      setEditingLead(null);
    },
  });

  const handleSaveLead = async (leadData) => {
    const duplicateLead = findDuplicateLead(
      leads,
      leadData,
      leadData.id,
    );

    if (duplicateLead) {
      const duplicatedBy = (
        normalizeLeadPhone(
          leadData.whatsapp || leadData.telefone,
        )
        && normalizeLeadPhone(
          duplicateLead.whatsapp || duplicateLead.telefone,
        ) === normalizeLeadPhone(
          leadData.whatsapp || leadData.telefone,
        )
      )
        ? 'telefone'
        : 'e-mail';

      alert(
        `Já existe um lead com este ${duplicatedBy}: `
        + `${duplicateLead.nome || 'Lead sem nome'}.`,
      );

      return;
    }

    setSaveStatus('saving');

    const now = new Date().toISOString();
    const payload = leadPayload(leadData, now);

    try {
      if (leadData.id) {
        const currentLead = leads.find(
          (lead) => lead.id === leadData.id,
        );

        payload.historico = [
          ...(currentLead?.historico || []),
          {
            data: now,
            tipo: 'atualizacao',
            acao: 'Dados do lead atualizados',
            dadosComerciais: buildCommercialSnapshot(leadData),
            orcamentoValidade: {
              dataEnvio: inputToDate(leadData.dataOrcamento) || null,
              validadeDias: Math.max(
                1,
                Number(leadData.validadeOrcamentoDias || 30),
              ),
            },
          },
        ];

        saveLeadLocal({
          id: leadData.id,
          payload,
        });
      } else {
        payload.historico = [
          {
            data: now,
            tipo: 'criacao',
            acao: 'Lead criado no CRM',
            dadosComerciais: buildCommercialSnapshot(leadData),
            orcamentoValidade: {
              dataEnvio: inputToDate(leadData.dataOrcamento) || null,
              validadeDias: Math.max(
                1,
                Number(leadData.validadeOrcamentoDias || 30),
              ),
            },
          },
        ];

        payload.created_at = now;

        saveLeadLocal({ payload });
      }

      await fetchLeads();
      window.dispatchEvent(new Event('sf_storage_update'));

      setIsModalOpen(false);
      setEditingLead(null);
    } catch (err) {
      console.error(
        'Erro ao salvar lead no Supabase:',
        err.message,
      );

      if (
        !isSupabaseConfigured
        || isMissingRelationError(err, 'leads')
      ) {
        saveLeadLocal({
          id: leadData.id,
          payload,
        });

        await fetchLeads();

        setIsModalOpen(false);
        setEditingLead(null);
      }
    } finally {
      setSaveStatus('saved');
    }
  };

  const handleOpenContactModal = (lead = selectedLead) => {
    if (lead) {
      setSelectedLead(lead);
    }

    setContactForm({
      ...createEmptyContactForm(),
      dataContato: getLocalDateTimeInputValue(),
    });

    setIsContactModalOpen(true);
  };

  const handleCloseContactModal = () => {
    if (isSavingContact) return;

    setIsContactModalOpen(false);
    setContactForm(createEmptyContactForm());
  };

  const handleContactFieldChange = (field, value) => {
    setContactForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleRegisterContact = async (event) => {
    event.preventDefault();

    if (!selectedLead || !contactForm.descricao.trim()) {
      return;
    }

    setIsSavingContact(true);
    setSaveStatus('saving');

    const currentLead = leads.find(
      (lead) => lead.id === selectedLead.id,
    ) || selectedLead;

    const contactDate = contactForm.dataContato
      ? new Date(contactForm.dataContato)
      : new Date();

    const validContactDate = Number.isNaN(contactDate.getTime())
      ? new Date()
      : contactDate;

    const contactIsoDate = validContactDate.toISOString();
    const lastContactDate = contactIsoDate.slice(0, 10);

    const nextFollowupDate = contactForm.proximoFollowup
      ? inputToDate(contactForm.proximoFollowup)
      : null;

    const historyItem = {
      id: createId('contato'),
      data: contactIsoDate,
      tipo: 'contato',
      acao: `Contato registrado por ${contactForm.tipoContato}`,
      tipoContato: contactForm.tipoContato,
      descricao: contactForm.descricao.trim(),
      resultado: contactForm.resultado,
      proximoFollowup: nextFollowupDate,
      dadosComerciais: {
        ...buildCommercialSnapshot(currentLead),
        dataUltimoContato: lastContactDate,
        dataProximoFollowup: nextFollowupDate,
      },
    };

    const nextHistorico = [
      ...(currentLead.historico || []),
      historyItem,
    ];

    const payload = {
      data_ultimo_contato: lastContactDate,
      data_proximo_followup: nextFollowupDate,
      historico: nextHistorico,
      updated_at: new Date().toISOString(),
    };

    const optimisticLead = {
      ...currentLead,
      dataUltimoContato: lastContactDate,
      dataProximoFollowup: nextFollowupDate || '',
      historico: nextHistorico,
      updatedAt: payload.updated_at,
    };

    setLeads((current) => (
      current.map((lead) => (
        lead.id === currentLead.id
          ? optimisticLead
          : lead
      ))
    ));

    setSelectedLead(optimisticLead);

    try {
      saveLeadLocal({
        id: currentLead.id,
        payload: {
          ...currentLead,
          ...payload,
        },
      });

      const updatedLeads = await fetchLeads();
      window.dispatchEvent(new Event('sf_storage_update'));

      const refreshedLead = updatedLeads.find(
        (lead) => lead.id === currentLead.id,
      );

      if (refreshedLead) {
        setSelectedLead(refreshedLead);
      }

      setIsContactModalOpen(false);
      setContactForm(createEmptyContactForm());
    } catch (err) {
      console.error(
        'Erro ao registrar contato do lead:',
        err.message,
      );

      if (
        !isSupabaseConfigured
        || isMissingRelationError(err, 'leads')
      ) {
        const localLead = saveLeadLocal({
          id: currentLead.id,
          payload: {
            ...currentLead,
            ...payload,
          },
        });

        await fetchLeads();

        setSelectedLead(localLead);
        setIsContactModalOpen(false);
        setContactForm(createEmptyContactForm());
      } else {
        setLeads((current) => (
          current.map((lead) => (
            lead.id === currentLead.id
              ? currentLead
              : lead
          ))
        ));

        setSelectedLead(currentLead);
      }
    } finally {
      setIsSavingContact(false);
      setSaveStatus('saved');
    }
  };

  const convertLeadToClient = async (lead) => {
    const alreadyConverted = (
      lead.convertidoEmCliente
      || lead.convertido_em_cliente
      || lead.clientId
      || lead.clienteId
      || (lead.historico || []).some((item) => (
        item?.tipo === 'conversao'
        || item?.acao === 'Lead convertido em cliente e trabalho'
      ))
    );

    if (alreadyConverted) {
      return true;
    }

    try {
      await convertLeadToClientProject(lead);

      return true;
    } catch (error) {
      console.error(
        'Erro ao converter lead em cliente/projeto:',
        error.message,
      );

      return false;
    }
  };

  const closeStatusReasonModal = () => {
    if (isSavingStatusReason) return;

    setIsStatusReasonModalOpen(false);
    setStatusReasonForm(createEmptyStatusReasonForm());
  };

  const persistStatusUpdate = async ({
    currentLead,
    normalizedStatus,
    reason = '',
  }) => {
    setSaveStatus('saving');

    if (
      normalizedStatus === 'aprovado'
      && normalizeLeadStatus(currentLead.status) !== 'aprovado'
    ) {
      const converted = await convertLeadToClient(currentLead);

      if (!converted) {
        setSaveStatus('saved');
        return false;
      }
    }

    const now = new Date().toISOString();
    const normalizedReason = reason.trim();
    const isLost = normalizedStatus === 'perdido';
    const isCanceled = normalizedStatus === 'cancelado';

    const nextHistorico = [
      ...(currentLead.historico || []),
      {
        data: now,
        tipo: 'alteracao_status',
        acao: `Status alterado para ${getStatusTitle(normalizedStatus)}`,
        statusAnterior: currentLead.status,
        novoStatus: normalizedStatus,
        motivo: normalizedReason,
        dadosComerciais: {
          ...buildCommercialSnapshot(currentLead),
          motivoPerda: isLost
            ? normalizedReason
            : currentLead.motivoPerda || '',
          motivoCancelamento: isCanceled
            ? normalizedReason
            : currentLead.motivoCancelamento || '',
        },
      },
    ];

    const statusPayload = {
      status: normalizedStatus,
      updated_at: now,
      historico: nextHistorico,
      ...(isLost
        ? { motivo_perda: normalizedReason }
        : {}),
      ...(isCanceled
        ? { motivo_cancelamento: normalizedReason }
        : {}),
    };

    const optimisticLead = {
      ...currentLead,
      status: normalizedStatus,
      historico: nextHistorico,
      updatedAt: now,
      ...(isLost
        ? { motivoPerda: normalizedReason }
        : {}),
      ...(isCanceled
        ? { motivoCancelamento: normalizedReason }
        : {}),
    };

    setLeads((current) => (
      current.map((lead) => (
        lead.id === currentLead.id
          ? optimisticLead
          : lead
      ))
    ));

    if (selectedLead?.id === currentLead.id) {
      setSelectedLead(optimisticLead);
    }

    try {
      saveLeadLocal({
        id: currentLead.id,
        payload: {
          ...currentLead,
          ...statusPayload,
        },
      });

      const updatedLeads = await fetchLeads();
      const refreshedLead = updatedLeads.find(
        (lead) => lead.id === currentLead.id,
      );

      if (
        refreshedLead
        && selectedLead?.id === currentLead.id
      ) {
        setSelectedLead(refreshedLead);
      }

      return true;
    } catch (err) {
      console.error(
        'Erro ao atualizar status no Supabase:',
        err.message,
      );

      if (
        !isSupabaseConfigured
        || isMissingRelationError(err, 'leads')
      ) {
        const localLead = saveLeadLocal({
          id: currentLead.id,
          payload: {
            ...currentLead,
            ...statusPayload,
          },
        });

        await fetchLeads();

        if (selectedLead?.id === currentLead.id) {
          setSelectedLead(localLead);
        }

        return true;
      }

      setLeads((current) => (
        current.map((lead) => (
          lead.id === currentLead.id
            ? currentLead
            : lead
        ))
      ));

      if (selectedLead?.id === currentLead.id) {
        setSelectedLead(currentLead);
      }

      return false;
    } finally {
      setSaveStatus('saved');
    }
  };

  const handleUpdateStatus = async (leadId, newStatus) => {
    const currentLead = leads.find(
      (lead) => lead.id === leadId,
    );

    const normalizedStatus = normalizeLeadStatus(newStatus);

    if (
      !currentLead
      || currentLead.status === normalizedStatus
    ) {
      return;
    }

    if (
      normalizedStatus === 'perdido'
      || normalizedStatus === 'cancelado'
    ) {
      setStatusReasonForm({
        leadId,
        status: normalizedStatus,
        motivo: normalizedStatus === 'perdido'
          ? currentLead.motivoPerda || ''
          : currentLead.motivoCancelamento || '',
      });

      setIsStatusReasonModalOpen(true);
      return;
    }

    await persistStatusUpdate({
      currentLead,
      normalizedStatus,
    });
  };

  const handleConfirmStatusReason = async (event) => {
    event.preventDefault();

    const normalizedReason = statusReasonForm.motivo.trim();

    if (!normalizedReason) return;

    const currentLead = leads.find(
      (lead) => lead.id === statusReasonForm.leadId,
    );

    if (!currentLead) {
      closeStatusReasonModal();
      return;
    }

    setIsSavingStatusReason(true);

    try {
      const saved = await persistStatusUpdate({
        currentLead,
        normalizedStatus: statusReasonForm.status,
        reason: normalizedReason,
      });

      if (saved) {
        setIsStatusReasonModalOpen(false);
        setStatusReasonForm(createEmptyStatusReasonForm());
      }
    } finally {
      setIsSavingStatusReason(false);
    }
  };

  const commercialTasks = useMemo(() => (
    leads.flatMap((lead) => getLeadTasks(lead))
  ), [leads]);

  const taskGroups = useMemo(() => {
    const pendingTasks = commercialTasks.filter((task) => !task.concluida);

    const sortTasks = (first, second) => {
      const priorityWeight = {
        urgente: 4,
        alta: 3,
        media: 2,
        baixa: 1,
      };

      const priorityDifference = (
        (priorityWeight[second.prioridade] || 0)
        - (priorityWeight[first.prioridade] || 0)
      );

      if (priorityDifference !== 0) return priorityDifference;

      const firstDate = parseDateOnly(first.prazo);
      const secondDate = parseDateOnly(second.prazo);

      if (!firstDate && !secondDate) {
        return String(first.titulo || '').localeCompare(
          String(second.titulo || ''),
          'pt-BR',
        );
      }

      if (!firstDate) return 1;
      if (!secondDate) return -1;

      return firstDate.getTime() - secondDate.getTime();
    };

    return {
      atrasadas: pendingTasks
        .filter((task) => getTaskCategory(task) === 'atrasada')
        .sort(sortTasks),
      hoje: pendingTasks
        .filter((task) => getTaskCategory(task) === 'hoje')
        .sort(sortTasks),
      proximas: pendingTasks
        .filter((task) => (
          ['proxima', 'sem_prazo'].includes(getTaskCategory(task))
        ))
        .sort(sortTasks),
      concluidas: commercialTasks
        .filter((task) => task.concluida)
        .sort((first, second) => (
          String(second.concluidaEm || '').localeCompare(
            String(first.concluidaEm || ''),
          )
        )),
    };
  }, [commercialTasks]);

  const taskSummary = useMemo(() => ({
    atrasadas: taskGroups.atrasadas.length,
    hoje: taskGroups.hoje.length,
    proximas: taskGroups.proximas.length,
    concluidas: taskGroups.concluidas.length,
    pendentes:
      taskGroups.atrasadas.length
      + taskGroups.hoje.length
      + taskGroups.proximas.length,
  }), [taskGroups]);

  const openTaskModal = (lead = selectedLead) => {
    const fallbackLead = lead || selectedLead || leads[0] || null;

    setTaskForm({
      ...createEmptyTaskForm(),
      leadId: fallbackLead?.id || '',
    });

    setIsTaskModalOpen(true);
  };

  const closeTaskModal = () => {
    if (isSavingTask) return;

    setIsTaskModalOpen(false);
    setTaskForm(createEmptyTaskForm());
  };

  const handleTaskFieldChange = (field, value) => {
    setTaskForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleCreateTask = async (event) => {
    event.preventDefault();

    const title = taskForm.titulo.trim();
    const lead = leads.find((item) => item.id === taskForm.leadId);

    if (!lead || !title) return;

    setIsSavingTask(true);
    setSaveStatus('saving');

    const now = new Date().toISOString();
    const taskId = createId('tarefa');

    const historyItem = {
      id: createId('historico'),
      data: now,
      tipo: 'tarefa_comercial',
      tarefaAcao: 'criada',
      tarefaId: taskId,
      acao: `Tarefa comercial criada: ${title}`,
      titulo: title,
      prazo: taskForm.prazo || '',
      prioridade: taskForm.prioridade || 'media',
      responsavel: taskForm.responsavel.trim() || 'Camilla',
      dadosComerciais: buildCommercialSnapshot(lead),
    };

    const nextHistorico = [
      ...(lead.historico || []),
      historyItem,
    ];

    const payload = {
      historico: nextHistorico,
      updated_at: now,
    };

    const optimisticLead = {
      ...lead,
      historico: nextHistorico,
      updatedAt: now,
    };

    setLeads((current) => current.map((item) => (
      item.id === lead.id ? optimisticLead : item
    )));

    if (selectedLead?.id === lead.id) {
      setSelectedLead(optimisticLead);
    }

    try {
      if (isSupabaseConfigured) {
        await saveLeadRow({
          id: lead.id,
          payload,
        });
      } else {
        saveLeadLocal({
          id: lead.id,
          payload: {
            ...lead,
            ...payload,
          },
        });
      }

      const updatedLeads = await fetchLeads();
      const refreshedLead = updatedLeads.find(
        (item) => item.id === lead.id,
      );

      if (refreshedLead && selectedLead?.id === lead.id) {
        setSelectedLead(refreshedLead);
      }

      setIsTaskModalOpen(false);
      setTaskForm(createEmptyTaskForm());
    } catch (error) {
      console.error(
        'Erro ao criar tarefa comercial:',
        error.message,
      );

      await fetchLeads();
    } finally {
      setIsSavingTask(false);
      setSaveStatus('saved');
    }
  };

  const completeCommercialTask = async (task) => {
    if (!task || task.concluida) return;

    const lead = leads.find((item) => item.id === task.leadId);

    if (!lead) return;

    setSaveStatus('saving');

    const now = new Date().toISOString();

    const historyItem = {
      id: createId('historico'),
      data: now,
      tipo: 'tarefa_comercial',
      tarefaAcao: 'concluida',
      tarefaId: task.id,
      acao: `Tarefa comercial concluída: ${task.titulo}`,
      titulo: task.titulo,
      prazo: task.prazo || '',
      prioridade: task.prioridade || 'media',
      responsavel: task.responsavel || 'Camilla',
      dadosComerciais: buildCommercialSnapshot(lead),
    };

    const nextHistorico = [
      ...(lead.historico || []),
      historyItem,
    ];

    const payload = {
      historico: nextHistorico,
      updated_at: now,
    };

    const optimisticLead = {
      ...lead,
      historico: nextHistorico,
      updatedAt: now,
    };

    setLeads((current) => current.map((item) => (
      item.id === lead.id ? optimisticLead : item
    )));

    if (selectedLead?.id === lead.id) {
      setSelectedLead(optimisticLead);
    }

    try {
      if (isSupabaseConfigured) {
        await saveLeadRow({
          id: lead.id,
          payload,
        });
      } else {
        saveLeadLocal({
          id: lead.id,
          payload: {
            ...lead,
            ...payload,
          },
        });
      }

      const updatedLeads = await fetchLeads();
      const refreshedLead = updatedLeads.find(
        (item) => item.id === lead.id,
      );

      if (refreshedLead && selectedLead?.id === lead.id) {
        setSelectedLead(refreshedLead);
      }
    } catch (error) {
      console.error(
        'Erro ao concluir tarefa comercial:',
        error.message,
      );

      await fetchLeads();
    } finally {
      setSaveStatus('saved');
    }
  };

  const openQuickNoteModal = (lead) => {
    if (!lead) return;

    setQuickNoteForm({
      leadId: lead.id,
      texto: '',
    });
    setIsQuickNoteModalOpen(true);
  };

  const closeQuickNoteModal = () => {
    if (isSavingQuickNote) return;

    setIsQuickNoteModalOpen(false);
    setQuickNoteForm(createEmptyQuickNoteForm());
  };

  const handleSaveQuickNote = async (event) => {
    event.preventDefault();

    const text = quickNoteForm.texto.trim();
    const lead = leads.find(
      (item) => item.id === quickNoteForm.leadId,
    );

    if (!lead || !text) return;

    setIsSavingQuickNote(true);
    setSaveStatus('saving');

    const now = new Date().toISOString();

    const historyItem = {
      id: createId('nota'),
      data: now,
      tipo: 'nota_rapida',
      acao: 'Nota rápida adicionada',
      descricao: text,
      dadosComerciais: buildCommercialSnapshot(lead),
    };

    const nextHistorico = [
      ...(lead.historico || []),
      historyItem,
    ];

    const payload = {
      historico: nextHistorico,
      updated_at: now,
    };

    const optimisticLead = {
      ...lead,
      historico: nextHistorico,
      updatedAt: now,
    };

    setLeads((current) => current.map((item) => (
      item.id === lead.id ? optimisticLead : item
    )));

    if (selectedLead?.id === lead.id) {
      setSelectedLead(optimisticLead);
    }

    try {
      if (isSupabaseConfigured) {
        await saveLeadRow({
          id: lead.id,
          payload,
        });
      } else {
        saveLeadLocal({
          id: lead.id,
          payload: {
            ...lead,
            ...payload,
          },
        });
      }

      const updatedLeads = await fetchLeads();
      const refreshedLead = updatedLeads.find(
        (item) => item.id === lead.id,
      );

      if (refreshedLead && selectedLead?.id === lead.id) {
        setSelectedLead(refreshedLead);
      }

      setIsQuickNoteModalOpen(false);
      setQuickNoteForm(createEmptyQuickNoteForm());
    } catch (error) {
      console.error(
        'Erro ao salvar nota rápida:',
        error.message,
      );

      await fetchLeads();
    } finally {
      setIsSavingQuickNote(false);
      setSaveStatus('saved');
    }
  };

  const campaignOptions = useMemo(() => (
    [...new Set(
      leads
        .map((lead) => String(lead.campanha || '').trim())
        .filter(Boolean),
    )].sort((first, second) => first.localeCompare(second, 'pt-BR'))
  ), [leads]);

  const followupGroups = useMemo(() => {
    const activeLeads = leads.filter((lead) => (
      !['aprovado', 'perdido', 'cancelado'].includes(lead.status)
    ));

    const sortByFollowupDate = (first, second) => {
      const firstDate = parseDateOnly(getLeadFollowupValue(first));
      const secondDate = parseDateOnly(getLeadFollowupValue(second));

      if (!firstDate && !secondDate) {
        return String(first.nome || '').localeCompare(
          String(second.nome || ''),
          'pt-BR',
        );
      }

      if (!firstDate) return 1;
      if (!secondDate) return -1;

      return firstDate.getTime() - secondDate.getTime();
    };

    return {
      atrasado: activeLeads
        .filter((lead) => getFollowupCategory(lead) === 'atrasado')
        .sort(sortByFollowupDate),
      hoje: activeLeads
        .filter((lead) => getFollowupCategory(lead) === 'hoje')
        .sort(sortByFollowupDate),
      proximos: activeLeads
        .filter((lead) => getFollowupCategory(lead) === 'proximos')
        .sort(sortByFollowupDate),
      sem_followup: activeLeads
        .filter((lead) => getFollowupCategory(lead) === 'sem_followup')
        .sort((first, second) => (
          String(first.nome || '').localeCompare(
            String(second.nome || ''),
            'pt-BR',
          )
        )),
    };
  }, [leads]);

  const followupSummary = useMemo(() => ({
    atrasado: followupGroups.atrasado.length,
    hoje: followupGroups.hoje.length,
    proximos: followupGroups.proximos.length,
    semFollowup: followupGroups.sem_followup.length,
    total:
      followupGroups.atrasado.length
      + followupGroups.hoje.length
      + followupGroups.proximos.length
      + followupGroups.sem_followup.length,
  }), [followupGroups]);

  const dailyActions = useMemo(() => {
    const actions = [];

    followupGroups.atrasado.forEach((lead) => {
      actions.push({
        id: `followup-atrasado-${lead.id}`,
        type: 'followup',
        urgency: 100,
        title: 'Follow-up atrasado',
        description: `${lead.nome || 'Lead sem nome'} precisa de retorno.`,
        lead,
        date: getLeadFollowupValue(lead),
        color: '#f87171',
        background: '#1b0d0d',
        border: '#472020',
      });
    });

    followupGroups.hoje.forEach((lead) => {
      actions.push({
        id: `followup-hoje-${lead.id}`,
        type: 'followup',
        urgency: 80,
        title: 'Follow-up para hoje',
        description: `${lead.nome || 'Lead sem nome'} tem retorno agendado.`,
        lead,
        date: getLeadFollowupValue(lead),
        color: '#fbbf24',
        background: '#1c1608',
        border: '#493817',
      });
    });

    taskGroups.atrasadas.forEach((task) => {
      actions.push({
        id: `tarefa-atrasada-${task.id}`,
        type: 'task',
        urgency: 95 + (
          task.prioridade === 'urgente'
            ? 10
            : task.prioridade === 'alta'
              ? 5
              : 0
        ),
        title: 'Tarefa atrasada',
        description: task.titulo,
        lead: task.lead,
        task,
        date: task.prazo,
        color: '#f87171',
        background: '#1b0d0d',
        border: '#472020',
      });
    });

    taskGroups.hoje.forEach((task) => {
      actions.push({
        id: `tarefa-hoje-${task.id}`,
        type: 'task',
        urgency: 75 + (
          task.prioridade === 'urgente'
            ? 10
            : task.prioridade === 'alta'
              ? 5
              : 0
        ),
        title: 'Tarefa para hoje',
        description: task.titulo,
        lead: task.lead,
        task,
        date: task.prazo,
        color: '#60a5fa',
        background: '#0d1520',
        border: '#24334a',
      });
    });

    leads
      .filter((lead) => (
        !['aprovado', 'perdido', 'cancelado'].includes(lead.status)
        && (lead.temperatura || 'morno') === 'quente'
        && getFollowupCategory(lead) === 'sem_followup'
      ))
      .forEach((lead) => {
        actions.push({
          id: `lead-quente-${lead.id}`,
          type: 'hot_lead',
          urgency: 70 + Math.round(
            Number(lead.probabilidadeFechamento ?? 50) / 10,
          ),
          title: 'Lead quente sem ação agendada',
          description: `${lead.nome || 'Lead sem nome'} está sem próximo contato.`,
          lead,
          color: '#fb7185',
          background: '#1f0f15',
          border: '#4a2230',
        });
      });

    return actions
      .sort((first, second) => second.urgency - first.urgency)
      .slice(0, 12);
  }, [
    followupGroups,
    leads,
    taskGroups.atrasadas,
    taskGroups.hoje,
  ]);

  const dailyActionsSummary = useMemo(() => ({
    overdue:
      followupSummary.atrasado
      + taskSummary.atrasadas,
    today:
      followupSummary.hoje
      + taskSummary.hoje,
    hotWithoutAction: leads.filter((lead) => (
      !['aprovado', 'perdido', 'cancelado'].includes(lead.status)
      && (lead.temperatura || 'morno') === 'quente'
      && getFollowupCategory(lead) === 'sem_followup'
    )).length,
    total: dailyActions.length,
  }), [
    dailyActions.length,
    followupSummary.atrasado,
    followupSummary.hoje,
    leads,
    taskSummary.atrasadas,
    taskSummary.hoje,
  ]);

  const smartFollowupSuggestions = useMemo(() => (
    leads
      .filter((lead) => (
        !['aprovado', 'perdido', 'cancelado'].includes(lead.status)
      ))
      .map((lead) => ({
        lead,
        suggestion: getSmartFollowupSuggestion(lead),
      }))
      .filter(({ suggestion }) => (
        suggestion.isOverdue
        || suggestion.hasNoFollowup
      ))
      .sort((first, second) => (
        second.suggestion.urgencyScore
        - first.suggestion.urgencyScore
      ))
      .slice(0, 6)
  ), [leads]);

  const applySuggestedFollowup = async (lead, suggestion) => {
    if (!lead || !suggestion?.suggestedDate) return;

    setSaveStatus('saving');

    const now = new Date().toISOString();
    const nextHistorico = [
      ...(lead.historico || []),
      {
        id: createId('followup'),
        data: now,
        tipo: 'followup_automatico',
        acao: `Follow-up sugerido agendado para ${formatDisplayDate(
          suggestion.suggestedDate,
        )}`,
        descricao: suggestion.reason,
        proximoFollowup: suggestion.suggestedDate,
        dadosComerciais: {
          ...buildCommercialSnapshot(lead),
          dataProximoFollowup: suggestion.suggestedDate,
        },
      },
    ];

    const payload = {
      data_proximo_followup: suggestion.suggestedDate,
      historico: nextHistorico,
      updated_at: now,
    };

    const optimisticLead = {
      ...lead,
      dataProximoFollowup: suggestion.suggestedDate,
      historico: nextHistorico,
      updatedAt: now,
    };

    setLeads((current) => current.map((item) => (
      item.id === lead.id ? optimisticLead : item
    )));

    if (selectedLead?.id === lead.id) {
      setSelectedLead(optimisticLead);
    }

    try {
      if (isSupabaseConfigured) {
        await saveLeadRow({
          id: lead.id,
          payload,
        });
      } else {
        saveLeadLocal({
          id: lead.id,
          payload: {
            ...lead,
            ...payload,
          },
        });
      }

      const updatedLeads = await fetchLeads();
      const refreshedLead = updatedLeads.find(
        (item) => item.id === lead.id,
      );

      if (refreshedLead && selectedLead?.id === lead.id) {
        setSelectedLead(refreshedLead);
      }

      setLeads((current) => current.map((item) => (
        item.id === lead.id
          ? {
              ...item,
              dataProximoFollowup: suggestion.suggestedDate,
            }
          : item
      )));
    } catch (error) {
      console.error(
        'Erro ao agendar follow-up sugerido:',
        error.message,
      );

      await fetchLeads();
    } finally {
      setSaveStatus('saved');
    }
  };

  const openSuggestedWhatsApp = (lead, suggestion) => {
    if (!lead || !suggestion) return;

    setWhatsAppLead(lead);
    setWhatsAppTemplateId('followup');
    setWhatsAppMessage(suggestion.message);
    setIsWhatsAppModalOpen(true);
  };

  const openLeadDetails = (lead) => {
    setHistoryFilters(createEmptyHistoryFilters());
    setLeadDetailTab('visao-geral');
    setIsLeadSummaryExpanded(false);
    setSelectedLead(lead);
  };

  const openLeadContact = (lead) => {
    handleOpenContactModal(lead);
  };

  const openWhatsAppModal = (lead = selectedLead) => {
    if (!lead) return;

    const template = WHATSAPP_TEMPLATES[0];

    setWhatsAppLead(lead);
    setWhatsAppTemplateId(template.id);
    setWhatsAppMessage(
      template.message(getLeadFirstName(lead)),
    );
    setIsWhatsAppModalOpen(true);
  };

  const closeWhatsAppModal = () => {
    setIsWhatsAppModalOpen(false);
    setWhatsAppLead(null);
  };

  const handleWhatsAppTemplateChange = (templateId) => {
    const template = WHATSAPP_TEMPLATES.find(
      (item) => item.id === templateId,
    ) || WHATSAPP_TEMPLATES[0];

    setWhatsAppTemplateId(template.id);
    setWhatsAppMessage(
      template.message(getLeadFirstName(whatsAppLead)),
    );
  };

  const copyWhatsAppMessage = async () => {
    if (!whatsAppMessage.trim()) return;

    try {
      await navigator.clipboard.writeText(whatsAppMessage);
    } catch (error) {
      console.error('Erro ao copiar mensagem:', error);
    }
  };

  const openWhatsAppConversation = () => {
    const number = getWhatsAppNumber(whatsAppLead);
    const message = whatsAppMessage.trim();

    if (!number || !message) return;

    window.open(
      `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const recoveryOpportunities = useMemo(() => (
    leads
      .map((lead) => getRecoveryOpportunity(lead))
      .filter(Boolean)
      .sort((first, second) => (
        second.recoveryScore - first.recoveryScore
        || second.value - first.value
      ))
      .slice(0, 12)
  ), [leads]);

  const recoverySummary = useMemo(() => ({
    total: recoveryOpportunities.length,
    closed: recoveryOpportunities.filter(
      (item) => item.isClosed,
    ).length,
    stalled: recoveryOpportunities.filter(
      (item) => item.isStalled,
    ).length,
    potential: recoveryOpportunities.reduce(
      (total, item) => total + item.value,
      0,
    ),
  }), [recoveryOpportunities]);

  const openRecoveryWhatsApp = (opportunity) => {
    if (!opportunity?.lead) return;

    setWhatsAppLead(opportunity.lead);
    setWhatsAppTemplateId('retomada');
    setWhatsAppMessage(opportunity.message);
    setIsWhatsAppModalOpen(true);
  };

  const reactivateLead = async (opportunity) => {
    const lead = opportunity?.lead;

    if (!lead || !opportunity.isClosed) return;

    setReopeningLeadId(lead.id);
    setSaveStatus('saving');

    const now = new Date().toISOString();
    const nextFollowup = getLocalDateInputValue();

    const nextHistorico = [
      ...(lead.historico || []),
      {
        id: createId('reativacao'),
        data: now,
        tipo: 'reativacao',
        acao: 'Lead reaberto para nova tentativa comercial',
        statusAnterior: lead.status,
        novoStatus: 'novo',
        motivoAnterior: opportunity.reason,
        dataProximoFollowup: nextFollowup,
        dadosComerciais: {
          ...buildCommercialSnapshot(lead),
          dataProximoFollowup: nextFollowup,
        },
      },
    ];

    const payload = {
      status: 'novo',
      data_proximo_followup: nextFollowup,
      historico: nextHistorico,
      updated_at: now,
    };

    const optimisticLead = {
      ...lead,
      status: 'novo',
      dataProximoFollowup: nextFollowup,
      historico: nextHistorico,
      updatedAt: now,
    };

    setLeads((current) => current.map((item) => (
      item.id === lead.id ? optimisticLead : item
    )));

    if (selectedLead?.id === lead.id) {
      setSelectedLead(optimisticLead);
    }

    try {
      if (isSupabaseConfigured) {
        await saveLeadRow({
          id: lead.id,
          payload,
        });
      } else {
        saveLeadLocal({
          id: lead.id,
          payload: {
            ...lead,
            ...payload,
          },
        });
      }

      const updatedLeads = await fetchLeads();
      const refreshedLead = updatedLeads.find(
        (item) => item.id === lead.id,
      );

      if (refreshedLead && selectedLead?.id === lead.id) {
        setSelectedLead(refreshedLead);
      }
    } catch (error) {
      console.error(
        'Erro ao reabrir oportunidade:',
        error.message,
      );

      await fetchLeads();
    } finally {
      setReopeningLeadId('');
      setSaveStatus('saved');
    }
  };

  const renewBudgetValidity = async (lead, days = 30) => {
    if (!lead) return;

    setRenewingBudgetLeadId(lead.id);
    setSaveStatus('saving');

    const now = new Date().toISOString();
    const today = getLocalDateInputValue();
    const validityDays = Math.max(1, Number(days || 30));

    const nextHistorico = [
      ...(lead.historico || []),
      {
        id: createId('renovacao-orcamento'),
        data: now,
        tipo: 'renovacao_orcamento',
        acao: `Validade do orçamento renovada por ${validityDays} dias`,
        dataEnvioOrcamento: today,
        validadeOrcamentoDias: validityDays,
        orcamentoValidade: {
          dataEnvio: today,
          validadeDias: validityDays,
        },
        dadosComerciais: {
          ...buildCommercialSnapshot(lead),
          validadeOrcamentoDias: validityDays,
        },
      },
    ];

    const payload = {
      data_orcamento: today,
      historico: nextHistorico,
      updated_at: now,
    };

    const optimisticLead = enrichLeadBudgetFields({
      ...lead,
      dataOrcamento: today,
      historico: nextHistorico,
      updatedAt: now,
    });

    setLeads((current) => current.map((item) => (
      item.id === lead.id ? optimisticLead : item
    )));

    if (selectedLead?.id === lead.id) {
      setSelectedLead(optimisticLead);
    }

    try {
      if (isSupabaseConfigured) {
        await saveLeadRow({
          id: lead.id,
          payload,
        });
      } else {
        saveLeadLocal({
          id: lead.id,
          payload: {
            ...lead,
            ...payload,
          },
        });
      }

      await fetchLeads();
    } catch (error) {
      console.error(
        'Erro ao renovar validade do orçamento:',
        error.message,
      );

      await fetchLeads();
    } finally {
      setRenewingBudgetLeadId('');
      setSaveStatus('saved');
    }
  };

  const setLeadPriorityFromAssistant = async (
    lead,
    priority = 'alta',
  ) => {
    if (!lead) return;

    setSaveStatus('saving');

    const now = new Date().toISOString();
    const nextHistorico = [
      ...(lead.historico || []),
      {
        id: createId('prioridade-assistente'),
        data: now,
        tipo: 'atualizacao',
        acao: `Prioridade alterada para ${TASK_PRIORITY_LABELS[priority] || priority} pelo sistema de regras comerciais`,
        dadosComerciais: {
          ...buildCommercialSnapshot(lead),
          prioridade: priority,
        },
      },
    ];

    const payload = {
      prioridade: priority,
      historico: nextHistorico,
      updated_at: now,
    };

    const optimisticLead = {
      ...lead,
      prioridade: priority,
      historico: nextHistorico,
      updatedAt: now,
    };

    setLeads((current) => current.map((item) => (
      item.id === lead.id ? optimisticLead : item
    )));

    if (selectedLead?.id === lead.id) {
      setSelectedLead(optimisticLead);
    }

    try {
      if (isSupabaseConfigured) {
        await saveLeadRow({
          id: lead.id,
          payload,
        });
      } else {
        saveLeadLocal({
          id: lead.id,
          payload: {
            ...lead,
            ...payload,
          },
        });
      }

      await fetchLeads();
    } catch (error) {
      console.error(
        'Erro ao alterar prioridade pelo assistente:',
        error.message,
      );

      await fetchLeads();
    } finally {
      setSaveStatus('saved');
    }
  };

  const saveAutomationRules = (event) => {
    event.preventDefault();

    const normalized = {
      ...automationRules,
      novo_lead: Math.max(0, Number(automationRules.novo_lead || 0)),
      orcamento_enviado: Math.max(
        0,
        Number(automationRules.orcamento_enviado || 0),
      ),
      em_negociacao: Math.max(
        0,
        Number(automationRules.em_negociacao || 0),
      ),
      aguardando_retorno: Math.max(
        0,
        Number(automationRules.aguardando_retorno || 0),
      ),
      leadQuenteParadoDias: Math.max(
        1,
        Number(automationRules.leadQuenteParadoDias || 4),
      ),
      avisoOrcamentoDias: Math.max(
        1,
        Number(automationRules.avisoOrcamentoDias || 5),
      ),
    };

    setAutomationRules(normalized);
    localStorage.setItem(
      CRM_AUTOMATION_RULES_STORAGE_KEY,
      JSON.stringify(normalized),
    );

    localStorage.setItem(
      CRM_AUDIT_ACTOR_STORAGE_KEY,
      auditActor.trim() || 'Camilla',
    );

    setAuditActor(auditActor.trim() || 'Camilla');
    setIsAutomationRulesOpen(false);
  };

  const openDocumentModal = (lead = selectedLead) => {
    if (!lead) return;

    setDocumentForm({
      ...createEmptyDocumentForm(),
      leadId: lead.id,
    });
    setIsDocumentModalOpen(true);
  };

  const closeDocumentModal = () => {
    if (isSavingDocument) return;

    setIsDocumentModalOpen(false);
    setDocumentForm(createEmptyDocumentForm());
  };

  const handleSaveDocument = async (event) => {
    event.preventDefault();

    const lead = leads.find(
      (item) => item.id === documentForm.leadId,
    );
    const title = documentForm.titulo.trim();

    if (!lead || !title) return;

    setIsSavingDocument(true);
    setSaveStatus('saving');

    const now = new Date().toISOString();
    const actor = auditActor.trim() || 'Camilla';

    const historyItem = {
      id: createId('documento'),
      documentoId: createId('arquivo'),
      data: now,
      tipo: 'documento',
      acao: `Documento adicionado: ${title}`,
      titulo: title,
      tipoDocumento: documentForm.tipoDocumento || 'Outro',
      url: documentForm.url.trim(),
      observacao: documentForm.observacao.trim(),
      usuario: actor,
      auditoria: {
        usuario: actor,
        acao: 'documento_adicionado',
        data: now,
      },
      dadosComerciais: buildCommercialSnapshot(lead),
    };

    const nextHistorico = [
      ...(lead.historico || []),
      historyItem,
    ];

    const payload = {
      historico: nextHistorico,
      updated_at: now,
    };

    const optimisticLead = {
      ...lead,
      historico: nextHistorico,
      updatedAt: now,
    };

    setLeads((current) => current.map((item) => (
      item.id === lead.id ? optimisticLead : item
    )));

    if (selectedLead?.id === lead.id) {
      setSelectedLead(optimisticLead);
    }

    try {
      if (isSupabaseConfigured) {
        await saveLeadRow({
          id: lead.id,
          payload,
        });
      } else {
        saveLeadLocal({
          id: lead.id,
          payload: {
            ...lead,
            ...payload,
          },
        });
      }

      const refreshed = await fetchLeads();
      const refreshedLead = refreshed.find(
        (item) => item.id === lead.id,
      );

      if (refreshedLead && selectedLead?.id === lead.id) {
        setSelectedLead(refreshedLead);
      }

      setIsDocumentModalOpen(false);
      setDocumentForm(createEmptyDocumentForm());
    } catch (error) {
      console.error(
        'Erro ao salvar documento do lead:',
        error.message,
      );

      await fetchLeads();
    } finally {
      setIsSavingDocument(false);
      setSaveStatus('saved');
    }
  };

  const selectedLeadSummary = useMemo(() => (
    selectedLead
      ? getLeadAutomaticSummary(selectedLead)
      : null
  ), [selectedLead]);

  const selectedLeadTasks = useMemo(() => (
    selectedLead
      ? getLeadTasks(selectedLead)
      : []
  ), [selectedLead]);

  const selectedLeadDocuments = useMemo(() => (
    selectedLead
      ? getLeadDocuments(selectedLead)
      : []
  ), [selectedLead]);

  const selectedLeadJourney = useMemo(() => (
    selectedLead
      ? buildLeadJourney(selectedLead)
      : []
  ), [selectedLead]);

  const selectedLeadAudit = useMemo(() => (
    selectedLeadJourney.filter(
      (item) => item.actor && item.actor !== 'Sistema',
    )
  ), [selectedLeadJourney]);

  const selectedLeadHistory = useMemo(() => {
    const history = Array.isArray(selectedLead?.historico)
      ? selectedLead.historico
      : [];

    const normalizedSearch = normalizeSearchText(
      historyFilters.search,
    );

    return history
      .filter((item) => {
        if (
          historyFilters.type
          && getHistoryCategory(item) !== historyFilters.type
        ) {
          return false;
        }

        if (
          !isHistoryItemInsidePeriod(
            item,
            historyFilters.period,
          )
        ) {
          return false;
        }

        if (
          normalizedSearch
          && !normalizeSearchText(
            getHistorySearchContent(item),
          ).includes(normalizedSearch)
        ) {
          return false;
        }

        return true;
      })
      .slice()
      .sort((first, second) => (
        String(second.data || '').localeCompare(
          String(first.data || ''),
        )
      ));
  }, [historyFilters, selectedLead]);

  const historySummary = useMemo(() => {
    const completeHistory = Array.isArray(selectedLead?.historico)
      ? selectedLead.historico
      : [];

    return {
      total: completeHistory.length,
      visible: selectedLeadHistory.length,
    };
  }, [selectedLead, selectedLeadHistory.length]);

  const handleHistoryFilterChange = (field, value) => {
    setHistoryFilters((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const clearHistoryFilters = () => {
    setHistoryFilters(createEmptyHistoryFilters());
  };

  const filteredLeads = useMemo(() => {
    const normalizedSearch = normalizeSearchText(filters.search);

    return leads.filter((lead) => {
      if (normalizedSearch) {
        const searchableValues = [
          lead.nome,
          lead.nomeCasal,
          lead.telefone,
          lead.whatsapp,
          lead.email,
          lead.cidade,
          lead.indicacao,
          lead.campanha,
        ];

        const matchesSearch = searchableValues.some((value) => (
          normalizeSearchText(value).includes(normalizedSearch)
        ));

        if (!matchesSearch) return false;
      }

      if (
        selectedService
        && lead.tipoServico !== selectedService
      ) {
        return false;
      }

      if (
        filters.service
        && lead.tipoServico !== filters.service
      ) {
        return false;
      }

      if (
        filters.origin
        && lead.origem !== filters.origin
      ) {
        return false;
      }

      if (
        filters.campaign
        && lead.campanha !== filters.campaign
      ) {
        return false;
      }

      if (
        filters.status
        && lead.status !== filters.status
      ) {
        return false;
      }

      if (
        filters.followup
        && getFollowupCategory(lead) !== filters.followup
      ) {
        return false;
      }

      if (
        filters.priority
        && (lead.prioridade || 'media') !== filters.priority
      ) {
        return false;
      }

      if (
        filters.temperature
        && (lead.temperatura || 'morno') !== filters.temperature
      ) {
        return false;
      }

      return true;
    });
  }, [filters, leads, selectedService]);

  const activeFilterCount = useMemo(() => (
    Object.values(filters).filter((value) => String(value).trim()).length
  ), [filters]);

  const handleFilterChange = (field, value) => {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const clearFilters = () => {
    setFilters(createEmptyFilters());
  };

  const leadSummary = useMemo(() => ({
    total: leads.length,
    visible: filteredLeads.length,
  }), [filteredLeads.length, leads.length]);

  const crmNotifications = useMemo(() => (
    buildCrmNotifications(leads, automationRules)
  ), [automationRules, leads]);

  const unreadNotifications = useMemo(() => (
    crmNotifications.filter(
      (notification) => !notificationReadState[notification.id],
    )
  ), [crmNotifications, notificationReadState]);

  const notificationSummary = useMemo(() => ({
    total: crmNotifications.length,
    unread: unreadNotifications.length,
    critical: unreadNotifications.filter(
      (notification) => notification.severity === 'critical',
    ).length,
    warning: unreadNotifications.filter(
      (notification) => notification.severity === 'warning',
    ).length,
    attention: unreadNotifications.filter(
      (notification) => notification.severity === 'attention',
    ).length,
  }), [crmNotifications, unreadNotifications]);

  const saveNotificationReadState = (nextState) => {
    setNotificationReadState(nextState);

    localStorage.setItem(
      CRM_NOTIFICATIONS_STORAGE_KEY,
      JSON.stringify(nextState),
    );
  };

  const markNotificationAsRead = (notificationId) => {
    saveNotificationReadState({
      ...notificationReadState,
      [notificationId]: true,
    });
  };

  const markAllNotificationsAsRead = () => {
    const nextState = {
      ...notificationReadState,
    };

    crmNotifications.forEach((notification) => {
      nextState[notification.id] = true;
    });

    saveNotificationReadState(nextState);
  };

  const handleNotificationAction = async (notification) => {
    if (!notification) return;

    markNotificationAsRead(notification.id);

    if (
      notification.type === 'task'
      && notification.task
      && notification.task.concluida === false
      && getTaskCategory(notification.task) === 'atrasada'
    ) {
      await completeCommercialTask(notification.task);
      return;
    }

    if (
      notification.type === 'budget'
      && notification.lead
      && getBudgetStatus(notification.lead).key === 'vencido'
    ) {
      await renewBudgetValidity(notification.lead, 30);
      return;
    }

    if (notification.lead) {
      setIsNotificationCenterOpen(false);
      openLeadDetails(notification.lead);
    }
  };

  const assistantData = useMemo(() => (
    buildStudioFlowAssistantData(
      filteredLeads,
      automationRules,
    )
  ), [automationRules, filteredLeads]);

  const assistantGreeting = useMemo(() => {
    const totalAttention = assistantData.attentionItems.length;

    if (totalAttention === 0) {
      return (
        'Seu CRM está organizado. Não há nenhuma ação comercial crítica neste momento.'
      );
    }

    return (
      `Existem ${totalAttention} ação(ões) que merecem sua atenção agora.`
    );
  }, [assistantData.attentionItems.length]);

  const askStudioFlowAssistant = (question = assistantQuestion) => {
    const nextQuestion = String(question || '').trim();

    setAssistantQuestion(nextQuestion);
    setAssistantAnswer(
      answerStudioFlowQuestion({
        question: nextQuestion,
        data: assistantData,
      }),
    );
  };

  const serviceViewOptions = useMemo(() => (
    [...new Set(
      leads
        .map((lead) => String(lead.tipoServico || '').trim())
        .filter(Boolean),
    )].sort((first, second) => (
      first.localeCompare(second, 'pt-BR')
    ))
  ), [leads]);

  const commercialAgenda = useMemo(() => {
    const items = [];

    filteredLeads.forEach((lead) => {
      const followupDate = getLeadFollowupValue(lead);

      if (followupDate) {
        items.push({
          id: `followup-${lead.id}-${followupDate}`,
          type: 'followup',
          label: 'Follow-up',
          title: lead.nome || 'Lead sem nome',
          description: 'Retorno comercial agendado',
          date: followupDate,
          lead,
          color: '#a78bfa',
        });
      }

      getLeadTasks(lead)
        .filter((task) => !task.concluida && task.prazo)
        .forEach((task) => {
          items.push({
            id: `task-${lead.id}-${task.id}`,
            type: 'task',
            label: 'Tarefa',
            title: task.titulo,
            description: lead.nome || 'Lead sem nome',
            date: task.prazo,
            lead,
            task,
            color: '#60a5fa',
          });
        });

      const budgetStatus = getBudgetStatus(lead);

      if (budgetStatus.expirationValue) {
        items.push({
          id: `budget-${lead.id}-${budgetStatus.expirationValue}`,
          type: 'budget',
          label: 'Vencimento do orçamento',
          title: lead.nome || 'Lead sem nome',
          description: budgetStatus.label,
          date: budgetStatus.expirationValue,
          lead,
          budgetStatus,
          color: budgetStatus.key === 'vencido'
            ? '#f87171'
            : budgetStatus.key === 'vencendo'
              ? '#fbbf24'
              : '#34d399',
        });
      }

      if (lead.dataEvento) {
        items.push({
          id: `event-${lead.id}-${lead.dataEvento}`,
          type: 'event',
          label: 'Data do evento',
          title: lead.nome || 'Lead sem nome',
          description: lead.tipoServico || 'Serviço',
          date: lead.dataEvento,
          lead,
          color: '#c5a059',
        });
      }

      const history = Array.isArray(lead.historico)
        ? lead.historico
        : [];

      history
        .filter((item) => (
          item?.tipo === 'contato'
          && String(item.resultado || '')
            .toLowerCase()
            .includes('reuniao')
        ))
        .forEach((item) => {
          const meetingDate = item.proximoFollowup || item.data;

          if (!meetingDate) return;

          items.push({
            id: `meeting-${lead.id}-${item.id || item.data}`,
            type: 'meeting',
            label: 'Reunião',
            title: lead.nome || 'Lead sem nome',
            description: item.descricao || 'Reunião comercial',
            date: meetingDate,
            lead,
            color: '#fb7185',
          });
        });
    });

    const today = parseDateOnly(new Date());

    return items
      .map((item) => {
        const itemDate = parseDateOnly(item.date);
        let timing = 'futuro';

        if (itemDate && today) {
          if (itemDate.getTime() < today.getTime()) timing = 'atrasado';
          else if (itemDate.getTime() === today.getTime()) timing = 'hoje';
        }

        return {
          ...item,
          parsedDate: itemDate,
          timing,
        };
      })
      .filter((item) => item.parsedDate)
      .sort((first, second) => (
        first.parsedDate.getTime()
        - second.parsedDate.getTime()
      ))
      .slice(0, 40);
  }, [filteredLeads]);

  const commercialAgendaSummary = useMemo(() => ({
    atrasados: commercialAgenda.filter(
      (item) => item.timing === 'atrasado',
    ).length,
    hoje: commercialAgenda.filter(
      (item) => item.timing === 'hoje',
    ).length,
    futuros: commercialAgenda.filter(
      (item) => item.timing === 'futuro',
    ).length,
    total: commercialAgenda.length,
  }), [commercialAgenda]);

  const formInputStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #333',
    background: '#111',
    color: '#fff',
    boxSizing: 'border-box',
    minWidth: 0,
  };

  const formLabelStyle = {
    color: '#888',
    fontSize: '0.78rem',
    marginBottom: '6px',
    display: 'block',
    fontWeight: 600,
  };

  return (
    <div
      className="crm-responsive-page"
      style={{
        width: '100%',
        minHeight: '100vh',
        backgroundColor: '#050505',
        color: '#fff',
        padding: 'clamp(12px, 2.5vw, 24px)',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="crm-responsive-inner"
        style={{
          maxWidth: '1600px',
          margin: '0 auto',
        }}
      >
        <header
          className="crm-responsive-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '18px',
            marginBottom: '32px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '24px',
                margin: 0,
              }}
            >
              CRM - Pipeline Comercial{' '}
              <AutoSaveIndicator state={saveStatus} />
            </h1>

            <p
              style={{
                color: '#888',
                marginTop: '6px',
              }}
            >
              {leadSummary.total} leads cadastrados.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => setIsAutomationRulesOpen(true)}
              aria-label="Configurar automações do CRM"
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: '#141414',
                color: '#93c5fd',
                border: '1px solid #303030',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <SlidersHorizontal size={19} />
            </button>

            <button
              type="button"
              onClick={() => {
                setIsNotificationCenterOpen(true);
              }}
              aria-label="Abrir notificações"
              style={{
                position: 'relative',
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: '#141414',
                color: '#c5a059',
                border: '1px solid #303030',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <BellRing size={19} />

              {notificationSummary.unread > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    minWidth: '21px',
                    height: '21px',
                    padding: '0 5px',
                    borderRadius: '999px',
                    background: notificationSummary.critical > 0
                      ? '#f87171'
                      : '#fbbf24',
                    color: '#111',
                    border: '2px solid #080808',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.65rem',
                    fontWeight: 900,
                    boxSizing: 'border-box',
                  }}
                >
                  {notificationSummary.unread > 99
                    ? '99+'
                    : notificationSummary.unread}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsAssistantOpen(true)}
              style={{
                background: '#171126',
                color: '#c4b5fd',
                padding: '12px 18px',
                borderRadius: '8px',
                border: '1px solid #3b2c5e',
                fontWeight: '800',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Sparkles size={18} />
              Assistente comercial
              {assistantData.attentionItems.length > 0 && (
                <span
                  style={{
                    minWidth: '22px',
                    height: '22px',
                    borderRadius: '999px',
                    background: '#f87171',
                    color: '#111',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 6px',
                    fontSize: '0.7rem',
                    fontWeight: 900,
                  }}
                >
                  {assistantData.attentionItems.length}
                </span>
              )}
            </button>

            <button
              className="crm-new-lead-button"
              onClick={() => {
                setEditingLead(null);
                setIsModalOpen(true);
              }}
              style={{
                background: '#c5a059',
                color: '#000',
                padding: '12px 22px',
                borderRadius: '8px',
                border: 'none',
                fontWeight: '800',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Plus size={18} />
              Novo Lead
            </button>
          </div>
        </header>

        {!isLoading && (
          <section
            style={{
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: '14px',
              padding: '14px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div
                  style={{
                    color: '#fff',
                    fontSize: '0.9rem',
                    fontWeight: 800,
                  }}
                >
                  Funil por tipo de serviço
                </div>

                <div
                  style={{
                    color: '#777',
                    fontSize: '0.74rem',
                    marginTop: '4px',
                  }}
                >
                  O Kanban e os indicadores acompanham o serviço selecionado.
                </div>
              </div>

              <select
                value={selectedService}
                onChange={(event) => {
                  setSelectedService(event.target.value);
                }}
                style={{
                  minWidth: '220px',
                  background: '#111',
                  color: '#ddd',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                }}
              >
                <option value="">Todos os serviços</option>

                {serviceViewOptions.map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {isLoading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '64px',
              color: '#c5a059',
            }}
          >
            <Loader2
              style={{
                animation: 'spin 1s linear infinite',
              }}
              size={32}
            />
          </div>
        ) : (
          <>
            <section
              style={{
                background: dailyActionsSummary.overdue > 0
                  ? '#0f0909'
                  : '#0a0a0a',
                border: dailyActionsSummary.overdue > 0
                  ? '1px solid #3d1c1c'
                  : '1px solid #1a1a1a',
                borderRadius: '16px',
                padding: 'clamp(14px, 2vw, 20px)',
                marginBottom: '24px',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setIsDailyActionsOpen((current) => !current);
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: dailyActionsSummary.overdue > 0
                        ? '#241111'
                        : '#18130a',
                      border: dailyActionsSummary.overdue > 0
                        ? '1px solid #5a2525'
                        : '1px solid #3a2d16',
                      color: dailyActionsSummary.overdue > 0
                        ? '#f87171'
                        : '#c5a059',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <PlayCircle size={20} />
                  </span>

                  <div style={{ minWidth: 0 }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: '1rem',
                        color: '#fff',
                      }}
                    >
                      Ações do dia
                    </h2>

                    <p
                      style={{
                        margin: '5px 0 0',
                        color: '#777',
                        fontSize: '0.8rem',
                      }}
                    >
                      {dailyActionsSummary.total} ação(ões) priorizada(s) para você.
                    </p>
                  </div>
                </div>

                <span
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#121212',
                    border: '1px solid #252525',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#999',
                    flexShrink: 0,
                  }}
                >
                  {isDailyActionsOpen
                    ? <ChevronUp size={17} />
                    : <ChevronDown size={17} />}
                </span>
              </button>

              {isDailyActionsOpen && (
                <div style={{ marginTop: '18px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: '10px',
                      marginBottom: '16px',
                    }}
                  >
                    <FollowupSummaryCard
                      label="Vencidos"
                      value={dailyActionsSummary.overdue}
                      color="#f87171"
                      background="#1b0d0d"
                      border="#472020"
                    />

                    <FollowupSummaryCard
                      label="Para hoje"
                      value={dailyActionsSummary.today}
                      color="#fbbf24"
                      background="#1c1608"
                      border="#493817"
                    />

                    <FollowupSummaryCard
                      label="Leads quentes sem ação"
                      value={dailyActionsSummary.hotWithoutAction}
                      color="#fb7185"
                      background="#1f0f15"
                      border="#4a2230"
                    />

                    <FollowupSummaryCard
                      label="Total priorizado"
                      value={dailyActionsSummary.total}
                      color="#c5a059"
                      background="#18130a"
                      border="#3a2d16"
                    />
                  </div>

                  {dailyActionsSummary.overdue > 0 && (
                    <div
                      style={{
                        background: '#1b0d0d',
                        border: '1px solid #472020',
                        borderRadius: '10px',
                        padding: '12px',
                        color: '#f3b4b4',
                        fontSize: '0.8rem',
                        lineHeight: 1.5,
                        marginBottom: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '9px',
                      }}
                    >
                      <AlertTriangle size={17} />
                      Existem ações vencidas que precisam de atenção antes das demais.
                    </div>
                  )}

                  {dailyActions.length > 0 ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: '10px',
                      }}
                    >
                      {dailyActions.map((action) => (
                        <DailyActionCard
                          key={action.id}
                          action={action}
                          onOpenLead={openLeadDetails}
                          onRegisterContact={openLeadContact}
                          onWhatsApp={openWhatsAppModal}
                          onCompleteTask={completeCommercialTask}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        color: '#666',
                        fontSize: '0.84rem',
                        border: '1px dashed #292929',
                        borderRadius: '10px',
                        padding: '16px',
                        textAlign: 'center',
                      }}
                    >
                      Nenhuma ação urgente ou prevista para hoje.
                    </div>
                  )}
                </div>
              )}
            </section>

            <section
              style={{
                background: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: '16px',
                padding: 'clamp(14px, 2vw, 20px)',
                marginBottom: '24px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '14px',
                  marginBottom: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <h2
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#fff',
                      fontSize: '1rem',
                      margin: 0,
                    }}
                  >
                    <SlidersHorizontal size={18} color="#c5a059" />
                    Pesquisa e filtros
                  </h2>

                  <p
                    style={{
                      color: '#777',
                      fontSize: '0.8rem',
                      margin: '5px 0 0',
                    }}
                  >
                    {leadSummary.visible} de {leadSummary.total} lead(s) visiveis.
                  </p>
                </div>

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    style={{
                      background: '#171717',
                      color: '#ddd',
                      border: '1px solid #333',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      fontSize: '0.8rem',
                    }}
                  >
                    <X size={15} />
                    Limpar filtros ({activeFilterCount})
                  </button>
                )}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '12px',
                  width: '100%',
                  alignItems: 'stretch',
                }}
              >
                <label
                  style={{
                    gridColumn: '1 / -1',
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: '100%',
                      height: '44px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #333',
                      background: '#111',
                      boxSizing: 'border-box',
                    }}
                  >
                    <Search
                      size={17}
                      color="#777"
                      style={{ flexShrink: 0 }}
                    />

                    <input
                      type="text"
                      value={filters.search}
                      placeholder="Buscar nome, telefone, e-mail ou cidade"
                      onChange={(event) => {
                        handleFilterChange('search', event.target.value);
                      }}
                      style={{
                        width: '100%',
                        minWidth: 0,
                        height: '100%',
                        padding: 0,
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: '#fff',
                        boxSizing: 'border-box',
                      }}
                    />
                  </span>
                </label>

                <select
                  value={filters.service}
                  onChange={(event) => {
                    handleFilterChange('service', event.target.value);
                  }}
                  style={formInputStyle}
                >
                  <option value="">Todos os servicos</option>
                  {SERVICE_TYPES.map((service) => (
                    <option key={service} value={service}>
                      {service}
                    </option>
                  ))}
                </select>

                <select
                  value={filters.origin}
                  onChange={(event) => {
                    handleFilterChange('origin', event.target.value);
                  }}
                  style={formInputStyle}
                >
                  <option value="">Todas as origens</option>
                  {LEAD_ORIGINS.map((origin) => (
                    <option key={origin} value={origin}>
                      {origin}
                    </option>
                  ))}
                </select>

                <select
                  value={filters.campaign}
                  onChange={(event) => {
                    handleFilterChange('campaign', event.target.value);
                  }}
                  style={formInputStyle}
                >
                  <option value="">Todas as campanhas</option>
                  {campaignOptions.map((campaign) => (
                    <option key={campaign} value={campaign}>
                      {campaign}
                    </option>
                  ))}
                </select>

                <select
                  value={filters.status}
                  onChange={(event) => {
                    handleFilterChange('status', event.target.value);
                  }}
                  style={formInputStyle}
                >
                  <option value="">Todos os status</option>
                  {CRM_STATUSES.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.title}
                    </option>
                  ))}
                </select>

                <select
                  value={filters.followup}
                  onChange={(event) => {
                    handleFilterChange('followup', event.target.value);
                  }}
                  style={formInputStyle}
                >
                  <option value="">Todos os follow-ups</option>
                  <option value="atrasado">Atrasados</option>
                  <option value="hoje">Para hoje</option>
                  <option value="proximos">Proximos</option>
                  <option value="sem_followup">Sem follow-up</option>
                </select>

                <select
                  value={filters.priority}
                  onChange={(event) => {
                    handleFilterChange('priority', event.target.value);
                  }}
                  style={formInputStyle}
                >
                  <option value="">Todas as prioridades</option>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>

                <select
                  value={filters.temperature}
                  onChange={(event) => {
                    handleFilterChange('temperature', event.target.value);
                  }}
                  style={formInputStyle}
                >
                  <option value="">Todas as temperaturas</option>
                  <option value="frio">Frio</option>
                  <option value="morno">Morno</option>
                  <option value="quente">Quente</option>
                </select>
              </div>
            </section>

            <section
              style={{
                background: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: '16px',
                padding: 'clamp(14px, 2vw, 20px)',
                marginBottom: '24px',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setIsFollowupCenterOpen((current) => !current);
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: '#18130a',
                      border: '1px solid #3a2d16',
                      color: '#c5a059',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <BellRing size={19} />
                  </span>

                  <div style={{ minWidth: 0 }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: '1rem',
                        color: '#fff',
                      }}
                    >
                      Central de follow-ups
                    </h2>

                    <p
                      style={{
                        margin: '5px 0 0',
                        color: '#777',
                        fontSize: '0.8rem',
                      }}
                    >
                      {followupSummary.total} lead(s) em acompanhamento comercial.
                    </p>
                  </div>
                </div>

                <span
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#121212',
                    border: '1px solid #252525',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#999',
                    flexShrink: 0,
                  }}
                >
                  {isFollowupCenterOpen
                    ? <ChevronUp size={17} />
                    : <ChevronDown size={17} />}
                </span>
              </button>

              {isFollowupCenterOpen && (
                <div style={{ marginTop: '18px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: '10px',
                      marginBottom: '16px',
                    }}
                  >
                    <FollowupSummaryCard
                      label="Atrasados"
                      value={followupSummary.atrasado}
                      color="#f87171"
                      background="#1b0d0d"
                      border="#472020"
                    />

                    <FollowupSummaryCard
                      label="Para hoje"
                      value={followupSummary.hoje}
                      color="#fbbf24"
                      background="#1c1608"
                      border="#493817"
                    />

                    <FollowupSummaryCard
                      label="Próximos"
                      value={followupSummary.proximos}
                      color="#a78bfa"
                      background="#151020"
                      border="#34254f"
                    />

                    <FollowupSummaryCard
                      label="Sem follow-up"
                      value={followupSummary.semFollowup}
                      color="#9ca3af"
                      background="#111315"
                      border="#2c3035"
                    />
                  </div>

                  {smartFollowupSuggestions.length > 0 && (
                    <div
                      style={{
                        background: '#0d0d0d',
                        border: '1px solid #2b2418',
                        borderRadius: '12px',
                        padding: '14px',
                        marginBottom: '16px',
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
                          <h3
                            style={{
                              margin: 0,
                              color: '#fff',
                              fontSize: '0.9rem',
                            }}
                          >
                            Sugestões inteligentes
                          </h3>

                          <p
                            style={{
                              margin: '5px 0 0',
                              color: '#777',
                              fontSize: '0.76rem',
                            }}
                          >
                            Leads parados, atrasados ou sem próximo contato.
                          </p>
                        </div>

                        <span
                          style={{
                            color: '#c5a059',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                          }}
                        >
                          {smartFollowupSuggestions.length} ação(ões)
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                          gap: '10px',
                        }}
                      >
                        {smartFollowupSuggestions.map((item) => (
                          <SmartFollowupCard
                            key={item.lead.id}
                            lead={item.lead}
                            suggestion={item.suggestion}
                            onSchedule={applySuggestedFollowup}
                            onWhatsApp={openSuggestedWhatsApp}
                            onOpenLead={openLeadDetails}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    <FollowupColumn
                      title="Atrasados"
                      leads={followupGroups.atrasado}
                      emptyText="Nenhum follow-up atrasado."
                      color="#f87171"
                      onOpenLead={openLeadDetails}
                      onRegisterContact={openLeadContact}
                    />

                    <FollowupColumn
                      title="Para hoje"
                      leads={followupGroups.hoje}
                      emptyText="Nenhum follow-up para hoje."
                      color="#fbbf24"
                      onOpenLead={openLeadDetails}
                      onRegisterContact={openLeadContact}
                    />

                    <FollowupColumn
                      title="Próximos"
                      leads={followupGroups.proximos}
                      emptyText="Nenhum próximo follow-up."
                      color="#a78bfa"
                      onOpenLead={openLeadDetails}
                      onRegisterContact={openLeadContact}
                    />

                    <FollowupColumn
                      title="Sem follow-up"
                      leads={followupGroups.sem_followup}
                      emptyText="Todos os leads ativos têm retorno agendado."
                      color="#9ca3af"
                      onOpenLead={openLeadDetails}
                      onRegisterContact={openLeadContact}
                    />
                  </div>
                </div>
              )}
            </section>

            <section
              style={{
                background: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: '16px',
                padding: 'clamp(14px, 2vw, 20px)',
                marginBottom: '24px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsTaskCenterOpen((current) => !current);
                  }}
                  style={{
                    flex: '1 1 260px',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: '#101621',
                      border: '1px solid #24334a',
                      color: '#60a5fa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <ClipboardList size={19} />
                  </span>

                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: '1rem',
                        color: '#fff',
                      }}
                    >
                      Central de tarefas comerciais
                    </h2>

                    <p
                      style={{
                        margin: '5px 0 0',
                        color: '#777',
                        fontSize: '0.8rem',
                      }}
                    >
                      {taskSummary.pendentes} tarefa(s) pendente(s).
                    </p>
                  </div>

                  <span
                    style={{
                      marginLeft: 'auto',
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: '#121212',
                      border: '1px solid #252525',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#999',
                      flexShrink: 0,
                    }}
                  >
                    {isTaskCenterOpen
                      ? <ChevronUp size={17} />
                      : <ChevronDown size={17} />}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => openTaskModal()}
                  style={{
                    background: '#60a5fa',
                    color: '#07111f',
                    border: 'none',
                    padding: '10px 13px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    flexShrink: 0,
                  }}
                >
                  <Plus size={16} />
                  Nova tarefa
                </button>
              </div>

              {isTaskCenterOpen && (
                <div style={{ marginTop: '18px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                      gap: '10px',
                      marginBottom: '16px',
                    }}
                  >
                    <FollowupSummaryCard
                      label="Atrasadas"
                      value={taskSummary.atrasadas}
                      color="#f87171"
                      background="#1b0d0d"
                      border="#472020"
                    />

                    <FollowupSummaryCard
                      label="Para hoje"
                      value={taskSummary.hoje}
                      color="#fbbf24"
                      background="#1c1608"
                      border="#493817"
                    />

                    <FollowupSummaryCard
                      label="Próximas"
                      value={taskSummary.proximas}
                      color="#60a5fa"
                      background="#0d1520"
                      border="#24334a"
                    />

                    <FollowupSummaryCard
                      label="Concluídas"
                      value={taskSummary.concluidas}
                      color="#34d399"
                      background="#0b1912"
                      border="#1e4932"
                    />
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    <TaskColumn
                      title="Atrasadas"
                      tasks={taskGroups.atrasadas}
                      color="#f87171"
                      emptyText="Nenhuma tarefa atrasada."
                      onOpenLead={openLeadDetails}
                      onComplete={completeCommercialTask}
                    />

                    <TaskColumn
                      title="Para hoje"
                      tasks={taskGroups.hoje}
                      color="#fbbf24"
                      emptyText="Nenhuma tarefa para hoje."
                      onOpenLead={openLeadDetails}
                      onComplete={completeCommercialTask}
                    />

                    <TaskColumn
                      title="Próximas"
                      tasks={taskGroups.proximas}
                      color="#60a5fa"
                      emptyText="Nenhuma próxima tarefa."
                      onOpenLead={openLeadDetails}
                      onComplete={completeCommercialTask}
                    />
                  </div>
                </div>
              )}
            </section>

            <section
              style={{
                background: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: '16px',
                padding: 'clamp(14px, 2vw, 20px)',
                marginBottom: '24px',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setIsRecoveryCenterOpen((current) => !current);
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: '#171126',
                      border: '1px solid #33244f',
                      color: '#a78bfa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <RefreshCcw size={19} />
                  </span>

                  <div style={{ minWidth: 0 }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: '1rem',
                        color: '#fff',
                      }}
                    >
                      Recuperação de oportunidades
                    </h2>

                    <p
                      style={{
                        margin: '5px 0 0',
                        color: '#777',
                        fontSize: '0.8rem',
                      }}
                    >
                      {recoverySummary.total} oportunidade(s) com possibilidade de retomada.
                    </p>
                  </div>
                </div>

                <span
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#121212',
                    border: '1px solid #252525',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#999',
                    flexShrink: 0,
                  }}
                >
                  {isRecoveryCenterOpen
                    ? <ChevronUp size={17} />
                    : <ChevronDown size={17} />}
                </span>
              </button>

              {isRecoveryCenterOpen && (
                <div style={{ marginTop: '18px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: '10px',
                      marginBottom: '16px',
                    }}
                  >
                    <FollowupSummaryCard
                      label="Para recuperar"
                      value={recoverySummary.total}
                      color="#a78bfa"
                      background="#171126"
                      border="#33244f"
                    />

                    <FollowupSummaryCard
                      label="Perdidos ou cancelados"
                      value={recoverySummary.closed}
                      color="#f87171"
                      background="#1b0d0d"
                      border="#472020"
                    />

                    <FollowupSummaryCard
                      label="Parados há 14+ dias"
                      value={recoverySummary.stalled}
                      color="#fbbf24"
                      background="#1c1608"
                      border="#493817"
                    />

                    <FollowupSummaryCard
                      label="Potencial recuperável"
                      value={formatSummaryCurrency(
                        recoverySummary.potential,
                      )}
                      color="#34d399"
                      background="#0d1b16"
                      border="#1f4939"
                    />
                  </div>

                  {recoveryOpportunities.length > 0 ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(270px, 1fr))',
                        gap: '10px',
                      }}
                    >
                      {recoveryOpportunities.map((opportunity) => (
                        <RecoveryOpportunityCard
                          key={opportunity.lead.id}
                          opportunity={opportunity}
                          isReopening={
                            reopeningLeadId === opportunity.lead.id
                          }
                          onOpenLead={openLeadDetails}
                          onWhatsApp={openRecoveryWhatsApp}
                          onReactivate={reactivateLead}
                          onRegisterContact={openLeadContact}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        color: '#666',
                        fontSize: '0.84rem',
                        border: '1px dashed #292929',
                        borderRadius: '10px',
                        padding: '16px',
                        textAlign: 'center',
                      }}
                    >
                      Nenhuma oportunidade disponível para recuperação.
                    </div>
                  )}
                </div>
              )}
            </section>

            <section
              style={{
                background: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: '16px',
                padding: 'clamp(14px, 2vw, 20px)',
                marginBottom: '24px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setIsCommercialAgendaOpen((current) => !current);
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <span
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: '#0d1726',
                      border: '1px solid #1f3b63',
                      color: '#60a5fa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CalendarClock size={20} />
                  </span>

                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: '1rem',
                      }}
                    >
                      Agenda comercial
                    </h2>

                    <p
                      style={{
                        margin: '5px 0 0',
                        color: '#777',
                        fontSize: '0.78rem',
                      }}
                    >
                      Follow-ups, tarefas, reuniões, orçamentos e eventos.
                    </p>
                  </div>
                </div>

                {isCommercialAgendaOpen
                  ? <ChevronUp size={17} />
                  : <ChevronDown size={17} />}
              </button>

              {isCommercialAgendaOpen && (
                <div style={{ marginTop: '16px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '10px',
                      marginBottom: '14px',
                    }}
                  >
                    <FollowupSummaryCard
                      label="Atrasados"
                      value={commercialAgendaSummary.atrasados}
                      color="#f87171"
                      background="#1b0d0d"
                      border="#472020"
                    />

                    <FollowupSummaryCard
                      label="Hoje"
                      value={commercialAgendaSummary.hoje}
                      color="#fbbf24"
                      background="#1c1608"
                      border="#493817"
                    />

                    <FollowupSummaryCard
                      label="Próximos"
                      value={commercialAgendaSummary.futuros}
                      color="#60a5fa"
                      background="#0d1726"
                      border="#1f3b63"
                    />

                    <FollowupSummaryCard
                      label="Total"
                      value={commercialAgendaSummary.total}
                      color="#c5a059"
                      background="#18130a"
                      border="#3a2d16"
                    />
                  </div>

                  {commercialAgenda.length > 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      {commercialAgenda.map((item) => (
                        <CommercialAgendaItem
                          key={item.id}
                          item={item}
                          renewing={
                            renewingBudgetLeadId === item.lead?.id
                          }
                          onOpenLead={openLeadDetails}
                          onRenewBudget={renewBudgetValidity}
                          onCompleteTask={completeCommercialTask}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        color: '#666',
                        border: '1px dashed #292929',
                        borderRadius: '9px',
                        padding: '14px',
                        textAlign: 'center',
                        fontSize: '0.82rem',
                      }}
                    >
                      Nenhum compromisso comercial encontrado.
                    </div>
                  )}
                </div>
              )}
            </section>

            <CRMStats leads={filteredLeads} />

            <KanbanBoard
              leads={filteredLeads}
              onMove={handleUpdateStatus}
              onClick={openLeadDetails}
              onQuickNote={openQuickNoteModal}
            />
          </>
        )}
      </div>

      {isAutomationRulesOpen && (
        <div
          role="presentation"
          onClick={() => setIsAutomationRulesOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1300,
            background: 'rgba(0, 0, 0, 0.78)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <form
            onSubmit={saveAutomationRules}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(620px, 100%)',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: '#0a0a0a',
              border: '1px solid #2a2a2a',
              borderRadius: '14px',
              padding: '18px',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                alignItems: 'flex-start',
                marginBottom: '16px',
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    color: '#fff',
                    fontSize: '1rem',
                  }}
                >
                  Regras automáticas do CRM
                </h2>

                <div
                  style={{
                    color: '#777',
                    fontSize: '0.72rem',
                    marginTop: '5px',
                  }}
                >
                  Configure a cadência e os alertas comerciais.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAutomationRulesOpen(false)}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  background: '#141414',
                  color: '#aaa',
                  border: '1px solid #2a2a2a',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '10px',
              }}
            >
              {[
                ['novo_lead', 'Lead novo: retorno em dias'],
                ['orcamento_enviado', 'Orçamento enviado: retorno em dias'],
                ['em_negociacao', 'Negociação: retorno em dias'],
                ['aguardando_retorno', 'Aguardando resposta: retorno em dias'],
                ['leadQuenteParadoDias', 'Lead quente parado após dias'],
                ['avisoOrcamentoDias', 'Avisar orçamento antes de vencer'],
              ].map(([field, label]) => (
                <label
                  key={field}
                  style={{
                    color: '#aaa',
                    fontSize: '0.72rem',
                  }}
                >
                  {label}

                  <input
                    type="number"
                    min="0"
                    value={automationRules[field]}
                    onChange={(event) => {
                      setAutomationRules((current) => ({
                        ...current,
                        [field]: Number(event.target.value),
                      }));
                    }}
                    style={{
                      width: '100%',
                      marginTop: '6px',
                      background: '#111',
                      color: '#fff',
                      border: '1px solid #333',
                      borderRadius: '8px',
                      padding: '10px',
                      boxSizing: 'border-box',
                    }}
                  />
                </label>
              ))}
            </div>

            <div
              style={{
                display: 'grid',
                gap: '9px',
                marginTop: '14px',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  alignItems: 'center',
                  color: '#bbb',
                  fontSize: '0.76rem',
                  background: '#111',
                  border: '1px solid #242424',
                  borderRadius: '9px',
                  padding: '11px',
                }}
              >
                Alertar follow-up atrasado

                <input
                  type="checkbox"
                  checked={Boolean(
                    automationRules.followupAtrasadoAtivo,
                  )}
                  onChange={(event) => {
                    setAutomationRules((current) => ({
                      ...current,
                      followupAtrasadoAtivo: event.target.checked,
                    }));
                  }}
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  alignItems: 'center',
                  color: '#bbb',
                  fontSize: '0.76rem',
                  background: '#111',
                  border: '1px solid #242424',
                  borderRadius: '9px',
                  padding: '11px',
                }}
              >
                Alertar tarefa atrasada

                <input
                  type="checkbox"
                  checked={Boolean(
                    automationRules.tarefaAtrasadaAtiva,
                  )}
                  onChange={(event) => {
                    setAutomationRules((current) => ({
                      ...current,
                      tarefaAtrasadaAtiva: event.target.checked,
                    }));
                  }}
                />
              </label>

              <label
                style={{
                  color: '#aaa',
                  fontSize: '0.72rem',
                }}
              >
                Usuário responsável pela auditoria

                <input
                  value={auditActor}
                  onChange={(event) => setAuditActor(event.target.value)}
                  placeholder="Camilla"
                  style={{
                    width: '100%',
                    marginTop: '6px',
                    background: '#111',
                    color: '#fff',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    padding: '10px',
                    boxSizing: 'border-box',
                  }}
                />
              </label>
            </div>

            <button
              type="submit"
              style={{
                width: '100%',
                marginTop: '16px',
                background: '#c5a059',
                color: '#111',
                border: 'none',
                borderRadius: '9px',
                padding: '11px',
                cursor: 'pointer',
                fontWeight: 900,
              }}
            >
              Salvar regras
            </button>
          </form>
        </div>
      )}

      <Modal
        isOpen={isDocumentModalOpen}
        title="Adicionar documento"
        onClose={closeDocumentModal}
      >
        <form
          onSubmit={handleSaveDocument}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <label style={{ color: '#aaa', fontSize: '0.72rem' }}>
            Título

            <input
              value={documentForm.titulo}
              onChange={(event) => {
                setDocumentForm((current) => ({
                  ...current,
                  titulo: event.target.value,
                }));
              }}
              required
              style={{
                width: '100%',
                marginTop: '6px',
                background: '#111',
                color: '#fff',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '10px',
                boxSizing: 'border-box',
              }}
            />
          </label>

          <label style={{ color: '#aaa', fontSize: '0.72rem' }}>
            Tipo

            <select
              value={documentForm.tipoDocumento}
              onChange={(event) => {
                setDocumentForm((current) => ({
                  ...current,
                  tipoDocumento: event.target.value,
                }));
              }}
              style={{
                width: '100%',
                marginTop: '6px',
                background: '#111',
                color: '#fff',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '10px',
              }}
            >
              <option>Orçamento</option>
              <option>Contrato</option>
              <option>Comprovante</option>
              <option>Referência</option>
              <option>Questionário</option>
              <option>Outro</option>
            </select>
          </label>

          <label style={{ color: '#aaa', fontSize: '0.72rem' }}>
            Link do documento

            <input
              type="url"
              value={documentForm.url}
              onChange={(event) => {
                setDocumentForm((current) => ({
                  ...current,
                  url: event.target.value,
                }));
              }}
              placeholder="https://..."
              style={{
                width: '100%',
                marginTop: '6px',
                background: '#111',
                color: '#fff',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '10px',
                boxSizing: 'border-box',
              }}
            />
          </label>

          <label style={{ color: '#aaa', fontSize: '0.72rem' }}>
            Observação

            <textarea
              value={documentForm.observacao}
              onChange={(event) => {
                setDocumentForm((current) => ({
                  ...current,
                  observacao: event.target.value,
                }));
              }}
              rows={4}
              style={{
                width: '100%',
                marginTop: '6px',
                background: '#111',
                color: '#fff',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '10px',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </label>

          <button
            type="submit"
            disabled={isSavingDocument}
            style={{
              background: '#c5a059',
              color: '#111',
              border: 'none',
              borderRadius: '9px',
              padding: '11px',
              cursor: isSavingDocument ? 'wait' : 'pointer',
              fontWeight: 900,
              opacity: isSavingDocument ? 0.65 : 1,
            }}
          >
            {isSavingDocument
              ? 'Salvando...'
              : 'Salvar documento'}
          </button>
        </form>
      </Modal>

      {isNotificationCenterOpen && (
        <div
          role="presentation"
          onClick={() => setIsNotificationCenterOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1250,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Central de notificações"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(500px, 100%)',
              height: '100%',
              background: '#080808',
              borderLeft: '1px solid #292929',
              boxShadow: '-16px 0 40px rgba(0,0,0,0.45)',
              padding: '18px',
              boxSizing: 'border-box',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                alignItems: 'flex-start',
                marginBottom: '15px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '11px',
                }}
              >
                <span
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: '#18130a',
                    border: '1px solid #3a2d16',
                    color: '#c5a059',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <BellRing size={20} />
                </span>

                <div>
                  <h2
                    style={{
                      margin: 0,
                      color: '#fff',
                      fontSize: '1rem',
                    }}
                  >
                    Central de notificações
                  </h2>

                  <div
                    style={{
                      color: '#777',
                      fontSize: '0.72rem',
                      marginTop: '4px',
                    }}
                  >
                    {notificationSummary.unread} não lida(s) de{' '}
                    {notificationSummary.total}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsNotificationCenterOpen(false)}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  background: '#141414',
                  color: '#aaa',
                  border: '1px solid #2a2a2a',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={17} />
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(90px, 1fr))',
                gap: '8px',
                marginBottom: '14px',
              }}
            >
              <NotificationSummaryCard
                label="Críticas"
                value={notificationSummary.critical}
                color="#f87171"
              />

              <NotificationSummaryCard
                label="Atenção"
                value={notificationSummary.warning}
                color="#fbbf24"
              />

              <NotificationSummaryCard
                label="Hoje"
                value={notificationSummary.attention}
                color="#60a5fa"
              />
            </div>

            {notificationSummary.unread > 0 && (
              <button
                type="button"
                onClick={markAllNotificationsAsRead}
                style={{
                  width: '100%',
                  background: '#141414',
                  color: '#bbb',
                  border: '1px solid #303030',
                  borderRadius: '8px',
                  padding: '9px 11px',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  marginBottom: '12px',
                }}
              >
                Marcar todas como lidas
              </button>
            )}

            {crmNotifications.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {crmNotifications.map((notification) => {
                  const isRead = Boolean(
                    notificationReadState[notification.id],
                  );

                  const visual = {
                    critical: {
                      color: '#f87171',
                      background: '#1b0d0d',
                      border: '#472020',
                    },
                    warning: {
                      color: '#fbbf24',
                      background: '#1c1608',
                      border: '#493817',
                    },
                    attention: {
                      color: '#60a5fa',
                      background: '#0d1726',
                      border: '#1f3b63',
                    },
                    info: {
                      color: '#a78bfa',
                      background: '#171126',
                      border: '#33244f',
                    },
                  }[notification.severity];

                  return (
                    <div
                      key={notification.id}
                      style={{
                        background: isRead
                          ? '#0d0d0d'
                          : visual.background,
                        border: `1px solid ${
                          isRead ? '#242424' : visual.border
                        }`,
                        borderRadius: '10px',
                        padding: '11px',
                        opacity: isRead ? 0.62 : 1,
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
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              color: isRead ? '#888' : visual.color,
                              fontSize: '0.7rem',
                              fontWeight: 900,
                            }}
                          >
                            {notification.title}
                          </div>

                          <div
                            style={{
                              color: isRead ? '#777' : '#bbb',
                              fontSize: '0.76rem',
                              lineHeight: 1.45,
                              marginTop: '5px',
                            }}
                          >
                            {notification.description}
                          </div>

                          {notification.date && (
                            <div
                              style={{
                                color: '#666',
                                fontSize: '0.68rem',
                                marginTop: '5px',
                              }}
                            >
                              {formatDisplayDate(notification.date)}
                            </div>
                          )}
                        </div>

                        {!isRead && (
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '999px',
                              background: visual.color,
                              marginTop: '4px',
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          gap: '7px',
                          flexWrap: 'wrap',
                          marginTop: '10px',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            void handleNotificationAction(notification);
                          }}
                          style={{
                            background: '#171717',
                            color: '#ddd',
                            border: '1px solid #303030',
                            borderRadius: '7px',
                            padding: '7px 9px',
                            cursor: 'pointer',
                            fontSize: '0.67rem',
                            fontWeight: 800,
                          }}
                        >
                          {notification.actionLabel}
                        </button>

                        {!isRead && (
                          <button
                            type="button"
                            onClick={() => {
                              markNotificationAsRead(notification.id);
                            }}
                            style={{
                              background: 'transparent',
                              color: '#888',
                              border: '1px solid #303030',
                              borderRadius: '7px',
                              padding: '7px 9px',
                              cursor: 'pointer',
                              fontSize: '0.67rem',
                              fontWeight: 700,
                            }}
                          >
                            Marcar como lida
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  color: '#666',
                  border: '1px dashed #292929',
                  borderRadius: '10px',
                  padding: '16px',
                  textAlign: 'center',
                  fontSize: '0.8rem',
                }}
              >
                Nenhuma notificação comercial neste momento.
              </div>
            )}
          </aside>
        </div>
      )}

      {isAssistantOpen && (
        <div
          role="presentation"
          onClick={() => setIsAssistantOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            background: 'rgba(0, 0, 0, 0.72)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Assistente comercial"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(520px, 100%)',
              height: '100%',
              background: '#080808',
              borderLeft: '1px solid #272033',
              boxShadow: '-16px 0 40px rgba(0,0,0,0.45)',
              padding: '18px',
              boxSizing: 'border-box',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                alignItems: 'flex-start',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: '11px',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: '#171126',
                    border: '1px solid #3b2c5e',
                    color: '#c4b5fd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Bot size={21} />
                </span>

                <div>
                  <h2
                    style={{
                      margin: 0,
                      color: '#fff',
                      fontSize: '1rem',
                    }}
                  >
                    Assistente comercial
                  </h2>

                  <div
                    style={{
                      color: '#777',
                      fontSize: '0.73rem',
                      marginTop: '4px',
                    }}
                  >
                    Assistente comercial com os dados do seu CRM
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAssistantOpen(false)}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  background: '#141414',
                  color: '#aaa',
                  border: '1px solid #2a2a2a',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={17} />
              </button>
            </div>

            <div
              style={{
                background: '#111',
                border: '1px solid #272033',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '14px',
              }}
            >
              <div
                style={{
                  color: '#c4b5fd',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  marginBottom: '7px',
                }}
              >
                Visão geral
              </div>

              <div
                style={{
                  color: '#ddd',
                  fontSize: '0.84rem',
                  lineHeight: 1.55,
                }}
              >
                {assistantGreeting}
              </div>

              <div
                style={{
                  color: '#777',
                  fontSize: '0.7rem',
                  lineHeight: 1.45,
                  marginTop: '7px',
                }}
              >
                Agora o assistente também executa ações diretamente nos leads.
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: '8px',
                  marginTop: '12px',
                }}
              >
                <AssistantMetric
                  label="Atrasados"
                  value={
                    assistantData.followupsOverdue.length
                    + assistantData.overdueTasks.length
                  }
                  color="#f87171"
                />

                <AssistantMetric
                  label="Para hoje"
                  value={
                    assistantData.followupsToday.length
                    + assistantData.todayTasks.length
                  }
                  color="#fbbf24"
                />

                <AssistantMetric
                  label="Sem próximo passo"
                  value={assistantData.withoutFollowup.length}
                  color="#a78bfa"
                />

                <AssistantMetric
                  label="Pipeline"
                  value={formatSummaryCurrency(
                    assistantData.weightedPipeline,
                  )}
                  color="#34d399"
                  compact
                />
              </div>
            </div>

            <div
              style={{
                marginBottom: '14px',
              }}
            >
              <div
                style={{
                  color: '#888',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  marginBottom: '8px',
                }}
              >
                Perguntas rápidas
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '7px',
                  flexWrap: 'wrap',
                }}
              >
                {[
                  'Quem devo responder hoje?',
                  'Quais leads têm maior chance de fechar?',
                  'Quais orçamentos estão vencendo?',
                  'Quanto vou faturar?',
                  'Quais tarefas estão atrasadas?',
                ].map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => askStudioFlowAssistant(question)}
                    style={{
                      background: '#121212',
                      color: '#aaa',
                      border: '1px solid #2b2b2b',
                      borderRadius: '999px',
                      padding: '7px 10px',
                      fontSize: '0.68rem',
                      cursor: 'pointer',
                    }}
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                askStudioFlowAssistant();
              }}
              style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '14px',
              }}
            >
              <input
                value={assistantQuestion}
                onChange={(event) => {
                  setAssistantQuestion(event.target.value);
                }}
                placeholder="Pergunte sobre seu CRM..."
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: '#111',
                  color: '#fff',
                  border: '1px solid #333',
                  borderRadius: '9px',
                  padding: '12px',
                  boxSizing: 'border-box',
                }}
              />

              <button
                type="submit"
                style={{
                  background: '#c5a059',
                  color: '#111',
                  border: 'none',
                  borderRadius: '9px',
                  padding: '0 15px',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Perguntar
              </button>
            </form>

            {assistantAnswer && (
              <div
                style={{
                  background: '#0d0d0d',
                  border: '1px solid #292929',
                  borderRadius: '12px',
                  padding: '14px',
                  marginBottom: '14px',
                }}
              >
                <div
                  style={{
                    color: '#c4b5fd',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    marginBottom: '8px',
                  }}
                >
                  Resposta
                </div>

                <div
                  style={{
                    color: '#d0d0d0',
                    fontSize: '0.8rem',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {assistantAnswer}
                </div>
              </div>
            )}

            <div>
              <div
                style={{
                  color: '#888',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  marginBottom: '8px',
                }}
              >
                Prioridades atuais
              </div>

              {assistantData.attentionItems.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {assistantData.attentionItems.map((item) => {
                    const suggestion = item.lead
                      ? getSmartFollowupSuggestion(item.lead)
                      : null;

                    return (
                      <div
                        key={item.id}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          background: '#111',
                          border: '1px solid #252525',
                          borderRadius: '10px',
                          padding: '11px',
                          boxSizing: 'border-box',
                        }}
                      >
                        <div
                          style={{
                            color: item.severity >= 90
                              ? '#f87171'
                              : item.severity >= 80
                                ? '#fbbf24'
                                : '#60a5fa',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                          }}
                        >
                          {item.title}
                        </div>

                        <div
                          style={{
                            color: '#bbb',
                            fontSize: '0.76rem',
                            lineHeight: 1.45,
                            marginTop: '5px',
                          }}
                        >
                          {item.description}
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '6px',
                            marginTop: '10px',
                          }}
                        >
                          {item.lead && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsAssistantOpen(false);
                                openLeadDetails(item.lead);
                              }}
                              style={{
                                background: '#171717',
                                color: '#bbb',
                                border: '1px solid #303030',
                                borderRadius: '7px',
                                padding: '7px 9px',
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              Ver lead
                            </button>
                          )}

                          {item.lead && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsAssistantOpen(false);
                                openWhatsAppModal(item.lead);
                              }}
                              style={{
                                background: '#102017',
                                color: '#70d6a2',
                                border: '1px solid #214a35',
                                borderRadius: '7px',
                                padding: '7px 9px',
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              WhatsApp
                            </button>
                          )}

                          {item.lead && suggestion && (
                            <button
                              type="button"
                              onClick={() => {
                                void applySuggestedFollowup(
                                  item.lead,
                                  suggestion,
                                );
                              }}
                              style={{
                                background: '#171126',
                                color: '#c4b5fd',
                                border: '1px solid #33244f',
                                borderRadius: '7px',
                                padding: '7px 9px',
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              Agendar follow-up
                            </button>
                          )}

                          {item.lead && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsAssistantOpen(false);
                                openTaskModal(item.lead);
                              }}
                              style={{
                                background: '#0d1726',
                                color: '#93c5fd',
                                border: '1px solid #1f3b63',
                                borderRadius: '7px',
                                padding: '7px 9px',
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              Criar tarefa
                            </button>
                          )}

                          {item.task && (
                            <button
                              type="button"
                              onClick={() => {
                                void completeCommercialTask(item.task);
                              }}
                              style={{
                                background: '#0d1b16',
                                color: '#70d6a2',
                                border: '1px solid #1f4939',
                                borderRadius: '7px',
                                padding: '7px 9px',
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              Concluir tarefa
                            </button>
                          )}

                          {item.type === 'budget' && item.lead && (
                            <button
                              type="button"
                              onClick={() => {
                                void renewBudgetValidity(item.lead, 30);
                              }}
                              style={{
                                background: '#18130a',
                                color: '#d8b56e',
                                border: '1px solid #3a2d16',
                                borderRadius: '7px',
                                padding: '7px 9px',
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              Renovar orçamento
                            </button>
                          )}

                          {item.lead && (
                            <button
                              type="button"
                              onClick={() => {
                                void setLeadPriorityFromAssistant(
                                  item.lead,
                                  'alta',
                                );
                              }}
                              style={{
                                background: '#1c1608',
                                color: '#fbbf24',
                                border: '1px solid #493817',
                                borderRadius: '7px',
                                padding: '7px 9px',
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              Prioridade alta
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    color: '#666',
                    border: '1px dashed #292929',
                    borderRadius: '9px',
                    padding: '13px',
                    textAlign: 'center',
                    fontSize: '0.78rem',
                  }}
                >
                  Nenhuma prioridade crítica neste momento.
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingLead(null);
        }}
        title={editingLead ? 'Editar Lead' : 'Novo Lead'}
      >
        <LeadForm
          initialData={editingLead}
          leads={leads}
          onSave={handleSaveLead}
        />
      </Modal>

      {selectedLead && (
        <div
          role="presentation"
          onClick={() => {
            if (isContactModalOpen) return;

            setSelectedLead(null);
            setHistoryFilters(createEmptyHistoryFilters());
            setLeadDetailTab('visao-geral');
            setIsLeadSummaryExpanded(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1150,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'clamp(0px, 2vw, 24px)',
            boxSizing: 'border-box',
          }}
        >
          <style>
            {`
              .lead-details-v2 {
                width: min(1080px, 96vw);
                height: min(92vh, 920px);
                display: grid;
                grid-template-rows: auto auto 1fr auto;
              }

              .lead-details-kpis {
                display: grid;
                grid-template-columns: repeat(4, minmax(120px, 1fr));
                gap: 10px;
              }

              .lead-details-info-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(150px, 1fr));
                gap: 10px;
              }

              .lead-details-sections {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 14px;
              }

              .lead-details-history-filters {
                display: grid;
                grid-template-columns: minmax(220px, 1.5fr) repeat(2, minmax(145px, 0.8fr));
                gap: 9px;
              }

              .lead-details-actions {
                display: grid;
                grid-template-columns: repeat(6, minmax(110px, 1fr));
                gap: 8px;
              }

              @media (max-width: 900px) {
                .lead-details-v2 {
                  width: 96vw;
                  height: 94vh;
                }

                .lead-details-kpis {
                  grid-template-columns: repeat(2, minmax(130px, 1fr));
                }

                .lead-details-info-grid {
                  grid-template-columns: repeat(2, minmax(145px, 1fr));
                }

                .lead-details-sections {
                  grid-template-columns: 1fr;
                }

                .lead-details-history-filters {
                  grid-template-columns: 1fr 1fr;
                }

                .lead-details-history-filters > :first-child {
                  grid-column: 1 / -1;
                }

                .lead-details-actions {
                  grid-template-columns: repeat(3, minmax(110px, 1fr));
                }
              }

              @media (max-width: 620px) {
                .lead-details-v2 {
                  width: 100vw;
                  height: 100vh;
                  max-height: none;
                  border-radius: 0 !important;
                }

                .lead-details-kpis,
                .lead-details-info-grid,
                .lead-details-history-filters {
                  grid-template-columns: 1fr;
                }

                .lead-details-history-filters > :first-child {
                  grid-column: auto;
                }

                .lead-details-tabs {
                  overflow-x: auto;
                  scrollbar-width: none;
                }

                .lead-details-tabs::-webkit-scrollbar,
                .lead-details-actions::-webkit-scrollbar {
                  display: none;
                }

                .lead-details-content {
                  padding: 14px !important;
                }

                .lead-details-actions {
                  display: flex;
                  overflow-x: auto;
                  scrollbar-width: none;
                }

                .lead-details-actions button {
                  min-width: 128px;
                  flex: 0 0 auto;
                }
              }
            `}
          </style>

          <section
            className="lead-details-v2"
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes do lead"
            onClick={(event) => event.stopPropagation()}
            style={{
              background: '#090909',
              border: '1px solid #242424',
              borderRadius: '18px',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
              overflow: 'hidden',
            }}
          >
            <header
              style={{
                padding: 'clamp(14px, 2vw, 22px)',
                borderBottom: '1px solid #202020',
                background:
                  'linear-gradient(180deg, rgba(197,160,89,0.08), rgba(9,9,9,0))',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '14px',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: '7px',
                      flexWrap: 'wrap',
                      marginBottom: '8px',
                    }}
                  >
                    <span
                      style={{
                        background: '#18130a',
                        border: '1px solid #3a2d16',
                        color: '#d8b56e',
                        borderRadius: '999px',
                        padding: '5px 8px',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                      }}
                    >
                      {getStatusTitle(selectedLead.status)}
                    </span>

                    <span
                      style={{
                        background: '#111',
                        border: '1px solid #292929',
                        color: '#aaa',
                        borderRadius: '999px',
                        padding: '5px 8px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                      }}
                    >
                      {selectedLead.tipoServico || 'Serviço não informado'}
                    </span>

                    <span
                      style={{
                        background: '#111',
                        border: '1px solid #292929',
                        color: '#aaa',
                        borderRadius: '999px',
                        padding: '5px 8px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                      }}
                    >
                      {selectedLead.cidade || 'Cidade não informada'}
                    </span>
                  </div>

                  <h2
                    style={{
                      margin: 0,
                      color: '#fff',
                      fontSize: 'clamp(1.2rem, 2vw, 1.65rem)',
                      lineHeight: 1.2,
                      wordBreak: 'break-word',
                    }}
                  >
                    {selectedLead.nome}
                  </h2>

                  <div
                    style={{
                      color: '#777',
                      fontSize: '0.76rem',
                      marginTop: '7px',
                      display: 'flex',
                      gap: '7px 14px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      Evento: {formatDisplayDate(selectedLead.dataEvento)}
                    </span>

                    <span>
                      Origem: {selectedLead.origem || 'Não informada'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedLead(null);
                    setHistoryFilters(createEmptyHistoryFilters());
                    setLeadDetailTab('visao-geral');
                    setIsLeadSummaryExpanded(false);
                  }}
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: '#151515',
                    border: '1px solid #2d2d2d',
                    color: '#aaa',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {selectedLeadSummary && (
                <div
                  className="lead-details-kpis"
                  style={{ marginTop: '16px' }}
                >
                  <LeadDetailKpi
                    label="Score IA"
                    value={`${getStudioFlowLeadScore(selectedLead)}/100`}
                    color="#c4b5fd"
                  />

                  <LeadDetailKpi
                    label="Probabilidade"
                    value={`${selectedLeadSummary.probability}%`}
                    color={
                      selectedLeadSummary.probability >= 70
                        ? '#34d399'
                        : '#fbbf24'
                    }
                  />

                  <LeadDetailKpi
                    label="Orçamento"
                    value={formatSummaryCurrency(
                      selectedLeadSummary.budgetValue,
                    )}
                    color="#c5a059"
                    compact
                  />

                  <LeadDetailKpi
                    label="Próximo follow-up"
                    value={formatDisplayDate(
                      selectedLead.dataProximoFollowup,
                    )}
                    color={
                      selectedLeadSummary.followupCategory === 'atrasado'
                        ? '#f87171'
                        : '#60a5fa'
                    }
                    compact
                  />
                </div>
              )}
            </header>

            <nav
              className="lead-details-tabs"
              style={{
                display: 'flex',
                gap: '6px',
                padding: '10px 14px',
                borderBottom: '1px solid #202020',
                background: '#0c0c0c',
              }}
            >
              {[
                ['visao-geral', 'Visão geral'],
                ['jornada', 'Jornada'],
                ['historico', 'Histórico'],
                ['tarefas', 'Tarefas'],
                ['documentos', 'Documentos'],
                ['auditoria', 'Auditoria'],
                ['observacoes', 'Observações'],
              ].map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setLeadDetailTab(tab)}
                  style={{
                    background: leadDetailTab === tab
                      ? '#18130a'
                      : 'transparent',
                    color: leadDetailTab === tab
                      ? '#d8b56e'
                      : '#888',
                    border: leadDetailTab === tab
                      ? '1px solid #3a2d16'
                      : '1px solid transparent',
                    borderRadius: '8px',
                    padding: '8px 11px',
                    cursor: 'pointer',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>

            <main
              className="lead-details-content"
              style={{
                overflowY: 'auto',
                padding: '18px 20px',
              }}
            >
              {leadDetailTab === 'visao-geral' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  {selectedLeadSummary && (
                    <section
                      style={{
                        background: '#0d0d0d',
                        border: selectedLeadSummary.alerts.length > 0
                          ? '1px solid #493817'
                          : '1px solid #222',
                        borderRadius: '12px',
                        padding: '14px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '12px',
                          flexWrap: 'wrap',
                          alignItems: 'flex-start',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              color: '#c5a059',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                            }}
                          >
                            Resumo inteligente
                          </div>

                          <div
                            style={{
                              color: '#ddd',
                              fontSize: '0.8rem',
                              lineHeight: 1.55,
                              marginTop: '6px',
                            }}
                          >
                            {selectedLeadSummary.commercialReading}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setIsLeadSummaryExpanded((current) => !current);
                          }}
                          style={{
                            background: '#171717',
                            color: '#aaa',
                            border: '1px solid #303030',
                            borderRadius: '7px',
                            padding: '7px 9px',
                            cursor: 'pointer',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isLeadSummaryExpanded
                            ? 'Ocultar análise'
                            : 'Ver análise completa'}
                        </button>
                      </div>

                      <div
                        style={{
                          background: '#111',
                          border: '1px solid #242424',
                          borderRadius: '9px',
                          padding: '11px',
                          marginTop: '10px',
                        }}
                      >
                        <div
                          style={{
                            color: '#777',
                            fontSize: '0.66rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                          }}
                        >
                          Próxima ação
                        </div>

                        <div
                          style={{
                            color: '#ddd',
                            fontSize: '0.78rem',
                            lineHeight: 1.5,
                            marginTop: '5px',
                          }}
                        >
                          {selectedLeadSummary.nextAction}
                        </div>

                        {selectedLeadSummary.suggestedDate && (
                          <div
                            style={{
                              color: '#c5a059',
                              fontSize: '0.69rem',
                              fontWeight: 700,
                              marginTop: '5px',
                            }}
                          >
                            Data sugerida:{' '}
                            {formatDisplayDate(
                              selectedLeadSummary.suggestedDate,
                            )}
                          </div>
                        )}
                      </div>

                      {isLeadSummaryExpanded && (
                        <div
                          className="lead-details-kpis"
                          style={{ marginTop: '10px' }}
                        >
                          <LeadSummaryMetric
                            label="Último contato"
                            value={
                              selectedLeadSummary.daysWithoutContact === null
                                ? 'Não registrado'
                                : selectedLeadSummary.daysWithoutContact === 0
                                  ? 'Hoje'
                                  : `${selectedLeadSummary.daysWithoutContact} dia(s)`
                            }
                          />

                          <LeadSummaryMetric
                            label="Contatos realizados"
                            value={selectedLeadSummary.contactsCount}
                          />

                          <LeadSummaryMetric
                            label="Tarefas pendentes"
                            value={selectedLeadSummary.pendingTasksCount}
                            alert={
                              selectedLeadSummary.overdueTasksCount > 0
                            }
                          />

                          <LeadSummaryMetric
                            label="Temperatura"
                            value={{
                              frio: 'Frio',
                              morno: 'Morno',
                              quente: 'Quente',
                            }[selectedLead.temperatura || 'morno']}
                          />
                        </div>
                      )}

                      {selectedLeadSummary.alerts.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            gap: '7px',
                            flexWrap: 'wrap',
                            marginTop: '10px',
                          }}
                        >
                          {selectedLeadSummary.alerts.map((alert) => (
                            <span
                              key={alert}
                              style={{
                                padding: '5px 8px',
                                borderRadius: '999px',
                                background: '#1b0d0d',
                                border: '1px solid #472020',
                                color: '#f3a7a7',
                                fontSize: '0.67rem',
                                fontWeight: 700,
                              }}
                            >
                              {alert}
                            </span>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  <div className="lead-details-sections">
                    <section
                      style={{
                        background: '#0d0d0d',
                        border: '1px solid #222',
                        borderRadius: '12px',
                        padding: '14px',
                      }}
                    >
                      <h3
                        style={{
                          color: '#fff',
                          margin: '0 0 12px',
                          fontSize: '0.87rem',
                        }}
                      >
                        Dados comerciais
                      </h3>

                      <div className="lead-details-info-grid">
                        <Info
                          label="Status"
                          value={getStatusTitle(selectedLead.status)}
                        />

                        <Info
                          label="Prioridade"
                          value={{
                            baixa: 'Baixa',
                            media: 'Média',
                            alta: 'Alta',
                            urgente: 'Urgente',
                          }[selectedLead.prioridade || 'media']}
                        />

                        <Info
                          label="Temperatura"
                          value={{
                            frio: 'Frio',
                            morno: 'Morno',
                            quente: 'Quente',
                          }[selectedLead.temperatura || 'morno']}
                        />

                        <Info
                          label="Probabilidade"
                          value={`${Number(
                            selectedLead.probabilidadeFechamento ?? 50,
                          )}%`}
                        />

                        <Info
                          label="Origem"
                          value={selectedLead.origem || 'Não informada'}
                        />

                        <Info
                          label="Campanha"
                          value={selectedLead.campanha || 'Não informada'}
                        />
                      </div>
                    </section>

                    <section
                      style={{
                        background: '#0d0d0d',
                        border: '1px solid #222',
                        borderRadius: '12px',
                        padding: '14px',
                      }}
                    >
                      <h3
                        style={{
                          color: '#fff',
                          margin: '0 0 12px',
                          fontSize: '0.87rem',
                        }}
                      >
                        Contato e evento
                      </h3>

                      <div className="lead-details-info-grid">
                        <Info
                          label="Telefone"
                          value={selectedLead.telefone || 'Não informado'}
                        />

                        <Info
                          label="WhatsApp"
                          value={
                            selectedLead.whatsapp
                            || selectedLead.telefone
                            || 'Não informado'
                          }
                        />

                        <Info
                          label="Cidade"
                          value={selectedLead.cidade || 'Não informada'}
                        />

                        <Info
                          label="Data do evento"
                          value={formatDisplayDate(
                            selectedLead.dataEvento,
                          )}
                        />

                        <Info
                          label="Primeiro contato"
                          value={formatDisplayDate(
                            selectedLead.dataPrimeiroContato,
                          )}
                        />

                        <Info
                          label="Último contato"
                          value={formatDisplayDate(
                            selectedLead.dataUltimoContato,
                          )}
                        />
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {leadDetailTab === 'jornada' && (
                <LeadJourneyTimeline
                  items={selectedLeadJourney}
                />
              )}

              {leadDetailTab === 'documentos' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '12px',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      marginBottom: '12px',
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          margin: 0,
                          color: '#fff',
                          fontSize: '0.9rem',
                        }}
                      >
                        Centro de documentos
                      </h3>

                      <div
                        style={{
                          color: '#777',
                          fontSize: '0.7rem',
                          marginTop: '4px',
                        }}
                      >
                        {selectedLeadDocuments.length} documento(s)
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openDocumentModal(selectedLead)}
                      style={{
                        background: '#18130a',
                        color: '#d8b56e',
                        border: '1px solid #3a2d16',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 800,
                        fontSize: '0.74rem',
                      }}
                    >
                      Adicionar documento
                    </button>
                  </div>

                  {selectedLeadDocuments.length > 0 ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(230px, 1fr))',
                        gap: '10px',
                      }}
                    >
                      {selectedLeadDocuments.map((document) => (
                        <LeadDocumentCard
                          key={document.id}
                          document={document}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        color: '#666',
                        border: '1px dashed #292929',
                        borderRadius: '10px',
                        padding: '16px',
                        textAlign: 'center',
                        fontSize: '0.8rem',
                      }}
                    >
                      Nenhum documento vinculado a este lead.
                    </div>
                  )}
                </div>
              )}

              {leadDetailTab === 'auditoria' && (
                <div>
                  <div
                    style={{
                      marginBottom: '12px',
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        color: '#fff',
                        fontSize: '0.9rem',
                      }}
                    >
                      Auditoria do lead
                    </h3>

                    <div
                      style={{
                        color: '#777',
                        fontSize: '0.7rem',
                        marginTop: '4px',
                      }}
                    >
                      Registro de quem realizou cada ação.
                    </div>
                  </div>

                  {selectedLeadAudit.length > 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      {selectedLeadAudit.map((item) => (
                        <div
                          key={`audit-${item.id}`}
                          style={{
                            background: '#0d0d0d',
                            border: '1px solid #242424',
                            borderRadius: '10px',
                            padding: '11px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '12px',
                            alignItems: 'flex-start',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                color: '#ddd',
                                fontSize: '0.78rem',
                                fontWeight: 800,
                              }}
                            >
                              {item.title}
                            </div>

                            <div
                              style={{
                                color: '#777',
                                fontSize: '0.69rem',
                                marginTop: '5px',
                                lineHeight: 1.45,
                              }}
                            >
                              {item.description || 'Ação registrada no CRM'}
                            </div>
                          </div>

                          <div
                            style={{
                              textAlign: 'right',
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                color: '#c5a059',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                              }}
                            >
                              {item.actor}
                            </div>

                            <div
                              style={{
                                color: '#666',
                                fontSize: '0.65rem',
                                marginTop: '4px',
                              }}
                            >
                              {formatDisplayDateTime(item.date)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        color: '#666',
                        border: '1px dashed #292929',
                        borderRadius: '10px',
                        padding: '16px',
                        textAlign: 'center',
                        fontSize: '0.8rem',
                      }}
                    >
                      Nenhuma ação de auditoria disponível.
                    </div>
                  )}
                </div>
              )}

              {leadDetailTab === 'historico' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '12px',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      marginBottom: '12px',
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          margin: 0,
                          color: '#fff',
                          fontSize: '0.9rem',
                        }}
                      >
                        Histórico comercial
                      </h3>

                      <div
                        style={{
                          color: '#777',
                          fontSize: '0.7rem',
                          marginTop: '4px',
                        }}
                      >
                        {historySummary.visible} de {historySummary.total}{' '}
                        registro(s)
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenContactModal}
                      style={{
                        background: '#c5a059',
                        color: '#17120c',
                        border: 'none',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 800,
                        fontSize: '0.74rem',
                      }}
                    >
                      Registrar contato
                    </button>
                  </div>

                  <div
                    style={{
                      background: '#0d0d0d',
                      border: '1px solid #222',
                      borderRadius: '10px',
                      padding: '12px',
                      marginBottom: '12px',
                    }}
                  >
                    <div className="lead-details-history-filters">
                      <label style={{ minWidth: 0 }}>
                        <span
                          style={{
                            height: '40px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            border: '1px solid #303030',
                            borderRadius: '8px',
                            background: '#111',
                            padding: '0 10px',
                            boxSizing: 'border-box',
                          }}
                        >
                          <Search size={15} color="#777" />

                          <input
                            type="text"
                            value={historyFilters.search}
                            placeholder="Buscar no histórico"
                            onChange={(event) => {
                              handleHistoryFilterChange(
                                'search',
                                event.target.value,
                              );
                            }}
                            style={{
                              width: '100%',
                              minWidth: 0,
                              height: '100%',
                              background: 'transparent',
                              border: 'none',
                              outline: 'none',
                              color: '#fff',
                            }}
                          />
                        </span>
                      </label>

                      <select
                        value={historyFilters.type}
                        onChange={(event) => {
                          handleHistoryFilterChange(
                            'type',
                            event.target.value,
                          );
                        }}
                        style={{
                          ...formInputStyle,
                          padding: '9px 10px',
                          height: '40px',
                        }}
                      >
                        <option value="">Todos os tipos</option>
                        <option value="contato">Contatos</option>
                        <option value="nota">Notas rápidas</option>
                        <option value="tarefa">Tarefas</option>
                        <option value="status">Mudanças de status</option>
                        <option value="followup">Follow-ups</option>
                        <option value="outro">Outros registros</option>
                      </select>

                      <select
                        value={historyFilters.period}
                        onChange={(event) => {
                          handleHistoryFilterChange(
                            'period',
                            event.target.value,
                          );
                        }}
                        style={{
                          ...formInputStyle,
                          padding: '9px 10px',
                          height: '40px',
                        }}
                      >
                        <option value="todos">Todo o período</option>
                        <option value="7_dias">Últimos 7 dias</option>
                        <option value="30_dias">Últimos 30 dias</option>
                        <option value="90_dias">Últimos 90 dias</option>
                      </select>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    {selectedLeadHistory.length > 0 ? (
                      selectedLeadHistory.map((item, index) => (
                        <div
                          key={item.id || `${item.data}-${index}`}
                          style={{
                            position: 'relative',
                            paddingLeft: '22px',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: '14px',
                              width: '9px',
                              height: '9px',
                              borderRadius: '50%',
                              background: '#c5a059',
                              boxShadow:
                                '0 0 0 4px rgba(197,160,89,0.12)',
                            }}
                          />

                          {index < selectedLeadHistory.length - 1 && (
                            <span
                              style={{
                                position: 'absolute',
                                left: '4px',
                                top: '25px',
                                bottom: '-15px',
                                width: '1px',
                                background: '#2b2b2b',
                              }}
                            />
                          )}

                          <HistoryItem item={item} />
                        </div>
                      ))
                    ) : (
                      <div
                        style={{
                          color: '#666',
                          border: '1px dashed #292929',
                          borderRadius: '10px',
                          padding: '16px',
                          textAlign: 'center',
                          fontSize: '0.8rem',
                        }}
                      >
                        Nenhum registro encontrado.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {leadDetailTab === 'tarefas' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '12px',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      marginBottom: '12px',
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          margin: 0,
                          color: '#fff',
                          fontSize: '0.9rem',
                        }}
                      >
                        Tarefas do lead
                      </h3>

                      <div
                        style={{
                          color: '#777',
                          fontSize: '0.7rem',
                          marginTop: '4px',
                        }}
                      >
                        {selectedLeadTasks.filter(
                          (task) => !task.concluida,
                        ).length}{' '}
                        pendente(s)
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openTaskModal(selectedLead)}
                      style={{
                        background: '#0d1726',
                        color: '#93c5fd',
                        border: '1px solid #1f3b63',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 800,
                        fontSize: '0.74rem',
                      }}
                    >
                      Nova tarefa
                    </button>
                  </div>

                  {selectedLeadTasks.length > 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '9px',
                      }}
                    >
                      {selectedLeadTasks.map((task) => {
                        const category = getTaskCategory(task);

                        return (
                          <div
                            key={task.id}
                            style={{
                              background: task.concluida
                                ? '#0d1b16'
                                : category === 'atrasada'
                                  ? '#1b0d0d'
                                  : '#0d0d0d',
                              border: task.concluida
                                ? '1px solid #1f4939'
                                : category === 'atrasada'
                                  ? '1px solid #472020'
                                  : '1px solid #242424',
                              borderRadius: '10px',
                              padding: '12px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: '12px',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  color: task.concluida
                                    ? '#70d6a2'
                                    : '#ddd',
                                  fontSize: '0.79rem',
                                  fontWeight: 800,
                                }}
                              >
                                {task.titulo}
                              </div>

                              <div
                                style={{
                                  color: '#777',
                                  fontSize: '0.69rem',
                                  marginTop: '5px',
                                }}
                              >
                                {task.responsavel} ·{' '}
                                {task.prazo
                                  ? formatDisplayDate(task.prazo)
                                  : 'Sem prazo'}
                              </div>
                            </div>

                            {!task.concluida && (
                              <button
                                type="button"
                                onClick={() => {
                                  void completeCommercialTask(task);
                                }}
                                style={{
                                  background: '#0d1b16',
                                  color: '#70d6a2',
                                  border: '1px solid #1f4939',
                                  borderRadius: '7px',
                                  padding: '7px 9px',
                                  cursor: 'pointer',
                                  fontSize: '0.67rem',
                                  fontWeight: 800,
                                }}
                              >
                                Concluir
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      style={{
                        color: '#666',
                        border: '1px dashed #292929',
                        borderRadius: '10px',
                        padding: '16px',
                        textAlign: 'center',
                        fontSize: '0.8rem',
                      }}
                    >
                      Nenhuma tarefa cadastrada.
                    </div>
                  )}
                </div>
              )}

              {leadDetailTab === 'observacoes' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <section
                    style={{
                      background: '#0d0d0d',
                      border: '1px solid #222',
                      borderRadius: '12px',
                      padding: '14px',
                    }}
                  >
                    <h3
                      style={{
                        color: '#fff',
                        margin: '0 0 10px',
                        fontSize: '0.88rem',
                      }}
                    >
                      Observações
                    </h3>

                    <div
                      style={{
                        color: selectedLead.observacoes
                          ? '#bbb'
                          : '#666',
                        fontSize: '0.79rem',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {selectedLead.observacoes
                        || 'Nenhuma observação registrada.'}
                    </div>
                  </section>

                  <section
                    style={{
                      background: '#0d0d0d',
                      border: '1px solid #222',
                      borderRadius: '12px',
                      padding: '14px',
                    }}
                  >
                    <div className="lead-details-info-grid">
                      <Info
                        label="Indicação"
                        value={selectedLead.indicacao || 'Não informada'}
                      />

                      <Info
                        label="Campanha"
                        value={selectedLead.campanha || 'Não informada'}
                      />

                      <Info
                        label="Próximo follow-up"
                        value={formatDisplayDate(
                          selectedLead.dataProximoFollowup,
                        )}
                      />
                    </div>
                  </section>
                </div>
              )}
            </main>

            <footer
              style={{
                borderTop: '1px solid #202020',
                background: '#0c0c0c',
                padding: '10px 12px',
              }}
            >
              <div className="lead-details-actions">
                <button
                  type="button"
                  onClick={() => openWhatsAppModal(selectedLead)}
                  style={{
                    background: '#102017',
                    color: '#70d6a2',
                    border: '1px solid #214a35',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: '0.71rem',
                  }}
                >
                  WhatsApp
                </button>

                <button
                  type="button"
                  onClick={handleOpenContactModal}
                  style={{
                    background: '#18130a',
                    color: '#d8b56e',
                    border: '1px solid #3a2d16',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: '0.71rem',
                  }}
                >
                  Registrar contato
                </button>

                <button
                  type="button"
                  onClick={() => openTaskModal(selectedLead)}
                  style={{
                    background: '#0d1726',
                    color: '#93c5fd',
                    border: '1px solid #1f3b63',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: '0.71rem',
                  }}
                >
                  Nova tarefa
                </button>

                <button
                  type="button"
                  onClick={() => openQuickNoteModal(selectedLead)}
                  style={{
                    background: '#171717',
                    color: '#bbb',
                    border: '1px solid #303030',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: '0.71rem',
                  }}
                >
                  Nota rápida
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditingLead(selectedLead);
                    setSelectedLead(null);
                    setIsModalOpen(true);
                  }}
                  style={{
                    background: '#171717',
                    color: '#fff',
                    border: '1px solid #333',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: '0.71rem',
                  }}
                >
                  Editar
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void handleUpdateStatus(
                      selectedLead.id,
                      'aprovado',
                    );
                  }}
                  style={{
                    background: '#34d399',
                    color: '#06130d',
                    border: 'none',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 900,
                    fontSize: '0.71rem',
                  }}
                >
                  Converter
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      <Modal
        isOpen={isContactModalOpen}
        onClose={handleCloseContactModal}
        title="Registrar contato"
      >
        <form
          onSubmit={handleRegisterContact}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              background: '#0d0d0d',
              border: '1px solid #222',
              borderRadius: '10px',
              padding: '12px',
            }}
          >
            <div
              style={{
                color: '#777',
                fontSize: '0.74rem',
                marginBottom: '4px',
              }}
            >
              Lead
            </div>

            <div
              style={{
                color: '#fff',
                fontWeight: 700,
              }}
            >
              {selectedLead?.nome || 'Lead selecionado'}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            <label>
              <span style={formLabelStyle}>
                Tipo de contato
              </span>

              <select
                style={formInputStyle}
                value={contactForm.tipoContato}
                onChange={(event) => {
                  handleContactFieldChange(
                    'tipoContato',
                    event.target.value,
                  );
                }}
              >
                {CONTACT_TYPES.map((type) => (
                  <option
                    key={type}
                    value={type}
                  >
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span style={formLabelStyle}>
                Data e horario
              </span>

              <input
                type="datetime-local"
                style={formInputStyle}
                required
                value={contactForm.dataContato}
                max={`${getLocalDateInputValue()}T23:59`}
                onChange={(event) => {
                  handleContactFieldChange(
                    'dataContato',
                    event.target.value,
                  );
                }}
              />
            </label>
          </div>

          <label>
            <span style={formLabelStyle}>
              O que foi conversado
            </span>

            <textarea
              style={{
                ...formInputStyle,
                minHeight: '110px',
                resize: 'vertical',
              }}
              required
              placeholder="Registre os principais pontos da conversa, duvidas do cliente e proximos passos."
              value={contactForm.descricao}
              onChange={(event) => {
                handleContactFieldChange(
                  'descricao',
                  event.target.value,
                );
              }}
            />
          </label>          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            <label>
              <span style={formLabelStyle}>
                Resultado
              </span>

              <select
                style={formInputStyle}
                value={contactForm.resultado}
                onChange={(event) => {
                  handleContactFieldChange(
                    'resultado',
                    event.target.value,
                  );
                }}
              >
                {CONTACT_RESULTS.map((result) => (
                  <option
                    key={result}
                    value={result}
                  >
                    {result}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span style={formLabelStyle}>
                Proximo follow-up
              </span>

              <input
                type="date"
                style={formInputStyle}
                value={contactForm.proximoFollowup}
                onChange={(event) => {
                  handleContactFieldChange(
                    'proximoFollowup',
                    event.target.value,
                  );
                }}
              />
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '4px',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              disabled={isSavingContact}
              onClick={handleCloseContactModal}
              style={{
                background: '#171717',
                color: '#ddd',
                border: '1px solid #333',
                padding: '11px 16px',
                borderRadius: '8px',
                cursor: isSavingContact
                  ? 'not-allowed'
                  : 'pointer',
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={
                isSavingContact
                || !contactForm.descricao.trim()
              }
              style={{
                background: '#c5a059',
                color: '#111',
                border: 'none',
                padding: '11px 16px',
                borderRadius: '8px',
                cursor: isSavingContact
                  ? 'wait'
                  : 'pointer',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: contactForm.descricao.trim()
                  ? 1
                  : 0.6,
              }}
            >
              {isSavingContact && (
                <Loader2
                  size={16}
                  style={{
                    animation: 'spin 1s linear infinite',
                  }}
                />
              )}

              {isSavingContact
                ? 'Salvando...'
                : 'Salvar contato'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isQuickNoteModalOpen}
        onClose={closeQuickNoteModal}
        title="Nota rápida"
      >
        <form
          onSubmit={handleSaveQuickNote}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              background: '#0d0d0d',
              border: '1px solid #222',
              borderRadius: '10px',
              padding: '12px',
            }}
          >
            <div
              style={{
                color: '#777',
                fontSize: '0.74rem',
                marginBottom: '4px',
              }}
            >
              Lead
            </div>

            <div
              style={{
                color: '#fff',
                fontWeight: 700,
              }}
            >
              {
                leads.find(
                  (lead) => lead.id === quickNoteForm.leadId,
                )?.nome || 'Lead selecionado'
              }
            </div>
          </div>

          <label>
            <span style={formLabelStyle}>
              Observação
            </span>

            <textarea
              autoFocus
              required
              style={{
                ...formInputStyle,
                minHeight: '130px',
                resize: 'vertical',
                lineHeight: 1.5,
              }}
              placeholder="Ex.: cliente pediu para retornar após conversar com a família."
              value={quickNoteForm.texto}
              onChange={(event) => {
                setQuickNoteForm((current) => ({
                  ...current,
                  texto: event.target.value,
                }));
              }}
            />
          </label>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              disabled={isSavingQuickNote}
              onClick={closeQuickNoteModal}
              style={{
                background: '#171717',
                color: '#ddd',
                border: '1px solid #333',
                padding: '11px 15px',
                borderRadius: '8px',
                cursor: isSavingQuickNote
                  ? 'not-allowed'
                  : 'pointer',
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={
                isSavingQuickNote
                || !quickNoteForm.texto.trim()
              }
              style={{
                background: '#c5a059',
                color: '#111',
                border: 'none',
                padding: '11px 15px',
                borderRadius: '8px',
                cursor: isSavingQuickNote ? 'wait' : 'pointer',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: quickNoteForm.texto.trim() ? 1 : 0.55,
              }}
            >
              {isSavingQuickNote && (
                <Loader2
                  size={16}
                  style={{
                    animation: 'spin 1s linear infinite',
                  }}
                />
              )}

              {isSavingQuickNote
                ? 'Salvando...'
                : 'Salvar nota'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isTaskModalOpen}
        onClose={closeTaskModal}
        title="Nova tarefa comercial"
      >
        <form
          onSubmit={handleCreateTask}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <label>
            <span style={formLabelStyle}>
              Lead
            </span>

            <select
              required
              style={formInputStyle}
              value={taskForm.leadId}
              onChange={(event) => {
                handleTaskFieldChange('leadId', event.target.value);
              }}
            >
              <option value="">Selecione um lead</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.nome || 'Lead sem nome'}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span style={formLabelStyle}>
              Tarefa
            </span>

            <input
              autoFocus
              required
              type="text"
              style={formInputStyle}
              placeholder="Ex.: confirmar reunião, enviar contrato ou cobrar retorno"
              value={taskForm.titulo}
              onChange={(event) => {
                handleTaskFieldChange('titulo', event.target.value);
              }}
            />
          </label>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '12px',
            }}
          >
            <label>
              <span style={formLabelStyle}>
                Prazo
              </span>

              <input
                type="date"
                style={formInputStyle}
                value={taskForm.prazo}
                onChange={(event) => {
                  handleTaskFieldChange('prazo', event.target.value);
                }}
              />
            </label>

            <label>
              <span style={formLabelStyle}>
                Prioridade
              </span>

              <select
                style={formInputStyle}
                value={taskForm.prioridade}
                onChange={(event) => {
                  handleTaskFieldChange(
                    'prioridade',
                    event.target.value,
                  );
                }}
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </label>
          </div>

          <label>
            <span style={formLabelStyle}>
              Responsável
            </span>

            <input
              type="text"
              style={formInputStyle}
              placeholder="Ex.: Camilla ou Jr"
              value={taskForm.responsavel}
              onChange={(event) => {
                handleTaskFieldChange(
                  'responsavel',
                  event.target.value,
                );
              }}
            />
          </label>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              disabled={isSavingTask}
              onClick={closeTaskModal}
              style={{
                background: '#171717',
                color: '#ddd',
                border: '1px solid #333',
                padding: '11px 15px',
                borderRadius: '8px',
                cursor: isSavingTask ? 'not-allowed' : 'pointer',
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={
                isSavingTask
                || !taskForm.leadId
                || !taskForm.titulo.trim()
              }
              style={{
                background: '#60a5fa',
                color: '#07111f',
                border: 'none',
                padding: '11px 15px',
                borderRadius: '8px',
                cursor: isSavingTask ? 'wait' : 'pointer',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: (
                  taskForm.leadId
                  && taskForm.titulo.trim()
                ) ? 1 : 0.55,
              }}
            >
              {isSavingTask && (
                <Loader2
                  size={16}
                  style={{
                    animation: 'spin 1s linear infinite',
                  }}
                />
              )}

              {isSavingTask ? 'Salvando...' : 'Criar tarefa'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isWhatsAppModalOpen}
        onClose={closeWhatsAppModal}
        title="Mensagem para WhatsApp"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              background: '#0d0d0d',
              border: '1px solid #222',
              borderRadius: '10px',
              padding: '12px',
            }}
          >
            <div
              style={{
                color: '#777',
                fontSize: '0.74rem',
                marginBottom: '4px',
              }}
            >
              Lead
            </div>

            <div
              style={{
                color: '#fff',
                fontWeight: 700,
              }}
            >
              {whatsAppLead?.nome || 'Lead selecionado'}
            </div>

            <div
              style={{
                color: getWhatsAppNumber(whatsAppLead)
                  ? '#8bd9a7'
                  : '#f87171',
                fontSize: '0.78rem',
                marginTop: '5px',
              }}
            >
              {getWhatsAppNumber(whatsAppLead)
                ? (whatsAppLead?.whatsapp || whatsAppLead?.telefone)
                : 'WhatsApp não cadastrado'}
            </div>
          </div>

          <label>
            <span style={formLabelStyle}>
              Mensagem pronta
            </span>

            <select
              style={formInputStyle}
              value={whatsAppTemplateId}
              onChange={(event) => {
                handleWhatsAppTemplateChange(event.target.value);
              }}
            >
              {WHATSAPP_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span style={formLabelStyle}>
              Mensagem
            </span>

            <textarea
              style={{
                ...formInputStyle,
                minHeight: '170px',
                resize: 'vertical',
                lineHeight: 1.5,
              }}
              value={whatsAppMessage}
              onChange={(event) => {
                setWhatsAppMessage(event.target.value);
              }}
            />
          </label>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={copyWhatsAppMessage}
              style={{
                background: '#171717',
                color: '#ddd',
                border: '1px solid #333',
                padding: '11px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Copiar mensagem
            </button>

            <button
              type="button"
              onClick={openWhatsAppConversation}
              disabled={!getWhatsAppNumber(whatsAppLead)}
              style={{
                background: '#25d366',
                color: '#06130d',
                border: 'none',
                padding: '11px 14px',
                borderRadius: '8px',
                cursor: getWhatsAppNumber(whatsAppLead)
                  ? 'pointer'
                  : 'not-allowed',
                fontWeight: 800,
                opacity: getWhatsAppNumber(whatsAppLead) ? 1 : 0.5,
              }}
            >
              Abrir WhatsApp
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isStatusReasonModalOpen}
        onClose={closeStatusReasonModal}
        title={
          statusReasonForm.status === 'perdido'
            ? 'Motivo da perda'
            : 'Motivo do cancelamento'
        }
      >
        <form
          onSubmit={handleConfirmStatusReason}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              background: '#0d0d0d',
              border: '1px solid #222',
              borderRadius: '10px',
              padding: '12px',
            }}
          >
            <div
              style={{
                color: '#777',
                fontSize: '0.74rem',
                marginBottom: '4px',
              }}
            >
              Lead
            </div>

            <div
              style={{
                color: '#fff',
                fontWeight: 700,
              }}
            >
              {
                leads.find(
                  (lead) => lead.id === statusReasonForm.leadId,
                )?.nome || 'Lead selecionado'
              }
            </div>
          </div>

          <div
            style={{
              background: '#1a0d0d',
              border: '1px solid #4a1f1f',
              borderRadius: '10px',
              padding: '12px',
              color: '#e5b1b1',
              fontSize: '0.82rem',
              lineHeight: 1.5,
            }}
          >
            {
              statusReasonForm.status === 'perdido'
                ? 'Informe por que esta oportunidade foi perdida. O motivo ficara salvo no cadastro e no historico comercial.'
                : 'Informe por que esta oportunidade foi cancelada. O motivo ficara salvo no cadastro e no historico comercial.'
            }
          </div>

          <label>
            <span style={formLabelStyle}>
              {
                statusReasonForm.status === 'perdido'
                  ? 'Motivo da perda'
                  : 'Motivo do cancelamento'
              }
            </span>

            <textarea
              autoFocus
              required
              style={{
                ...formInputStyle,
                minHeight: '120px',
                resize: 'vertical',
              }}
              placeholder={
                statusReasonForm.status === 'perdido'
                  ? 'Ex.: cliente escolheu outro profissional, valor acima do orcamento ou data indisponivel.'
                  : 'Ex.: evento cancelado, mudança de data ou desistência do cliente.'
              }
              value={statusReasonForm.motivo}
              onChange={(event) => {
                setStatusReasonForm((current) => ({
                  ...current,
                  motivo: event.target.value,
                }));
              }}
            />
          </label>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              disabled={isSavingStatusReason}
              onClick={closeStatusReasonModal}
              style={{
                background: '#171717',
                color: '#ddd',
                border: '1px solid #333',
                padding: '11px 16px',
                borderRadius: '8px',
                cursor: isSavingStatusReason
                  ? 'not-allowed'
                  : 'pointer',
              }}
            >
              Manter status atual
            </button>

            <button
              type="submit"
              disabled={
                isSavingStatusReason
                || !statusReasonForm.motivo.trim()
              }
              style={{
                background: '#f87171',
                color: '#1a0808',
                border: 'none',
                padding: '11px 16px',
                borderRadius: '8px',
                cursor: isSavingStatusReason
                  ? 'wait'
                  : 'pointer',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: statusReasonForm.motivo.trim()
                  ? 1
                  : 0.6,
              }}
            >
              {isSavingStatusReason && (
                <Loader2
                  size={16}
                  style={{
                    animation: 'spin 1s linear infinite',
                  }}
                />
              )}

              {
                isSavingStatusReason
                  ? 'Salvando...'
                  : statusReasonForm.status === 'perdido'
                    ? 'Marcar como perdido'
                    : 'Marcar como cancelado'
              }
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function SmartFollowupCard({
  lead,
  suggestion,
  onSchedule,
  onWhatsApp,
  onOpenLead,
}) {
  return (
    <div
      style={{
        background: '#111',
        border: suggestion.isOverdue
          ? '1px solid #4a2020'
          : '1px solid #292929',
        borderRadius: '10px',
        padding: '12px',
        minWidth: 0,
      }}
    >
      <button
        type="button"
        onClick={() => onOpenLead(lead)}
        style={{
          width: '100%',
          padding: 0,
          background: 'transparent',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          textAlign: 'left',
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
          <span
            style={{
              fontWeight: 700,
              fontSize: '0.84rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {lead.nome || 'Lead sem nome'}
          </span>

          <span
            style={{
              color: suggestion.isOverdue ? '#f87171' : '#fbbf24',
              fontSize: '0.68rem',
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            {suggestion.isOverdue ? 'URGENTE' : 'ATENÇÃO'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            marginTop: '8px',
          }}
        >
          <span
            style={{
              background: '#18130a',
              border: '1px solid #3a2d16',
              color: '#d8b56e',
              borderRadius: '999px',
              padding: '4px 7px',
              fontSize: '0.66rem',
              fontWeight: 800,
            }}
          >
            Etapa {suggestion.sequenceStep}
          </span>

          <span
            style={{
              background: '#171717',
              border: '1px solid #303030',
              color: '#aaa',
              borderRadius: '999px',
              padding: '4px 7px',
              fontSize: '0.66rem',
              fontWeight: 700,
            }}
          >
            {suggestion.ruleTitle}
          </span>
        </div>

        <div
          style={{
            color: '#888',
            fontSize: '0.73rem',
            lineHeight: 1.45,
            marginTop: '7px',
          }}
        >
          {suggestion.reason}
        </div>
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: '#a78bfa',
          fontSize: '0.72rem',
          fontWeight: 600,
          marginTop: '9px',
        }}
      >
        <CalendarClock size={14} />
        Sugestão: {formatDisplayDate(suggestion.suggestedDate)}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '7px',
          marginTop: '10px',
        }}
      >
        <button
          type="button"
          onClick={() => onSchedule(lead, suggestion)}
          style={{
            background: '#c5a059',
            color: '#17120c',
            border: 'none',
            borderRadius: '7px',
            padding: '8px',
            cursor: 'pointer',
            fontSize: '0.71rem',
            fontWeight: 800,
          }}
        >
          Agendar
        </button>

        <button
          type="button"
          onClick={() => onWhatsApp(lead, suggestion)}
          style={{
            background: '#17351f',
            color: '#9ee6b5',
            border: '1px solid #285b36',
            borderRadius: '7px',
            padding: '8px',
            cursor: 'pointer',
            fontSize: '0.71rem',
            fontWeight: 800,
          }}
        >
          WhatsApp
        </button>
      </div>
    </div>
  );
}

function DailyActionCard({
  action,
  onOpenLead,
  onRegisterContact,
  onWhatsApp,
  onCompleteTask,
}) {
  const lead = action.lead;

  return (
    <div
      style={{
        background: action.background,
        border: `1px solid ${action.border}`,
        borderRadius: '11px',
        padding: '13px',
        minWidth: 0,
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
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: action.color,
              fontSize: '0.73rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            {action.title}
          </div>

          <div
            style={{
              color: '#fff',
              fontSize: '0.86rem',
              fontWeight: 700,
              marginTop: '6px',
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {action.description}
          </div>
        </div>

        {action.date && (
          <span
            style={{
              color: '#aaa',
              fontSize: '0.7rem',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {formatDisplayDate(action.date)}
          </span>
        )}
      </div>

      {lead && (
        <div
          style={{
            color: '#777',
            fontSize: '0.72rem',
            marginTop: '7px',
          }}
        >
          {lead.tipoServico || 'Serviço não informado'}
          {action.task?.responsavel
            ? ` · ${action.task.responsavel}`
            : ''}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '7px',
          flexWrap: 'wrap',
          marginTop: '11px',
        }}
      >
        <button
          type="button"
          onClick={() => onOpenLead(lead)}
          style={{
            background: '#171717',
            color: '#ddd',
            border: '1px solid #333',
            padding: '8px 9px',
            borderRadius: '7px',
            cursor: 'pointer',
            fontSize: '0.72rem',
            fontWeight: 700,
          }}
        >
          Abrir lead
        </button>

        {action.type === 'task' ? (
          <button
            type="button"
            onClick={() => onCompleteTask(action.task)}
            style={{
              background: '#12301f',
              color: '#8fe2af',
              border: '1px solid #245d3a',
              padding: '8px 9px',
              borderRadius: '7px',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <CheckCircle2 size={14} />
            Concluir
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onRegisterContact(lead)}
              style={{
                background: '#18130a',
                color: '#d8b56e',
                border: '1px solid #3a2d16',
                padding: '8px 9px',
                borderRadius: '7px',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: 700,
              }}
            >
              Registrar contato
            </button>

            <button
              type="button"
              onClick={() => onWhatsApp(lead)}
              style={{
                background: '#12301f',
                color: '#8fe2af',
                border: '1px solid #245d3a',
                padding: '8px 9px',
                borderRadius: '7px',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: 700,
              }}
            >
              WhatsApp
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TaskColumn({
  title,
  tasks,
  color,
  emptyText,
  onOpenLead,
  onComplete,
}) {
  return (
    <div
      style={{
        background: '#0d0d0d',
        border: '1px solid #202020',
        borderRadius: '12px',
        padding: '12px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            color: '#ddd',
            fontSize: '0.84rem',
            fontWeight: 700,
          }}
        >
          {title === 'Atrasadas'
            ? <AlertTriangle size={15} color={color} />
            : <ClipboardList size={15} color={color} />}
          {title}
        </div>

        <span
          style={{
            minWidth: '26px',
            height: '26px',
            borderRadius: '999px',
            background: '#161616',
            border: '1px solid #292929',
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.76rem',
            fontWeight: 800,
            padding: '0 7px',
          }}
        >
          {tasks.length}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxHeight: '380px',
          overflowY: 'auto',
          paddingRight: '2px',
        }}
      >
        {tasks.length === 0 ? (
          <div
            style={{
              border: '1px dashed #292929',
              borderRadius: '9px',
              padding: '14px',
              color: '#626262',
              fontSize: '0.78rem',
              lineHeight: 1.4,
              textAlign: 'center',
            }}
          >
            {emptyText}
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              style={{
                background: '#111',
                border: '1px solid #242424',
                borderRadius: '10px',
                padding: '11px',
              }}
            >
              <div
                style={{
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  lineHeight: 1.4,
                }}
              >
                {task.titulo}
              </div>

              <div
                style={{
                  color: '#777',
                  fontSize: '0.73rem',
                  marginTop: '5px',
                }}
              >
                {task.leadName}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '7px',
                  flexWrap: 'wrap',
                  marginTop: '9px',
                }}
              >
                <span
                  style={{
                    color: TASK_PRIORITY_COLORS[
                      task.prioridade || 'media'
                    ],
                    background: '#171717',
                    border: '1px solid #292929',
                    borderRadius: '999px',
                    padding: '4px 7px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                  }}
                >
                  {TASK_PRIORITY_LABELS[
                    task.prioridade || 'media'
                  ]}
                </span>

                <span
                  style={{
                    color,
                    background: '#171717',
                    border: '1px solid #292929',
                    borderRadius: '999px',
                    padding: '4px 7px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                  }}
                >
                  {task.prazo
                    ? formatDisplayDate(task.prazo)
                    : 'Sem prazo'}
                </span>
              </div>

              <div
                style={{
                  color: '#666',
                  fontSize: '0.7rem',
                  marginTop: '8px',
                }}
              >
                Responsável: {task.responsavel || 'Camilla'}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '7px',
                  marginTop: '10px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onOpenLead(task.lead);
                  }}
                  style={{
                    flex: '1 1 90px',
                    background: '#191919',
                    color: '#ddd',
                    border: '1px solid #303030',
                    borderRadius: '7px',
                    padding: '8px 9px',
                    cursor: 'pointer',
                    fontSize: '0.73rem',
                    fontWeight: 600,
                  }}
                >
                  Abrir lead
                </button>

                <button
                  type="button"
                  onClick={() => onComplete(task)}
                  style={{
                    flex: '1 1 110px',
                    background: '#12301f',
                    color: '#8fe2af',
                    border: '1px solid #245d3a',
                    borderRadius: '7px',
                    padding: '8px 9px',
                    cursor: 'pointer',
                    fontSize: '0.73rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <CheckCircle2 size={14} />
                  Concluir
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LeadJourneyTimeline({ items = [] }) {
  if (!items.length) {
    return (
      <div
        style={{
          color: '#666',
          border: '1px dashed #292929',
          borderRadius: '10px',
          padding: '16px',
          textAlign: 'center',
          fontSize: '0.8rem',
        }}
      >
        Nenhum marco disponível na jornada deste lead.
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          style={{
            position: 'relative',
            paddingLeft: '24px',
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: '15px',
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              background: item.category === 'evento'
                ? '#2dd4bf'
                : item.category === 'orcamento'
                  ? '#c5a059'
                  : '#60a5fa',
              boxShadow: '0 0 0 4px rgba(96,165,250,0.1)',
            }}
          />

          {index < items.length - 1 && (
            <span
              style={{
                position: 'absolute',
                left: '4px',
                top: '26px',
                bottom: '-16px',
                width: '1px',
                background: '#2a2a2a',
              }}
            />
          )}

          <div
            style={{
              background: '#0d0d0d',
              border: '1px solid #242424',
              borderRadius: '10px',
              padding: '11px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                alignItems: 'flex-start',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: '#ddd',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                  }}
                >
                  {item.title}
                </div>

                {item.description && (
                  <div
                    style={{
                      color: '#777',
                      fontSize: '0.69rem',
                      lineHeight: 1.45,
                      marginTop: '5px',
                    }}
                  >
                    {item.description}
                  </div>
                )}
              </div>

              <div
                style={{
                  color: '#666',
                  fontSize: '0.65rem',
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                <div>{formatDisplayDateTime(item.date)}</div>
                <div
                  style={{
                    color: '#c5a059',
                    marginTop: '4px',
                  }}
                >
                  {item.actor}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LeadDocumentCard({ document }) {
  const canOpen = Boolean(document.url);

  return (
    <div
      style={{
        background: '#0d0d0d',
        border: '1px solid #242424',
        borderRadius: '10px',
        padding: '12px',
      }}
    >
      <div
        style={{
          color: '#c5a059',
          fontSize: '0.68rem',
          fontWeight: 800,
          textTransform: 'uppercase',
        }}
      >
        {document.tipoDocumento}
      </div>

      <div
        style={{
          color: '#ddd',
          fontSize: '0.8rem',
          fontWeight: 800,
          marginTop: '6px',
          wordBreak: 'break-word',
        }}
      >
        {document.titulo}
      </div>

      {document.observacao && (
        <div
          style={{
            color: '#777',
            fontSize: '0.7rem',
            lineHeight: 1.45,
            marginTop: '6px',
          }}
        >
          {document.observacao}
        </div>
      )}

      <div
        style={{
          color: '#666',
          fontSize: '0.65rem',
          marginTop: '8px',
        }}
      >
        {document.usuario}
        {document.data
          ? ` · ${formatDisplayDate(document.data)}`
          : ''}
      </div>

      {canOpen && (
        <button
          type="button"
          onClick={() => {
            window.open(
              document.url,
              '_blank',
              'noopener,noreferrer',
            );
          }}
          style={{
            width: '100%',
            marginTop: '10px',
            background: '#171717',
            color: '#bbb',
            border: '1px solid #303030',
            borderRadius: '7px',
            padding: '8px',
            cursor: 'pointer',
            fontSize: '0.68rem',
            fontWeight: 800,
          }}
        >
          Abrir documento
        </button>
      )}
    </div>
  );
}

function NotificationSummaryCard({
  label,
  value,
  color,
}) {
  return (
    <div
      style={{
        background: '#0d0d0d',
        border: '1px solid #242424',
        borderRadius: '9px',
        padding: '10px',
      }}
    >
      <div
        style={{
          color: '#666',
          fontSize: '0.65rem',
          marginBottom: '5px',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color,
          fontSize: '1.05rem',
          fontWeight: 900,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function AssistantMetric({
  label,
  value,
  color,
  compact = false,
}) {
  return (
    <div
      style={{
        background: '#0b0b0b',
        border: '1px solid #242424',
        borderRadius: '9px',
        padding: '10px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: '#666',
          fontSize: '0.65rem',
          marginBottom: '5px',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color,
          fontSize: compact ? '0.78rem' : '1.05rem',
          fontWeight: 900,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CommercialAgendaItem({
  item,
  renewing,
  onOpenLead,
  onRenewBudget,
  onCompleteTask,
}) {
  const timingStyle = item.timing === 'atrasado'
    ? {
        background: '#1b0d0d',
        border: '#472020',
        color: '#f87171',
      }
    : item.timing === 'hoje'
      ? {
          background: '#1c1608',
          border: '#493817',
          color: '#fbbf24',
        }
      : {
          background: '#0d0d0d',
          border: '#242424',
          color: item.color,
        };

  return (
    <div
      style={{
        background: timingStyle.background,
        border: `1px solid ${timingStyle.border}`,
        borderRadius: '10px',
        padding: '11px',
        display: 'grid',
        gridTemplateColumns:
          'minmax(95px, 0.7fr) minmax(150px, 1.5fr) minmax(110px, 0.8fr) auto',
        gap: '10px',
        alignItems: 'center',
      }}
    >
      <div>
        <div
          style={{
            color: timingStyle.color,
            fontSize: '0.68rem',
            fontWeight: 800,
            textTransform: 'uppercase',
          }}
        >
          {item.label}
        </div>

        <div
          style={{
            color: '#aaa',
            fontSize: '0.72rem',
            marginTop: '4px',
          }}
        >
          {formatDisplayDate(item.date)}
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: '#ddd',
            fontSize: '0.8rem',
            fontWeight: 800,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </div>

        <div
          style={{
            color: '#777',
            fontSize: '0.7rem',
            marginTop: '4px',
          }}
        >
          {item.description}
        </div>
      </div>

      <div
        style={{
          color: timingStyle.color,
          fontSize: '0.72rem',
          fontWeight: 700,
        }}
      >
        {item.timing === 'atrasado'
          ? 'Atrasado'
          : item.timing === 'hoje'
            ? 'Hoje'
            : 'Próximo'}
      </div>

      <div
        style={{
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}
      >
        {item.type === 'budget' && (
          <button
            type="button"
            disabled={renewing}
            onClick={() => onRenewBudget(item.lead, 30)}
            style={{
              background: '#18130a',
              color: '#d8b56e',
              border: '1px solid #3a2d16',
              borderRadius: '7px',
              padding: '7px 9px',
              fontSize: '0.68rem',
              fontWeight: 800,
              cursor: renewing ? 'wait' : 'pointer',
              opacity: renewing ? 0.65 : 1,
            }}
          >
            {renewing ? 'Renovando...' : 'Renovar 30 dias'}
          </button>
        )}

        {item.type === 'task' && item.task && (
          <button
            type="button"
            onClick={() => onCompleteTask(item.task)}
            style={{
              background: '#0d1b16',
              color: '#70d6a2',
              border: '1px solid #1f4939',
              borderRadius: '7px',
              padding: '7px 9px',
              fontSize: '0.68rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Concluir
          </button>
        )}

        <button
          type="button"
          onClick={() => onOpenLead(item.lead)}
          style={{
            background: '#171717',
            color: '#bbb',
            border: '1px solid #303030',
            borderRadius: '7px',
            padding: '7px 9px',
            fontSize: '0.68rem',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Ver lead
        </button>
      </div>
    </div>
  );
}

function RecoveryOpportunityCard({
  opportunity,
  isReopening,
  onOpenLead,
  onWhatsApp,
  onReactivate,
  onRegisterContact,
}) {
  const {
    lead,
    isClosed,
    daysWithoutContact,
    recoveryScore,
    reason,
    value,
  } = opportunity;

  const scoreColor = recoveryScore >= 75
    ? '#34d399'
    : recoveryScore >= 50
      ? '#fbbf24'
      : '#a78bfa';

  return (
    <div
      style={{
        background: '#0d0d0d',
        border: '1px solid #242424',
        borderRadius: '11px',
        padding: '13px',
        minWidth: 0,
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
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: '#fff',
              fontSize: '0.86rem',
              fontWeight: 800,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={lead.nome || 'Lead sem nome'}
          >
            {lead.nome || 'Lead sem nome'}
          </div>

          <div
            style={{
              color: '#777',
              fontSize: '0.72rem',
              marginTop: '4px',
            }}
          >
            {lead.tipoServico || 'Serviço não informado'}
          </div>
        </div>

        <span
          style={{
            padding: '5px 7px',
            borderRadius: '999px',
            background: '#151515',
            border: `1px solid ${scoreColor}`,
            color: scoreColor,
            fontSize: '0.68rem',
            fontWeight: 800,
            whiteSpace: 'nowrap',
          }}
        >
          {recoveryScore}% recuperável
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          marginTop: '11px',
        }}
      >
        <div
          style={{
            background: '#111',
            border: '1px solid #222',
            borderRadius: '8px',
            padding: '9px',
          }}
        >
          <div
            style={{
              color: '#666',
              fontSize: '0.66rem',
            }}
          >
            Valor
          </div>

          <div
            style={{
              color: '#34d399',
              fontSize: '0.78rem',
              fontWeight: 800,
              marginTop: '4px',
            }}
          >
            {formatSummaryCurrency(value)}
          </div>
        </div>

        <div
          style={{
            background: '#111',
            border: '1px solid #222',
            borderRadius: '8px',
            padding: '9px',
          }}
        >
          <div
            style={{
              color: '#666',
              fontSize: '0.66rem',
            }}
          >
            Sem contato
          </div>

          <div
            style={{
              color: daysWithoutContact >= 30
                ? '#f87171'
                : '#fbbf24',
              fontSize: '0.78rem',
              fontWeight: 800,
              marginTop: '4px',
            }}
          >
            {daysWithoutContact} dia(s)
          </div>
        </div>
      </div>

      <div
        style={{
          background: isClosed ? '#1b0d0d' : '#18130a',
          border: isClosed
            ? '1px solid #472020'
            : '1px solid #493817',
          borderRadius: '8px',
          padding: '9px',
          color: isClosed ? '#e8aaaa' : '#d8bd78',
          fontSize: '0.72rem',
          lineHeight: 1.45,
          marginTop: '9px',
        }}
      >
        <strong>
          {isClosed ? 'Motivo anterior:' : 'Alerta:'}
        </strong>{' '}
        {reason}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '7px',
          marginTop: '11px',
        }}
      >
        <button
          type="button"
          onClick={() => onWhatsApp(opportunity)}
          style={{
            flex: '1 1 90px',
            background: '#102017',
            color: '#70d6a2',
            border: '1px solid #214a35',
            borderRadius: '7px',
            padding: '8px',
            cursor: 'pointer',
            fontSize: '0.7rem',
            fontWeight: 800,
          }}
        >
          WhatsApp
        </button>

        {isClosed ? (
          <button
            type="button"
            disabled={isReopening}
            onClick={() => onReactivate(opportunity)}
            style={{
              flex: '1 1 90px',
              background: '#171126',
              color: '#c4b5fd',
              border: '1px solid #33244f',
              borderRadius: '7px',
              padding: '8px',
              cursor: isReopening ? 'wait' : 'pointer',
              fontSize: '0.7rem',
              fontWeight: 800,
              opacity: isReopening ? 0.65 : 1,
            }}
          >
            {isReopening ? 'Reabrindo...' : 'Reabrir lead'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onRegisterContact(lead)}
            style={{
              flex: '1 1 90px',
              background: '#18130a',
              color: '#d8b56e',
              border: '1px solid #3a2d16',
              borderRadius: '7px',
              padding: '8px',
              cursor: 'pointer',
              fontSize: '0.7rem',
              fontWeight: 800,
            }}
          >
            Registrar contato
          </button>
        )}

        <button
          type="button"
          onClick={() => onOpenLead(lead)}
          style={{
            flex: '1 1 80px',
            background: '#171717',
            color: '#bbb',
            border: '1px solid #303030',
            borderRadius: '7px',
            padding: '8px',
            cursor: 'pointer',
            fontSize: '0.7rem',
            fontWeight: 800,
          }}
        >
          Ver lead
        </button>
      </div>
    </div>
  );
}

function FollowupSummaryCard({
  label,
  value,
  color,
  background,
  border,
}) {
  return (
    <div
      style={{
        background,
        border: `1px solid ${border}`,
        borderRadius: '10px',
        padding: '12px',
      }}
    >
      <div
        style={{
          color,
          fontSize: '1.25rem',
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        {value}
      </div>

      <div
        style={{
          color: '#aaa',
          fontSize: '0.76rem',
          marginTop: '6px',
        }}
      >
        {label}
      </div>
    </div>
  );
}

function FollowupColumn({
  title,
  leads,
  emptyText,
  color,
  onOpenLead,
  onRegisterContact,
}) {
  return (
    <div
      style={{
        background: '#0d0d0d',
        border: '1px solid #202020',
        borderRadius: '12px',
        padding: '12px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            color: '#ddd',
            fontSize: '0.84rem',
            fontWeight: 700,
          }}
        >
          <Clock3 size={15} color={color} />
          {title}
        </div>

        <span
          style={{
            minWidth: '26px',
            height: '26px',
            borderRadius: '999px',
            background: '#161616',
            border: '1px solid #292929',
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.76rem',
            fontWeight: 800,
            padding: '0 7px',
          }}
        >
          {leads.length}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxHeight: '360px',
          overflowY: 'auto',
          paddingRight: '2px',
        }}
      >
        {leads.length === 0 ? (
          <div
            style={{
              border: '1px dashed #292929',
              borderRadius: '9px',
              padding: '14px',
              color: '#626262',
              fontSize: '0.78rem',
              lineHeight: 1.4,
              textAlign: 'center',
            }}
          >
            {emptyText}
          </div>
        ) : (
          leads.map((lead) => (
            <div
              key={lead.id}
              style={{
                background: '#111',
                border: '1px solid #242424',
                borderRadius: '10px',
                padding: '11px',
              }}
            >
              <button
                type="button"
                onClick={() => onOpenLead(lead)}
                style={{
                  width: '100%',
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {lead.nome || 'Lead sem nome'}
                </div>

                <div
                  style={{
                    color: '#777',
                    fontSize: '0.73rem',
                    marginTop: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {lead.tipoServico || 'Serviço não informado'}
                </div>
              </button>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color,
                  fontSize: '0.73rem',
                  marginTop: '9px',
                  fontWeight: 600,
                }}
              >
                <CalendarClock size={14} />
                {getLeadFollowupValue(lead)
                  ? formatDisplayDate(getLeadFollowupValue(lead))
                  : 'Sem retorno agendado'}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '7px',
                  marginTop: '10px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => onOpenLead(lead)}
                  style={{
                    flex: '1 1 90px',
                    background: '#191919',
                    color: '#ddd',
                    border: '1px solid #303030',
                    borderRadius: '7px',
                    padding: '8px 9px',
                    cursor: 'pointer',
                    fontSize: '0.73rem',
                    fontWeight: 600,
                  }}
                >
                  Abrir lead
                </button>

                <button
                  type="button"
                  onClick={() => onRegisterContact(lead)}
                  style={{
                    flex: '1 1 120px',
                    background: '#c5a059',
                    color: '#17120c',
                    border: 'none',
                    borderRadius: '7px',
                    padding: '8px 9px',
                    cursor: 'pointer',
                    fontSize: '0.73rem',
                    fontWeight: 800,
                  }}
                >
                  Registrar contato
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function HistoryItem({ item }) {
  const isContact = item?.tipo === 'contato';

  return (
    <div
      style={{
        background: isContact ? '#111' : 'transparent',
        border: isContact
          ? '1px solid #252525'
          : 'none',
        borderBottom: isContact
          ? '1px solid #252525'
          : '1px solid #222',
        borderRadius: isContact ? '10px' : 0,
        padding: isContact
          ? '12px'
          : '0 0 8px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            color: isContact ? '#ddd' : '#888',
            fontSize: '0.84rem',
            fontWeight: isContact ? 700 : 400,
          }}
        >
          {getHistoryTitle(item)}
        </div>

        <div
          style={{
            color: '#777',
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
          }}
        >
          {formatDisplayDateTime(item.data)}
        </div>
      </div>

      {getHistoryDescription(item) && (
        <div
          style={{
            color: '#aaa',
            fontSize: '0.82rem',
            lineHeight: 1.5,
            marginTop: '8px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {getHistoryDescription(item)}
        </div>
      )}

      {isContact && item.resultado && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '9px',
            fontSize: '0.76rem',
          }}
        >
          <span style={{ color: '#666' }}>
            Resultado:
          </span>

          <span
            style={{
              color: '#c5a059',
              fontWeight: 600,
            }}
          >
            {item.resultado}
          </span>
        </div>
      )}

      {isContact && item.proximoFollowup && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '6px',
            fontSize: '0.76rem',
          }}
        >
          <span style={{ color: '#666' }}>
            Proximo follow-up:
          </span>

          <span
            style={{
              color: '#a78bfa',
              fontWeight: 600,
            }}
          >
            {formatDisplayDate(item.proximoFollowup)}
          </span>
        </div>
      )}
    </div>
  );
}

function LeadDetailKpi({
  label,
  value,
  color,
  compact = false,
}) {
  return (
    <div
      style={{
        background: '#0d0d0d',
        border: '1px solid #242424',
        borderRadius: '10px',
        padding: '11px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: '#666',
          fontSize: '0.65rem',
          marginBottom: '5px',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color,
          fontSize: compact ? '0.78rem' : '1rem',
          fontWeight: 900,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LeadSummaryMetric({
  label,
  value,
  alert = false,
}) {
  return (
    <div
      style={{
        background: alert ? '#1b0d0d' : '#111',
        border: alert
          ? '1px solid #472020'
          : '1px solid #242424',
        borderRadius: '9px',
        padding: '10px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: '#777',
          fontSize: '0.68rem',
          fontWeight: 700,
          marginBottom: '5px',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: alert ? '#f3a7a7' : '#fff',
          fontSize: '0.82rem',
          fontWeight: 800,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div
      style={{
        background: '#111',
        border: '1px solid #222',
        borderRadius: '10px',
        padding: '12px',
      }}
    >
      <div
        style={{
          color: '#777',
          fontSize: '0.75rem',
          marginBottom: '5px',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: '#f5f5f5',
          fontWeight: 600,
          fontSize: '0.9rem',
        }}
      >
        {value}
      </div>
    </div>
  );
}