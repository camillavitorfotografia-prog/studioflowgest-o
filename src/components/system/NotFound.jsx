import { ArrowLeft, Home } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <main className="system-state-page">
      <section className="system-state-card">
        <p className="system-state-eyebrow">Erro 404</p>
        <h1>Página não encontrada</h1>
        <p>O endereço acessado não corresponde a nenhuma tela disponível no StudioFlow.</p>
        <div className="system-state-actions">
          <button type="button" className="system-state-button system-state-button--secondary" onClick={() => navigate(-1)}><ArrowLeft size={17} /> Voltar</button>
          <Link className="system-state-button" to="/dashboard"><Home size={17} /> Ir ao Dashboard</Link>
        </div>
      </section>
    </main>
  );
}
