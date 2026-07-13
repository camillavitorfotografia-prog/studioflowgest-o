// Máscara para moeda brasileira.
export const maskCurrency = (value) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';

    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  const digits = String(value).replace(/\D/g, '');

  if (!digits) return '';

  const amount = Number(digits) / 100;

  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const maskPhone = (value) => {
  if (!value) return '';

  let v = value.toString().replace(/\D/g, '');

  if (v.length > 11) {
    v = v.slice(0, 11);
  }

  if (v.length === 0) return '';

  if (v.length <= 2) {
    return `(${v}`;
  }

  if (v.length === 3) {
    return `(${v.slice(0, 2)}) ${v.slice(2)}`;
  }

  if (v.length <= 7) {
    return `(${v.slice(0, 2)}) ${v.slice(2, 3)} ${v.slice(3)}`;
  }

  return `(${v.slice(0, 2)}) ${v.slice(2, 3)} ${v.slice(3, 7)}-${v.slice(7)}`;
};

export const capitalizeName = (value) => {
  if (!value) return '';

  const preposicoes = [
    'de',
    'da',
    'do',
    'das',
    'dos',
    'e',
  ];

  return value
    .split(' ')
    .map((word, index) => {
      const lowerWord = word.toLowerCase();

      if (
        index !== 0
        && preposicoes.includes(lowerWord)
      ) {
        return lowerWord;
      }

      return (
        word.charAt(0).toUpperCase()
        + word.slice(1).toLowerCase()
      );
    })
    .join(' ');
};

export const capitalizeFirst = (value) => {
  if (!value) return '';

  return value.charAt(0).toUpperCase() + value.slice(1);
};

export const maskInstagram = (value) => {
  if (!value) return '';

  const clean = value
    .toString()
    .replace(/^@+/, '')
    .replace(/\s/g, '');

  return clean ? `@${clean}` : '';
};

export const maskDate = (value) => {
  if (!value) return '';

  const digits = value
    .toString()
    .replace(/\D/g, '')
    .slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return (
    `${digits.slice(0, 2)}/`
    + `${digits.slice(2, 4)}/`
    + digits.slice(4)
  );
};

export const maskMonth = (value) => {
  if (!value) return '';

  const digits = value
    .toString()
    .replace(/\D/g, '')
    .slice(0, 6);

  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const isValidDateParts = (
  day,
  month,
  year,
) => {
  const dayNumber = Number(day);
  const monthNumber = Number(month);
  const yearNumber = Number(year);

  if (
    !Number.isInteger(dayNumber)
    || !Number.isInteger(monthNumber)
    || !Number.isInteger(yearNumber)
    || yearNumber < 1900
    || monthNumber < 1
    || monthNumber > 12
    || dayNumber < 1
  ) {
    return false;
  }

  const date = new Date(
    yearNumber,
    monthNumber - 1,
    dayNumber,
  );

  return (
    date.getFullYear() === yearNumber
    && date.getMonth() === monthNumber - 1
    && date.getDate() === dayNumber
  );
};

export const dateToInput = (value) => {
  if (!value) return '';

  const stringValue = String(value);

  if (
    /^\d{2}\/\d{2}\/\d{4}$/.test(stringValue)
  ) {
    return stringValue;
  }

  if (
    /^\d{4}-\d{2}-\d{2}/.test(stringValue)
  ) {
    const [
      year,
      month,
      day,
    ] = stringValue
      .slice(0, 10)
      .split('-');

    return `${day}/${month}/${year}`;
  }

  return maskDate(stringValue);
};

export const inputToDate = (value) => {
  if (!value) return '';

  const stringValue = String(value).trim();

  if (
    /^\d{4}-\d{2}-\d{2}/.test(stringValue)
  ) {
    const [
      year,
      month,
      day,
    ] = stringValue
      .slice(0, 10)
      .split('-');

    return isValidDateParts(
      day,
      month,
      year,
    )
      ? `${year}-${month}-${day}`
      : '';
  }

  const match = stringValue.match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
  );

  if (!match) return '';

  const [
    ,
    day,
    month,
    year,
  ] = match;

  if (
    !isValidDateParts(
      day,
      month,
      year,
    )
  ) {
    return '';
  }

  return `${year}-${month}-${day}`;
};

export const monthToInput = (value) => {
  if (!value) return '';

  const stringValue = String(value).trim();

  if (
    /^\d{2}\/\d{4}$/.test(stringValue)
  ) {
    return stringValue;
  }

  const match = stringValue.match(
    /^(\d{4})-(\d{2})$/,
  );

  if (!match) {
    return maskMonth(stringValue);
  }

  return `${match[2]}/${match[1]}`;
};

export const inputToMonth = (value) => {
  if (!value) return '';

  const stringValue = String(value).trim();

  if (
    /^\d{4}-(0[1-9]|1[0-2])$/.test(stringValue)
  ) {
    return stringValue;
  }

  const match = stringValue.match(
    /^(0[1-9]|1[0-2])\/(\d{4})$/,
  );

  if (!match) return '';

  return `${match[2]}-${match[1]}`;
};

export const formatDateBR = (value) => {
  if (!value) return '';

  return dateToInput(value);
};

export const formatMonthBR = (value) => {
  if (!value) return '';

  return monthToInput(value);
};