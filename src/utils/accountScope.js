const ACTIVE_ACCOUNT_KEY = 'studioflow:active-account-id';
const LEGACY_FALLBACK_OWNER_KEY = 'studioflow:legacy-storage-owner';
const SCOPED_PREFIX = 'studioflow:user:';
const GUEST_SCOPED_PREFIX = `${SCOPED_PREFIX}guest:`;

const PRIVATE_PREFIXES = [
  'cv_',
  'meus',
  'studioflow.',
  'studioflow_',
  'sf_',
];

const PRIVATE_EXACT_KEYS = new Set([
  'profileData',
  'profilePhoto',
]);

const TRANSIENT_STORAGE_PREFIXES = [
  'tus::',
  'tus-',
  'studioflow.upload.',
  'studioflow.cache.',
];

let installed = false;
let nativeGetItem = null;
let nativeSetItem = null;
let nativeRemoveItem = null;

const canUseBrowserStorage = () => (
  typeof window !== 'undefined'
  && typeof window.localStorage !== 'undefined'
  && typeof window.sessionStorage !== 'undefined'
);

const isScopedKey = (key = '') => String(key).startsWith(SCOPED_PREFIX);

const isQuotaExceededError = (error) => (
  error?.name === 'QuotaExceededError'
  || error?.code === 22
  || error?.code === 1014
  || String(error?.message || '').toLowerCase().includes('quota')
);

export const isPrivateStorageKey = (key = '') => {
  const normalized = String(key || '');

  if (!normalized) return false;
  if (normalized === ACTIVE_ACCOUNT_KEY) return false;
  if (isScopedKey(normalized)) return false;
  if (normalized.startsWith('sb-')) return false;
  if (normalized.startsWith('tus::') || normalized.startsWith('tus-')) return false;

  return PRIVATE_EXACT_KEYS.has(normalized)
    || PRIVATE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

export const getActiveAccountId = () => {
  if (!canUseBrowserStorage()) return '';

  try {
    return window.sessionStorage.getItem(ACTIVE_ACCOUNT_KEY) || '';
  } catch {
    return '';
  }
};

const getLegacyFallbackOwner = () => {
  if (!canUseBrowserStorage()) return '';

  try {
    return window.sessionStorage.getItem(LEGACY_FALLBACK_OWNER_KEY) || '';
  } catch {
    return '';
  }
};

const setLegacyFallbackOwner = (accountId = '') => {
  if (!canUseBrowserStorage()) return;

  try {
    if (accountId) {
      window.sessionStorage.setItem(LEGACY_FALLBACK_OWNER_KEY, accountId);
    } else {
      window.sessionStorage.removeItem(LEGACY_FALLBACK_OWNER_KEY);
    }
  } catch {
    // A sessão autenticada continua válida mesmo sem este marcador auxiliar.
  }
};

const canUseLegacyFallback = () => {
  const activeAccount = getActiveAccountId();
  return Boolean(
    activeAccount
    && activeAccount === getLegacyFallbackOwner(),
  );
};

export const getScopedStorageKey = (key, accountId = getActiveAccountId()) => {
  const normalizedKey = String(key || '');
  if (!isPrivateStorageKey(normalizedKey)) return normalizedKey;

  const owner = String(accountId || 'guest').trim() || 'guest';
  return `${SCOPED_PREFIX}${owner}:${normalizedKey}`;
};

const getRawLocalItem = (key) => {
  if (!canUseBrowserStorage()) return null;
  const getter = nativeGetItem || Storage.prototype.getItem;
  return getter.call(window.localStorage, key);
};

const setRawLocalItem = (key, value) => {
  if (!canUseBrowserStorage()) return undefined;
  const setter = nativeSetItem || Storage.prototype.setItem;
  return setter.call(window.localStorage, key, value);
};

const removeRawLocalItem = (key) => {
  if (!canUseBrowserStorage()) return undefined;
  const remover = nativeRemoveItem || Storage.prototype.removeItem;
  return remover.call(window.localStorage, key);
};

const listRawLocalKeys = () => {
  if (!canUseBrowserStorage()) return [];

  const keys = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key) keys.push(key);
  }
  return keys;
};

