import { useRef, useEffect } from 'react';

export default function PageCanvas({ page, selectedElementId, onSelectElement, onChangeElement, zoom = .78, preview = false, editingElementId = null, onEnterEdit = () => {}, onExitEdit = () => {} }) {
  const frameRef = useRef(null);
  const interactionRef = useRef(false);
  const bg = page.background || {};
  const startPointer = (event, element, mode = 'move', handle) => {
    if (preview || element.locked) return;
    event.preventDefault(); event.stopPropagation(); onSelectElement(element.id);
    const rect = frameRef.current.getBoundingClientRect(); const startX = event.clientX; const startY = event.clientY; const origin = { ...element };

    if (mode === 'rotate') {
      const center = { x: rect.left + (origin.x + origin.width / 2) / page.width * rect.width, y: rect.top + (origin.y + origin.height / 2) / page.height * rect.height };
      const startAngle = Math.atan2(startY - center.y, startX - center.x) * (180 / Math.PI);
      const rotateMove = (pointer) => {
        const angle = Math.atan2(pointer.clientY - center.y, pointer.clientX - center.x) * (180 / Math.PI);
        const diff = angle - startAngle;
        onChangeElement(element.id, { rotation: (origin.rotation || 0) + diff }, false);
      };
      interactionRef.current = true;
      const endRotate = () => { interactionRef.current = false; window.removeEventListener('pointermove', rotateMove); window.removeEventListener('pointerup', endRotate); onChangeElement(element.id, {}, true); };
      window.addEventListener('pointermove', rotateMove); window.addEventListener('pointerup', endRotate);
      return;
    }

    const move = (pointer) => {
      const dx = (pointer.clientX - startX) / rect.width * page.width;
      const dy = (pointer.clientY - startY) / rect.height * page.height;
      if (mode === 'resize') {
        let nw = origin.width; let nh = origin.height; let nx = origin.x; let ny = origin.y;
        // handle corners
        if (!handle || handle === 'br') {
          nw = Math.max(24, origin.width + dx); nh = Math.max(18, origin.height + dy);
        } else if (handle === 'bl') { nw = Math.max(24, origin.width - dx); nh = Math.max(18, origin.height + dy); nx = origin.x + dx; }
        else if (handle === 'tr') { nw = Math.max(24, origin.width + dx); nh = Math.max(18, origin.height - dy); ny = origin.y + dy; }
        else if (handle === 'tl') { nw = Math.max(24, origin.width - dx); nh = Math.max(18, origin.height - dy); nx = origin.x + dx; ny = origin.y + dy; }
        onChangeElement(element.id, { width: nw, height: nh, x: Math.max(0, Math.min(page.width - nw, nx)), y: Math.max(0, Math.min(page.height - nh, ny)) }, false);
      } else {
        onChangeElement(element.id, { x: Math.max(0, Math.min(page.width - origin.width, origin.x + dx)), y: Math.max(0, Math.min(page.height - origin.height, origin.y + dy)) }, false);
      }
    };
    const end = () => { interactionRef.current = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); onChangeElement(element.id, {}, true); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end);
  };
  useEffect(() => {
    // prevent page selecting while interacting
    const prevent = (e) => { if (interactionRef.current) e.preventDefault(); };
    window.addEventListener('selectstart', prevent);
    return () => window.removeEventListener('selectstart', prevent);
  }, []);

  if (!page) return <div className="page-canvas"><div className="page-empty">Selecione uma página</div></div>;

  return <div className={`page-canvas${preview ? ' preview' : ''}`} style={{ '--editor-zoom': zoom }} onMouseDown={() => onSelectElement(null)}><div ref={frameRef} className="page-frame" style={{ aspectRatio: `${page.width}/${page.height}` }}><div className="page-frame-inner">
    {bg.url ? <img className="page-background" src={bg.url} alt="" style={{ opacity: bg.opacity ?? 1, transform: `scale(${bg.zoom ?? 1}) rotate(${bg.rotation || 0}deg)`, objectPosition: `${bg.positionX ?? 50}% ${bg.positionY ?? 50}%` }} /> : <div className="page-empty">Adicione uma imagem ou texto</div>}
    <div className="page-overlay" style={{ background: bg.overlayColor || '#000', opacity: bg.overlayOpacity || 0 }} />
    {(page.elements || []).filter((element) => element.visible !== false && (!['text','pricing'].includes(element.type) || element.content)).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).map((element) => <div key={element.id} className={`canvas-element type-${element.type}${selectedElementId === element.id ? ' selected' : ''}${element.locked ? ' locked' : ''}`} onPointerDown={(event) => startPointer(event, element)} style={{ left: `${element.x / page.width * 100}%`, top: `${element.y / page.height * 100}%`, width: `${element.width / page.width * 100}%`, height: `${element.height / page.height * 100}%`, zIndex: element.zIndex || 1, opacity: element.opacity ?? 1, transform: `rotate(${element.rotation || 0}deg)`, color: element.color, fontFamily: element.fontFamily, fontSize: `${element.fontSize || 16}px`, fontWeight: element.fontWeight, fontStyle: element.fontStyle, textDecoration: element.underline ? 'underline' : 'none', textTransform: element.textTransform, textAlign: element.align, lineHeight: element.lineHeight, letterSpacing: `${element.letterSpacing || 0}px`, background: element.backgroundColor || element.fill, borderRadius: `${element.borderRadius || 0}px`, padding: `${element.padding || 0}px`, boxShadow: element.shadow ? '0 4px 18px rgba(0,0,0,.38)' : 'none', border: element.stroke ? `1px solid ${element.stroke}` : 'none' }}>
      {['text','pricing'].includes(element.type) ? <span className="editable-copy" contentEditable={!preview && !element.locked && editingElementId === element.id} suppressContentEditableWarning onDoubleClick={(e) => { e.stopPropagation(); if (!preview && !element.locked) { onEnterEdit(element.id); } }} onBlur={(event) => { onChangeElement(element.id, { content: event.currentTarget.textContent }, true); if (editingElementId === element.id) onExitEdit(); }}>{element.content}</span> : element.src ? <img src={element.src} alt="" style={{ objectPosition: `${element.positionX ?? 50}% ${element.positionY ?? 50}%`, transform: `scale(${element.zoom || 1})`, borderRadius: `${element.borderRadius || 0}px` }} /> : element.type === 'image' ? <span className="image-placeholder">Adicionar imagem</span> : null}
      {selectedElementId === element.id && !preview && !element.locked && <>
        <button type="button" className="resize-handle br" aria-label="Redimensionar elemento" onPointerDown={(event) => startPointer(event, element, 'resize', 'br')} />
        <button type="button" className="resize-handle bl" aria-label="Redimensionar elemento" onPointerDown={(event) => startPointer(event, element, 'resize', 'bl')} />
        <button type="button" className="resize-handle tr" aria-label="Redimensionar elemento" onPointerDown={(event) => startPointer(event, element, 'resize', 'tr')} />
        <button type="button" className="resize-handle tl" aria-label="Redimensionar elemento" onPointerDown={(event) => startPointer(event, element, 'resize', 'tl')} />
        <button type="button" className="rotate-handle" aria-label="Rotacionar elemento" onPointerDown={(event) => startPointer(event, element, 'rotate')} />
      </>}
    </div>)}
    {!preview && <><div className="canvas-guide vertical" /><div className="canvas-guide horizontal" /></>}
  </div></div></div>;
}
