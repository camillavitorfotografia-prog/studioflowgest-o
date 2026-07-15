export const alignElements = (elements, selectedIds, mode) => {
  const selected = elements.filter((item) => selectedIds.includes(item.id) && !item.locked);
  if (selected.length < 2) return elements;

  const left = Math.min(...selected.map((item) => Number(item.x || 0)));
  const top = Math.min(...selected.map((item) => Number(item.y || 0)));
  const right = Math.max(...selected.map((item) => Number(item.x || 0) + Number(item.width || 0)));
  const bottom = Math.max(...selected.map((item) => Number(item.y || 0) + Number(item.height || 0)));
  const centerX = left + ((right - left) / 2);
  const centerY = top + ((bottom - top) / 2);

  return elements.map((item) => {
    if (!selectedIds.includes(item.id) || item.locked) return item;
    const width = Number(item.width || 0);
    const height = Number(item.height || 0);
    const patch = {};

    if (mode === 'left') patch.x = left;
    if (mode === 'center') patch.x = centerX - (width / 2);
    if (mode === 'right') patch.x = right - width;
    if (mode === 'top') patch.y = top;
    if (mode === 'middle') patch.y = centerY - (height / 2);
    if (mode === 'bottom') patch.y = bottom - height;

    return { ...item, ...patch };
  });
};

export const distributeElements = (elements, selectedIds, axis) => {
  const selected = elements
    .filter((item) => selectedIds.includes(item.id) && !item.locked)
    .sort((a, b) => axis === 'horizontal'
      ? Number(a.x || 0) - Number(b.x || 0)
      : Number(a.y || 0) - Number(b.y || 0));

  if (selected.length < 3) return elements;

  const first = selected[0];
  const last = selected[selected.length - 1];
  const totalSize = selected.reduce((sum, item) => sum + Number(axis === 'horizontal' ? item.width : item.height || 0), 0);
  const start = Number(axis === 'horizontal' ? first.x : first.y || 0);
  const end = Number(axis === 'horizontal' ? last.x : last.y || 0)
    + Number(axis === 'horizontal' ? last.width : last.height || 0);
  const gap = (end - start - totalSize) / (selected.length - 1);
  const positions = new Map();
  let cursor = start;

  selected.forEach((item) => {
    positions.set(item.id, cursor);
    cursor += Number(axis === 'horizontal' ? item.width : item.height || 0) + gap;
  });

  return elements.map((item) => {
    if (!positions.has(item.id)) return item;
    return axis === 'horizontal'
      ? { ...item, x: Math.round(positions.get(item.id)) }
      : { ...item, y: Math.round(positions.get(item.id)) };
  });
};
