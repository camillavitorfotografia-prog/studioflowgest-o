import * as tmplApi from '../api/documentTemplateApi';

const now = () => new Date().toISOString();

const getBaseTemplateId = (template) => template.baseTemplateId || template.id || null;

const getNextVersion = (templates = [], template) => {
  const baseTemplateId = getBaseTemplateId(template);
  const group = templates.filter((item) => getBaseTemplateId(item) === baseTemplateId);
  const maxVersion = group.reduce((max, item) => Math.max(max, Number(item.version || 0)), 0);
  return Math.max(maxVersion, Number(template.version || 0)) + 1;
};

const sortByVersion = (items) => [...items].sort((a, b) => Number(b.version || 0) - Number(a.version || 0));

export async function createDraftVersion(template) {
  const all = await tmplApi.listTemplates();
  const nextVersion = getNextVersion(all, template);

  const draft = {
    ...template,
    id: null,
    baseTemplateId: getBaseTemplateId(template),
    version: nextVersion,
    isPublished: false,
    isLatest: false,
    publishedAt: null,
    createdAt: now(),
    updatedAt: now(),
  };

  return tmplApi.saveTemplate(draft);
}

export async function markAsLatest(templateId) {
  if (!templateId) return null;
  const current = await tmplApi.getTemplate(templateId);
  if (!current) return null;

  const all = await tmplApi.listTemplates();
  const group = all.filter((item) => getBaseTemplateId(item) === getBaseTemplateId(current));

  const updates = group.map((item) => {
    if (item.id === current.id) {
      return tmplApi.saveTemplate({ ...item, isLatest: true, updatedAt: now() });
    }
    if (item.isLatest) {
      return tmplApi.saveTemplate({ ...item, isLatest: false, updatedAt: now() });
    }
    return Promise.resolve(item);
  });

  await Promise.all(updates);
  return tmplApi.getTemplate(current.id);
}

export async function publishNewVersion(template) {
  const all = await tmplApi.listTemplates();
  const nextVersion = getNextVersion(all, template);

  const published = {
    ...template,
    id: null,
    baseTemplateId: getBaseTemplateId(template),
    version: nextVersion,
    isPublished: true,
    isLatest: true,
    publishedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  };

  const saved = await tmplApi.saveTemplate(published);
  await markAsLatest(saved.id);
  return saved;
}

export async function getLatestPublishedVersion(slugOrId) {
  const all = await tmplApi.listTemplates();
  const candidates = all.filter((item) => {
    const baseTemplateId = getBaseTemplateId(item);
    return (
      item.id === slugOrId ||
      item.slug === slugOrId ||
      baseTemplateId === slugOrId
    );
  });

  return sortByVersion(candidates.filter((item) => item.isPublished))[0] || null;
}

export async function listTemplateVersions(slugOrId) {
  const all = await tmplApi.listTemplates();
  return sortByVersion(all.filter((item) => {
    const baseTemplateId = getBaseTemplateId(item);
    return item.id === slugOrId || item.slug === slugOrId || baseTemplateId === slugOrId;
  }));
}

export async function cloneTemplateVersion(template) {
  if (!template) return null;
  const all = await tmplApi.listTemplates();
  const nextVersion = getNextVersion(all, template);

  const clone = {
    ...template,
    id: null,
    version: nextVersion,
    isPublished: false,
    isLatest: false,
    publishedAt: null,
    createdAt: now(),
    updatedAt: now(),
  };

  return tmplApi.saveTemplate(clone);
}

export default {
  createDraftVersion,
  publishNewVersion,
  getLatestPublishedVersion,
  listTemplateVersions,
  cloneTemplateVersion,
  markAsLatest,
};