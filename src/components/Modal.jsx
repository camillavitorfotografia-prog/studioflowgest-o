import {
  useEffect,
} from 'react';
import { X } from 'lucide-react';
import './Modal.css';

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
      className="sf-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="glass sf-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth }}
      >
        <div className="sf-modal-header">
          <h2>{title}</h2>

          <button
            type="button"
            className="sf-modal-close"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className="sf-modal-content">
          {children}
        </div>
      </div>
    </div>
  );
}