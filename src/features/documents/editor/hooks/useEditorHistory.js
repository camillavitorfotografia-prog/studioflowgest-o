import { useCallback, useState } from 'react';

const clone = (value) => (value ? JSON.parse(JSON.stringify(value)) : value);

export default function useEditorHistory(limit = 40) {
  const [history, setHistory] = useState({ past: [], future: [] });

  const record = useCallback((current) => {
    setHistory((state) => ({
      past: [...state.past.slice(-(limit - 1)), clone(current)],
      future: [],
    }));
  }, [limit]);

  const undo = useCallback((current) => {
    let value = current;
    setHistory((state) => {
      if (!state.past.length) return state;
      value = clone(state.past.at(-1));
      return {
        past: state.past.slice(0, -1),
        future: [clone(current), ...state.future].slice(0, limit),
      };
    });
    return value;
  }, [limit]);

  const redo = useCallback((current) => {
    let value = current;
    setHistory((state) => {
      if (!state.future.length) return state;
      value = clone(state.future[0]);
      return {
        past: [...state.past, clone(current)].slice(-limit),
        future: state.future.slice(1),
      };
    });
    return value;
  }, [limit]);

  const reset = useCallback(() => setHistory({ past: [], future: [] }), []);

  return {
    history,
    record,
    undo,
    redo,
    reset,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
