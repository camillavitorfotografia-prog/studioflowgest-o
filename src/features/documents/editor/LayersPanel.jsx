import {
  BringToFront,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  Group,
  Layers3,
  Lock,
  Pencil,
  SendToBack,
  Square,
  Type,
  Image as ImageIcon,
  Unlock,
} from 'lucide-react';
import {
  useMemo,
  useState,
} from 'react';

const getLayerIcon = (item = {}) => {
  if (item.type === 'text' || item.type === 'dynamicField') {
    return <Type />;
  }

  if (item.type === 'image' || item.type === 'logo') {
    return <ImageIcon />;
  }

  return <Square />;
};

export default function LayersPanel({
  elements = [],
  selectedIds = [],
  getLabel,
  onSelect,
  onToggleVisible,
  onToggleLocked,
  onRename,
  onReorder,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
}) {
  const [expandedGroups, setExpandedGroups] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [draggedKey, setDraggedKey] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);

  const units = useMemo(() => {
    const sorted = [...elements].sort(
      (first, second) => Number(second.zIndex || 0) - Number(first.zIndex || 0),
    );
    const seenGroups = new Set();

    return sorted.reduce((result, item) => {
      if (!item.groupId) {
        result.push({
          key: `element:${item.id}`,
          type: 'element',
          ids: [item.id],
          items: [item],
        });
        return result;
      }

      if (seenGroups.has(item.groupId)) return result;
      seenGroups.add(item.groupId);

      const groupItems = sorted.filter(
        (entry) => entry.groupId === item.groupId,
      );

      result.push({
        key: `group:${item.groupId}`,
        type: 'group',
        groupId: item.groupId,
        ids: groupItems.map((entry) => entry.id),
        items: groupItems,
      });
      return result;
    }, []);
  }, [elements]);

  const selectedCount = selectedIds.length;

  const beginRename = (unit, item = null) => {
    const key = item ? `element:${item.id}` : unit.key;
    const currentName = item
      ? item.name || getLabel(item)
      : unit.items[0]?.metadata?.groupName || 'Grupo';

    setEditingKey(key);
    setEditingValue(currentName);
  };

  const finishRename = (unit, item = null) => {
    const value = editingValue.trim();

    if (value) {
      if (item) {
        onRename?.([item.id], value, null);
      } else {
        onRename?.(unit.ids, value, unit.groupId);
      }
    }

    setEditingKey(null);
    setEditingValue('');
  };

  const handleDrop = (targetKey) => {
    if (draggedKey && draggedKey !== targetKey) {
      onReorder?.(draggedKey, targetKey);
    }

    setDraggedKey(null);
    setDragOverKey(null);
  };

  const renderName = (unit, item = null) => {
    const key = item ? `element:${item.id}` : unit.key;
    const label = item
      ? item.name || getLabel(item)
      : unit.items[0]?.metadata?.groupName || 'Grupo';

    if (editingKey === key) {
      return (
        <input
          className="contract-layer-name-input"
          value={editingValue}
          autoFocus
          onChange={(event) => setEditingValue(event.target.value)}
          onBlur={() => finishRename(unit, item)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              finishRename(unit, item);
            }

            if (event.key === 'Escape') {
              setEditingKey(null);
              setEditingValue('');
            }
          }}
        />
      );
    }

    return <span className="contract-layer-name">{label}</span>;
  };

  const renderLayerRow = (unit, item, isChild = false) => {
    const ids = item ? [item.id] : unit.ids;
    const representative = item || unit.items[0];
    const rowKey = item ? `child:${item.id}` : unit.key;
    const active = ids.some((id) => selectedIds.includes(id));
    const allHidden = ids.every((id) => (
      elements.find((entry) => entry.id === id)?.visible === false
    ));
    const allLocked = ids.every((id) => (
      elements.find((entry) => entry.id === id)?.locked
    ));

    return (
      <div
        key={rowKey}
        className={`contract-layer-row ${active ? 'active ' : ''}${
          allHidden ? 'is-hidden ' : ''
        }${allLocked ? 'is-locked ' : ''}${
          dragOverKey === unit.key ? 'drag-over' : ''
        }`}
        draggable={!isChild}
        onDragStart={() => {
          if (!isChild) setDraggedKey(unit.key);
        }}
        onDragOver={(event) => {
          if (isChild) return;
          event.preventDefault();
          setDragOverKey(unit.key);
        }}
        onDragLeave={() => setDragOverKey(null)}
        onDrop={(event) => {
          if (isChild) return;
          event.preventDefault();
          handleDrop(unit.key);
        }}
        onDragEnd={() => {
          setDraggedKey(null);
          setDragOverKey(null);
        }}
      >
        {!isChild && (
          <button
            type="button"
            className="contract-layer-drag"
            title="Arrastar para reorganizar"
            aria-label="Arrastar camada"
          >
            <GripVertical />
          </button>
        )}

        <button
          type="button"
          className="contract-layer-main"
          onClick={(event) => {
            onSelect?.(representative, event);
          }}
          onDoubleClick={() => beginRename(unit, item)}
          title="Clique para selecionar. Clique duas vezes para renomear."
        >
          {item ? getLayerIcon(item) : <Group />}
          {renderName(unit, item)}
        </button>

        <div className="contract-layer-tools">
          <button
            type="button"
            title={allHidden ? 'Mostrar camada' : 'Ocultar camada'}
            onClick={() => onToggleVisible?.(ids)}
          >
            {allHidden ? <EyeOff /> : <Eye />}
          </button>

          <button
            type="button"
            title={allLocked ? 'Desbloquear camada' : 'Bloquear camada'}
            onClick={() => onToggleLocked?.(ids)}
          >
            {allLocked ? <Lock /> : <Unlock />}
          </button>

          <button
            type="button"
            title="Renomear camada"
            onClick={() => beginRename(unit, item)}
          >
            <Pencil />
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="contract-layers-panel">
      <div className="contract-layers-header">
        <h3>Camadas</h3>
        <span>
          {selectedCount
            ? `${selectedCount} selecionado${selectedCount > 1 ? 's' : ''}`
            : `${elements.length} elemento${elements.length === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className="contract-layers-actions">
        <button
          type="button"
          title="Trazer para frente (Ctrl+])"
          disabled={!selectedCount}
          onClick={onBringForward}
        >
          <Layers3 />
        </button>
        <button
          type="button"
          title="Enviar para trás (Ctrl+[)"
          disabled={!selectedCount}
          onClick={onSendBackward}
        >
          <Layers3 />
        </button>
        <button
          type="button"
          title="Trazer totalmente para frente (Ctrl+Alt+])"
          disabled={!selectedCount}
          onClick={onBringToFront}
        >
          <BringToFront />
        </button>
        <button
          type="button"
          title="Enviar totalmente para trás (Ctrl+Alt+[)"
          disabled={!selectedCount}
          onClick={onSendToBack}
        >
          <SendToBack />
        </button>
      </div>

      <div className="contract-layers-list">
        {!units.length && (
          <div className="contract-layer-empty">
            Esta página ainda não possui elementos.
          </div>
        )}

        {units.map((unit) => {
          if (unit.type === 'element') {
            return renderLayerRow(unit, unit.items[0]);
          }

          const expanded = expandedGroups[unit.groupId] !== false;
          const groupSelected = unit.ids.some((id) => selectedIds.includes(id));

          return (
            <div
              key={unit.key}
              className={`contract-layer-group ${groupSelected ? 'selected' : ''}`}
            >
              <div className="contract-layer-row">
                <button
                  type="button"
                  className="contract-layer-expand"
                  title={expanded ? 'Recolher grupo' : 'Expandir grupo'}
                  onClick={() => {
                    setExpandedGroups((current) => ({
                      ...current,
                      [unit.groupId]: !expanded,
                    }));
                  }}
                >
                  {expanded ? <ChevronDown /> : <ChevronRight />}
                </button>
                {renderLayerRow(unit, null)}
              </div>

              {expanded && (
                <div className="contract-layer-children">
                  {unit.items.map((item) => renderLayerRow(unit, item, true))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
