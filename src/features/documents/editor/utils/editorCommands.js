export const cloneValue = (value) => JSON.parse(JSON.stringify(value));

export const reorder = (items, from, to) => {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export const moveElements = (elements, selectedIds, deltaX, deltaY) => (
  elements.map((item) => (
    selectedIds.includes(item.id)
      ? { ...item, x: Number(item.x || 0) + deltaX, y: Number(item.y || 0) + deltaY }
      : item
  ))
);

export const deleteElements = (elements, selectedIds) => (
  elements.filter((item) => !selectedIds.includes(item.id))
);


export const normalizeRect = (startX, startY, endX, endY) => ({
  x: Math.min(startX, endX),
  y: Math.min(startY, endY),
  width: Math.abs(endX - startX),
  height: Math.abs(endY - startY),
});

export const elementIntersectsRect = (element, rect) => {
  const left = Number(element.x || 0);
  const top = Number(element.y || 0);
  const right = left + Number(element.width || 0);
  const bottom = top + Number(element.height || 0);

  return (
    left < rect.x + rect.width
    && right > rect.x
    && top < rect.y + rect.height
    && bottom > rect.y
  );
};

export const getGroupedElementIds = (elements, element) => {
  if (!element?.groupId) return element?.id ? [element.id] : [];

  return elements
    .filter((item) => item.groupId === element.groupId)
    .map((item) => item.id);
};

export const expandIdsWithGroups = (elements, ids) => {
  const sourceIds = new Set(ids);
  const groupIds = new Set(
    elements
      .filter((item) => sourceIds.has(item.id) && item.groupId)
      .map((item) => item.groupId),
  );

  elements.forEach((item) => {
    if (item.groupId && groupIds.has(item.groupId)) {
      sourceIds.add(item.id);
    }
  });

  return [...sourceIds];
};

export const cloneSelectedElements = ({
  elements,
  selectedIds,
  createElementId,
  offsetX = 12,
  offsetY = 12,
}) => {
  const idMap = new Map();
  const groupIdMap = new Map();

  const copies = elements
    .filter((item) => selectedIds.includes(item.id))
    .map((item) => {
      const nextId = createElementId(item.type);
      idMap.set(item.id, nextId);

      let nextGroupId = item.groupId;

      if (item.groupId) {
        if (!groupIdMap.has(item.groupId)) {
          groupIdMap.set(item.groupId, createElementId('group'));
        }

        nextGroupId = groupIdMap.get(item.groupId);
      }

      return {
        ...cloneValue(item),
        id: nextId,
        ...(nextGroupId ? { groupId: nextGroupId } : {}),
        x: Number(item.x || 0) + offsetX,
        y: Number(item.y || 0) + offsetY,
      };
    });

  return { copies, idMap, groupIdMap };
};
