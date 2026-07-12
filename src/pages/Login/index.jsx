import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AlertTriangle, CalendarDays, Loader2, TrendingUp, WalletCards } from 'lucide-react';
import Logo from '../../assets/studioflow-logo.png';
import { useAuth } from '../../contexts/useAuth';
import {
  assertNewEmailRegistration,
  getEmailAuthMessage,
  resendSignupConfirmation,
  validateRegistration,
} from '../../utils/emailAuth';

const benefits = [
  { icon: CalendarDays, title: 'Organize sua agenda', description: 'Controle casamentos, ensaios e eventos em um unico lugar.' },
  { icon: WalletCards, title: 'Controle seu financeiro', description: 'Acompanhe pagamentos, despesas e lucro automaticamente.' },
  { icon: TrendingUp, title: 'Faca seu estudio crescer', description: 'CRM, clientes, projetos e relatorios totalmente integrados.' },
];

export default function Login() {
  const {
    loading,
    isAuthenticated,
    signInWithGoogle,
    signInWithEmail,
    signUp,
    resetPassword,
    updatePassword,
    authError,
    isSupabaseConfigured,
  } = useAuth();
  const location = useLocation();
  const savedRoute = location.state?.from;
  const requestedRoute = savedRoute?.pathname
    ? `${savedRoute.pathname}${savedRoute.search || ''}`
    : '/dashboard';
  const from = requestedRoute === '/login'
    ? '/dashboard'
    : requestedRoute;
  const queryMode = new URLSearchParams(location.search).get('mode');
  const [mode, setMode] = useState(location.pathname === '/recuperar-senha' ? 'recovery' : (queryMode || 'login'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState(
    new URLSearchParams(location.search).get('email_confirmed') === 'true'
      ? 'E-mail confirmado com sucesso. Sua conta está pronta para entrar.'
      : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('');
  const [isResending, setIsResending] = useState(false);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setSubmitError('');
    setSuccessMessage('');
    setPendingConfirmationEmail('');
  };

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    setSuccessMessage('');
    setIsSubmitting(true);
    try {
      if (mode === 'recovery') {
        await resetPassword(email);
        setSuccessMessage('Enviamos o link de recuperacao para o seu e-mail.');
      } else if (mode === 'register') {
        const normalizedEmail = validateRegistration({ email, password });
        const data = await signUp({ email: normalizedEmail, password });
        assertNewEmailRegistration(data);
        setPendingConfirmationEmail(normalizedEmail);
        setSuccessMessage('Cadastro realizado com sucesso. Enviamos um e-mail de confirmação. Confirme seu endereço antes de entrar.');
      } else if (mode === 'update-password') {
        await updatePassword(password);
        setSuccessMessage('Senha atualizada com sucesso.');
        setMode('login');
      } else {
        await signInWithEmail({ email, password });
      }
    } catch (error) {
      setSubmitError(getEmailAuthMessage(error, error instanceof Error ? error.message : undefined));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendConfirmation = async () => {
    setSubmitError('');
    setSuccessMessage('');
    setIsResending(true);
    try {
      await resendSignupConfirmation(pendingConfirmationEmail);
      setSuccessMessage('E-mail de confirmação reenviado com sucesso. Verifique também a pasta de spam.');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Erro ao reenviar o e-mail de confirmação.');
    } finally {
      setIsResending(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSubmitError('');
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      setSubmitError(error.message);
      console.error('Erro ao entrar com Google:', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="sf-login-screen loading"><Loader2 className="sf-login-spinner" size={30} /></div>;
  }

  if (isAuthenticated && mode !== 'update-password' && !pendingConfirmationEmail) {
    return <Navigate to={from} replace />;
  }

  const visibleError = submitError || authError;
  const title = mode === 'register' ? 'Criar conta' : mode === 'recovery' ? 'Recuperar senha' : mode === 'update-password' ? 'Nova senha' : 'Bem-vindo de volta';
  const subtitle = mode === 'register' ? 'Cadastre seu acesso ao StudioFlow.' : mode === 'recovery' ? 'Informe seu e-mail para receber o link.' : mode === 'update-password' ? 'Defina uma nova senha segura.' : 'Entre para acessar sua conta.';

  return (
    <main className="sf-login-screen">
      <aside className="sf-login-institutional" aria-label="StudioFlow">
        <div>
          <img src={Logo} alt="StudioFlow" className="sf-login-brandmark" />
          <p className="sf-login-tagline">Gestao inteligente para fotografos e filmmakers.</p>
        </div>
        <div className="sf-login-benefit-list">
          {benefits.map(({ icon: Icon, title: benefitTitle, description }) => (
            <article className="sf-login-benefit-card" key={benefitTitle}>
              <Icon size={20} />
              <div><h2>{benefitTitle}</h2><p>{description}</p></div>
            </article>
          ))}
        </div>
        <footer className="sf-login-version"><span>© StudioFlow</span><span>Versao 1.0</span></footer>
      </aside>

      <section className="sf-login-form-side" aria-labelledby="sf-login-title">
        <form className="sf-login-form" onSubmit={handleEmailSubmit}>
          <img src={Logo} alt="StudioFlow" className="sf-login-mobile-logo" />
          <div className="sf-login-form-heading"><h1 id="sf-login-title">{title}</h1><p>{subtitle}</p></div>

          {visibleError && <div className="sf-login-alert"><AlertTriangle size={18} /><span>{visibleError}</span></div>}
          {successMessage && <div className="sf-login-alert"><span>{successMessage}</span></div>}
          {!isSupabaseConfigured && <div className="sf-login-alert"><AlertTriangle size={18} /><span>Configure o Supabase para ativar a autenticacao.</span></div>}

          {mode !== 'update-password' && (
            <label className="sf-login-field">
              <span>Email</span>
              <input required type="email" autoComplete="email" placeholder="seuemail@studio.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
          )}
          {mode !== 'recovery' && (
            <label className="sf-login-field">
              <span>{mode === 'update-password' ? 'Nova senha' : 'Senha'}</span>
              <input required minLength="6" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Digite sua senha" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
          )}

          {mode === 'login' && (
            <div className="sf-login-options">
              <label><input type="checkbox" name="remember" /><span>Lembrar de mim</span></label>
              <button type="button" onClick={() => changeMode('recovery')}>Esqueceu sua senha?</button>
            </div>
          )}

          <button type="submit" className="sf-login-submit" disabled={isSubmitting || !isSupabaseConfigured}>
            {isSubmitting ? 'Aguarde...' : mode === 'register' ? 'Criar conta' : mode === 'recovery' ? 'Enviar link' : mode === 'update-password' ? 'Salvar nova senha' : 'Entrar'}
          </button>

          {mode === 'register' && pendingConfirmationEmail && (
            <button type="button" className="sf-login-google" onClick={handleResendConfirmation} disabled={isResending || isSubmitting}>
              {isResending && <Loader2 size={18} className="sf-login-spinner" />}
              <span>{isResending ? 'Reenviando...' : 'Reenviar e-mail de confirmação'}</span>
            </button>
          )}

          {mode === 'login' && (
            <>
              <div className="sf-login-separator"><span /><strong>OU</strong><span /></div>
              <button type="button" className="sf-login-google" onClick={handleGoogleLogin} disabled={isSubmitting || !isSupabaseConfigured}>
                {isSubmitting ? <Loader2 size={18} className="sf-login-spinner" /> : <span className="sf-login-google-mark">G</span>}
                <span>Continuar com Google</span>
              </button>
            </>
          )}

          <p className="sf-login-create">
            {mode === 'register' ? 'Ja possui conta?' : mode === 'login' ? 'Nao possui conta?' : 'Lembrou sua senha?'}
            <button type="button" onClick={() => changeMode(mode === 'register' ? 'login' : mode === 'login' ? 'register' : 'login')}>
              {mode === 'register' ? 'Entrar' : mode === 'login' ? 'Criar conta' : 'Voltar ao login'}
            </button>
          </p>
        </form>
      </section>
    </main>
  );
}
