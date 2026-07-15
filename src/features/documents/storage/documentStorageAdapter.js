import { isSupabaseConfigured, supabase } from '../../../utils/supabase';
import { isMissingRelationError } from '../../../utils/dbData';
import { readStorage, writeStorage } from '../../../utils/storage';
import { createId } from '../utils/documentIds';
import {
  validateTemplate,
  validateProposal,
  validateContract,
  normalizeArray,
  normalizeDate,
} from '../utils/documentValidation';

const STORAGE_KEYS = {
  templates: 'studioflow.documentTemplates.v1',
  documents: 'studioflow.documentInstances.v1',
};

const TEMPLATE_TABLE = 'document_templates';
const DOCUMENT_TABLE = 'document_instances';

const OFFICIAL_CONTRACT_CATEGORIES = [
  'casamento',
  'ensaio',
  'formatura',
];

const normalizeDateField = (value) => (
  normalizeDate(value) || null
);

const getCanonicalTemplateBaseId = (
  template = {},
) => {
  if (
    template.documentType === 'contract'
    && OFFICIAL_CONTRACT_CATEGORIES.includes(
      template.category,
    )
  ) {
    return `contract-${template.category}`;
  }

  return (
    template.baseTemplateId
    || template.id
    || null
  );
};

const normalizeTemplateRecord = (
  template,
) => {
  const currentDate =
    new Date().toISOString();

  const record = {
    ...template,
    id:
      template.id
      || createId('template'),
    documentType:
      template.documentType
      || 'proposal',
    name:
      template.name
      || '',
    slug:
      template.slug
      || '',
    category:
      template.category
      || '',
    version:
      Number(template.version || 1),
    status:
      template.status
      || 'draft',
    isPublished:
      Boolean(template.isPublished),
    isLatest:
      Boolean(template.isLatest),
    baseTemplateId:
      getCanonicalTemplateBaseId(
        template,
      ),
    pages:
      Array.isArray(template.pages)
        ? template.pages
        : [],
    metadata:
      typeof template.metadata === 'object'
      && template.metadata !== null
        ? template.metadata
        : {},
    createdAt:
      normalizeDateField(template.createdAt)
      || currentDate,
    updatedAt:
      normalizeDateField(template.updatedAt)
      || currentDate,
    publishedAt:
      normalizeDateField(
        template.publishedAt,
      ),
  };

  if (!record.baseTemplateId) {
    record.baseTemplateId = record.id;
  }

  if (
    record.documentType === 'contract'
    && OFFICIAL_CONTRACT_CATEGORIES.includes(
      record.category,
    )
  ) {
    record.slug =
      record.baseTemplateId;
  }

  return record;
};

const normalizeDocumentRecord = (
  document,
) => {
  const currentDate =
    new Date().toISOString();

  return {
    ...document,
    id:
      document.id
      || createId('document'),
    documentType:
      document.documentType
      || 'proposal',
    templateId:
      document.templateId
      || null,
    templateVersion:
      document.templateVersion
      || null,
    status:
      document.status
      || 'draft',
    leadId:
      document.leadId
      || null,
    clientId:
      document.clientId
      || null,
    projectId:
      document.projectId
      || null,
    proposalId:
      document.proposalId
      || null,
    packageOptions:
      normalizeArray(
        document.packageOptions,
      ),
    packages:
      normalizeArray(document.packages),
    history:
      normalizeArray(document.history),
    assetOverrides:
      typeof document.assetOverrides
        === 'object'
      && document.assetOverrides !== null
        ? document.assetOverrides
        : {},
    textOverrides:
      typeof document.textOverrides
        === 'object'
      && document.textOverrides !== null
        ? document.textOverrides
        : {},
    createdBy:
      document.createdBy
      || null,
    createdAt:
      normalizeDateField(document.createdAt)
      || currentDate,
    updatedAt:
      normalizeDateField(document.updatedAt)
      || currentDate,
    generatedAt:
      normalizeDateField(
        document.generatedAt,
      ),
    sentAt:
      normalizeDateField(document.sentAt),
    approvedAt:
      normalizeDateField(
        document.approvedAt,
      ),
  };
};

const getLocalTemplates = () => (
  readStorage(STORAGE_KEYS.templates, [])
);

const setLocalTemplates = (templates) => (
  writeStorage(
    STORAGE_KEYS.templates,
    templates,
  )
);

