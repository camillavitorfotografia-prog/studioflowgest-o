import { useEffect, useState } from 'react';
import {
  isSupabaseConfigured,
  supabase,
} from '../utils/supabase';
import { AuthContext } from './authContext';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

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

    const applySession = (nextSession) => {
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!active) return;

        authRevision += 1;
        applySession(nextSession);
        setAuthError('');
      }
    );

    const loadInitialSession = async () => {
      const revisionBeforeRequest = authRevision;

      try {
        const { data, error } =
          await supabase.auth.getSession();

        if (error) throw error;
        if (!active) return;

        if (authRevision === revisionBeforeRequest) {
          applySession(data.session);
        }

        setAuthError('');
      } catch (error) {
        if (!active) return;

        setAuthError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar a sessão.'
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

    const { data, error } =
      await supabase.auth.signInWithPassword({
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

    const { error } =
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo:
          `${window.location.origin}/login?mode=update-password`,
      });

    if (error) {
      setAuthError(error.message);
      throw error;
    }
  };

  const updatePassword = async (password) => {
    setAuthError('');
    ensureConfigured();

    const { data, error } =
      await supabase.auth.updateUser({ password });

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
  };

  const value = {
    session,
    user,
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
