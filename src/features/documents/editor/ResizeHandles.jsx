const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export default function ResizeHandles({ onPointerDown, onPointerMove, onPointerUp }) {
  return HANDLES.map((handle) => (
    <span
      key={handle}
      className={`contract-resize-handle handle-${handle}`}
      onPointerDown={(event) => onPointerDown(event, handle)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  ));
}
