import {
  normalizeStoredValue,
  readStorage,
  STORAGE_KEYS,
  STORAGE_SCHEMA_VERSION,
  writeStorage,
} from './storage';
import { isMissingRelationError } from './dbData';
import { isSupabaseConfigured, supabase } from './supabase';

const allowedKeys = new Set(Object.values(STORAGE_KEYS));
const remoteTables = [
  'clientes',
  'leads',
  'equipamentos',
  'projetos',
  'financas',
  'perfil',
  'document_templates',
  'document_instances',
  'galleries',
  'gallery_photos',
  'gallery_events',
  'client_portals',
  'file_folders',
  'file_assets',
];

const readRemoteTable = async (table) => {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    if (isMissingRelationError(error, table)) {
      return { table, rows: [], skipped: true, error: '' };
    }
    return {
      table,
      rows: [],
      skipped: true,
      error: error.message || 'Falha ao consultar a tabela.',
    };
  }
  return { table, rows: Array.isArray(data) ? data : [], skipped: false, error: '' };
};

export const createBackupPayload = async () => {
  const localData = Object.fromEntries(
    [...allowedKeys].map((key) => [key, readStorage(key, null)]),
  );
  const remoteData = {};
  const warnings = [];

  if (isSupabaseConfigured) {
    const results = await Promise.all(remoteTables.map(readRemoteTable));
    results.forEach((result) => {
      remoteData[result.table] = result.rows;
      if (result.error) warnings.push(`${result.table}: ${result.error}`);
    });
  } else {
    warnings.push('Supabase não configurado: somente dados locais foram exportados.');
  }

  return {
    studioFlow: true,
    backupType: 'account-data-export',
    schemaVersion: STORAGE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    includes: {
      localPreferencesAndLegacyMirrors: true,
      supabaseRows: isSupabaseConfigured,
      storageFileBinaries: false,
    },
    warnings: [
      ...warnings,
      'Arquivos binários do Supabase Storage não estão dentro deste JSON; os registros e caminhos foram exportados.',
    ],
    data: localData,
    remoteData,
  };
};

export const validateBackupPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('O arquivo não contém um backup válido.');
  }
  const data = payload.studioFlow ? payload.data : payload;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('A seção de dados locais do backup é inválida.');
  }
  const entries = Object.entries(data).filter(([key]) => allowedKeys.has(key));
  const hasRemoteRows = payload.remoteData
    && typeof payload.remoteData === 'object'
    && Object.values(payload.remoteData).some(Array.isArray);
  if (!entries.length && !hasRemoteRows) {
    throw new Error('Nenhum dado reconhecido do StudioFlow foi encontrado.');
  }
  return entries;
};

const restoreRemoteData = async (remoteData = {}) => {
  if (!isSupabaseConfigured || !remoteData || typeof remoteData !== 'object') {
    return { tables: 0, rows: 0, warnings: [] };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData?.user?.id;
  if (!userId) throw new Error('Entre na conta antes de restaurar os dados do Supabase.');

  let tables = 0;
  let rows = 0;
  const warnings = [];
  const pendingGalleryCovers = [];

  for (const table of remoteTables) {
    const tableRows = Array.isArray(remoteData[table]) ? remoteData[table] : [];
    if (!tableRows.length) continue;

    const payload = tableRows.map((row) => {
      const nextRow = {
        ...row,
        ...(Object.prototype.hasOwnProperty.call(row, 'user_id') ? { user_id: userId } : {}),
      };

      // O identificador do perfil é derivado da conta. Reutilizar o id de outra
      // conta causaria conflito de chave primária durante uma restauração.
      if (table === 'perfil') {
        nextRow.id = `studio-profile-${userId}`;
      }

      // A capa referencia gallery_photos, que só é restaurada na etapa seguinte.
      // A referência é reaplicada depois de todas as fotos existirem.
      if (table === 'galleries' && nextRow.cover_photo_id) {
        pendingGalleryCovers.push({
          galleryId: nextRow.id,
          coverPhotoId: nextRow.cover_photo_id,
        });
        nextRow.cover_photo_id = null;
      }

      return nextRow;
    });

    const { error } = await supabase.from(table).upsert(payload);
    if (error) {
      if (isMissingRelationError(error, table)) {
        warnings.push(`${table}: tabela não disponível nesta instalação.`);
        continue;
      }
      throw new Error(`Falha ao restaurar ${table}: ${error.message}`);
    }
    tables += 1;
    rows += payload.length;
  }

  for (const cover of pendingGalleryCovers) {
    const { error } = await supabase
      .from('galleries')
      .update({ cover_photo_id: cover.coverPhotoId })
      .eq('id', cover.galleryId);

    if (error) {
      warnings.push(
        `galleries: a capa da galeria ${cover.galleryId} não pôde ser restaurada (${error.message}).`,
      );
    }
  }

  return { tables, rows, warnings };
};

export const restoreBackupPayload = async (payload) => {
  const normalized = validateBackupPayload(payload)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => [key, normalizeStoredValue(key, value)]);

  const remoteResult = await restoreRemoteData(payload.remoteData);
  normalized.forEach(([key, value]) => {
    const stored = writeStorage(key, value, { emit: false });
    if (!stored) throw new Error(`Não foi possível restaurar a área local [${key}].`);
  });

  window.dispatchEvent(new CustomEvent('sf_storage_update', {
    detail: { restored: true },
  }));
  window.dispatchEvent(new Event('storage'));

  return {
    localSections: normalized.length,
    remoteTables: remoteResult.tables,
    remoteRows: remoteResult.rows,
    warnings: remoteResult.warnings,
  };
};
