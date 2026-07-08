export const parseCurrency = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  return parseFloat(value.toString().replace(/\D/g, '')) / 100 || 0;
};

export const formatCurrency = (value) => {
  const amount = Number(value) || 0;
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

export const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;

  const clean = value.toString();
  if (clean.includes('-')) {
    const [year, month, day] = clean.split('-').map(Number);
    return new Date(year, month - 1, day || 1);
  }

  if (clean.includes('/')) {
    const [day, month, year] = clean.split('/').map(Number);
    return new Date(year, month - 1, day || 1);
  }

  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatShortDate = (value) => {
  const date = parseDate(value);
  if (!date) return 'Sem data';

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
};

export const isCurrentMonth = (value, baseDate = new Date()) => {
  const date = parseDate(value);
  if (!date) return false;
  return date.getMonth() === baseDate.getMonth() && date.getFullYear() === baseDate.getFullYear();
};
