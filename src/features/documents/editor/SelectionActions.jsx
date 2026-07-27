import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  BringToFront,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Group,
  Layers3,
  Lock,
  MoreHorizontal,
  Paintbrush,
  Palette,
  SendToBack,
  Trash2,
  Ungroup,
  Unlock,
} from 'lucide-react';
import { useState } from 'react';

const ALIGN_ACTIONS = [
  ['left', AlignStartVertical, 'À esquerda'],
  ['center', AlignCenterVertical, 'Ao centro'],
  ['right', AlignEndVertical, 'À direita'],
  ['top', AlignStartHorizontal, 'Em cima'],
  ['middle', AlignCenterHorizontal, 'No meio'],
  ['bottom', AlignEndHorizontal, 'Embaixo'],
];

const LAYER_ACTIONS = [
  ['front', BringToFront, 'Trazer à frente'],
  ['forward', BringToFront, 'Avançar uma camada'],
  ['backward', SendToBack, 'Recuar uma camada'],
  ['back', SendToBack, 'Enviar para trás'],
];

function ActionGrid({ actions, onAction }) {
  return (
    <div className="contract-selection-action-grid">
      {actions.map(([value, Icon, label]) => (
        <button
          type="button"
          key={value}
          onClick={() => onAction(value)}
          title={label}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

export function SelectionQuickToolbar({
  bounds,
  zoom = 1,
  pageWidth = 595.28,
  selectedCount = 0,
  grouped = false,
  locked = false,
  canPaste = false,
  onCopy,
  onPaste,
  onDuplicate,
  onGroup,
  onUngroup,
  onToggleLock,
  onAlignPage,
  onLayer,
  onOpenEffects,
  onDelete,
  onOpenMore,
}) {
  const [openPanel, setOpenPanel] = useState(null);

  if (!bounds || !selectedCount) return null;

  const numericZoom = Math.max(0.35, Number(zoom || 1));
  const compact = numericZoom < 0.95 || selectedCount > 1;
  const estimatedVisualWidth = compact ? 278 : 480;
  const safeHalfWidth = Math.min(
    Number(pageWidth || 595.28) / 2,
    (estimatedVisualWidth / 2) / numericZoom,
  );
  const rawCenterX = Number(bounds.x || 0) + (Number(bounds.width || 0) / 2);
  const toolbarLeft = Math.max(
    safeHalfWidth,
    Math.min(rawCenterX, Number(pageWidth || 595.28) - safeHalfWidth),
  );
  const placeBelow = Number(bounds.y || 0) < 74;
  const toolbarTop = placeBelow
    ? Number(bounds.y || 0) + Number(bounds.height || 0) + 12
    : Number(bounds.y || 0) - 12;

  const closeAndRun = (callback, value) => {
    setOpenPanel(null);
    callback?.(value);
  };

  return (
    <div
      className={`contract-selection-quickbar ${placeBelow ? 'is-below ' : ''}${compact ? 'is-compact' : ''}`}
      style={{
        left: toolbarLeft,
        top: toolbarTop,
        '--selection-toolbar-scale': 1 / numericZoom,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" onClick={onCopy} title="Copiar (Ctrl+C)">
        <ClipboardCopy />
        <span>Copiar</span>
      </button>

      <button type="button" onClick={onDuplicate} title="Duplicar (Ctrl+D)">
        <Copy />
        <span>Duplicar</span>
      </button>

      <button
        type="button"
        onClick={onToggleLock}
        title={locked ? 'Desbloquear seleção' : 'Bloquear seleção'}
      >
        {locked ? <Unlock /> : <Lock />}
        <span>{locked ? 'Desbloquear' : 'Bloquear'}</span>
      </button>

      {selectedCount > 1 && (
        <button
          type="button"
          onClick={grouped ? onUngroup : onGroup}
          title={grouped ? 'Desagrupar (Ctrl+Shift+G)' : 'Agrupar (Ctrl+G)'}
        >
          {grouped ? <Ungroup /> : <Group />}
          <span>{grouped ? 'Desagrupar' : 'Agrupar'}</span>
        </button>
      )}

      <div className="contract-selection-popover-anchor">
        <button
          type="button"
          className={openPanel === 'position' ? 'is-active' : ''}
          onClick={() => setOpenPanel((current) => current === 'position' ? null : 'position')}
          title="Alinhar à página"
        >
          <AlignCenterHorizontal />
          <span>Posição</span>
        </button>

        {openPanel === 'position' && (
          <div className="contract-selection-popover contract-selection-position-popover">
            <strong>Alinhar à página</strong>
            <ActionGrid
              actions={ALIGN_ACTIONS}
              onAction={(value) => closeAndRun(onAlignPage, value)}
            />
          </div>
        )}
      </div>

      <div className="contract-selection-popover-anchor">
        <button
          type="button"
          className={openPanel === 'layers' ? 'is-active' : ''}
          onClick={() => setOpenPanel((current) => current === 'layers' ? null : 'layers')}
          title="Camadas"
        >
          <Layers3 />
          <span>Camada</span>
        </button>

        {openPanel === 'layers' && (
          <div className="contract-selection-popover contract-selection-layer-popover">
            <strong>Organizar camada</strong>
            <ActionGrid
              actions={LAYER_ACTIONS}
              onAction={(value) => closeAndRun(onLayer, value)}
            />
          </div>
        )}
      </div>

      {selectedCount === 1 && (
        <button type="button" onClick={onOpenEffects} title="Efeitos e aparência">
          <Palette />
          <span>Efeitos</span>
        </button>
      )}

      <button
        type="button"
        className="contract-selection-more-button"
        onClick={onOpenMore}
        title="Mais ações"
      >
        <MoreHorizontal />
      </button>

      <button
        type="button"
        className="contract-selection-delete-button"
        onClick={onDelete}
        title="Excluir seleção"
      >
        <Trash2 />
      </button>

      {canPaste && (
        <button
          type="button"
          className="contract-selection-paste-shortcut"
          onClick={onPaste}
          title="Colar"
        >
          <ClipboardPaste />
        </button>
      )}
    </div>
  );
}

export function SelectionContextMenu({
  menu,
  selectedCount = 0,
  grouped = false,
  locked = false,
  canPaste = false,
  canPasteStyle = false,
  onClose,
  onCopy,
  onPaste,
  onCopyStyle,
  onPasteStyle,
  onDuplicate,
  onGroup,
  onUngroup,
  onToggleLock,
  onAlignPage,
  onLayer,
  onOpenEffects,
  onDelete,
}) {
  if (!menu) return null;

  const run = (callback, value) => {
    callback?.(value);
    onClose?.();
  };

  return (
    <div
      className="contract-selection-context-layer"
      onPointerDown={onClose}
      role="presentation"
    >
      <div
        className="contract-selection-context-menu"
        style={{ left: menu.x, top: menu.y }}
        onPointerDown={(event) => event.stopPropagation()}
        role="menu"
      >
        <div className="contract-selection-context-heading">
          <div>
            <strong>{selectedCount > 1 ? `${selectedCount} elementos` : 'Elemento selecionado'}</strong>
            <span>Organize sem alterar o conteúdo</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className="contract-selection-context-primary">
          <button type="button" onClick={() => run(onCopy)}><ClipboardCopy /><span>Copiar</span><kbd>Ctrl+C</kbd></button>
          <button type="button" onClick={() => run(onCopyStyle)}><Paintbrush /><span>Copiar estilo</span><kbd>Ctrl+Alt+C</kbd></button>
          <button type="button" disabled={!canPaste} onClick={() => run(onPaste)}><ClipboardPaste /><span>Colar</span><kbd>Ctrl+V</kbd></button>
          <button type="button" disabled={!canPasteStyle} onClick={() => run(onPasteStyle)}><Paintbrush /><span>Colar estilo</span><kbd>Ctrl+Alt+V</kbd></button>
          <button type="button" onClick={() => run(onDuplicate)}><Copy /><span>Duplicar</span><kbd>Ctrl+D</kbd></button>
          <button type="button" className="danger" onClick={() => run(onDelete)}><Trash2 /><span>Excluir</span><kbd>Delete</kbd></button>
        </div>

        <div className="contract-selection-context-divider" />

        <div className="contract-selection-context-row">
          {selectedCount > 1 && (
            <button type="button" onClick={() => run(grouped ? onUngroup : onGroup)}>
              {grouped ? <Ungroup /> : <Group />}
              <span>{grouped ? 'Desagrupar' : 'Agrupar'}</span>
            </button>
          )}
          <button type="button" onClick={() => run(onToggleLock)}>
            {locked ? <Unlock /> : <Lock />}
            <span>{locked ? 'Desbloquear' : 'Bloquear'}</span>
          </button>
          {selectedCount === 1 && (
            <button type="button" onClick={() => run(onOpenEffects)}>
              <Palette />
              <span>Efeitos</span>
            </button>
          )}
        </div>

        <details>
          <summary><AlignCenterHorizontal /><span>Alinhar à página</span></summary>
          <ActionGrid actions={ALIGN_ACTIONS} onAction={(value) => run(onAlignPage, value)} />
        </details>

        <details>
          <summary><Layers3 /><span>Camada</span></summary>
          <ActionGrid actions={LAYER_ACTIONS} onAction={(value) => run(onLayer, value)} />
        </details>
      </div>
    </div>
  );
}
