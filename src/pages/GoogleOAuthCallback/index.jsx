import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { requestIntegrationAction } from '../../services/integrationsService';
import './GoogleOAuthCallback.css';

export default function GoogleOAuthCallback() {
  const navigate = useNavigate();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const startedRef = useRef(false);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Concluindo a conexão segura com o Google...');

  useEffect(() => {
    if (authLoading || startedRef.current) return;
    startedRef.current = true;

    if (!isAuthenticated) {
      setStatus('error');
      setMessage('Sua sessão expirou. Entre novamente e repita a conexão do Google.');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const oauthError = params.get('error');

    if (!state || (!code && !oauthError)) {
      setStatus('error');
      setMessage('O retorno do Google está incompleto. Tente conectar novamente pelas Configurações.');
      return;
    }

    requestIntegrationAction('google-oauth-callback', {
      code,
      state,
      error: oauthError,
    })
      .then((response) => {
        setStatus('success');
        setMessage(response?.accountEmail
          ? `Google Workspace conectado com ${response.accountEmail}.`
          : 'Google Workspace conectado com sucesso.');
        window.setTimeout(() => {
          navigate('/configuracoes?integracao=google&status=conectado', { replace: true });
        }, 1200);
      })
      .catch((error) => {
        setStatus('error');
        setMessage(error?.message || 'Não foi possível concluir a conexão com o Google.');
      });
  }, [authLoading, isAuthenticated, navigate]);

  const Icon = status === 'success' ? CheckCircle2 : status === 'error' ? TriangleAlert : LoaderCircle;

  return (
    <main className="google-oauth-callback-page">
      <section className={`google-oauth-callback-card is-${status}`}>
        <div className="google-oauth-callback-icon">
          <Icon size={28} className={status === 'loading' ? 'is-spinning' : ''} />
        </div>
        <p className="google-oauth-callback-eyebrow">Google Workspace</p>
        <h1>{status === 'success' ? 'Conexão concluída' : status === 'error' ? 'Não foi possível conectar' : 'Conectando sua conta'}</h1>
        <p>{message}</p>

        {status === 'error' && (
          <div className="google-oauth-callback-actions">
            <button type="button" onClick={() => navigate('/configuracoes', { replace: true })}>
              Voltar às configurações
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
