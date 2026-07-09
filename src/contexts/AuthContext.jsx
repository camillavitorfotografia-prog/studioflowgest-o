import { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../utils/supabase';
import { AuthContext } from './authContext';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let active = true;

    if (!isSupabaseConfigured) {
      return () => {
        active = false;
      };
    }

    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!active) return;
        setSession(data.session || null);
        setUser(data.session?.user || null);
      } catch (error) {
        console.error('Erro ao carregar sessao:', error.message);
        setAuthError(error.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setUser(nextSession?.user || null);
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    setAuthError('');
    if (!isSupabaseConfigured) {
      const message = 'Configure a URL real do Supabase no arquivo .env antes de entrar com Google.';
      setAuthError(message);
      throw new Error(message);
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) throw error;
  };

  const signOut = async () => {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = useMemo(() => ({
    session,
    user,
    loading,
    authError,
    isSupabaseConfigured,
    isAuthenticated: Boolean(session?.user),
    signInWithGoogle,
    signOut,
  }), [authError, loading, session, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
