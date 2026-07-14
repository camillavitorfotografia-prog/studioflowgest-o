import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';

export default function LayersPanel({
  elements,
  selectedIds,
  getLabel,
  onSelect,
  onToggleVisible,
  onToggleLocked,
}) {
  return (
    <section className="contract-layers-panel">
      <h3>Camadas</h3>
      <div className="contract-field-list">
        {[...(elements || [])]
          .sort((a, b) => Number(b.zIndex || 0) - Number(a.zIndex || 0))
          .map((item) => (
            <div key={item.id} className="contract-layer-row">
              <button
                type="button"
                className={selectedIds.includes(item.id) ? 'active' : ''}
                onClick={(event) => onSelect(item, event)}
              >
                {getLabel(item)}
              </button>
              <button
                type="button"
                title={item.visible === false ? 'Mostrar' : 'Ocultar'}
                onClick={() => onToggleVisible(item)}
              >
                {item.visible === false ? <EyeOff /> : <Eye />}
              </button>
              <button
                type="button"
                title={item.locked ? 'Desbloquear' : 'Bloquear'}
                onClick={() => onToggleLocked(item)}
              >
                {item.locked ? <Lock /> : <Unlock />}
              </button>
            </div>
          ))}
      </div>
    </section>
  );
}
