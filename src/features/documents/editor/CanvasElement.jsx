import ResizeHandles from './ResizeHandles';
import RichTextEditor from './RichTextEditor';

export default function CanvasElement({
  item,
  selected,
  singleSelection,
  editingTextId,
  content,
  commonStyle,
  onSelect,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onResizePointerDown,
  onRememberSelection,
}) {
  const className = [
    'contract-canvas-element',
    item.type === 'logo' || item.type === 'image'
      ? 'image-element'
      : item.type === 'overlay'
        ? 'overlay-element'
        : 'text-element',
    item.metadata?.role ? `role-${item.metadata.role}` : '',
    selected ? 'selected' : '',
  ].filter(Boolean).join(' ');

  const handles = selected && singleSelection && !item.locked
    ? (
        <ResizeHandles
          onPointerDown={(event, handle) => onResizePointerDown(event, item, handle)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      )
    : null;

  if (item.type === 'logo' || item.type === 'image') {
    return (
      <div
        role="button"
        tabIndex={0}
        className={className}
        style={commonStyle}
        onClick={(event) => onSelect(item, event)}
        onPointerDown={(event) => onPointerDown(event, item)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {item.src ? (
          <img
            src={item.src}
            alt={item.alt || ''}
            draggable="false"
            style={{
              objectFit: item.objectFit || 'contain',
              objectPosition: `${item.objectPositionX ?? 50}% ${item.objectPositionY ?? 50}%`,
              transform: `scale(${item.imageScale || 1})`,
              transformOrigin: 'center',
            }}
          />
        ) : (
          <span>{item.type === 'logo' ? 'Adicionar logomarca' : 'Adicionar imagem'}</span>
        )}
        {handles}
      </div>
    );
  }

  if (item.type === 'overlay') {
    return (
      <div
        role="button"
        tabIndex={0}
        className={className}
        style={{
          ...commonStyle,
          backgroundColor: item.backgroundColor,
          border: `${item.borderWidth || 0}px solid ${item.borderColor || 'transparent'}`,
          borderRadius: item.borderRadius || 0,
        }}
        onClick={(event) => onSelect(item, event)}
        onPointerDown={(event) => onPointerDown(event, item)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {handles}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={className}
      style={{
        ...commonStyle,
        fontFamily: item.fontFamily,
        fontSize: item.fontSize,
        fontWeight: item.fontWeight,
        fontStyle: item.fontStyle || 'normal',
        textDecoration: item.textDecoration || 'none',
        color: item.color,
        textAlign: item.align,
        lineHeight: item.lineHeight,
        letterSpacing: item.letterSpacing,
      }}
      onClick={(event) => onSelect(item, event)}
      onDoubleClick={() => onDoubleClick(item)}
      onPointerDown={(event) => onPointerDown(event, item)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {item.type === 'text' ? (
        <RichTextEditor
          element={item}
          editing={editingTextId === item.id}
          onMouseUp={onRememberSelection}
          onKeyUp={onRememberSelection}
          onInput={onRememberSelection}
          onBlur={onRememberSelection}
        />
      ) : content}
      {handles}
    </div>
  );
}
