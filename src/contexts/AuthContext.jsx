import { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../utils/supabase';
import { AuthContext } from './authContext';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let isMounted = true;

    if (!isSupabaseConfigured) {
      return () => {
        isMounted = false;
      };
    }

    const loadSession = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!isMounted) return;
        setSession(data.session || null);
        setUser(data.session?.user || null);
        setAuthError('');
      } catch (error) {
        console.error('Erro ao carregar sessao:', error.message);
        if (isMounted) {
          setAuthError(error.message);
          setSession(null);
          setUser(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession || null);
      setUser(nextSession?.user || null);
      setAuthError('');
      setLoading(false);
    });

    return () => {
      isMounted = false;
      listener?.subscription?.unsubscribe();
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
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) throw error;
  };

  const signOut = async () => {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setUser(null);
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
