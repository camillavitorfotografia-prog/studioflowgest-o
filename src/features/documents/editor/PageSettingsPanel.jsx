import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Image, Lock, Plus, Trash2, Type, Unlock } from 'lucide-react';

const Field = ({ label, children }) => <label className="property-field"><span>{label}</span>{children}</label>;
const ADD_TYPES = [['text','Texto'],['image','Imagem'],['logo','Logo'],['rectangle','Retângulo'],['line','Linha'],['circle','Círculo'],['overlay','Overlay'],['package','Pacote'],['price','Preço'],['services','Lista de serviços'],['payment','Condições de pagamento'],['testimonial','Depoimento'],['dynamic','Campo dinâmico']];

export default function PageSettingsPanel({ page, selectedElement, onChange, onUploadImage, onRemoveImage, onChangeElement, onSelectElement, onAddText, onAddElement, onAddImage, onDuplicateElement, onDeleteElement, onMoveLayer }) {
  if (!page) return <aside className="page-settings"><h2>Propriedades</h2></aside>;
  const elements = [...(page.elements || [])].sort((a,b)=>(b.zIndex||0)-(a.zIndex||0));
  const update = (patch) => selectedElement && onChangeElement(selectedElement.id,patch,true);
  return (
    <aside className="page-settings">
      <details className="add-element-menu" open>
        <summary><Plus/> Adicionar elemento</summary>
        <div>
          {ADD_TYPES.map(([type,label]) => type === 'image' ? <label key={type}><Image/>{label}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onAddImage(event.target.files?.[0])} /></label> : <button type="button" key={type} onClick={() => type === 'text' ? onAddText() : onAddElement(type)}><Plus/>{label}</button>)}
        </div>
      </details>

      {selectedElement ? (
        <>
          <div className="inspector-heading">
            <div><span>Elemento selecionado</span><h2>{selectedElement.name || selectedElement.type}</h2></div>
            <button type="button" onClick={() => update({ locked: !selectedElement.locked })}>{selectedElement.locked ? <Lock/> : <Unlock/>}</button>
          </div>

          <Field label="Nome da camada"><input value={selectedElement.name || ''} onChange={(event) => update({ name: event.target.value })} /></Field>

          { (selectedElement.type === 'text' || selectedElement.type === 'pricing') && (
            <>
              <details className="panel-section" open>
                <summary>Conteúdo</summary>
                <Field label="Conteúdo / exemplo"><textarea value={selectedElement.content || ''} onChange={(event) => update({ content: event.target.value })} /></Field>
              </details>

              <details className="panel-section" open>
                <summary>Fonte</summary>
                <div className="property-grid">
                  <Field label="Fonte">
                    <select value={selectedElement.fontFamily || 'Arial'} onChange={(event) => update({ fontFamily: event.target.value })}>
                      <option value="Playfair Display">Playfair Display</option>
                      <option value="Cormorant Garamond">Cormorant Garamond</option>
                      <option value="Libre Baskerville">Libre Baskerville</option>
                      <option value="Lora">Lora</option>
                      <option value="Merriweather">Merriweather</option>
                      <option value="Montserrat">Montserrat</option>
                      <option value="Inter">Inter</option>
                      <option value="Poppins">Poppins</option>
                      <option value="Open Sans">Open Sans</option>
                      <option value="Raleway">Raleway</option>
                      <option value="Dancing Script">Dancing Script</option>
                      <option value="Great Vibes">Great Vibes</option>
                      <option value="Allura">Allura</option>
                      <option value="Sacramento">Sacramento</option>
                      <option value="Parisienne">Parisienne</option>
                      <option value="Arial">Arial</option>
                      <option value="Helvetica">Helvetica</option>
                    </select>
                  </Field>
                  <Field label="Tamanho"><input type="number" min="6" max="300" value={selectedElement.fontSize || 16} onChange={(event) => update({ fontSize: Number(event.target.value) })} /></Field>
                  <Field label="Peso"><select value={String(selectedElement.fontWeight || '400')} onChange={(event) => update({ fontWeight: event.target.value })}><option value="300">300</option><option value="400">400</option><option value="500">500</option><option value="600">600</option><option value="700">700</option><option value="800">800</option><option value="900">900</option></select></Field>
                  <Field label="Estilo"><select value={selectedElement.fontStyle || 'normal'} onChange={(event) => update({ fontStyle: event.target.value })}><option value="normal">Normal</option><option value="italic">Itálico</option></select></Field>
                </div>
              </details>

              <details className="panel-section" open>
                <summary>Cor</summary>
                <div className="property-grid">
                  <Field label="Cor"><input type="color" value={selectedElement.color || '#ffffff'} onChange={(event) => update({ color: event.target.value })} /></Field>
                  <Field label="Hex"><input type="text" value={selectedElement.color || '#ffffff'} onChange={(event) => update({ color: event.target.value })} /></Field>
                  <Field label="Opacidade"><input type="range" min="0" max="1" step=".01" value={selectedElement.opacity ?? 1} onChange={(event) => update({ opacity: Number(event.target.value) })} /></Field>
                  <Field label="Fundo da caixa"><input type="color" value={selectedElement.backgroundColor || '#000000'} onChange={(event) => update({ backgroundColor: event.target.value })} /></Field>
                  <Field label="Fundo opacidade"><input type="range" min="0" max="1" step=".01" value={selectedElement.backgroundOpacity ?? 1} onChange={(event) => update({ backgroundOpacity: Number(event.target.value) })} /></Field>
                </div>
              </details>

              <details className="panel-section">
                <summary>Alinhamento</summary>
                <div className="property-grid">
                  <Field label="Horizontal"><select value={selectedElement.align || 'left'} onChange={(event) => update({ align: event.target.value })}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option><option value="justify">Justificado</option></select></Field>
                  <Field label="Transformação"><select value={selectedElement.textTransform || 'none'} onChange={(event) => update({ textTransform: event.target.value })}><option value="none">Normal</option><option value="uppercase">Caixa alta</option><option value="lowercase">Caixa baixa</option><option value="capitalize">Capitalizar</option></select></Field>
                </div>
              </details>

              <details className="panel-section">
                <summary>Espaçamento</summary>
                <div className="property-grid">
                  <Field label="Line-height"><input type="number" min=".5" max="4" step=".05" value={selectedElement.lineHeight || 1.2} onChange={(event) => update({ lineHeight: Number(event.target.value) })} /></Field>
                  <Field label="Letter-spacing"><input type="number" min="-10" max="40" step=".1" value={selectedElement.letterSpacing || 0} onChange={(event) => update({ letterSpacing: Number(event.target.value) })} /></Field>
                  <Field label="Padding X"><input type="number" value={selectedElement.paddingX ?? selectedElement.padding ?? 0} onChange={(event) => update({ padding: Number(event.target.value) })} /></Field>
                  <Field label="Padding Y"><input type="number" value={selectedElement.paddingY ?? selectedElement.padding ?? 0} onChange={(event) => update({ padding: Number(event.target.value) })} /></Field>
                </div>
                <div style={{ textAlign: 'right' }}><button type="button" onClick={() => update({ lineHeight: 1.2, letterSpacing: 0, padding: 0 })}>Restaurar padrão</button></div>
              </details>

              <details className="panel-section">
                <summary>Efeitos</summary>
                <div className="property-grid">
                  <Field label="Sombra"><select value={selectedElement.shadow ? 'soft' : 'none'} onChange={(e) => update({ shadow: e.target.value === 'none' ? false : true })}><option value="none">Sem sombra</option><option value="soft">Sombra suave</option><option value="medium">Sombra média</option></select></Field>
                  <Field label="Cor da sombra"><input type="color" value={selectedElement.shadowColor || '#000000'} onChange={(event) => update({ shadowColor: event.target.value })} /></Field>
                </div>
              </details>
            </>
          )}

          {selectedElement.type === 'image' && <>
            <label className="replace-image">Substituir imagem<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onAddImage(event.target.files?.[0], selectedElement.id)} /></label>
            <div className="property-grid">
              <Field label="Zoom interno"><input type="range" min="1" max="3" step=".05" value={selectedElement.zoom || 1} onChange={(event) => update({ zoom: Number(event.target.value) })} /></Field>
              <Field label="Border radius"><input type="number" min="0" max="200" value={selectedElement.borderRadius || 0} onChange={(event) => update({ borderRadius: Number(event.target.value) })} /></Field>
              <Field label="Posição horizontal"><input type="range" min="0" max="100" value={selectedElement.positionX ?? 50} onChange={(event) => update({ positionX: Number(event.target.value) })} /></Field>
              <Field label="Posição vertical"><input type="range" min="0" max="100" value={selectedElement.positionY ?? 50} onChange={(event) => update({ positionY: Number(event.target.value) })} /></Field>
            </div>
          </>}

          <div className="property-grid">
            <Field label="X"><input type="number" value={Math.round(selectedElement.x || 0)} onChange={(event) => update({ x: Number(event.target.value) })} /></Field>
            <Field label="Y"><input type="number" value={Math.round(selectedElement.y || 0)} onChange={(event) => update({ y: Number(event.target.value) })} /></Field>
            <Field label="Largura"><input type="number" value={Math.round(selectedElement.width || 0)} onChange={(event) => update({ width: Number(event.target.value) })} /></Field>
            <Field label="Altura"><input type="number" value={Math.round(selectedElement.height || 0)} onChange={(event) => update({ height: Number(event.target.value) })} /></Field>
            <Field label="Rotação"><input type="number" value={selectedElement.rotation || 0} onChange={(event) => update({ rotation: Number(event.target.value) })} /></Field>
            <Field label="Opacidade"><input type="range" min="0" max="1" step=".01" value={selectedElement.opacity ?? 1} onChange={(event) => update({ opacity: Number(event.target.value) })} /></Field>
          </div>

          <div className="element-actions">
            <button onClick={() => onMoveLayer(selectedElement.id, 1)}><ArrowUp/>Frente</button>
            <button onClick={() => onMoveLayer(selectedElement.id, -1)}><ArrowDown/>Trás</button>
            <button onClick={() => onDuplicateElement(selectedElement.id)}><Copy/>Duplicar</button>
            <button onClick={() => update({ visible: selectedElement.visible === false })}>{selectedElement.visible === false ? <Eye/> : <EyeOff/>}</button>
            <button className="danger" onClick={() => onDeleteElement(selectedElement.id)}><Trash2/>Excluir</button>
          </div>

        </>
      ) : (
        <>
          <h2>Configurações da página</h2>
          <Field label="Nome"><input value={page.name || ''} onChange={(event) => onChange({ name: event.target.value })} /></Field>
          <label className="replace-image">Importar fundo JPG / PNG<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onUploadImage(event.target.files?.[0])} /></label>
          {page.background?.url && <button className="page-actions" onClick={onRemoveImage}>Remover fundo</button>}
          <Field label="Overlay"><input type="range" min="0" max="1" step=".05" value={page.background?.overlayOpacity || 0} onChange={(event) => onChange({ background: { ...page.background, overlayOpacity: Number(event.target.value) } })} /></Field>
        </>
      )}

      <div className="layers-panel">
        <h3>Camadas</h3>
        <div className="layer-row background-layer"><span>Fundo</span><Lock/></div>
        {elements.map((element) => (
          <div key={element.id} className={`layer-row${selectedElement?.id === element.id ? ' active' : ''}`}>
            <button type="button" className="layer-select" onClick={() => onSelectElement(element.id)}>
              <span>{element.type === 'text' ? <Type/> : <Image/>}<strong>{element.name || element.content || element.type}</strong></span>
            </button>
            <button type="button" aria-label="Alternar visibilidade" onClick={() => onChangeElement(element.id, { visible: element.visible === false })}>{element.visible === false ? <EyeOff/> : <Eye/>}</button>
            <button type="button" aria-label="Alternar bloqueio" onClick={() => onChangeElement(element.id, { locked: !element.locked })}>{element.locked ? <Lock/> : <Unlock/>}</button>
          </div>
        ))}
      </div>
    </aside>
  );
}
