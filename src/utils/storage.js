export const STORAGE_KEYS = {
  leads: 'cv_crm_leads',
  legacyLeads: 'meusLeadsData',
  clients: 'cv_studio_clients',
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
  localStorage.setItem(key, JSON.stringify(value));
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
