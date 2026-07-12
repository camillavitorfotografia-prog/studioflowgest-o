import DOCUMENT_INSTANCE_DEFAULT from '../schemas/documentInstanceSchema';

export function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }
export function isValidId(v) { return isNonEmptyString(v); }
export function isValidDocumentType(v) { return ['proposal', 'contract'].includes(v); }
export function isValidStatus(type, v) {
  const statuses = {
    proposal: ['draft', 'generated', 'sent', 'approved', 'rejected', 'expired', 'replaced'],
    contract: ['draft', 'generated', 'sent', 'signed', 'cancelled', 'replaced'],
  };
  return Array.isArray(statuses[type]) ? statuses[type].includes(v) : false;
}

export function validateTemplate(template) {
  if (!template) throw new Error('Template is required');
  if (!isValidDocumentType(template.documentType)) throw new Error('Invalid documentType');
  if (!isNonEmptyString(template.name)) throw new Error('Template name is required');
  if (!Array.isArray(template.pages)) throw new Error('Template pages must be an array');
  // validate page orders
  const orders = template.pages.map((p) => Number(p.order || 0));
  for (const o of orders) if (!Number.isFinite(o)) throw new Error('Invalid page order');
  return true;
}

export function validateInstance(instance) {
  if (!instance) throw new Error('Instance is required');
  if (!isValidDocumentType(instance.documentType)) throw new Error('Invalid documentType');
  if (!instance.templateId) throw new Error('templateId required');
  if (!instance.templateVersion) throw new Error('templateVersion required');
  return true;
}

// default export will be defined at the end to include all helpers

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

export function normalizeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function validateDimensions({ width, height, x = 0, y = 0 } = {}) {
  if (!Number.isFinite(width) || width <= 0) throw new Error('Invalid width');
  if (!Number.isFinite(height) || height <= 0) throw new Error('Invalid height');
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Invalid coordinates');
  return true;
}

export function validateFinancialValue(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n < 0) throw new Error('Invalid financial value');
  return true;
}

export function normalizeStatus(documentType, status) {
  if (!isValidDocumentType(documentType)) return status;
  const allowed = {
    proposal: ['draft', 'generated', 'sent', 'approved', 'rejected', 'expired', 'replaced'],
    contract: ['draft', 'generated', 'sent', 'signed', 'cancelled', 'replaced'],
  };
  return allowed[documentType].includes(status) ? status : 'draft';
}

export function validateProposal(proposal) {
  validateInstance(proposal);
  const statusOk = ['draft', 'generated', 'sent', 'approved', 'rejected', 'expired', 'replaced'];
  if (!statusOk.includes(proposal.status)) throw new Error('Invalid proposal status');
  if (proposal.packages && !Array.isArray(proposal.packages)) throw new Error('packages must be array');
  (proposal.packages || []).forEach((p) => {
    if (p.finalPrice !== undefined) validateFinancialValue(p.finalPrice);
    if (p.originalPrice !== undefined) validateFinancialValue(p.originalPrice);
    if (p.discount !== undefined) validateFinancialValue(p.discount);
  });
  return true;
}

export function validateContract(contract) {
  validateInstance(contract);
  const statusOk = ['draft', 'generated', 'sent', 'signed', 'cancelled', 'replaced'];
  if (!statusOk.includes(contract.status)) throw new Error('Invalid contract status');
  if (!contract.templateId) throw new Error('Contract must reference templateId');
  return true;
}

export function createEmptyTemplate() {
  // minimal empty template
  return {
    id: null,
    documentType: 'proposal',
    name: 'Novo template',
    slug: null,
    category: null,
    version: 1,
    status: 'draft',
    isPublished: false,
    isLatest: true,
    createdBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pages: [],
  };
}

export function createEmptyInstance(instance = {}) {
  return deepClone({ ...DOCUMENT_INSTANCE_DEFAULT, ...instance, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
}

const defaultExport = {
  isNonEmptyString,
  isValidId,
  isValidDocumentType,
  isValidStatus,
  validateTemplate,
  validateInstance,
  deepClone,
  normalizeArray,
  normalizeDate,
  validateDimensions,
  validateFinancialValue,
  normalizeStatus,
  validateProposal,
  validateContract,
  createEmptyTemplate,
  createEmptyInstance,
};

export default defaultExport;
