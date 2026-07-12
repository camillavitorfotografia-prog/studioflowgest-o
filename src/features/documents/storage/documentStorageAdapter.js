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

const normalizeDateField = (value) => normalizeDate(value) || null;

const normalizeTemplateRecord = (template) => {
  const now = new Date().toISOString();

  const record = {
    ...template,
    id: template.id || createId('template'),
    documentType: template.documentType || 'proposal',
    name: template.name || '',
    slug: template.slug || '',
    category: template.category || '',
    version: Number(template.version || 1),
    status: template.status || 'draft',
    isPublished: Boolean(template.isPublished),
    isLatest: Boolean(template.isLatest),
    baseTemplateId: template.baseTemplateId || template.id || null,
    pages: Array.isArray(template.pages) ? template.pages : [],
    metadata: typeof template.metadata === 'object' && template.metadata !== null ? template.metadata : {},
    createdAt: normalizeDateField(template.createdAt) || now,
    updatedAt: normalizeDateField(template.updatedAt) || now,
    publishedAt: normalizeDateField(template.publishedAt),
  };

  if (!record.baseTemplateId) {
    record.baseTemplateId = record.id;
  }

  return record;
};

const normalizeDocumentRecord = (document) => {
  const now = new Date().toISOString();

  return {
    ...document,
    id: document.id || createId('document'),
    documentType: document.documentType || 'proposal',
    templateId: document.templateId || null,
    templateVersion: document.templateVersion || null,
    status: document.status || 'draft',
    leadId: document.leadId || null,
    clientId: document.clientId || null,
    projectId: document.projectId || null,
    proposalId: document.proposalId || null,
    packageOptions: normalizeArray(document.packageOptions),
    packages: normalizeArray(document.packages),
    history: normalizeArray(document.history),
    assetOverrides:
      typeof document.assetOverrides === 'object' && document.assetOverrides !== null ? document.assetOverrides : {},
    textOverrides:
      typeof document.textOverrides === 'object' && document.textOverrides !== null ? document.textOverrides : {},
    createdBy: document.createdBy || null,
    createdAt: normalizeDateField(document.createdAt) || now,
    updatedAt: normalizeDateField(document.updatedAt) || now,
    generatedAt: normalizeDateField(document.generatedAt),
    sentAt: normalizeDateField(document.sentAt),
    approvedAt: normalizeDateField(document.approvedAt),
  };
};

const getLocalTemplates = () => readStorage(STORAGE_KEYS.templates, []);
const setLocalTemplates = (templates) => writeStorage(STORAGE_KEYS.templates, templates);
const getLocalDocuments = () => readStorage(STORAGE_KEYS.documents, []);
const setLocalDocuments = (documents) => writeStorage(STORAGE_KEYS.documents, documents);

const createMatcher = (filters) => {
  if (typeof filters === 'function') {
    return filters;
  }

  return (item) => {
    if (!filters) return true;
    if (filters.documentType && item.documentType !== filters.documentType) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.leadId && String(item.leadId || '') !== String(filters.leadId)) return false;
    if (filters.clientId && String(item.clientId || '') !== String(filters.clientId)) return false;
    if (filters.proposalId && String(item.proposalId || '') !== String(filters.proposalId)) return false;
    return true;
  };
};

const transformRemoteRecord = (row) => {
  if (!row || typeof row !== 'object') return row;

  return {
    ...row,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
    publishedAt: row.published_at || row.publishedAt || null,
    generatedAt: row.generated_at || row.generatedAt || null,
    sentAt: row.sent_at || row.sentAt || null,
    approvedAt: row.approved_at || row.approvedAt || null,
  };
};

const handleSupabase = async (table, action, fallback) => {
  if (!isSupabaseConfigured) {
    return fallback();
  }

  try {
    return await action();
  } catch (error) {
    if (isMissingRelationError(error, table)) {
      return fallback();
    }

    console.error(`Supabase document storage fallback (${table}):`, error?.message || error);
    return fallback();
  }
};

const saveRemoteRecord = async (table, record) => {
  const { data, error } = await supabase.from(table).upsert([record], { onConflict: 'id' }).select().single();
  if (error) throw error;
  return transformRemoteRecord(data || record);
};

const validateDocument = (document) => {
  if (!document || !document.documentType) {
    throw new Error('Document must contain documentType');
  }

  if (document.documentType === 'proposal') {
    validateProposal(document);
    return;
  }

  if (document.documentType === 'contract') {
    validateContract(document);
    return;
  }

  throw new Error('documentType must be proposal or contract');
};

const loadRemoteById = async (table, id) => {
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? transformRemoteRecord(data) : null;
};

