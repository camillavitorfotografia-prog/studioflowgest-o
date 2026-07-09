import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../utils/supabase';

export default function AuthCallback() {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let isMounted = true;

    const processSession = async () => {
      console.log('auth callback iniciado');

      if (!isSupabaseConfigured) {
        console.log('sem sessão');
        if (isMounted) setStatus('unauthenticated');
        return;
      }

      try {
        const url = new URL(window.location.href);
        const hasCode = url.searchParams.has('code');

        if (hasCode) {
          console.log('code encontrado');
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(window.location.href);

          if (exchangeError) {
            console.error('exchangeCodeForSession erro', exchangeError.message);
            if (isMounted) setStatus('unauthenticated');
            return;
          }
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!isMounted) return;
        if (data.session?.user) {
          console.log('sessão encontrada');
          setStatus('authenticated');
          return;
        }

        console.log('sem sessão');
        setStatus('unauthenticated');
      } catch (error) {
        console.error('Erro ao processar callback de autenticacao:', error.message);
        console.log('sem sessão');
        if (isMounted) setStatus('unauthenticated');
      }
    };

    void processSession();

    return () => {
      isMounted = false;
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
