import { normalizeStoredValue, readStorage, STORAGE_KEYS, STORAGE_SCHEMA_VERSION } from './storage';

const allowedKeys = new Set(Object.values(STORAGE_KEYS));

export const createBackupPayload = () => ({
  studioFlow: true,
  schemaVersion: STORAGE_SCHEMA_VERSION,
  exportedAt: new Date().toISOString(),
  data: Object.fromEntries([...allowedKeys].map((key) => [key, readStorage(key, null)])),
});

export const validateBackupPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('O arquivo não contém um backup válido.');
  const data = payload.studioFlow ? payload.data : payload;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('A seção de dados do backup é inválida.');
  const entries = Object.entries(data).filter(([key]) => allowedKeys.has(key));
  if (!entries.length) throw new Error('Nenhum dado reconhecido do StudioFlow foi encontrado.');
  return entries;
};

export const restoreBackupPayload = (payload) => {
  const normalized = validateBackupPayload(payload)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => [key, normalizeStoredValue(key, value)]);
  normalized.forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  window.dispatchEvent(new CustomEvent('sf_storage_update', { detail: { restored: true } }));
  window.dispatchEvent(new Event('storage'));
  return normalized.length;
};