const unscopedPartOfKey = (key = '') => {
  const normalized = String(key || '');
  if (!normalized.startsWith(SCOPED_PREFIX)) return normalized;

  const separatorIndex = normalized.indexOf(':', SCOPED_PREFIX.length);
  return separatorIndex >= 0
    ? normalized.slice(separatorIndex + 1)
    : normalized;
};

const isTransientStorageKey = (key = '') => {
  const unscoped = unscopedPartOfKey(key);
  return TRANSIENT_STORAGE_PREFIXES.some((prefix) => (
    unscoped.startsWith(prefix)
  ));
};

/**
 * Libera somente espaço recuperável. Nunca remove automaticamente a única
 * cópia de clientes, CRM, financeiro, projetos ou configurações.
 */
const clearRecoverableStorage = ({ accountId = '', preserveKeys = [] } = {}) => {
  if (!canUseBrowserStorage()) return 0;

  const preserved = new Set(preserveKeys.filter(Boolean));
  const keys = listRawLocalKeys();
  const removable = new Set();

  keys.forEach((key) => {
    if (preserved.has(key)) return;

    if (isTransientStorageKey(key)) {
      removable.add(key);
      return;
    }

    // O escopo guest existe somente antes do login. Depois da autenticação,
    // essas preferências temporárias não devem disputar quota com a conta.
    if (accountId && key.startsWith(GUEST_SCOPED_PREFIX)) {
      removable.add(key);
      return;
    }

    // Se a versão já isolada existe, a chave antiga é uma cópia redundante.
    if (accountId && isPrivateStorageKey(key)) {
      const scopedKey = getScopedStorageKey(key, accountId);
      if (getRawLocalItem(scopedKey) !== null) removable.add(key);
    }
  });

  removable.forEach((key) => {
    try {
      removeRawLocalItem(key);
    } catch {
      // Limpeza oportunista: a falha será tratada pela gravação solicitante.
    }
  });

  return removable.size;
};

const trySetRawLocalItem = (key, value, accountId = '') => {
  try {
    setRawLocalItem(key, value);
    return { ok: true, recovered: 0, error: null };
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      return { ok: false, recovered: 0, error };
    }

    const recovered = clearRecoverableStorage({
      accountId,
      preserveKeys: [key],
    });

    try {
      setRawLocalItem(key, value);
      return { ok: true, recovered, error: null };
    } catch (retryError) {
      return { ok: false, recovered, error: retryError };
    }
  }
};

const emitStorageWarning = (detail = {}) => {
  if (typeof window === 'undefined') return;

  try {
    window.dispatchEvent(new CustomEvent('studioflow:storage-warning', {
      detail,
    }));
  } catch {
    // O aviso é auxiliar e nunca deve interromper a aplicação.
  }
};

export const setActiveAccountScope = (accountId) => {
  if (!canUseBrowserStorage()) return;

  const normalized = String(accountId || '').trim();
  try {
    if (normalized) {
      window.sessionStorage.setItem(ACTIVE_ACCOUNT_KEY, normalized);
    } else {
      window.sessionStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    }
  } catch {
    // A aplicação continuará usando o escopo guest caso o sessionStorage falhe.
  }

  window.dispatchEvent(new CustomEvent('studioflow:account-scope-changed', {
    detail: { accountId: normalized },
  }));
};

export const clearActiveAccountScope = () => setActiveAccountScope('');

/**
 * Move as chaves legadas para o escopo do proprietário sem manter duas cópias
 * simultâneas. Isso evita estourar a quota durante o primeiro login.
 *
 * Em caso de falha, a chave antiga é restaurada e fica acessível somente para
 * o proprietário legado nesta sessão; o login nunca é bloqueado.
 */
