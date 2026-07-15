import { Upload } from 'tus-js-client';
import { isSupabaseConfigured, supabase } from '../../../utils/supabase';
import { capitalizeName } from '../../../utils/masks';

const FILES_TABLE = 'file_assets';
const FOLDERS_TABLE = 'file_folders';
const BUCKET = 'studioflow-files';
const LOCAL_FILES_KEY = 'studioflow.fileLibrary.files.v1';
const LOCAL_FOLDERS_KEY = 'studioflow.fileLibrary.folders.v1';

const readLocal = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const writeLocal = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event('sf_storage_update'));
};

const sanitizeFileName = (name = 'arquivo') => String(name)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase();

const normalizeFile = (row = {}) => ({
  id: row.id,
  name: row.name || row.original_name || 'Arquivo',
  originalName: row.original_name || row.originalName || row.name || '',
  storagePath: row.storage_path || row.storagePath || '',
  bucket: row.bucket || BUCKET,
  mimeType: row.mime_type || row.mimeType || 'application/octet-stream',
  extension: row.extension || '',
  sizeBytes: Number(row.size_bytes || row.sizeBytes || 0),
  folderId: row.folder_id || row.folderId || null,
  clientId: row.client_id || row.clientId || null,
  projectId: row.project_id || row.projectId || null,
  favorite: Boolean(row.favorite),
  portalVisible: Boolean(row.portal_visible ?? row.portalVisible),
  status: row.status || 'active',
  metadata: row.metadata || {},
  createdAt: row.created_at || row.createdAt || null,
  updatedAt: row.updated_at || row.updatedAt || null,
  deletedAt: row.deleted_at || row.deletedAt || null,
});

const normalizeFolder = (row = {}) => ({
  id: row.id,
  name: capitalizeName(row.name || 'Nova pasta'),
  parentId: row.parent_id || row.parentId || null,
  clientId: row.client_id || row.clientId || null,
  projectId: row.project_id || row.projectId || null,
  color: row.color || 'gold',
  createdAt: row.created_at || row.createdAt || null,
  updatedAt: row.updated_at || row.updatedAt || null,
});

export async function listLibraryFiles() {
  if (!isSupabaseConfigured) {
    return readLocal(LOCAL_FILES_KEY).map(normalizeFile);
  }

  const { data, error } = await supabase
    .from(FILES_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeFile);
}

export async function listLibraryFolders() {
  if (!isSupabaseConfigured) {
    return readLocal(LOCAL_FOLDERS_KEY).map(normalizeFolder);
  }

  const { data, error } = await supabase
    .from(FOLDERS_TABLE)
    .select('*')
    .order('name');

  if (error) throw error;
  return (data || []).map(normalizeFolder);
}

