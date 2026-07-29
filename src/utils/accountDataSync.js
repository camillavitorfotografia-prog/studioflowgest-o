import { isSupabaseConfigured, supabase } from './supabase';
import { readStorage, STORAGE_KEYS, writeStorage } from './storage';

const PROFILE_TABLE = 'perfil';
const PROFILE_ID = 'studio-profile';

const SECTION_BY_STORAGE_KEY = new Map([
  [STORAGE_KEYS.recurrences, 'financeRecurrences'],
  [STORAGE_KEYS.contracts, 'financialContracts'],
]);

let writeQueue = Promise.resolve();

const getCurrentUser = async () => {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user || null;
};

const loadProfileRow = async (userId) => {
  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .select('id,user_id,dados,created_at,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

const saveProfileData = async (userId, currentRow, dados) => {
  const now = new Date().toISOString();
  const payload = {
    id: currentRow?.id || `${PROFILE_ID}-${userId}`,
    user_id: userId,
    dados,
    updated_at: now,
    ...(currentRow?.created_at ? {} : { created_at: now }),
  };

  const { error } = await supabase
    .from(PROFILE_TABLE)
    .upsert([payload], { onConflict: 'id' });

  if (error) throw error;
};

export const syncAccountStorageSection = (storageKey, value) => {
  const section = SECTION_BY_STORAGE_KEY.get(storageKey);
  if (!section || !isSupabaseConfigured) return Promise.resolve(false);

  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const user = await getCurrentUser();
      if (!user?.id) return false;

      const currentRow = await loadProfileRow(user.id);
      const currentData = currentRow?.dados && typeof currentRow.dados === 'object'
        ? currentRow.dados
        : {};
      const accountData = currentData.accountData && typeof currentData.accountData === 'object'
        ? currentData.accountData
        : {};

      await saveProfileData(user.id, currentRow, {
        ...currentData,
        accountData: {
          ...accountData,
          [section]: value,
        },
      });

      return true;
    });

  return writeQueue;
};

export const hydrateAccountStorageSections = async () => {
  if (!isSupabaseConfigured || typeof window === 'undefined') return;

  const user = await getCurrentUser();
  if (!user?.id) return;

  const currentRow = await loadProfileRow(user.id);
  const currentData = currentRow?.dados && typeof currentRow.dados === 'object'
    ? currentRow.dados
    : {};
  const accountData = currentData.accountData && typeof currentData.accountData === 'object'
    ? currentData.accountData
    : {};
  let profileChanged = false;
  const nextAccountData = { ...accountData };

  SECTION_BY_STORAGE_KEY.forEach((section, storageKey) => {
    const remoteValue = accountData[section];
    const localValue = readStorage(storageKey, []);

    if (Array.isArray(remoteValue)) {
      writeStorage(storageKey, remoteValue, {
        emit: false,
        remoteSync: false,
      });
      return;
    }

    if (Array.isArray(localValue) && localValue.length > 0) {
      nextAccountData[section] = localValue;
      profileChanged = true;
    }
  });

  if (profileChanged) {
    await saveProfileData(user.id, currentRow, {
      ...currentData,
      accountData: nextAccountData,
    });
  }

  window.dispatchEvent(new CustomEvent('sf_storage_update', {
    detail: { source: 'account-hydration' },
  }));
};
