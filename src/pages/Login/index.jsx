import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AlertTriangle, CalendarDays, Loader2, TrendingUp, WalletCards } from 'lucide-react';
import Logo from '../../assets/studioflow-logo.png';
import { useAuth } from '../../contexts/useAuth';

const benefits = [
  {
    icon: CalendarDays,
    title: 'Organize sua agenda',
    description: 'Controle casamentos, ensaios e eventos em um único lugar.',
  },
  {
    icon: WalletCards,
    title: 'Controle seu financeiro',
    description: 'Acompanhe pagamentos, despesas e lucro automaticamente.',
  },
  {
    icon: TrendingUp,
    title: 'Faça seu estúdio crescer',
    description: 'CRM, clientes, projetos e relatórios totalmente integrados.',
  },
];

export default function Login() {
  const { loading, isAuthenticated, signInWithGoogle, authError, isSupabaseConfigured } = useAuth();
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const handleEmailLogin = (event) => {
    event.preventDefault();
    setSubmitError('O acesso por e-mail e senha ainda não está habilitado. Use o Google para entrar.');
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
    return (
      <div className="sf-login-screen loading">
        <Loader2 className="sf-login-spinner" size={30} />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const visibleError = submitError || authError;

  return (
    <main className="sf-login-screen">
      <aside className="sf-login-institutional" aria-label="StudioFlow">
        <div>
          <img src={Logo} alt="StudioFlow" className="sf-login-brandmark" />
          <p className="sf-login-tagline">Gestão inteligente para fotógrafos e filmmakers.</p>
        </div>

        <div className="sf-login-benefit-list">
          {benefits.map(({ icon: Icon, title, description }) => (
            <article className="sf-login-benefit-card" key={title}>
              <Icon size={20} />
              <div>
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>

        <footer className="sf-login-version">
          <span>© StudioFlow</span>
          <span>Versão 1.0</span>
        </footer>
      </aside>

      <section className="sf-login-form-side" aria-labelledby="sf-login-title">
        <form className="sf-login-form" onSubmit={handleEmailLogin}>
          <img src={Logo} alt="StudioFlow" className="sf-login-mobile-logo" />

          <div className="sf-login-form-heading">
            <h1 id="sf-login-title">Bem-vindo de volta</h1>
            <p>Entre para acessar sua conta.</p>
          </div>

          {visibleError && (
            <div className="sf-login-alert">
              <AlertTriangle size={18} />
              <span>{visibleError}</span>
            </div>
          )}

          {!isSupabaseConfigured && (
            <div className="sf-login-alert">
              <AlertTriangle size={18} />
              <span>Configure a URL real do Supabase no .env para ativar o login Google.</span>
            </div>
          )}

          <label className="sf-login-field">
            <span>Email</span>
            <input type="email" name="email" autoComplete="email" placeholder="seuemail@studio.com" />
          </label>

          <label className="sf-login-field">
            <span>Senha</span>
            <input type="password" name="password" autoComplete="current-password" placeholder="Digite sua senha" />
          </label>

          <div className="sf-login-options">
            <label>
              <input type="checkbox" name="remember" />
              <span>Lembrar de mim</span>
            </label>
            <button type="button">Esqueceu sua senha?</button>
          </div>

          <button type="submit" className="sf-login-submit">
            Entrar
          </button>

          <div className="sf-login-separator">
            <span />
            <strong>OU</strong>
            <span />
          </div>

          <button
            type="button"
            className="sf-login-google"
            onClick={handleGoogleLogin}
            disabled={isSubmitting || !isSupabaseConfigured}
          >
            {isSubmitting ? <Loader2 size={18} className="sf-login-spinner" /> : <span className="sf-login-google-mark">G</span>}
            <span>Continuar com Google</span>
          </button>

          <p className="sf-login-create">
            Não possui conta?
            <button type="button">Criar conta</button>
          </p>
        </form>
      </section>
    </main>
  );
}