export async function createLibraryFolder(input) {
  const name = capitalizeName(String(input.name || '').trim());
  if (!name) throw new Error('Informe o nome da pasta.');

  if (!isSupabaseConfigured) {
    const folder = normalizeFolder({
      ...input,
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    writeLocal(LOCAL_FOLDERS_KEY, [folder, ...readLocal(LOCAL_FOLDERS_KEY)]);
    return folder;
  }

  const { data, error } = await supabase
    .from(FOLDERS_TABLE)
    .insert({
      name,
      parent_id: input.parentId || null,
      client_id: input.clientId || null,
      project_id: input.projectId || null,
      color: input.color || 'gold',
    })
    .select('*')
    .single();

  if (error) throw error;
  return normalizeFolder(data);
}

export async function uploadLibraryFile(file, input = {}, onProgress = null) {
  if (!file) throw new Error('Selecione um arquivo.');
  if (!isSupabaseConfigured) {
    throw new Error('O Supabase precisa estar configurado para enviar arquivos.');
  }

  const [{ data: userData, error: userError }, { data: sessionData, error: sessionError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  if (userError) throw userError;
  if (sessionError) throw sessionError;

  const userId = userData?.user?.id;
  const accessToken = sessionData?.session?.access_token;
  if (!userId || !accessToken) {
    throw new Error('Sessão inválida. Entre novamente no StudioFlow.');
  }

  const assetId = crypto.randomUUID();
  const safeName = sanitizeFileName(file.name) || `arquivo-${Date.now()}`;
  const storagePath = `${userId}/${assetId}/${safeName}`;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  await new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: BUCKET,
        objectName: storagePath,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      onError: reject,
      onProgress: (bytesUploaded, bytesTotal) => {
        const progress = bytesTotal > 0
          ? Math.round((bytesUploaded / bytesTotal) * 76)
          : 0;
        onProgress?.(Math.max(1, progress));
      },
      onSuccess: resolve,
    });

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    }).catch(reject);
  });

  onProgress?.(80);
  const extension = file.name.includes('.')
    ? file.name.split('.').pop().toLowerCase()
    : '';

  const { data, error } = await supabase
    .from(FILES_TABLE)
    .insert({
      id: assetId,
      name: capitalizeName(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')),
      original_name: file.name,
      storage_path: storagePath,
      bucket: BUCKET,
      mime_type: file.type || 'application/octet-stream',
      extension,
      size_bytes: file.size || 0,
      folder_id: input.folderId || null,
      client_id: input.clientId || null,
      project_id: input.projectId || null,
      portal_visible: Boolean(input.portalVisible),
      metadata: {
        lastModified: file.lastModified || null,
      },
    })
    .select('*')
    .single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw error;
  }

  onProgress?.(100);
  return normalizeFile(data);
}

export async function updateLibraryFile(fileId, changes = {}) {
  const payload = {
    ...(changes.name !== undefined ? { name: capitalizeName(changes.name) } : {}),
    ...(changes.folderId !== undefined ? { folder_id: changes.folderId || null } : {}),
    ...(changes.clientId !== undefined ? { client_id: changes.clientId || null } : {}),
    ...(changes.projectId !== undefined ? { project_id: changes.projectId || null } : {}),
    ...(changes.favorite !== undefined ? { favorite: Boolean(changes.favorite) } : {}),
    ...(changes.portalVisible !== undefined ? { portal_visible: Boolean(changes.portalVisible) } : {}),
    ...(changes.status !== undefined ? { status: changes.status } : {}),
    ...(changes.deletedAt !== undefined ? { deleted_at: changes.deletedAt || null } : {}),
    updated_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    const files = readLocal(LOCAL_FILES_KEY);
    const next = files.map((file) => file.id === fileId ? { ...file, ...changes, updatedAt: payload.updated_at } : file);
    writeLocal(LOCAL_FILES_KEY, next);
    return normalizeFile(next.find((file) => file.id === fileId));
  }

  const { data, error } = await supabase
    .from(FILES_TABLE)
    .update(payload)
    .eq('id', fileId)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeFile(data);
}

export const moveLibraryFileToTrash = (fileId) => updateLibraryFile(fileId, {
  status: 'trash',
  deletedAt: new Date().toISOString(),
  portalVisible: false,
});

export const restoreLibraryFile = (fileId) => updateLibraryFile(fileId, {
  status: 'active',
  deletedAt: null,
});

export async function permanentlyDeleteLibraryFile(file) {
  if (!file?.id) return;

  if (!isSupabaseConfigured) {
    writeLocal(LOCAL_FILES_KEY, readLocal(LOCAL_FILES_KEY).filter((item) => item.id !== file.id));
    return;
  }

  if (file.storagePath) {
    const { error: storageError } = await supabase.storage
      .from(file.bucket || BUCKET)
      .remove([file.storagePath]);
    if (storageError) throw storageError;
  }

  const { error } = await supabase.from(FILES_TABLE).delete().eq('id', file.id);
  if (error) throw error;
}

export async function createLibrarySignedUrl(file, expiresIn = 3600) {
  if (!file?.storagePath) throw new Error('Arquivo sem caminho de armazenamento.');
  const { data, error } = await supabase.storage
    .from(file.bucket || BUCKET)
    .createSignedUrl(file.storagePath, expiresIn);
  if (error) throw error;
  return data?.signedUrl || '';
}

export { BUCKET as FILE_LIBRARY_BUCKET };
