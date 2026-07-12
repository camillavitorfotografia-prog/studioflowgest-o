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
import { readStorage, STORAGE_KEYS } from './storage.js';
import { getConsolidatedFinances, calculateProjectFinancials } from './financeEngine.js';

export const calculateProjectValues = (project = {}) => {
  const contracts = readStorage(STORAGE_KEYS.contracts, []);
  const transactions = readStorage(STORAGE_KEYS.finances, []);
  const clients = readStorage(STORAGE_KEYS.clients, []);
  
  const consolidated = getConsolidatedFinances({ contracts, transactions, clients });
  
  const financials = calculateProjectFinancials({
    project,
    contracts,
    receitasAvulsas: consolidated.receitasAvulsas,
    despesas: consolidated.despesas,
  });

  return {
    valorContratado: financials.receitaContratada,
    valorRecebido: financials.receitaRecebida,
    saldoPendente: Math.max(0, financials.receitaContratada - financials.receitaRecebida),
    custoEstimado: financials.custoEstimado,
    custoReal: financials.custoReal,
    lucroEstimado: financials.lucroEstimado,
    lucroReal: financials.lucroReal,
  };
};
export const projectMatchesSearch = (project, client, query) => {
  const text = normalizeName(query);
  const digits = normalizePhone(query);
  return !text || [project.titulo, project.categoria, project.tipoServico, project.cidade, project.local, project.statusComercial, project.statusProducao, client?.nome].some((value) => normalizeName(value).includes(text)) || (digits && normalizePhone(client?.telefone || client?.whatsapp).includes(digits));
};
