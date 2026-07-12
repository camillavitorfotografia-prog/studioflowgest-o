import { normalizeName, normalizePhone } from './clientIdentity.js';

export const COMMERCIAL_STATUSES = ['novo_contato', 'orcamento_elaboracao', 'orcamento_enviado', 'aguardando_retorno', 'negociacao', 'aprovado', 'contrato_pendente', 'contratado', 'perdido', 'cancelado'];
export const PRODUCTION_STATUSES = ['agendado', 'pre_producao', 'evento_realizado', 'aguardando_backup', 'backup_concluido', 'selecao', 'edicao', 'revisao', 'pronto_entrega', 'entregue', 'finalizado', 'pausado', 'cancelado'];
export const PRIORITIES = ['baixa', 'normal', 'alta', 'urgente'];
export const SERVICE_TYPES = ['Fotografia', 'Filmagem', 'Fotografia e filmagem', 'Outro'];
export const PROJECT_CATEGORIES = ['Casamento', 'Ensaio de casal', 'Pré-wedding', 'Gestante', 'Família', 'Formatura', 'Aniversário', 'Evento', 'Corporativo', 'Editorial', 'Outro'];

const legacyCommercial = { novo: 'novo_contato', orcamento: 'orcamento_enviado', 'em negociacao': 'negociacao', fechado: 'contratado', contrato_fechado: 'contratado', recusado: 'perdido', cancelado: 'cancelado' };
const legacyProduction = { fotografando: 'evento_realizado', edicao: 'edicao', entregue: 'entregue' };
const key = (value) => normalizeName(value).replace(/\s+/g, '_');
export const normalizeCommercialStatus = (value, fallback = 'novo_contato') => COMMERCIAL_STATUSES.includes(key(value)) ? key(value) : (legacyCommercial[normalizeName(value)] || value || fallback);
export const normalizeProductionStatus = (value, fallback = 'agendado') => PRODUCTION_STATUSES.includes(key(value)) ? key(value) : (legacyProduction[normalizeName(value)] || value || fallback);

export const calculateDeliveryDate = (eventDate, days) => {
  if (!eventDate || Number(days) < 0 || !Number.isFinite(Number(days))) return '';
  const date = new Date(`${eventDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + Number(days));
  return date.toISOString().slice(0, 10);
};
export const deliveryState = (project, reference = new Date()) => {
  const due = project.dataPrevistaEntrega ? new Date(`${project.dataPrevistaEntrega}T23:59:59`) : null;
  if (!due || Number.isNaN(due.getTime()) || project.statusProducao === 'entregue' || project.statusProducao === 'finalizado') return { daysRemaining: null, overdue: false, upcoming: false };
  const daysRemaining = Math.ceil((due - reference) / 86400000);
  return { daysRemaining, overdue: daysRemaining < 0, upcoming: daysRemaining >= 0 && daysRemaining <= 7 };
};
const money = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
export const calculateProjectValues = (project = {}) => {
  const valorContratado = money(project.valorContratado ?? project.valor_contratado);
  const payments = project.pagamentos || project.receitas || project.financeiro?.receitas || [];
  const derivedReceived = payments.reduce((sum, payment) => ['recebido', 'confirmado', 'pago'].includes(normalizeName(payment.status)) ? sum + money(payment.valor) : sum, 0);
  const valorRecebido = payments.length ? derivedReceived : money(project.valorRecebido ?? project.valor_recebido);
  const custoEstimado = Math.max(0, money(project.custoEstimado));
  const custoReal = Math.max(0, money(project.custoReal));
  return { valorContratado, valorRecebido, saldoPendente: valorContratado - valorRecebido, custoEstimado, custoReal, lucroEstimado: valorContratado - custoEstimado, lucroReal: valorRecebido - custoReal };
};
export const projectMatchesSearch = (project, client, query) => {
  const text = normalizeName(query);
  const digits = normalizePhone(query);
  return !text || [project.titulo, project.categoria, project.tipoServico, project.cidade, project.local, project.statusComercial, project.statusProducao, client?.nome].some((value) => normalizeName(value).includes(text)) || (digits && normalizePhone(client?.telefone || client?.whatsapp).includes(digits));
};