const loadRemoteAll = async (table) => {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  return Array.isArray(data) ? data.map(transformRemoteRecord) : [];
};

const local = {
  saveTemplate: async (template) => {
    const record = normalizeTemplateRecord(template);
    const list = getLocalTemplates();
    const foundIndex = list.findIndex((item) => item.id === record.id);
    if (foundIndex >= 0) {
      list[foundIndex] = record;
    } else {
      list.unshift(record);
    }
    setLocalTemplates(list);
    return record;
  },

  getTemplate: async (id) => {
    const found = getLocalTemplates().find((item) => item.id === id) || null;
    return found ? JSON.parse(JSON.stringify(found)) : null;
  },

  listTemplates: async (filters = null) => {
    const items = getLocalTemplates();
    const matcher = createMatcher(filters);
     // return deep clones to avoid accidental shared mutations
     return items.filter(matcher).map((item) => JSON.parse(JSON.stringify(item)));
  },

  deleteTemplate: async (id) => {
    const list = getLocalTemplates().filter((item) => item.id !== id);
    setLocalTemplates(list);
    return true;
  },

  saveDocument: async (document) => {
    const record = normalizeDocumentRecord(document);
    const list = getLocalDocuments();
    const foundIndex = list.findIndex((item) => item.id === record.id);
    if (foundIndex >= 0) {
      list[foundIndex] = record;
    } else {
      list.unshift(record);
    }
    setLocalDocuments(list);
    return record;
  },

  getDocument: async (id) => getLocalDocuments().find((item) => item.id === id) || null,

  listDocuments: async (filters = null) => {
    const items = getLocalDocuments();
    const matcher = createMatcher(filters);
    return items.filter(matcher);
  },

  deleteDocument: async (id) => {
    const list = getLocalDocuments().filter((item) => item.id !== id);
    setLocalDocuments(list);
    return true;
  },
};

const supabaseAdapter = {
  saveTemplate: async (template) => {
    const record = normalizeTemplateRecord(template);
    validateTemplate(record);
    return handleSupabase(TEMPLATE_TABLE, async () => saveRemoteRecord(TEMPLATE_TABLE, record), () => local.saveTemplate(record));
  },

  getTemplate: async (id) => handleSupabase(TEMPLATE_TABLE, async () => loadRemoteById(TEMPLATE_TABLE, id), () => local.getTemplate(id)),

  listTemplates: async (filters = null) =>
    handleSupabase(TEMPLATE_TABLE, async () => {
      const rows = await loadRemoteAll(TEMPLATE_TABLE);
      const matcher = createMatcher(filters);
      return rows.filter(matcher);
    }, () => local.listTemplates(filters)),

  deleteTemplate: async (id) => handleSupabase(TEMPLATE_TABLE, async () => {
      await supabase.from(TEMPLATE_TABLE).delete().eq('id', id);
      return true;
    }, () => local.deleteTemplate(id)),

  saveDocument: async (document) => {
    const record = normalizeDocumentRecord(document);
    validateDocument(record);
    return handleSupabase(DOCUMENT_TABLE, async () => saveRemoteRecord(DOCUMENT_TABLE, record), () => local.saveDocument(record));
  },

  getDocument: async (id) => handleSupabase(DOCUMENT_TABLE, async () => loadRemoteById(DOCUMENT_TABLE, id), () => local.getDocument(id)),

  listDocuments: async (filters = null) =>
    handleSupabase(DOCUMENT_TABLE, async () => {
      const rows = await loadRemoteAll(DOCUMENT_TABLE);
      const matcher = createMatcher(filters);
      return rows.filter(matcher);
    }, () => local.listDocuments(filters)),

  deleteDocument: async (id) => handleSupabase(DOCUMENT_TABLE, async () => {
      await supabase.from(DOCUMENT_TABLE).delete().eq('id', id);
      return true;
    }, () => local.deleteDocument(id)),
};

const adapter = isSupabaseConfigured ? supabaseAdapter : local;

export async function saveTemplate(template) {
  return adapter.saveTemplate(template);
}

export async function getTemplate(templateId) {
  return adapter.getTemplate(templateId);
}

export async function listTemplates(filters = null) {
  return adapter.listTemplates(filters);
}

export async function deleteTemplate(templateId) {
  return adapter.deleteTemplate(templateId);
}

export async function saveDocument(document) {
  return adapter.saveDocument(document);
}

export async function getDocument(documentId) {
  return adapter.getDocument(documentId);
}

export async function listDocuments(filters = null) {
  return adapter.listDocuments(filters);
}

export async function deleteDocument(documentId) {
  return adapter.deleteDocument(documentId);
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