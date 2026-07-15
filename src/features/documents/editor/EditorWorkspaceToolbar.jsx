import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Grid3X3,
  Maximize2,
  Minus,
  Plus,
  Ruler,
  Rows3,
  Columns3,
  ScanLine,
  Trash2,
} from 'lucide-react';

export default function EditorWorkspaceToolbar({
  zoom,
  hasSelection,
  multipleSelection,
  viewOptions,
  autosaveStatus,
  onZoomOut,
  onZoomIn,
  onResetZoom,
  onFitPage,
  onToggleView,
  onSelectAll,
  onDelete,
  onAlign,
  onDistribute,
}) {
  const saveLabel = {
    pending: 'Alterações pendentes',
    saving: 'Salvando…',
    saved: 'Salvo automaticamente',
    error: 'Falha ao salvar',
    idle: 'Salvamento automático',
  }[autosaveStatus] || 'Salvamento automático';

  return (
    <div className="contract-canvas-toolbar contract-workspace-toolbar">
      <div className="contract-toolbar-group">
        <button type="button" onClick={onZoomOut} title="Diminuir zoom"><Minus /></button>
        <span className="contract-zoom-label">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={onZoomIn} title="Aumentar zoom"><Plus /></button>
        <button type="button" onClick={onResetZoom}>100%</button>
        <button type="button" onClick={onFitPage} title="Ajustar página"><Maximize2 /></button>
      </div>

      <span className="contract-toolbar-divider" />

      <div className="contract-toolbar-group">
        <button type="button" className={viewOptions.grid ? 'is-active' : ''} onClick={() => onToggleView('grid')} title="Grid"><Grid3X3 /></button>
        <button type="button" className={viewOptions.rulers ? 'is-active' : ''} onClick={() => onToggleView('rulers')} title="Réguas"><Ruler /></button>
        <button type="button" className={viewOptions.margins ? 'is-active' : ''} onClick={() => onToggleView('margins')} title="Margens e área segura"><ScanLine /></button>
      </div>

      {multipleSelection && (
        <>
          <span className="contract-toolbar-divider" />
          <div className="contract-toolbar-group contract-alignment-actions">
            <button type="button" onClick={() => onAlign('left')} title="Alinhar à esquerda"><AlignStartVertical /></button>
            <button type="button" onClick={() => onAlign('center')} title="Centralizar horizontalmente"><AlignCenterVertical /></button>
            <button type="button" onClick={() => onAlign('right')} title="Alinhar à direita"><AlignEndVertical /></button>
            <button type="button" onClick={() => onAlign('top')} title="Alinhar ao topo"><AlignStartHorizontal /></button>
            <button type="button" onClick={() => onAlign('middle')} title="Centralizar verticalmente"><AlignCenterHorizontal /></button>
            <button type="button" onClick={() => onAlign('bottom')} title="Alinhar à base"><AlignEndHorizontal /></button>
            <button type="button" onClick={() => onDistribute('horizontal')} title="Distribuir horizontalmente"><Columns3 /></button>
            <button type="button" onClick={() => onDistribute('vertical')} title="Distribuir verticalmente"><Rows3 /></button>
          </div>
        </>
      )}

      <span className="contract-toolbar-divider" />
      <button type="button" onClick={onSelectAll}>Selecionar tudo</button>
      <button type="button" disabled={!hasSelection} onClick={onDelete}><Trash2 /> Apagar</button>
      <span className={`contract-autosave-status is-${autosaveStatus}`}>{saveLabel}</span>
    </div>
  );
}
