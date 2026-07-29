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

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const appliedUserIdRef = useRef('');

  useEffect(() => {
    let active = true;
    let authRevision = 0;

    if (!isSupabaseConfigured) {
      queueMicrotask(() => {
        if (active) setLoading(false);
      });

      return () => {
        active = false;
      };
    }

    const applySession = async (nextSession) => {
      const nextUser = nextSession?.user ?? null;
      const nextUserId = nextUser?.id || '';
      const previousUserId = appliedUserIdRef.current;

      if (!nextUserId) {
        clearActiveAccountScope();
        appliedUserIdRef.current = '';
        invalidateDbStudioDataCache();
        setSession(null);
        setUser(null);
        return;
      }

      setActiveAccountScope(nextUserId);

      const { data: legacyOwnerId, error: isolationError } = await supabase.rpc(
        'studioflow_legacy_owner_id',
      );

      if (isolationError) {
        throw new Error(
          'A atualização de segurança para separar as contas ainda não foi aplicada no Supabase. '
          + 'Execute a migration 20260729113857_multitenant_account_isolation.sql antes de acessar o StudioFlow.',
          { cause: isolationError },
        );
      }

      if (String(legacyOwnerId || '') === String(nextUserId)) {
        // A migração do cache local é auxiliar. Falta de espaço no navegador
        // nunca deve invalidar uma sessão que o Supabase autenticou.
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

      appliedUserIdRef.current = nextUserId;
      invalidateDbStudioDataCache();
      setSession(nextSession ?? null);
      setUser(nextUser);

      if (previousUserId && previousUserId !== nextUserId) {
        window.dispatchEvent(new CustomEvent('studioflow:account-changed', {
          detail: {
            previousUserId,
            userId: nextUserId,
          },
        }));
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!active) return;

        authRevision += 1;
        setLoading(true);
        void applySession(nextSession)
          .then(() => {
            if (!active) return;
            setAuthError('');
          })
          .catch((error) => {
            if (!active) return;
            clearActiveAccountScope();
            appliedUserIdRef.current = '';
            invalidateDbStudioDataCache();
            setSession(null);
            setUser(null);
            setAuthError(
              error instanceof Error
                ? error.message
                : 'Não foi possível preparar a conta atual.',
            );
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
    );

    const loadInitialSession = async () => {
      const revisionBeforeRequest = authRevision;

      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;
        if (!active) return;

        if (authRevision === revisionBeforeRequest) {
          await applySession(data.session);
        }

        setAuthError('');
      } catch (error) {
        if (!active) return;

        clearActiveAccountScope();
        appliedUserIdRef.current = '';
        invalidateDbStudioDataCache();
        setSession(null);
        setUser(null);
        setAuthError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar a sessão.',
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadInitialSession();

    return () => {
      active = false;
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
