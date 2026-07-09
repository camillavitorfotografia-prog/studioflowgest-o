import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, RefreshCw, FolderOpen } from 'lucide-react';

/* ==========================================
   1. SHORTCUTS HOOK (Atalhos de Teclado)
   ========================================== */
export function useKeyboardShortcuts(shortcuts) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const isCtrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (isCtrl && shortcuts[key]) {
        event.preventDefault();
        shortcuts[key]();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

/* ==========================================
   2. PREMIUM SIDE DRAWER (Painel Lateral)
   ========================================== */
export function Drawer({ isOpen, onClose, title, children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setMounted(false), 200);
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen && !mounted) return null;

  return (
    <>
      {/* Backdrop com blur dinâmico */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)',
          zIndex: 9998, opacity: isOpen ? 1 : 0, transition: 'opacity 0.2s ease'
        }}
      />
      {/* Drawer com Slide Lateral Avançado */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, 
        width: '100%', maxWidth: '460px', backgroundColor: 'var(--bg-card, #111)',
        borderLeft: '1px solid var(--border-color, #222)', zIndex: 9999,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex', flexDirection: 'column', boxShadow: '-15px 0 30px rgba(0,0,0,0.4)'
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: '600', margin: 0, color: 'var(--text-main)' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }} className="sf-icon-button">
            <X size={20} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {children}
        </div>
      </div>
    </>
  );
}

/* ==========================================
   3. SKELETON LOADING UI (Carregamento Inteligente)
   ========================================== */
export function Skeleton({ type = 'card', lines = 3 }) {
  if (type === 'table') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
        {[...Array(lines)].map((_, i) => (
          <div key={i} className="sf-skeleton" style={{ height: '40px', width: '100%', borderRadius: 'var(--radius-sm, 6px)' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="sf-card sf-skeleton" style={{ minHeight: '120px', display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center' }}>
      <div style={{ height: '16px', width: '40%', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
      <div style={{ height: '12px', width: '85%', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }} />
      <div style={{ height: '12px', width: '60%', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }} />
    </div>
  );
}

/* ==========================================
   4. TOAST NOTIFICATIONS (Mecanismo Leve)
   ========================================== */
export function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: { border: '#34d399', bg: 'rgba(52, 211, 153, 0.05)', icon: <CheckCircle size={16} color="#34d399" /> },
    error: { border: '#f87171', bg: 'rgba(248, 113, 113, 0.05)', icon: <AlertCircle size={16} color="#f87171" /> },
    warn: { border: '#fbbf24', bg: 'rgba(251, 191, 36, 0.05)', icon: <AlertCircle size={16} color="#fbbf24" /> }
  };

  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 10000,
      display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px',
      backgroundColor: 'var(--bg-card, #1c1c1f)', borderLeft: `4px solid ${colors[type].border}`,
      boxShadow: '0 20px 40px rgba(0,0,0,0.4)', borderRadius: '6px',
      animation: 'sf-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      {colors[type].icon}
      <span style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: '500' }}>{message}</span>
    </div>
  );
}

/* ==========================================
   5. AUTO-SAVE INDICATOR (Salvamento Silencioso)
   ========================================== */
export function AutoSaveIndicator({ state }) {
  // state pode ser: 'idle' | 'saving' | 'saved'
  if (state === 'idle') return null;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
      {state === 'saving' ? (
        <>
          <RefreshCw size={12} className="sf-pulse" style={{ animation: 'spin 1s linear infinite' }} />
          <span>Salvando alterações...</span>
        </>
      ) : (
        <span style={{ color: '#34d399' }}>● Alterações salvas</span>
      )}
    </div>
  );
}

/* ==========================================
   6. PREMIUM EMPTY STATE (Estados Vazios)
   ========================================== */
export function EmptyState({ title = "Nenhum registro encontrado", description = "Adicione um novo item para iniciar." }) {
  return (
    <div className="sf-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center', borderStyle: 'dashed', opacity: 0.8 }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyCw: 'center', justifyContent: 'center', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
        <FolderOpen size={20} style={{ color: 'var(--color-highlight)' }} />
      </div>
      <h4 style={{ margin: '0 0 4px 0', color: 'var(--text-main)', fontSize: '1rem', fontWeight: '500' }}>{title}</h4>
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{description}</p>
    </div>
  );
}