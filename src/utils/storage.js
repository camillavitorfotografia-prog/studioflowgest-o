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
  return safeJsonParse(localStorage.getItem(key), fallback);
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