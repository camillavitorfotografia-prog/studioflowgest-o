/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  FolderOpen,
  RefreshCw,
  X,
} from 'lucide-react';

export function useKeyboardShortcuts(shortcuts = {}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const key = typeof event?.key === 'string'
        ? event.key.toLowerCase()
        : '';

      if (!key) return;

      const target = event.target;
      const tagName = String(
        target?.tagName || '',
      ).toLowerCase();

      const isEditable = (
        tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || Boolean(target?.isContentEditable)
      );

      if (isEditable && key !== 'escape') {
        return;
      }

      const isCtrl = Boolean(
        event.ctrlKey || event.metaKey,
      );

      const shortcut = shortcuts?.[key];

      if (isCtrl && typeof shortcut === 'function') {
        event.preventDefault();
        shortcut();
      }

      if (
        key === 'escape'
        && typeof shortcuts?.escape === 'function'
      ) {
        shortcuts.escape();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts]);
}

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const mountTimer = setTimeout(
        () => setMounted(true),
        0,
      );

      document.body.style.overflow = 'hidden';

      return () => {
        clearTimeout(mountTimer);
        document.body.style.overflow = '';
      };
    }

    const timer = setTimeout(
      () => setMounted(false),
      200,
    );

    document.body.style.overflow = '';

    return () => clearTimeout(timer);
  }, [isOpen]);

  if (!isOpen && !mounted) return null;

  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          zIndex: 9998,
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 0.2s ease',
        }}
      />

      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: '100%',
          maxWidth: '460px',
          backgroundColor: 'var(--bg-card, #111)',
          borderLeft: '1px solid var(--border-color, #222)',
          zIndex: 9999,
          transform: isOpen
            ? 'translateX(0)'
            : 'translateX(100%)',
          transition:
            'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-15px 0 30px rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            style={{
              fontSize: '1.15rem',
              fontWeight: 600,
              margin: 0,
              color: 'var(--text-main)',
            }}
          >
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            className="sf-icon-button"
          >
            <X size={20} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

export function Skeleton({
  type = 'card',
  lines = 3,
}) {
  if (type === 'table') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: '100%',
        }}
      >
        {[...Array(lines)].map((_, index) => (
          <div
            key={index}
            className="sf-skeleton"
            style={{
              height: '40px',
              width: '100%',
              borderRadius: 'var(--radius-sm, 6px)',
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="sf-card sf-skeleton"
      style={{
        minHeight: '120px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          height: '16px',
          width: '40%',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '4px',
        }}
      />

      <div
        style={{
          height: '12px',
          width: '85%',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '4px',
        }}
      />

      <div
        style={{
          height: '12px',
          width: '60%',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '4px',
        }}
      />
    </div>
  );
}

export function Toast({
  message,
  type = 'success',
  onClose,
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof onClose === 'function') {
        onClose();
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: {
      border: '#34d399',
      icon: <CheckCircle size={16} color="#34d399" />,
    },
    error: {
      border: '#f87171',
      icon: <AlertCircle size={16} color="#f87171" />,
    },
    warn: {
      border: '#fbbf24',
      icon: <AlertCircle size={16} color="#fbbf24" />,
    },
  };

  const selected = colors[type] || colors.success;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 20px',
        backgroundColor: 'var(--bg-card, #1c1c1f)',
        borderLeft: `4px solid ${selected.border}`,
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        borderRadius: '6px',
        animation:
          'sf-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {selected.icon}

      <span
        style={{
          color: 'var(--text-main)',
          fontSize: '0.9rem',
          fontWeight: 500,
        }}
      >
        {message}
      </span>
    </div>
  );
}

export function AutoSaveIndicator({ state }) {
  if (state === 'idle') return null;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
      }}
    >
      {state === 'saving' ? (
        <>
          <RefreshCw
            size={12}
            className="sf-pulse"
            style={{
              animation: 'spin 1s linear infinite',
            }}
          />
          <span>Salvando alterações...</span>
        </>
      ) : (
        <span style={{ color: '#34d399' }}>
          ● Alterações salvas
        </span>
      )}
    </div>
  );
}

export function EmptyState({
  title = 'Nenhum registro encontrado',
  description = 'Adicione um novo item para iniciar.',
}) {
  return (
    <div
      className="sf-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        borderStyle: 'dashed',
        opacity: 0.8,
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255,255,255,0.02)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
          border: '1px solid var(--border-color)',
        }}
      >
        <FolderOpen
          size={20}
          style={{ color: 'var(--color-highlight)' }}
        />
      </div>

      <h4
        style={{
          margin: '0 0 4px 0',
          color: 'var(--text-main)',
          fontSize: '1rem',
          fontWeight: 500,
        }}
      >
        {title}
      </h4>

      <p
        style={{
          margin: 0,
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
        }}
      >
        {description}
      </p>
    </div>
  );
}