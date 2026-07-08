import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children }) {
  // Se o modal não estiver aberto, não renderiza nada na tela
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(5px)', /* Efeito de vidro no fundo */
      zIndex: 1000, /* Garante que fique por cima de tudo */
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '24px'
    }}>
      <div className="glass" style={{
        width: '100%',
        maxWidth: '500px',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        position: 'relative',
        boxShadow: 'var(--shadow-lg)',
        maxHeight: '90vh',
        overflowY: 'auto' // Permite rolar se o formulário for muito grande
      }}>
        
        {/* Cabeçalho do Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ color: 'var(--text-main)', fontSize: '1.5rem', fontWeight: '600' }}>
            {title}
          </h2>
          <button 
            onClick={onClose} 
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-secondary)', 
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'var(--transition-fast)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = 'var(--text-main)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Conteúdo dinâmico (Formulário, texto, etc) que passaremos para ele */}
        <div>
          {children}
        </div>

      </div>
    </div>
  );
}