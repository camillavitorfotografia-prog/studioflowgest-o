import { useEffect, useRef, useState } from 'react';

export default function useEditorAutosave({ value, enabled = true, delay = 1800, onSave }) {
  const [status, setStatus] = useState('idle');
  const initializedRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled || !value || typeof onSave !== 'function') return undefined;
    if (!initializedRef.current) {
      initializedRef.current = true;
      return undefined;
    }

    setStatus('pending');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        setStatus('saving');
        await onSave(value);
        setStatus('saved');
      } catch (error) {
        console.error('Falha no salvamento automático:', error);
        setStatus('error');
      }
    }, delay);

    return () => clearTimeout(timerRef.current);
  }, [value, enabled, delay, onSave]);

  return status;
}
