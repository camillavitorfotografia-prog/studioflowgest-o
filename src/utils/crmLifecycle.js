export const CRM_FOLLOWUP_CADENCE_DAYS = [2, 3, 5, 10, 30];

const toDateOnly = (value = new Date()) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export const addCalendarDays = (value, days) => {
  const date = toDateOnly(value);
  date.setDate(date.getDate() + Number(days || 0));
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

export const getRestartedCadenceDate = (contactDate = new Date()) => (
  addCalendarDays(contactDate, CRM_FOLLOWUP_CADENCE_DAYS[0])
);

export const getNextCadenceDate = ({ baseDate = new Date(), cadenceIndex = 0 } = {}) => {
  const safeIndex = Math.min(
    Math.max(Number(cadenceIndex || 0), 0),
    CRM_FOLLOWUP_CADENCE_DAYS.length - 1,
  );
  return addCalendarDays(baseDate, CRM_FOLLOWUP_CADENCE_DAYS[safeIndex]);
};

export const isLeadInTrash = (lead = {}) => Boolean(
  lead.deletedAt
  || lead.deleted_at
  || lead.excluidoEm
  || lead.excluido_em
  || lead.naLixeira
  || lead.na_lixeira,
);

export const markLeadAsTrashed = (lead = {}, deletedAt = new Date().toISOString()) => ({
  ...lead,
  deleted_at: deletedAt,
  na_lixeira: true,
  updated_at: deletedAt,
});

export const restoreLeadFromTrash = (lead = {}) => ({
  ...lead,
  deleted_at: null,
  na_lixeira: false,
  updated_at: new Date().toISOString(),
});
