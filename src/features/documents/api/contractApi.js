import storage from '../storage/documentStorageAdapter';
import { createId } from '../utils/documentIds';
import CONTRACT_INSTANCE_DEFAULT from '../schemas/contractSchema';

export async function saveContractInstance(instance) {
  const next = { ...CONTRACT_INSTANCE_DEFAULT, ...instance };
  if (!next.id) next.id = createId('contract');
  next.updatedAt = new Date().toISOString();
  if (!next.createdAt) next.createdAt = next.updatedAt;
  return storage.saveDocument(next);
}

export async function getContractInstance(id) {
  if (!id) return null;
  return storage.getDocument(id);
}

export async function listContractsByClient(clientId) {
  return storage.listDocuments((d) => d.documentType === 'contract' && String(d.clientId || '') === String(clientId));
}

export async function listContractsByProposal(proposalId) {
  return storage.listDocuments((d) => d.documentType === 'contract' && String(d.proposalId || '') === String(proposalId));
}

export default { saveContractInstance, getContractInstance, listContractsByClient, listContractsByProposal };
