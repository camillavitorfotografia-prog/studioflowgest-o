import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  BringToFront,
  Layers3,
  Lock,
  Palette,
  SendToBack,
  Unlock,
} from 'lucide-react';

const ALIGN_ACTIONS = [
  ['left', AlignStartVertical, 'Esquerda'],
  ['center', AlignCenterVertical, 'Centro horizontal'],
  ['right', AlignEndVertical, 'Direita'],
  ['top', AlignStartHorizontal, 'Topo'],
  ['middle', AlignCenterHorizontal, 'Centro vertical'],
  ['bottom', AlignEndHorizontal, 'Base'],
];

const LAYER_ACTIONS = [
  ['front', BringToFront, 'Trazer à frente'],
  ['forward', BringToFront, 'Avançar'],
  ['backward', SendToBack, 'Recuar'],
  ['back', SendToBack, 'Enviar para trás'],
];

const clampOpacity = (value, fallback = 0.35) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
};

function RangeControl({ label, value, min, max, step = 1, suffix = '', onChange }) {
  return (
    <label className="contract-design-range">
      <span>{label}<b>{value}{suffix}</b></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ColorControl({ label, value, onChange }) {
  return (
    <label className="contract-design-color">
      <span>{label}</span>
      <span className="contract-design-color-input">
        <i style={{ background: value }} />
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <code>{value}</code>
      </span>
    </label>
  );
}

export default function ElementDesignPanel({
  field,
  onUpdate,
  onAlignPage,
  onLayer,
  onToggleLock,
}) {
  if (!field) return null;

  const isText = ['text', 'dynamicField'].includes(field.type);
  const isShape = ['overlay', 'polygon'].includes(field.type);
  const isImage = ['image', 'logo', 'qrcode'].includes(field.type);
  const shadowEnabled = Boolean(field.shadowEnabled);
  const textShadowEnabled = Boolean(field.textShadowEnabled);
  const backgroundEnabled = Boolean(field.backgroundEnabled);
  const fillType = field.fillType || 'solid';
  const backgroundFillType = field.backgroundFillType || 'solid';

  return (
    <section className="contract-design-properties" id="contract-element-design-properties">
      <header>
        <span><Palette /></span>
        <div>
          <h3>Posição e aparência</h3>
          <p>Alinhamento, camadas, fundos, gradientes e sombras.</p>
        </div>
      </header>

      <details open>
        <summary><Layers3 /> Organização</summary>

        <div className="contract-design-section-body">
          <span className="contract-design-label">Alinhar à página</span>
          <div className="contract-design-icon-grid six-columns">
            {ALIGN_ACTIONS.map(([value, Icon, label]) => (
              <button type="button" key={value} onClick={() => onAlignPage(value)} title={label}>
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <span className="contract-design-label">Camada</span>
          <div className="contract-design-icon-grid four-columns">
            {LAYER_ACTIONS.map(([value, Icon, label]) => (
              <button type="button" key={value} onClick={() => onLayer(value)} title={label}>
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <button type="button" className="contract-design-lock" onClick={onToggleLock}>
            {field.locked ? <Unlock /> : <Lock />}
            <span>{field.locked ? 'Desbloquear elemento' : 'Bloquear elemento'}</span>
            <small>{field.locked ? 'Permite mover e editar novamente' : 'Protege contra movimentos e alterações acidentais'}</small>
          </button>
        </div>
      </details>

      {(isText || isShape) && (
        <details open>
          <summary><Palette /> Fundo e gradiente</summary>

          <div className="contract-design-section-body">
            {isText && (
              <label className="contract-design-switch-row">
                <span>
                  <strong>Faixa de fundo</strong>
                  <small>Cria uma faixa sólida ou degradê atrás do texto.</small>
                </span>
                <input
                  type="checkbox"
                  checked={backgroundEnabled}
                  onChange={(event) => onUpdate({ backgroundEnabled: event.target.checked })}
                />
              </label>
            )}

            {(!isText || backgroundEnabled) && (
              <>
                <div className="contract-design-segmented">
                  <button
                    type="button"
                    className={(isText ? backgroundFillType : fillType) === 'solid' ? 'active' : ''}
                    onClick={() => onUpdate(isText ? { backgroundFillType: 'solid' } : { fillType: 'solid' })}
                  >
                    Cor sólida
                  </button>
                  <button
                    type="button"
                    className={(isText ? backgroundFillType : fillType) === 'gradient' ? 'active' : ''}
                    onClick={() => onUpdate(isText ? { backgroundFillType: 'gradient' } : { fillType: 'gradient' })}
                  >
                    Gradiente
                  </button>
                </div>

                <div className="contract-design-color-grid">
                  <ColorControl
                    label="Cor principal"
                    value={(isText ? field.backgroundColor : field.backgroundColor) || '#1a1a1a'}
                    onChange={(value) => onUpdate({ backgroundColor: value })}
                  />
                  {(isText ? backgroundFillType : fillType) === 'gradient' && (
                    <ColorControl
                      label="Cor secundária"
                      value={field.backgroundColor2 || '#b88746'}
                      onChange={(value) => onUpdate({ backgroundColor2: value })}
                    />
                  )}
                </div>

                {(isText ? backgroundFillType : fillType) === 'gradient' && (
                  <RangeControl
                    label="Ângulo"
                    value={Number(isText ? field.backgroundGradientAngle ?? 180 : field.gradientAngle ?? 135)}
                    min={0}
                    max={360}
                    suffix="°"
                    onChange={(value) => onUpdate(isText ? { backgroundGradientAngle: value } : { gradientAngle: value })}
                  />
                )}

                {isText && (
                  <>
                    <RangeControl
                      label="Opacidade"
                      value={Math.round(clampOpacity(field.backgroundOpacity, 0.72) * 100)}
                      min={0}
                      max={100}
                      suffix="%"
                      onChange={(value) => onUpdate({ backgroundOpacity: value / 100 })}
                    />
                    <div className="contract-design-two-columns">
                      <label>
                        Respiro interno
                        <input
                          type="number"
                          min="0"
                          max="80"
                          value={field.textPadding ?? 8}
                          onChange={(event) => onUpdate({ textPadding: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Arredondamento
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={field.backgroundRadius ?? 6}
                          onChange={(event) => onUpdate({ backgroundRadius: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </details>
      )}

      <details open>
        <summary><Palette /> Sombras</summary>

        <div className="contract-design-section-body">
          <label className="contract-design-switch-row">
            <span>
              <strong>Sombra do elemento</strong>
              <small>Destaca textos, imagens e formas do fundo.</small>
            </span>
            <input
              type="checkbox"
              checked={shadowEnabled}
              onChange={(event) => onUpdate({ shadowEnabled: event.target.checked })}
            />
          </label>

          {shadowEnabled && (
            <>
              <ColorControl
                label="Cor da sombra"
                value={field.shadowColor || '#000000'}
                onChange={(value) => onUpdate({ shadowColor: value })}
              />
              <RangeControl
                label="Opacidade"
                value={Math.round(clampOpacity(field.shadowOpacity, 0.28) * 100)}
                min={0}
                max={100}
                suffix="%"
                onChange={(value) => onUpdate({ shadowOpacity: value / 100 })}
              />
              <div className="contract-design-two-columns">
                <label>Horizontal<input type="number" value={field.shadowOffsetX ?? 0} onChange={(event) => onUpdate({ shadowOffsetX: Number(event.target.value) })} /></label>
                <label>Vertical<input type="number" value={field.shadowOffsetY ?? 6} onChange={(event) => onUpdate({ shadowOffsetY: Number(event.target.value) })} /></label>
                <label>Desfoque<input type="number" min="0" value={field.shadowBlur ?? 16} onChange={(event) => onUpdate({ shadowBlur: Number(event.target.value) })} /></label>
                <label>Expansão<input type="number" value={field.shadowSpread ?? 0} onChange={(event) => onUpdate({ shadowSpread: Number(event.target.value) })} /></label>
              </div>
            </>
          )}

          {isText && (
            <>
              <div className="contract-design-divider" />
              <label className="contract-design-switch-row">
                <span>
                  <strong>Sombra das letras</strong>
                  <small>Aplica profundidade diretamente aos caracteres.</small>
                </span>
                <input
                  type="checkbox"
                  checked={textShadowEnabled}
                  onChange={(event) => onUpdate({ textShadowEnabled: event.target.checked })}
                />
              </label>

              {textShadowEnabled && (
                <>
                  <ColorControl
                    label="Cor do texto sombreado"
                    value={field.textShadowColor || '#000000'}
                    onChange={(value) => onUpdate({ textShadowColor: value })}
                  />
                  <RangeControl
                    label="Opacidade"
                    value={Math.round(clampOpacity(field.textShadowOpacity, 0.45) * 100)}
                    min={0}
                    max={100}
                    suffix="%"
                    onChange={(value) => onUpdate({ textShadowOpacity: value / 100 })}
                  />
                  <div className="contract-design-two-columns">
                    <label>Horizontal<input type="number" value={field.textShadowOffsetX ?? 0} onChange={(event) => onUpdate({ textShadowOffsetX: Number(event.target.value) })} /></label>
                    <label>Vertical<input type="number" value={field.textShadowOffsetY ?? 2} onChange={(event) => onUpdate({ textShadowOffsetY: Number(event.target.value) })} /></label>
                    <label>Desfoque<input type="number" min="0" value={field.textShadowBlur ?? 6} onChange={(event) => onUpdate({ textShadowBlur: Number(event.target.value) })} /></label>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </details>

      {isImage && (
        <details>
          <summary><Palette /> Acabamento da imagem</summary>
          <div className="contract-design-section-body">
            <RangeControl
              label="Cantos arredondados"
              value={Number(field.borderRadius || 0)}
              min={0}
              max={120}
              onChange={(value) => onUpdate({ borderRadius: value })}
            />
          </div>
        </details>
      )}
    </section>
  );
}
