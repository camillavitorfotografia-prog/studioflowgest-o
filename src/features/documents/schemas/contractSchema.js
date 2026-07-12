import DOCUMENT_INSTANCE_DEFAULT from './documentInstanceSchema';

export const CONTRACT_INSTANCE_DEFAULT = {
  ...DOCUMENT_INSTANCE_DEFAULT,
  documentType: 'contract',
  variableFields: {},
  originalPdfReference: null,
  originalHashSnapshot: null,
  overlayMap: null,
  status: 'draft', // draft, generated, sent, signed, cancelled, replaced
};

export default CONTRACT_INSTANCE_DEFAULT;

export function createContractSkeleton(values = {}) {
  return { ...CONTRACT_INSTANCE_DEFAULT, ...values };
}
