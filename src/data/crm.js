export const CRM_STATUSES = [
  { id: 'novo_lead', title: 'Novo contato', color: '#60a5fa' },
  { id: 'orcamento_enviado', title: 'Orcamento enviado', color: '#c9a06c' },
  { id: 'em_negociacao', title: 'Negociacao', color: '#fb923c' },
  { id: 'aguardando_retorno', title: 'Aguardando resposta', color: '#a78bfa' },
  { id: 'aprovado', title: 'Contrato fechado', color: '#34d399' },
  { id: 'evento_realizado', title: 'Evento realizado', color: '#2dd4bf' },
  { id: 'finalizado', title: 'Cliente finalizado', color: '#94a3b8' },
  { id: 'perdido', title: 'Perdido', color: '#f87171' },
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

export const getStatusTitle = (status) => {
  return CRM_STATUSES.find((item) => item.id === status)?.title || status;
};
