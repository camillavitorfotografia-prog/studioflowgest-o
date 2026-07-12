export const DOCUMENT_INSTANCE_DEFAULT = {
  id: null,
  documentType: 'proposal',
  templateId: null,
  templateVersion: null,
  templateSnapshot: null,
  status: 'draft',
  leadId: null,
  clientId: null,
  projectId: null,
  proposalId: null,
  pricingSnapshot: null,
  clientSnapshot: null,
  workSnapshot: null,
  studioSnapshot: null,
  packageOptions: [],
  selectedPackageId: null,
  assetOverrides: {},
  textOverrides: {},
  pdfFile: null,
  history: [],
  createdBy: null,
  createdAt: null,
  updatedAt: null,
  generatedAt: null,
  sentAt: null,
  approvedAt: null,
};

export default DOCUMENT_INSTANCE_DEFAULT;

export function createEmptyInstance({ documentType = 'proposal', templateId = null, templateVersion = null } = {}) {
  const now = new Date().toISOString();
  return {
    ...DOCUMENT_INSTANCE_DEFAULT,
    id: null,
    documentType,
    templateId,
    templateVersion,
    templateSnapshot: null,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}