const getLocalDocuments = () => (
  readStorage(STORAGE_KEYS.documents, [])
);

const setLocalDocuments = (documents) => (
  writeStorage(
    STORAGE_KEYS.documents,
    documents,
  )
);

const createMatcher = (filters) => {
  if (typeof filters === 'function') {
    return filters;
  }

  return (item) => {
    if (!filters) return true;

    if (
      filters.documentType
      && item.documentType
        !== filters.documentType
    ) {
      return false;
    }

    if (
      filters.category
      && item.category
        !== filters.category
    ) {
      return false;
    }

    if (
      filters.status
      && item.status !== filters.status
    ) {
      return false;
    }

    if (
      filters.leadId
      && String(item.leadId || '')
        !== String(filters.leadId)
    ) {
      return false;
    }

    if (
      filters.clientId
      && String(item.clientId || '')
        !== String(filters.clientId)
    ) {
      return false;
    }

    if (
      filters.proposalId
      && String(item.proposalId || '')
        !== String(filters.proposalId)
    ) {
      return false;
    }

    return true;
  };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuidReference = (value) => {
  const normalized = String(value || '').trim();

  return UUID_PATTERN.test(normalized)
    ? normalized
    : null;
};

const serializeTemplateRecord = (record) => ({
  id: record.id,
  document_type: record.documentType,
  name: record.name,
  slug: record.slug,
  category: record.category,
  version: record.version,
  status: record.status,
  is_published: record.isPublished,
  is_latest: record.isLatest,
  base_template_id: record.baseTemplateId,
  pages: record.pages,
  metadata: record.metadata,
  payload: record,
  published_at: record.publishedAt,
  created_at: record.createdAt,
  updated_at: record.updatedAt,
});

const serializeDocumentRecord = (record) => ({
  id: record.id,
  document_type: record.documentType,
  template_id: record.templateId,
  template_version: record.templateVersion,
  status: record.status,
  lead_id: record.leadId
    ? String(record.leadId)
    : null,
  client_id: normalizeUuidReference(record.clientId),
  project_id: normalizeUuidReference(record.projectId),
  proposal_id: record.proposalId
    ? String(record.proposalId)
    : null,
  package_options: record.packageOptions,
  packages: record.packages,
  history: record.history,
  asset_overrides: record.assetOverrides,
  text_overrides: record.textOverrides,
  payload: record,
  created_by: normalizeUuidReference(record.createdBy),
  generated_at: record.generatedAt,
  sent_at: record.sentAt,
  approved_at: record.approvedAt,
  created_at: record.createdAt,
  updated_at: record.updatedAt,
});

const serializeRemoteRecord = (table, record) => (
  table === TEMPLATE_TABLE
    ? serializeTemplateRecord(record)
    : serializeDocumentRecord(record)
);

const transformRemoteRecord = (row, table) => {
  if (
    !row
    || typeof row !== 'object'
  ) {
    return row;
  }

  const payload = (
    row.payload
    && typeof row.payload === 'object'
    && !Array.isArray(row.payload)
  )
    ? row.payload
    : {};

  if (table === TEMPLATE_TABLE) {
    return {
      ...payload,
      id: row.id,
      documentType:
        row.document_type
        || payload.documentType
        || 'proposal',
      name: row.name ?? payload.name ?? '',
      slug: row.slug ?? payload.slug ?? '',
      category:
        row.category
        ?? payload.category
        ?? '',
      version: Number(
        row.version
        ?? payload.version
        ?? 1,
      ),
      status:
        row.status
        || payload.status
        || 'draft',
      isPublished: Boolean(
        row.is_published
        ?? payload.isPublished,
      ),
      isLatest: Boolean(
        row.is_latest
        ?? payload.isLatest,
      ),
      baseTemplateId:
        row.base_template_id
        || payload.baseTemplateId
        || row.id,
      pages: Array.isArray(row.pages)
        ? row.pages
        : normalizeArray(payload.pages),
      metadata: (
        row.metadata
        && typeof row.metadata === 'object'
      )
        ? row.metadata
        : (payload.metadata || {}),
      createdAt:
        row.created_at
        || payload.createdAt
        || null,
      updatedAt:
        row.updated_at
        || payload.updatedAt
        || null,
      publishedAt:
        row.published_at
        || payload.publishedAt
        || null,
    };
  }

  return {
    ...payload,
    id: row.id,
    documentType:
      row.document_type
      || payload.documentType
      || 'proposal',
    templateId:
      row.template_id
      || payload.templateId
      || null,
    templateVersion:
      row.template_version
      ?? payload.templateVersion
      ?? null,
    status:
      row.status
      || payload.status
      || 'draft',
    leadId:
      row.lead_id
      || payload.leadId
      || null,
    clientId:
      row.client_id
      || payload.clientId
      || null,
    projectId:
      row.project_id
      || payload.projectId
      || null,
    proposalId:
      row.proposal_id
      || payload.proposalId
      || null,
    packageOptions: Array.isArray(row.package_options)
      ? row.package_options
      : normalizeArray(payload.packageOptions),
    packages: Array.isArray(row.packages)
      ? row.packages
      : normalizeArray(payload.packages),
    history: Array.isArray(row.history)
      ? row.history
      : normalizeArray(payload.history),
    assetOverrides: (
      row.asset_overrides
      && typeof row.asset_overrides === 'object'
    )
      ? row.asset_overrides
      : (payload.assetOverrides || {}),
    textOverrides: (
      row.text_overrides
      && typeof row.text_overrides === 'object'
    )
      ? row.text_overrides
      : (payload.textOverrides || {}),
    createdBy:
      row.created_by
      || payload.createdBy
      || null,
    createdAt:
      row.created_at
      || payload.createdAt
      || null,
    updatedAt:
      row.updated_at
      || payload.updatedAt
      || null,
    generatedAt:
      row.generated_at
      || payload.generatedAt
      || null,
    sentAt:
      row.sent_at
      || payload.sentAt
      || null,
    approvedAt:
      row.approved_at
      || payload.approvedAt
      || null,
  };
};

const handleSupabase = async (
  table,
  action,
  fallback,
) => {
  if (!isSupabaseConfigured) {
    return fallback();
  }

  try {
    return await action();
  } catch (error) {
    if (
      isMissingRelationError(
        error,
        table,
      )
    ) {
      return fallback();
    }

    console.error(
      `Supabase document storage fallback (${table}):`,
      error?.message || error,
    );

    return fallback();
  }
};

const saveRemoteRecord = async (
  table,
  record,
) => {
  const payload = serializeRemoteRecord(
    table,
    record,
  );

  const { data, error } = await supabase
    .from(table)
    .upsert(
      [payload],
      { onConflict: 'id' },
    )
    .select()
    .single();

  if (error) throw error;

  return transformRemoteRecord(
    data || payload,
    table,
  );
};

const validateDocument = (document) => {
  if (
    !document
    || !document.documentType
  ) {
    throw new Error(
      'Document must contain documentType',
    );
  }

  if (
    document.documentType === 'proposal'
  ) {
    validateProposal(document);
    return;
  }

  if (
    document.documentType === 'contract'
  ) {
    validateContract(document);
    return;
  }

  throw new Error(
    'documentType must be proposal or contract',
  );
};

const loadRemoteById = async (
  table,
  id,
) => {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;

  return data
    ? transformRemoteRecord(data, table)
    : null;
};

const loadRemoteAll = async (table) => {
  const { data, error } = await supabase
    .from(table)
    .select('*');

  if (error) throw error;

  return Array.isArray(data)
    ? data.map((row) => (
      transformRemoteRecord(row, table)
    ))
    : [];
};

const local = {
  saveTemplate: async (template) => {
    const record =
      normalizeTemplateRecord(template);
    const list = getLocalTemplates();
    const foundIndex = list.findIndex(
      (item) => item.id === record.id,
    );

    if (foundIndex >= 0) {
      list[foundIndex] = record;
    } else {
      list.unshift(record);
    }

    setLocalTemplates(list);

    return record;
  },

  getTemplate: async (id) => {
    const found = getLocalTemplates()
      .find((item) => item.id === id)
      || null;

    return found
      ? JSON.parse(JSON.stringify(found))
      : null;
  },

  listTemplates: async (
    filters = null,
  ) => {
    const items = getLocalTemplates();
    const matcher =
      createMatcher(filters);

    return items
      .filter(matcher)
      .map((item) => (
        JSON.parse(JSON.stringify(item))
      ));
  },

  deleteTemplate: async (id) => {
    const list = getLocalTemplates()
      .filter((item) => item.id !== id);

    setLocalTemplates(list);

    return true;
  },

  saveDocument: async (document) => {
    const record =
      normalizeDocumentRecord(document);
    const list = getLocalDocuments();
    const foundIndex = list.findIndex(
      (item) => item.id === record.id,
    );

    if (foundIndex >= 0) {
      list[foundIndex] = record;
    } else {
      list.unshift(record);
    }

    setLocalDocuments(list);

    return record;
  },

  getDocument: async (id) => (
    getLocalDocuments()
      .find((item) => item.id === id)
    || null
  ),

  listDocuments: async (
    filters = null,
  ) => {
    const items = getLocalDocuments();
    const matcher =
      createMatcher(filters);

    return items.filter(matcher);
  },

  deleteDocument: async (id) => {
    const list = getLocalDocuments()
      .filter((item) => item.id !== id);

    setLocalDocuments(list);

    return true;
  },
};

const supabaseAdapter = {
  saveTemplate: async (template) => {
    const record =
      normalizeTemplateRecord(template);

    validateTemplate(record);

    return handleSupabase(
      TEMPLATE_TABLE,
      () => saveRemoteRecord(
        TEMPLATE_TABLE,
        record,
      ),
      () => local.saveTemplate(record),
    );
  },

  getTemplate: async (id) => (
    handleSupabase(
      TEMPLATE_TABLE,
      () => loadRemoteById(
        TEMPLATE_TABLE,
        id,
      ),
      () => local.getTemplate(id),
    )
  ),

  listTemplates: async (
    filters = null,
  ) => (
    handleSupabase(
      TEMPLATE_TABLE,
      async () => {
        const rows = await loadRemoteAll(
          TEMPLATE_TABLE,
        );
        const matcher =
          createMatcher(filters);

        return rows.filter(matcher);
      },
      () => local.listTemplates(filters),
    )
  ),

  deleteTemplate: async (id) => (
    handleSupabase(
      TEMPLATE_TABLE,
      async () => {
        const { error } = await supabase
          .from(TEMPLATE_TABLE)
          .delete()
          .eq('id', id);

        if (error) throw error;

        return true;
      },
      () => local.deleteTemplate(id),
    )
  ),

  saveDocument: async (document) => {
    const record =
      normalizeDocumentRecord(document);

    validateDocument(record);

    return handleSupabase(
      DOCUMENT_TABLE,
      () => saveRemoteRecord(
        DOCUMENT_TABLE,
        record,
      ),
      () => local.saveDocument(record),
    );
  },

  getDocument: async (id) => (
    handleSupabase(
      DOCUMENT_TABLE,
      () => loadRemoteById(
        DOCUMENT_TABLE,
        id,
      ),
      () => local.getDocument(id),
    )
  ),

  listDocuments: async (
    filters = null,
  ) => (
    handleSupabase(
      DOCUMENT_TABLE,
      async () => {
        const rows = await loadRemoteAll(
          DOCUMENT_TABLE,
        );
        const matcher =
          createMatcher(filters);

        return rows.filter(matcher);
      },
      () => local.listDocuments(filters),
    )
  ),

  deleteDocument: async (id) => (
    handleSupabase(
      DOCUMENT_TABLE,
      async () => {
        const { error } = await supabase
          .from(DOCUMENT_TABLE)
          .delete()
          .eq('id', id);

        if (error) throw error;

        return true;
      },
      () => local.deleteDocument(id),
    )
  ),
};

const adapter = isSupabaseConfigured
  ? supabaseAdapter
  : local;

export async function saveTemplate(
  template,
) {
  return adapter.saveTemplate(template);
}

export async function getTemplate(
  templateId,
) {
  return adapter.getTemplate(templateId);
}

export async function listTemplates(
  filters = null,
) {
  return adapter.listTemplates(filters);
}

export async function deleteTemplate(
  templateId,
) {
  return adapter.deleteTemplate(
    templateId,
  );
}

export async function saveDocument(
  document,
) {
  return adapter.saveDocument(document);
}

export async function getDocument(
  documentId,
) {
  return adapter.getDocument(documentId);
}

export async function listDocuments(
  filters = null,
) {
  return adapter.listDocuments(filters);
}

export async function deleteDocument(
  documentId,
) {
  return adapter.deleteDocument(
    documentId,
  );
}

export default {
  saveTemplate,
  getTemplate,
  listTemplates,
  deleteTemplate,
  saveDocument,
  getDocument,
  listDocuments,
  deleteDocument,
};