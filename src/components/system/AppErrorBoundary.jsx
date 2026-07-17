import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[StudioFlow] Erro de renderização não tratado:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="system-state-page" role="alert">
        <section className="system-state-card">
          <span className="system-state-icon"><AlertTriangle size={28} /></span>
          <p className="system-state-eyebrow">StudioFlow</p>
          <h1>Não foi possível abrir esta tela</h1>
          <p>O sistema encontrou um erro de renderização. Seus dados não foram apagados.</p>
          <button type="button" className="system-state-button" onClick={() => window.location.reload()}>
            <RefreshCw size={17} /> Recarregar página
          </button>
          {import.meta.env.DEV && this.state.error?.message ? <code className="system-state-error">{this.state.error.message}</code> : null}
        </section>
      </main>
    );
  }
}
