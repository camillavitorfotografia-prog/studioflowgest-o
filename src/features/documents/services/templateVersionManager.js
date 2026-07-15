import * as tmplApi from '../api/documentTemplateApi';

const now = () => new Date().toISOString();

const OFFICIAL_CONTRACT_CATEGORIES = [
  'casamento',
  'ensaio',
  'formatura',
];

const getCanonicalContractBaseId = (
  category,
) => (
  `contract-${category}`
);

const getBaseTemplateId = (template = {}) => {
  if (
    template.documentType === 'contract'
    && OFFICIAL_CONTRACT_CATEGORIES.includes(
      template.category,
    )
  ) {
    return getCanonicalContractBaseId(
      template.category,
    );
  }

  return (
    template.baseTemplateId
    || template.id
    || null
  );
};

const belongsToSameTemplate = (
  item,
  template,
) => (
  getBaseTemplateId(item)
  === getBaseTemplateId(template)
);

const getNextVersion = (
  templates = [],
  template,
) => {
  const group = templates.filter(
    (item) => belongsToSameTemplate(
      item,
      template,
    ),
  );

  const maxVersion = group.reduce(
    (maximum, item) => Math.max(
      maximum,
      Number(item.version || 0),
    ),
    0,
  );

  return Math.max(
    maxVersion,
    Number(template.version || 0),
  ) + 1;
};

const sortByVersion = (items) => (
  [...items].sort(
    (first, second) => (
      Number(second.version || 0)
      - Number(first.version || 0)
    ),
  )
);

export async function markAsLatest(
  templateId,
) {
  if (!templateId) return null;

  const current = await tmplApi.getTemplate(
    templateId,
  );

  if (!current) return null;

  const all = await tmplApi.listTemplates();
  const baseTemplateId =
    getBaseTemplateId(current);

  const group = all.filter(
    (item) => (
      getBaseTemplateId(item)
      === baseTemplateId
    ),
  );

  await Promise.all(
    group.map((item) => (
      tmplApi.saveTemplate({
        ...item,
        baseTemplateId,
        isLatest:
          item.id === current.id,
        updatedAt: now(),
      })
    )),
  );

  return tmplApi.getTemplate(current.id);
}

export async function createDraftVersion(
  template,
) {
  const all = await tmplApi.listTemplates();
  const nextVersion = getNextVersion(
    all,
    template,
  );
  const baseTemplateId =
    getBaseTemplateId(template);

  const draft = {
    ...template,
    id: null,
    baseTemplateId,
    slug: baseTemplateId,
    version: nextVersion,
    status: 'draft',
    isPublished: false,
    isLatest: true,
    publishedAt: null,
    createdAt: now(),
    updatedAt: now(),
  };

  const saved = await tmplApi.saveTemplate(
    draft,
  );

  await markAsLatest(saved.id);

  return tmplApi.getTemplate(saved.id);
}

export async function publishNewVersion(
  template,
) {
  const baseTemplateId =
    getBaseTemplateId(template);

  if (
    template.id
    && !template.isPublished
  ) {
    const published = await tmplApi.saveTemplate({
      ...template,
      baseTemplateId,
      slug: baseTemplateId,
      status: 'published',
      isPublished: true,
      isLatest: true,
      publishedAt: now(),
      updatedAt: now(),
    });

    await markAsLatest(published.id);

    return tmplApi.getTemplate(
      published.id,
    );
  }

  const all = await tmplApi.listTemplates();
  const nextVersion = getNextVersion(
    all,
    template,
  );

  const published = await tmplApi.saveTemplate({
    ...template,
    id: null,
    baseTemplateId,
    slug: baseTemplateId,
    version: nextVersion,
    status: 'published',
    isPublished: true,
    isLatest: true,
    publishedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  });

  await markAsLatest(published.id);

  return tmplApi.getTemplate(
    published.id,
  );
}

export async function getLatestPublishedVersion(
  slugOrId,
) {
  const all = await tmplApi.listTemplates();

  const candidates = all.filter((item) => {
    const baseTemplateId =
      getBaseTemplateId(item);

    return (
      item.id === slugOrId
      || item.slug === slugOrId
      || baseTemplateId === slugOrId
    );
  });

  return sortByVersion(
    candidates.filter(
      (item) => item.isPublished,
    ),
  )[0] || null;
}

export async function listTemplateVersions(
  slugOrId,
) {
  const all = await tmplApi.listTemplates();

  const reference = all.find((item) => (
    item.id === slugOrId
    || item.slug === slugOrId
    || getBaseTemplateId(item) === slugOrId
  ));

  if (!reference) return [];

  return sortByVersion(
    all.filter(
      (item) => belongsToSameTemplate(
        item,
        reference,
      ),
    ),
  );
}

export async function cloneTemplateVersion(
  template,
) {
  if (!template) return null;

  const all = await tmplApi.listTemplates();
  const nextVersion = getNextVersion(
    all,
    template,
  );
  const baseTemplateId =
    getBaseTemplateId(template);

  const clone = {
    ...template,
    id: null,
    baseTemplateId,
    slug: baseTemplateId,
    version: nextVersion,
    status: 'draft',
    isPublished: false,
    isLatest: true,
    publishedAt: null,
    createdAt: now(),
    updatedAt: now(),
  };

  const saved = await tmplApi.saveTemplate(
    clone,
  );

  await markAsLatest(saved.id);

  return tmplApi.getTemplate(saved.id);
}

export default {
  createDraftVersion,
  publishNewVersion,
  getLatestPublishedVersion,
  listTemplateVersions,
  cloneTemplateVersion,
  markAsLatest,
};