export const migrateLegacyStorageForOwner = (accountId) => {
  if (!canUseBrowserStorage() || !accountId) {
    return {
      migrated: 0,
      skipped: 0,
      failed: 0,
      recovered: 0,
    };
  }

  const rawKeys = listRawLocalKeys().filter(isPrivateStorageKey);
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  let recovered = 0;

  rawKeys.forEach((legacyKey) => {
    const scopedKey = getScopedStorageKey(legacyKey, accountId);
    const legacyValue = getRawLocalItem(legacyKey);
    const currentValue = getRawLocalItem(scopedKey);

    if (legacyValue === null) return;

    if (currentValue !== null) {
      try {
        removeRawLocalItem(legacyKey);
      } catch {
        // A cópia isolada já é suficiente para abrir a conta.
      }
      skipped += 1;
      return;
    }

    // Remove primeiro para liberar o mesmo volume que será gravado. O valor
    // permanece em memória e é restaurado se a gravação isolada não couber.
    try {
      removeRawLocalItem(legacyKey);
    } catch {
      failed += 1;
      return;
    }

    const result = trySetRawLocalItem(scopedKey, legacyValue, accountId);
    recovered += result.recovered;

    if (result.ok) {
      migrated += 1;
      return;
    }

    failed += 1;
    try {
      setRawLocalItem(legacyKey, legacyValue);
    } catch {
      // O fallback em memória não deve derrubar a autenticação. O Supabase
      // continua sendo a fonte oficial dos módulos centrais.
    }
  });

  clearRecoverableStorage({ accountId });
  setLegacyFallbackOwner(failed > 0 ? accountId : '');

  if (failed > 0) {
    emitStorageWarning({
      type: 'legacy-migration-partial',
      accountId,
      failed,
    });
  }

  return {
    migrated,
    skipped,
    failed,
    recovered,
  };
};

export const installScopedLocalStorage = () => {
  if (!canUseBrowserStorage() || installed) return;

  installed = true;
  nativeGetItem = Storage.prototype.getItem;
  nativeSetItem = Storage.prototype.setItem;
  nativeRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.getItem = function scopedGetItem(key) {
    if (this === window.localStorage && isPrivateStorageKey(key)) {
      const scopedKey = getScopedStorageKey(key);
      const scopedValue = nativeGetItem.call(this, scopedKey);

      if (scopedValue !== null) return scopedValue;

      // Fallback estritamente limitado ao proprietário legado. Uma segunda
      // conta jamais lê as chaves antigas sem escopo.
      if (canUseLegacyFallback()) {
        return nativeGetItem.call(this, key);
      }

      return null;
    }
    return nativeGetItem.call(this, key);
  };

  Storage.prototype.setItem = function scopedSetItem(key, value) {
    if (this === window.localStorage && isPrivateStorageKey(key)) {
      const accountId = getActiveAccountId();
      const scopedKey = getScopedStorageKey(key, accountId);

      try {
        const result = nativeSetItem.call(this, scopedKey, value);

        if (canUseLegacyFallback()) {
          try { nativeRemoveItem.call(this, key); } catch { /* noop */ }
        }

        return result;
      } catch (error) {
        if (!isQuotaExceededError(error)) throw error;

        clearRecoverableStorage({
          accountId,
          preserveKeys: [scopedKey],
        });

        try {
          return nativeSetItem.call(this, scopedKey, value);
        } catch (retryError) {
          // Preferências e caches não podem expulsar o usuário da sessão.
          // O módulo solicitante pode continuar usando o estado em memória.
          console.warn(
            `StudioFlow: armazenamento local cheio; a chave [${key}] não foi persistida.`,
            retryError,
          );
          emitStorageWarning({
            type: 'quota-exceeded',
            key,
            scopedKey,
          });
          return undefined;
        }
      }
    }
    return nativeSetItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function scopedRemoveItem(key) {
    if (this === window.localStorage && isPrivateStorageKey(key)) {
      const result = nativeRemoveItem.call(this, getScopedStorageKey(key));

      if (canUseLegacyFallback()) {
        try { nativeRemoveItem.call(this, key); } catch { /* noop */ }
      }

      return result;
    }
    return nativeRemoveItem.call(this, key);
  };
};

export const getAccountScopeDiagnostics = () => ({
  accountId: getActiveAccountId(),
  legacyFallbackOwner: getLegacyFallbackOwner(),
  installed,
});
