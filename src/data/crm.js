export const CRM_STATUSES = [
  { id: 'novo_lead', title: 'Lead', color: '#60a5fa' },
  { id: 'orcamento_enviado', title: 'Orcamento enviado', color: '#c9a06c' },
  { id: 'em_negociacao', title: 'Negociacao', color: '#fb923c' },
  { id: 'aguardando_retorno', title: 'Aguardando resposta', color: '#a78bfa' },
  { id: 'aprovado', title: 'Fechado', color: '#34d399' },
  { id: 'evento_realizado', title: 'Evento realizado', color: '#2dd4bf' },
  { id: 'finalizado', title: 'Cliente finalizado', color: '#94a3b8' },
  { id: 'perdido', title: 'Perdido', color: '#f87171' },
  { id: 'cancelado', title: 'Cancelado', color: '#ef4444' },
];

export const ACTIVE_LEAD_STATUSES = [
  'novo_lead',
  'orcamento_enviado',
  'em_negociacao',
  'aguardando_retorno',
];

export const SERVICE_TYPES = [
  'Casamento',
  'Pre-wedding',
  'Gestante',
  'Familia',
  'Formatura',
  'Corporativo',
  'Outros',
];

export const LEAD_ORIGINS = [
  'Instagram',
  'Indicacao',
  'Google',
  'Facebook',
  'WhatsApp',
  'Site',
  'Outro',
];

const normalizeStatusKey = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const STATUS_ALIASES = {
  novo: 'novo_lead',
  novo_contato: 'novo_lead',
  novo_lead: 'novo_lead',
  orcamento_enviado: 'orcamento_enviado',
  negociacao: 'em_negociacao',
  em_negociacao: 'em_negociacao',
  aguardando_resposta: 'aguardando_retorno',
  aguardando_retorno: 'aguardando_retorno',
  contrato_fechado: 'aprovado',
  aprovado: 'aprovado',
  ganho: 'aprovado',
  evento_realizado: 'evento_realizado',
  cliente_finalizado: 'finalizado',
  finalizado: 'finalizado',
  perdido: 'perdido',
  cancelado: 'cancelado',
  cancelada: 'cancelado',
};

export const normalizeLeadStatus = (status) => {
  const key = normalizeStatusKey(status);
  return STATUS_ALIASES[key] || 'novo_lead';
};

export const getStatusTitle = (status) => {
  const normalizedStatus = normalizeLeadStatus(status);
  return CRM_STATUSES.find((item) => item.id === normalizedStatus)?.title || status;
};