import { useEffect, useRef, useState } from 'react';
import {
  isSupabaseConfigured,
  supabase,
} from '../utils/supabase';
import {
  clearActiveAccountScope,
  migrateLegacyStorageForOwner,
  setActiveAccountScope,
} from '../utils/accountScope.js';
import { invalidateDbStudioDataCache } from '../utils/dbData.js';
import { AuthContext } from './authContext';

const ISOLATION_SESSION_PREFIX = 'studioflow:isolation-ready:';
const ISOLATION_CHECK_TIMEOUT_MS = 6_000;

const isIsolationMigrationMissing = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(
    error?.message || error?.details || error?.hint || '',
  ).toLowerCase();

  return [
    'PGRST202',
    '42883',
    '42P01',
  ].includes(code)
    || message.includes('studioflow_legacy_owner_id') && (
      message.includes('could not find')
      || message.includes('does not exist')
      || message.includes('não existe')
      || message.includes('schema cache')
    );
};

const readIsolationSessionCache = (userId) => {
  if (typeof window === 'undefined' || !userId) return false;

  try {
    return window.sessionStorage.getItem(
      `${ISOLATION_SESSION_PREFIX}${userId}`,
    ) === 'ready';
  } catch {
    return false;
  }
};

const writeIsolationSessionCache = (userId) => {
  if (typeof window === 'undefined' || !userId) return;

  try {
    window.sessionStorage.setItem(
      `${ISOLATION_SESSION_PREFIX}${userId}`,
      'ready',
    );
  } catch {
    // Cache auxiliar: a autenticação não depende do sessionStorage.
  }
};

