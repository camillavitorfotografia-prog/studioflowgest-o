export const STORAGE_KEYS = {
  leads: 'cv_crm_leads',
  legacyLeads: 'meusLeadsData',
  clients: 'cv_studio_clients',
  projects: 'cv_studio_projects',
  checklists: 'cv_studio_checklists',
  contracts: 'cv_studio_contracts',
  questionnaires: 'cv_studio_questionnaires',
  files: 'cv_studio_files',
  finances: 'cv_studio_financas',
  financeBalances: 'cv_finance_saldos',
  agendaEvents: 'meusEventosAgenda',
  equipment: 'cv_studio_equipamentos',
  documents: 'cv_studio_documents',
  settings: 'cv_studio_settings_v1',
  recurrences: 'cv_studio_recorrencias',
};

export const STORAGE_SCHEMA_VERSION = 4;

const asArray = (value) => (Array.isArray(value) ? value : []);
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const normalizeRecord = (record, defaults) => ({ ...defaults, ...asObject(record) });
import { normalizeChecklist } from './checklistEngine.js';
import { normalizeContract } from './contractEngine.js';

const CLIENT_DEFAULTS = { cpfCnpj: '', endereco: '', cidade: '', dataNascimento: '', origem: '', indicacao: '', indicacaoClienteId: '', observacoes: '', datasImportantes: [], historicoContatos: [], dataPrimeiroContato: '', dataUltimoContato: '', dataProximoRetorno: '', statusComercial: 'novo' };
const PROJECT_DEFAULTS = { titulo: '', clienteId: '', clienteNome: '', descricao: '', observacoes: '', tipoServico: 'Fotografia', categoria: 'Outro', dataEvento: '', horaInicio: '', horaFim: '', local: '', cidade: '', estado: '', endereco: '', observacoesLocal: '', duracaoEstimada: '', equipeIds: [], equipamentoIds: [], custoEstimado: 0, custoReal: 0, prazoEntregaDias: '', dataPrevistaEntrega: '', dataRealEntrega: '', prioridade: 'normal', arquivado: false, statusComercial: 'novo_contato', statusProducao: 'agendado', checklist: [], contratoId: '', orcamentoId: '', pagamentoIds: [], pagamentos: [] };
const CONTRACT_DEFAULTS = { clientId: '', projectId: '', numero: '', dataCriacao: '', valorTotal: 0, valorEntrada: 0, saldo: 0, quantidadeParcelas: 0, parcelas: [], formaPagamento: '', observacoes: '', status: 'rascunho' };
const EQUIPMENT_DEFAULTS = { categoria: 'Outros', marca: '', modelo: '', numeroSerie: '', dataCompra: '', valorCompra: 0, valorResidual: 0, vidaUtilAnos: 5, fornecedor: '', garantiaAte: '', estadoConservacao: '', situacao: 'disponivel', observacoes: '', manutencoes: [], trabalhos: [] };
const TRANSACTION_DEFAULTS = { descricao: 'Lançamento financeiro', categoria: 'Outros', valor: 0, vencimento: '', dataRecebimento: '', dataPagamento: '', status: '', clienteId: '', trabalhoId: '', formaPagamento: 'Pix', observacoes: '', competencia: '', recorrenciaId: '', tipo: '', tipoGeral: '', contaOrigem: 'empresa' };
const RECURRENCE_DEFAULTS = { descricao: 'Recorrência fixa', categoria: 'Aluguel', valor: 0, frequencia: 'mensal', diaVencimento: 1, fornecedor: '', formaPagamento: 'Pix', observacoes: '', ativo: true, contaOrigem: 'empresa' };

export const normalizeStoredValue = (key, value) => {
  if (value === null || value === undefined) return value;
  if (key === STORAGE_KEYS.clients) return asArray(value).map((item) => normalizeRecord(item, CLIENT_DEFAULTS));
  if (key === STORAGE_KEYS.projects) return asArray(value).map((item) => { const project = normalizeRecord(item, PROJECT_DEFAULTS); return { ...project, checklist: normalizeChecklist(item?.checklist) }; });
  if (key === STORAGE_KEYS.contracts) return asArray(value).map((item, index) => normalizeContract(normalizeRecord(item, CONTRACT_DEFAULTS), index));
  if (key === STORAGE_KEYS.equipment) return asArray(value).map((item) => normalizeRecord(item, EQUIPMENT_DEFAULTS));
  if (key === STORAGE_KEYS.finances) {
    return asArray(value).map((item, index) => {
      const norm = normalizeRecord(item, TRANSACTION_DEFAULTS);
      const id = norm.id || `transacao-legacy-${index}-${Date.now()}`;
      const tipoGeral = norm.tipoGeral || (['fixa', 'variavel'].includes(norm.tipo) ? 'Saida' : 'Entrada');
      const tipo = norm.tipo || (tipoGeral === 'Saida' ? 'fixa' : 'receita_avulsa');
      const status = norm.status || (tipoGeral === 'Saida' ? 'Pendente' : 'prevista');
      const vencimento = norm.vencimento || norm.data || '';
      const competencia = norm.competencia || (vencimento ? vencimento.slice(0, 7) : new Date().toISOString().slice(0, 7));
      return {
        ...norm,
        id,
        tipoGeral,
        tipo,
        status,
        vencimento,
        competencia,
        criadoEm: norm.criadoEm || norm.created_at || new Date().toISOString(),
        atualizadoEm: norm.atualizadoEm || norm.updated_at || new Date().toISOString()
      };
    });
  }
  if (key === STORAGE_KEYS.recurrences) {
    return asArray(value).map((item, index) => {
      const norm = normalizeRecord(item, RECURRENCE_DEFAULTS);
      const id = norm.id || `recorrencia-legacy-${index}-${Date.now()}`;
      return {
        ...norm,
        id,
        diaVencimento: Math.max(1, Math.min(31, Number(norm.diaVencimento || 1))),
        ativo: norm.ativo !== false,
        criadoEm: norm.criadoEm || new Date().toISOString(),
        atualizadoEm: norm.atualizadoEm || new Date().toISOString()
      };
    });
  }
  if ([STORAGE_KEYS.checklists, STORAGE_KEYS.agendaEvents].includes(key)) return asArray(value);
  return value;
};

export const safeJsonParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

export const readStorage = (key, fallback = []) => {
  if (typeof window === 'undefined') return fallback;
  return normalizeStoredValue(key, safeJsonParse(localStorage.getItem(key), fallback));
};

export const writeStorage = (key, value) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    
    // Dispara evento customizado para sincronização reativa e imediata entre contextos e módulos
    window.dispatchEvent(new CustomEvent('sf_storage_update', { 
      detail: { key, value } 
    }));
  } catch (error) {
    console.error(`Erro crítico de persistência na chave [${key}]:`, error);
  }
};

export const createId = (prefix = 'item') => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const syncLegacyLeads = () => {
  const current = readStorage(STORAGE_KEYS.leads, []);
  if (current.length > 0) return current;

  const legacy = readStorage(STORAGE_KEYS.legacyLeads, []);
  if (legacy.length > 0) {
    writeStorage(STORAGE_KEYS.leads, legacy);
  }

  return legacy;
};
