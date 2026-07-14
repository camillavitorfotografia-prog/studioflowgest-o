import { useCallback, useState } from 'react';

export default function useCanvasSelection() {
  const [selectedIds, setSelectedIds] = useState([]);

  const select = useCallback((id, additive = false) => {
    setSelectedIds((current) => {
      if (!additive) return [id];
      return current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
    });
  }, []);

  const clear = useCallback(() => setSelectedIds([]), []);
  const selectAll = useCallback((ids) => setSelectedIds(ids), []);

  return { selectedIds, setSelectedIds, select, clear, selectAll };
}
