import { useEffect } from 'react';

export default function useKeyboardShortcuts(handler) {
  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}
