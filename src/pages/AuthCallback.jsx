import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../utils/supabase';

const wait = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export default function AuthCallback() {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = null;

    const setSafeStatus = (nextStatus) => {
      if (isMounted) setStatus(nextStatus);
    };

    const getSessionWithRetry = async () => {
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session?.user) return data.session;
        await wait(250);
      }

      return null;
    };

    const processSession = async () => {
      console.log('auth callback iniciado');

      if (!isSupabaseConfigured) {
        console.log('sem sessão');
        setSafeStatus('unauthenticated');
        return;
      }

      const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (nextSession?.user) {
          console.log('sessão encontrada');
          setSafeStatus('authenticated');
        }
      });

      unsubscribe = authListener?.subscription?.unsubscribe;

      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');

        if (code) {
          console.log('code encontrado');
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error('exchangeCodeForSession erro', exchangeError.message);
          }
        }

        const session = await getSessionWithRetry();

        if (session?.user) {
          console.log('sessão encontrada');
          setSafeStatus('authenticated');
          return;
        }

        console.log('sem sessão');
        setSafeStatus('unauthenticated');
      } catch (error) {
        console.error('Erro ao processar callback de autenticacao:', error.message);
        console.log('sem sessão');
        setSafeStatus('unauthenticated');
      }
    };

    void processSession();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="sf-auth-loading">
      <Loader2 size={28} />
    </div>
  );
}
