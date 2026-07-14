import { Trash2 } from 'lucide-react';

export default function CanvasToolbar({
  zoom,
  hasSelection,
  onZoomOut,
  onZoomIn,
  onResetZoom,
  onSelectAll,
  onDelete,
}) {
  return (
    <div className="contract-canvas-toolbar">
      <button type="button" onClick={onZoomOut}>−</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button type="button" onClick={onZoomIn}>+</button>
      <button type="button" onClick={onResetZoom}>100%</button>
      <span className="contract-toolbar-divider" />
      <button type="button" onClick={onSelectAll}>Selecionar tudo</button>
      <button type="button" disabled={!hasSelection} onClick={onDelete}>
        <Trash2 /> Apagar
      </button>
    </div>
  );
}
