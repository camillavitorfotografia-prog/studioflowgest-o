import {
  useEffect,
} from 'react';
import { X } from 'lucide-react';

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = '500px',
}) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        padding: 'clamp(10px, 2.4vw, 24px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(5px)',
      }}
    >
      <div
        className="glass"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          padding: 'clamp(16px, 3vw, 32px)',
          position: 'relative',
          overflowY: 'auto',
          overflowX: 'hidden',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          scrollbarWidth: 'thin',
        }}
      >
        <div
          style={{
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <h2
            style={{
              margin: 0,
              color: 'var(--text-main)',
              fontSize: 'clamp(1.15rem, 2.5vw, 1.5rem)',
              fontWeight: '600',
            }}
          >
            {title}
          </h2>

          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            style={{
              width: '36px',
              height: '36px',
              flex: '0 0 auto',
              padding: 0,
              display: 'grid',
              placeItems: 'center',
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
              borderRadius: '50%',
              cursor: 'pointer',
              transition: 'var(--transition-fast)',
            }}
            onMouseOver={(event) => {
              event.currentTarget.style.backgroundColor =
                'rgba(255, 255, 255, 0.1)';
              event.currentTarget.style.color =
                'var(--text-main)';
            }}
            onMouseOut={(event) => {
              event.currentTarget.style.backgroundColor =
                'transparent';
              event.currentTarget.style.color =
                'var(--text-secondary)';
            }}
          >
            <X size={24} />
          </button>
        </div>

        <div>
          {children}
        </div>
      </div>
    </div>
  );
}