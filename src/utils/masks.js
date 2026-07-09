// Mascara para Moeda (R$ 1.500,00)
export const maskCurrency = (value) => {
  if (value === null || value === undefined) return '';

  let v = value.toString().replace(/\D/g, '');
  if (v === '') return '';

  v = (parseInt(v, 10) / 100).toFixed(2);
  v = v.replace('.', ',');
  v = v.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');

  return `R$ ${v}`;
};

export const maskPhone = (value) => {
  if (!value) return '';

  let v = value.toString().replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);

  if (v.length === 0) return '';
  if (v.length <= 2) return `(${v}`;
  if (v.length === 3) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
  if (v.length <= 7) return `(${v.slice(0, 2)}) ${v.slice(2, 3)} ${v.slice(3)}`;

  return `(${v.slice(0, 2)}) ${v.slice(2, 3)} ${v.slice(3, 7)}-${v.slice(7)}`;
};

export const capitalizeName = (value) => {
  if (!value) return '';

  const preposicoes = ['de', 'da', 'do', 'das', 'dos', 'e'];

  return value
    .split(' ')
    .map((word, index) => {
      const lowerWord = word.toLowerCase();
      if (index !== 0 && preposicoes.includes(lowerWord)) return lowerWord;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

export const capitalizeFirst = (value) => {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export const maskInstagram = (value) => {
  if (!value) return '';
  const clean = value.toString().replace(/^@+/, '').replace(/\s/g, '');
  return clean ? `@${clean}` : '';
};

export const maskDate = (value) => {
  if (!value) return '';
  const v = value.toString().replace(/\D/g, '').slice(0, 8);
  if (v.length <= 2) return v;
  if (v.length <= 4) return `${v.slice(0, 2)}/${v.slice(2)}`;
  return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
};

export const dateToInput = (value) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }
  return maskDate(value);
};

export const inputToDate = (value) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const [day, month, year] = value.split('/');
  if (!day || !month || !year || year.length !== 4) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};