const verifyAccountIsolation = async (userId) => {
  if (readIsolationSessionCache(userId)) {
    return {
      verified: true,
      legacyOwnerId: '',
      warning: '',
    };
  }

  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = window.setTimeout(() => resolve({
      data: null,
      error: Object.assign(
        new Error('Tempo limite ao verificar a segurança da conta.'),
        { code: 'STUDIOFLOW_ISOLATION_TIMEOUT' },
      ),
    }), ISOLATION_CHECK_TIMEOUT_MS);
  });

  const response = await Promise.race([
    supabase.rpc('studioflow_legacy_owner_id'),
    timeout,
  ]);

  window.clearTimeout(timeoutId);

  const { data: legacyOwnerId, error } = response || {};

  if (!error) {
    writeIsolationSessionCache(userId);
    return {
      verified: true,
      legacyOwnerId: String(legacyOwnerId || ''),
      warning: '',
    };
  }

  if (isIsolationMigrationMissing(error)) {
    throw new Error(
      'A atualização de segurança para separar as contas ainda não foi aplicada no Supabase. '
      + 'Execute a migration 20260729113857_multitenant_account_isolation.sql antes de acessar o StudioFlow.',
      { cause: error },
    );
  }

  // RLS já é a proteção efetiva das tabelas. Uma falha temporária de rede,
  // timeout ou indisponibilidade do PostgREST não deve invalidar uma sessão
  // que o Supabase autenticou corretamente.
  return {
    verified: false,
    legacyOwnerId: '',
    warning: 'Não foi possível confirmar novamente o estado de segurança agora. '
      + 'A sessão foi mantida e o StudioFlow tentará validar em uma próxima abertura.',
    error,
  };
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [securityWarning, setSecurityWarning] = useState('');
  const appliedUserIdRef = useRef('');
  const applyRevisionRef = useRef(0);

  useEffect(() => {
    let active = true;
    let authEventRevision = 0;

    if (!isSupabaseConfigured) {
      queueMicrotask(() => {
        if (active) setLoading(false);
      });

      return () => {
        active = false;
      };
    }

    const applySession = async (nextSession, { verifyIsolation = true } = {}) => {
      const requestRevision = ++applyRevisionRef.current;
      const nextUser = nextSession?.user ?? null;
      const nextUserId = nextUser?.id || '';
      const previousUserId = appliedUserIdRef.current;

      if (!nextUserId) {
        clearActiveAccountScope();
        appliedUserIdRef.current = '';
        invalidateDbStudioDataCache();
        if (!active || requestRevision !== applyRevisionRef.current) return;
        setSession(null);
        setUser(null);
        setSecurityWarning('');
        return;
      }

      setActiveAccountScope(nextUserId);

      let isolationResult = {
        verified: true,
        legacyOwnerId: '',
        warning: '',
      };

      if (verifyIsolation) {
        isolationResult = await verifyAccountIsolation(nextUserId);
      }

      if (
        isolationResult.legacyOwnerId
        && String(isolationResult.legacyOwnerId) === String(nextUserId)
      ) {
        try {
          const migrationResult = migrateLegacyStorageForOwner(nextUserId);
          if (migrationResult.failed > 0) {
            console.warn(
              'StudioFlow: parte do cache legado permaneceu no formato antigo.',
              migrationResult,
            );
          }
        } catch (storageError) {
          console.warn(
            'StudioFlow: não foi possível concluir a migração do cache local; a sessão continuará ativa.',
            storageError,
          );
        }
      }

      try {
        const { hydrateAccountStorageSections } = await import(
          '../utils/accountDataSync.js'
        );
        await hydrateAccountStorageSections();
      } catch (syncError) {
        // Recorrências e contratos locais continuam disponíveis. Uma falha
        // temporária nessa sincronização não invalida a sessão autenticada.
        console.warn(
          'StudioFlow: não foi possível sincronizar preferências da conta agora.',
          syncError,
        );
      }

      if (!active || requestRevision !== applyRevisionRef.current) return;

      appliedUserIdRef.current = nextUserId;
      invalidateDbStudioDataCache();
      setSession(nextSession ?? null);
      setUser(nextUser);
      setSecurityWarning(isolationResult.warning || '');

      if (previousUserId && previousUserId !== nextUserId) {
        window.dispatchEvent(new CustomEvent('studioflow:account-changed', {
          detail: {
            previousUserId,
            userId: nextUserId,
          },
        }));
      }
    };

    const handleSessionFailure = (error, fallbackMessage) => {
      if (!active) return;

      clearActiveAccountScope();
      appliedUserIdRef.current = '';
      invalidateDbStudioDataCache();
      setSession(null);
      setUser(null);
      setSecurityWarning('');
      setAuthError(
        error instanceof Error
          ? error.message
          : fallbackMessage,
      );
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!active) return;

        authEventRevision += 1;
        const nextUserId = nextSession?.user?.id || '';
        const isSameAuthenticatedUser = Boolean(
          nextUserId
          && nextUserId === appliedUserIdRef.current,
        );
        const isBackgroundRefresh = [
          'TOKEN_REFRESHED',
          'USER_UPDATED',
        ].includes(event) && isSameAuthenticatedUser;

        if (isBackgroundRefresh) {
          // Atualizações automáticas do token não desmontam a tela nem repetem
          // consultas de segurança e migrações de cache.
          setSession(nextSession ?? null);
          setUser(nextSession?.user ?? null);
          return;
        }

        setLoading(true);
        void applySession(nextSession, {
          verifyIsolation: Boolean(nextUserId),
        })
          .then(() => {
            if (!active) return;
            setAuthError('');
          })
          .catch((error) => {
            handleSessionFailure(
              error,
              'Não foi possível preparar a conta atual.',
            );
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
    );

    const loadInitialSession = async () => {
      const revisionBeforeRequest = authEventRevision;

      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;
        if (!active) return;

        if (authEventRevision === revisionBeforeRequest) {
          await applySession(data.session, {
            verifyIsolation: Boolean(data.session?.user?.id),
          });
        }

        setAuthError('');
      } catch (error) {
        handleSessionFailure(
          error,
          'Não foi possível carregar a sessão.',
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadInitialSession();

    return () => {
      active = false;
      applyRevisionRef.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  const ensureConfigured = () => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase não configurado.');
    }
  };

  const signInWithGoogle = async () => {
    setAuthError('');
    ensureConfigured();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      setAuthError(error.message);
      throw error;
    }
  };

  const signInWithEmail = async ({ email, password }) => {
    setAuthError('');
    ensureConfigured();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthError(error.message);
      throw error;
    }

    return data;
  };

  const signUp = async ({ email, password }) => {
    setAuthError('');
    ensureConfigured();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setAuthError(error.message);
      throw error;
    }

    return data;
  };

  const resetPassword = async (email) => {
    setAuthError('');
    ensureConfigured();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login?mode=update-password`,
    });

    if (error) {
      setAuthError(error.message);
      throw error;
    }
  };

  const updatePassword = async (password) => {
    setAuthError('');
    ensureConfigured();

    const { data, error } = await supabase.auth.updateUser({ password });

    if (error) {
      setAuthError(error.message);
      throw error;
    }

    return data;
  };

  const signOut = async () => {
    setAuthError('');
    ensureConfigured();

    const { error } = await supabase.auth.signOut();

    if (error) {
      setAuthError(error.message);
      throw error;
    }

    clearActiveAccountScope();
    invalidateDbStudioDataCache();
  };

  const value = {
    session,
    user,
    accountId: user?.id || '',
    loading,
    authError,
    securityWarning,
    isSupabaseConfigured,
    isAuthenticated: Boolean(session?.user),
    signInWithGoogle,
    signInWithEmail,
    signUp,
    resetPassword,
    updatePassword,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
