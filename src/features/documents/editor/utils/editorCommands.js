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
