import storage from '../storage/documentStorageAdapter';
import { createId } from '../utils/documentIds';
import PROPOSAL_INSTANCE_DEFAULT from '../schemas/proposalSchema';

export async function saveProposalInstance(instance) {
  const next = { ...PROPOSAL_INSTANCE_DEFAULT, ...instance };
  if (!next.id) next.id = createId('proposal');
  next.updatedAt = new Date().toISOString();
  if (!next.createdAt) next.createdAt = next.updatedAt;
  return storage.saveDocument(next);
}

export async function getProposalInstance(id) {
  if (!id) return null;
  return storage.getDocument(id);
}

export async function listProposalsByLead(leadId) {
  return storage.listDocuments((d) => d.documentType === 'proposal' && String(d.leadId || '') === String(leadId));
}

export async function listProposalsByClient(clientId) {
  return storage.listDocuments((d) => d.documentType === 'proposal' && String(d.clientId || '') === String(clientId));
}

export default { saveProposalInstance, getProposalInstance, listProposalsByLead, listProposalsByClient };
