import storage from '../storage/documentStorageAdapter';
import { createPage } from '../schemas/documentTemplateSchema';
import { createId } from '../../documents/utils/documentIds';

export async function saveTemplate(template) {
  const next = { ...template };
  if (!next.id) next.id = createId('template');
  if (!Array.isArray(next.pages)) next.pages = [];
  // ensure pages have ids and default structure
  next.pages = next.pages.map((p, i) => ({ ...createPage(p), id: p.id || createId(`page-${i}`), order: p.order ?? i }));
  next.updatedAt = new Date().toISOString();
  if (!next.createdAt) next.createdAt = next.updatedAt;
  return storage.saveTemplate(next);
}

export async function getTemplate(id) {
  if (!id) return null;
  return storage.getTemplate(id);
}

export async function listTemplates(filters = null) {
  return storage.listTemplates(filters);
}

export async function deleteTemplate(id) {
  return storage.deleteTemplate(id);
}

export default { saveTemplate, getTemplate, listTemplates, deleteTemplate };
