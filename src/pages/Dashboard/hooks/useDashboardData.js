import { useCallback, useEffect, useState } from 'react';
import { getDbStudioData, subscribeDbUpdates } from '../../../utils/dbData';
import { isSupabaseConfigured, supabase } from '../../../utils/supabase';
import storage from '../../../features/documents/storage/documentStorageAdapter';

const EMPTY_DATA = {
  leads: [],
  clients: [],
  projects: [],
  transactions: [],
  canonicalRows: [],
  equipment: [],
  documents: [],
};

export default function useDashboardData() {
  const [state, setState] = useState({
    data: EMPTY_DATA,
    loading: true,
    error: null,
    refreshedAt: null,
  });

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setState((current) => ({ ...current, loading: true, error: null }));
    }

    try {
      const [studio, documents, ledgerResult] = await Promise.all([
        getDbStudioData(),
        storage.listDocuments(),
        isSupabaseConfigured
          ? supabase.from('finance_ledger_canonical').select('*')
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (ledgerResult?.error) throw ledgerResult.error;

      setState({
        data: {
          leads: studio.leads || [],
          clients: studio.clients || [],
          projects: studio.projects || [],
          transactions: studio.transactions || [],
          canonicalRows: Array.isArray(ledgerResult?.data) ? ledgerResult.data : [],
          equipment: studio.equipment || [],
          documents: documents || [],
        },
        loading: false,
        error: null,
        refreshedAt: new Date(),
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || 'Não foi possível carregar o painel.',
      }));
    }
  }, []);

  useEffect(() => {
    let active = true;

    const safeLoad = async (options) => {
      if (!active) return;
      await load(options);
    };

    void safeLoad();
    const onFocus = () => void safeLoad({ silent: true });
    window.addEventListener('focus', onFocus);
    const unsubscribe = subscribeDbUpdates(() => void safeLoad({ silent: true }));

    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      unsubscribe();
    };
  }, [load]);

  return {
    ...state,
    refresh: () => load({ silent: false }),
  };
}
