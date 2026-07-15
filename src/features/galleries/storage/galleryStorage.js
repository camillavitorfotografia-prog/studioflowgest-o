import { Upload } from 'tus-js-client';
import { isSupabaseConfigured, supabase } from '../../../utils/supabase';
import { capitalizeName } from '../../../utils/masks';

const GALLERIES_TABLE = 'galleries';
const PHOTOS_TABLE = 'gallery_photos';
const BUCKET = 'gallery-files';

const buildGalleryPublicUrl = (token) => {
  if (!token) return '';
  if (typeof window === 'undefined') return `/galeria/${token}`;
  return `${window.location.origin}/galeria/${token}`;
};

const randomToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const hashToken = async (token) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const normalizeGallery = (row = {}) => ({
  id: row.id,
  clientId: row.client_id || row.clientId || null,
  projectId: row.project_id || row.projectId || null,
  name: capitalizeName(row.name || 'Nova galeria'),
  status: row.status || 'draft',
  includedPhotos: Number(row.included_photos ?? row.includedPhotos ?? 0),
  additionalPrice: Number(row.additional_price ?? row.additionalPrice ?? 0),
  selectionDeadline: row.selection_deadline || row.selectionDeadline || null,
  expiresAt: row.expires_at || row.expiresAt || null,
  watermarkSettings: row.watermark_settings || row.watermarkSettings || {},
  legalNotice: row.legal_notice || row.legalNotice || '',
  settings: row.settings || {},
  deletedAt: row.deleted_at || row.deletedAt || null,
  selectionFinalizedAt: row.selection_finalized_at || row.selectionFinalizedAt || null,
  deliveryReleasedAt: row.delivery_released_at || row.deliveryReleasedAt || null,
  tokenPreview: row.access_token_preview || row.tokenPreview || '',
  createdAt: row.created_at || row.createdAt || null,
  updatedAt: row.updated_at || row.updatedAt || null,
});

const normalizePhoto = (row = {}) => ({
  id: row.id,
  galleryId: row.gallery_id || row.galleryId,
  displayName: row.display_name || row.displayName || row.original_name || 'Foto',
  originalName: row.original_name || row.originalName || '',
  originalPath: row.original_path || row.originalPath || '',
  previewPath: row.preview_path || row.previewPath || '',
  finalPath: row.final_path || row.finalPath || null,
  mimeType: row.mime_type || row.mimeType || 'image/jpeg',
  sizeBytes: Number(row.size_bytes || row.sizeBytes || 0),
  width: row.width || null,
  height: row.height || null,
  position: Number(row.position || 0),
  selected: Boolean(row.selected),
  clientComment: row.client_comment || row.clientComment || '',
  status: row.status || 'active',
  metadata: row.metadata || {},
});

export async function listGalleries({ includeTrash = false } = {}) {
  let query = supabase
    .from(GALLERIES_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  query = includeTrash
    ? query.not('deleted_at', 'is', null)
    : query.is('deleted_at', null).neq('status', 'trash');

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeGallery);
}

export async function getGallery(galleryId) {
  const [{ data: gallery, error: galleryError }, { data: photos, error: photosError }] = await Promise.all([
    supabase.from(GALLERIES_TABLE).select('*').eq('id', galleryId).single(),
    supabase.from(PHOTOS_TABLE).select('*').eq('gallery_id', galleryId).neq('status', 'deleted').order('position'),
  ]);
  if (galleryError) throw galleryError;
  if (photosError) throw photosError;
  return { gallery: normalizeGallery(gallery), photos: (photos || []).map(normalizePhoto) };
}

export async function createGallery(input) {
  if (!isSupabaseConfigured) throw new Error('A galeria exige conexão com o Supabase.');
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const { data, error } = await supabase.from(GALLERIES_TABLE).insert({
    client_id: input.clientId || null,
    project_id: input.projectId || null,
    name: capitalizeName(input.name || 'Nova galeria'),
    status: input.status || 'draft',
    access_token_hash: tokenHash,
    access_token_preview: token.slice(-8),
    included_photos: Number(input.includedPhotos || 0),
    additional_price: Number(input.additionalPrice || 0),
    selection_deadline: input.selectionDeadline || null,
    expires_at: input.expiresAt || null,
    watermark_settings: input.watermarkSettings || {},
    legal_notice: input.legalNotice,
    settings: input.settings || {},
  }).select('*').single();
  if (error) throw error;
  localStorage.setItem(`studioflow.gallery.token.${data.id}`, token);
  return { ...normalizeGallery(data), token };
}

export async function updateGallery(galleryId, changes) {
  const payload = {
    ...(changes.name !== undefined ? { name: capitalizeName(changes.name) } : {}),
    ...(changes.status !== undefined ? { status: changes.status } : {}),
    ...(changes.includedPhotos !== undefined ? { included_photos: Number(changes.includedPhotos) } : {}),
    ...(changes.additionalPrice !== undefined ? { additional_price: Number(changes.additionalPrice) } : {}),
    ...(changes.selectionDeadline !== undefined ? { selection_deadline: changes.selectionDeadline || null } : {}),
    ...(changes.expiresAt !== undefined ? { expires_at: changes.expiresAt || null } : {}),
    ...(changes.watermarkSettings !== undefined ? { watermark_settings: changes.watermarkSettings } : {}),
    ...(changes.legalNotice !== undefined ? { legal_notice: changes.legalNotice } : {}),
    ...(changes.settings !== undefined ? { settings: changes.settings } : {}),
    ...(changes.deliveryReleasedAt !== undefined ? { delivery_released_at: changes.deliveryReleasedAt || null } : {}),
    ...(changes.deletedAt !== undefined ? { deleted_at: changes.deletedAt || null } : {}),
  };
  const { data, error } = await supabase.from(GALLERIES_TABLE).update(payload).eq('id', galleryId).select('*').single();
  if (error) throw error;
  return normalizeGallery(data);
}

export const getStoredGalleryToken = (galleryId) => localStorage.getItem(`studioflow.gallery.token.${galleryId}`) || '';

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Não foi possível processar ${file.name}.`)); };
  image.src = url;
});

export async function createProtectedPreview(file, settings = {}, clientName = '') {
  const image = await loadImage(file);
  const maxWidth = Number(settings.previewMaxWidth || 1800);
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, width, height);

  const text = String(settings.text || 'PROTEGIDO').toUpperCase();
  const opacity = Math.max(0.12, Math.min(0.65, Number(settings.opacity ?? 0.3)));
  const spacing = Math.max(95, Number(settings.spacing || 170));
  const angle = (Number(settings.angle ?? -28) * Math.PI) / 180;
  const fontSize = Math.max(18, Math.round(width / 42));
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(width / 2, height / 2);
  ctx.rotate(angle);
  ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,.72)';
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  const diagonal = Math.sqrt(width * width + height * height);
  for (let y = -diagonal; y <= diagonal; y += spacing) {
    for (let x = -diagonal; x <= diagonal; x += spacing * 1.55) {
      const label = settings.showClient && clientName ? `${text} · ${capitalizeName(clientName)}` : text;
      ctx.strokeText(label, x, y);
      ctx.fillText(label, x, y);
    }
  }
  if (settings.grid !== false) {
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(255,255,255,.48)';
    for (let n = -diagonal; n <= diagonal; n += spacing) {
      ctx.beginPath(); ctx.moveTo(-diagonal, n); ctx.lineTo(diagonal, n); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(n, -diagonal); ctx.lineTo(n, diagonal); ctx.stroke();
    }
  }
  ctx.restore();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error('Não foi possível gerar a prova protegida.');
  return { blob, width, height };
}

async function uploadResumable({
  file,
  path,
  contentType,
  accessToken,
  onProgress,
  upsert = false,
}) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase não configurado para upload.');
  }

  await new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
        'x-upsert': upsert ? 'true' : 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: BUCKET,
        objectName: path,
        contentType: contentType || 'application/octet-stream',
        cacheControl: '3600',
      },
      onError: reject,
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = bytesTotal > 0
          ? Math.round((bytesUploaded / bytesTotal) * 100)
          : 0;
        onProgress?.(percentage);
      },
      onSuccess: resolve,
    });

    upload.findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      })
      .catch(reject);
  });
}

async function removeUploadedPaths(paths = []) {
  const validPaths = paths.filter(Boolean);
  if (!validPaths.length) return;

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove(validPaths);

  if (error) {
    console.warn('Não foi possível limpar arquivos incompletos da galeria:', error.message);
  }
}

export async function uploadGalleryPhotos({
  galleryId,
  files,
  watermarkSettings,
  clientName,
  onProgress,
}) {
  const [
    { data: userData, error: userError },
    { data: sessionData, error: sessionError },
  ] = await Promise.all([
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

  const current = await getGallery(galleryId);
  let position = current.photos.length;
  const results = [];
  const failures = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const photoId = crypto.randomUUID();
    const safeName = file.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .toLowerCase();

    const originalPath = `${userId}/${galleryId}/original/${photoId}-${safeName}`;
    const previewPath = `${userId}/${galleryId}/preview/${photoId}.jpg`;

    try {
      onProgress?.({
        index,
        name: file.name,
        progress: 5,
        status: 'processing',
      });

      const preview = await createProtectedPreview(
        file,
        watermarkSettings,
        clientName,
      );

      onProgress?.({
        index,
        name: file.name,
        progress: 20,
        status: 'uploading',
      });

      await uploadResumable({
        file,
        path: originalPath,
        contentType: file.type || 'image/jpeg',
        accessToken,
        onProgress: (value) => {
          onProgress?.({
            index,
            name: file.name,
            progress: 20 + Math.round(value * 0.58),
            status: 'uploading',
          });
        },
      });

      onProgress?.({
        index,
        name: file.name,
        progress: 80,
        status: 'preview',
      });

      await uploadResumable({
        file: preview.blob,
        path: previewPath,
        contentType: 'image/jpeg',
        accessToken,
        onProgress: (value) => {
          onProgress?.({
            index,
            name: file.name,
            progress: 80 + Math.round(value * 0.14),
            status: 'preview',
          });
        },
      });

      const { data, error } = await supabase
        .from(PHOTOS_TABLE)
        .insert({
          id: photoId,
          gallery_id: galleryId,
          original_name: file.name,
          display_name: capitalizeName(
            file.name
              .replace(/\.[^.]+$/, '')
              .replace(/[-_]+/g, ' '),
          ),
          original_path: originalPath,
          preview_path: previewPath,
          mime_type: file.type || 'image/jpeg',
          size_bytes: file.size,
          width: preview.width,
          height: preview.height,
          position: position++,
          metadata: {
            originalLastModified: file.lastModified || null,
          },
        })
        .select('*')
        .single();

      if (error) throw error;

      results.push(normalizePhoto(data));
      onProgress?.({
        index,
        name: file.name,
        progress: 100,
        status: 'completed',
      });
    } catch (error) {
      await removeUploadedPaths([originalPath, previewPath]);

      const message = error?.message || 'Falha no envio.';
      failures.push({
        index,
        name: file.name,
        error: message,
      });

      onProgress?.({
        index,
        name: file.name,
        progress: 0,
        status: 'error',
        error: message,
      });
    }
  }

  return {
    uploaded: results,
    failures,
  };
}


export async function reprocessGalleryPreviews({
  galleryId,
  watermarkSettings,
  clientName = '',
  onProgress,
}) {
  const [{ data: sessionData, error: sessionError }, detail] = await Promise.all([
    supabase.auth.getSession(),
    getGallery(galleryId),
  ]);

  if (sessionError) throw sessionError;
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Sessão inválida. Entre novamente no StudioFlow.');

  const failures = [];
  const updated = [];

  for (let index = 0; index < detail.photos.length; index += 1) {
    const photo = detail.photos[index];
    try {
      onProgress?.({ index, name: photo.displayName, progress: 5, status: 'downloading' });
      const originalUrl = await createGalleryPhotoAdminUrl(photo, 'original', 900);
      const response = await fetch(originalUrl);
      if (!response.ok) throw new Error('Não foi possível carregar o original.');
      const originalBlob = await response.blob();
      const originalFile = new File([originalBlob], photo.originalName || `${photo.id}.jpg`, {
        type: photo.mimeType || originalBlob.type || 'image/jpeg',
      });

      onProgress?.({ index, name: photo.displayName, progress: 25, status: 'processing' });
      const preview = await createProtectedPreview(originalFile, watermarkSettings, clientName);

      onProgress?.({ index, name: photo.displayName, progress: 55, status: 'uploading' });
      await uploadResumable({
        file: preview.blob,
        path: photo.previewPath,
        contentType: 'image/jpeg',
        accessToken,
        upsert: true,
        onProgress: (value) => onProgress?.({
          index,
          name: photo.displayName,
          progress: 55 + Math.round(value * 0.4),
          status: 'uploading',
        }),
      });

      await supabase
        .from(PHOTOS_TABLE)
        .update({
          width: preview.width,
          height: preview.height,
          metadata: {
            ...(photo.metadata || {}),
            previewReprocessedAt: new Date().toISOString(),
            watermarkOpacity: Number(watermarkSettings?.opacity ?? 0.3),
          },
        })
        .eq('id', photo.id);

      updated.push(photo.id);
      onProgress?.({ index, name: photo.displayName, progress: 100, status: 'completed' });
    } catch (error) {
      const message = error?.message || 'Falha ao atualizar a prova.';
      failures.push({ id: photo.id, name: photo.displayName, error: message });
      onProgress?.({ index, name: photo.displayName, progress: 0, status: 'error', error: message });
    }
  }

  return { updated, failures };
}

export async function createGalleryPhotoAdminUrl(photo, kind = 'preview', expiresIn = 900) {
  const path = kind === 'original'
    ? photo.originalPath
    : (kind === 'final'
      ? (photo.finalPath || photo.originalPath)
      : photo.previewPath);
  if (!path) return '';
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl || '';
}

export async function loadPublicGallery(token) {
  const { data, error } = await supabase.rpc('get_gallery_by_token', { p_token: token });
  if (error) throw error;
  return data || null;
}

export async function acceptGalleryLegalNotice(token, sessionId) {
  const { data, error } = await supabase.rpc('accept_gallery_legal_notice', { p_token: token, p_session_id: sessionId });
  if (error) throw error;
  return Boolean(data);
}

export async function togglePublicPhotoSelection(token, photoId, selected, comment = '') {
  const { data, error } = await supabase.rpc('toggle_gallery_photo_selection', {
    p_token: token,
    p_photo_id: photoId,
    p_selected: selected,
    p_comment: comment,
  });
  if (error) throw error;
  return data;
}

export async function finalizePublicGallerySelection(token) {
  const { data, error } = await supabase.rpc('finalize_gallery_selection', { p_token: token });
  if (error) throw error;
  return data;
}

export async function getPublicGalleryMediaUrl(token, photoId, kind = 'preview') {
  const { data, error } = await supabase.functions.invoke('gallery-media-url', {
    body: { accessToken: token, photoId, kind },
  });
  if (error) throw error;
  if (!data?.url) throw new Error(data?.error || 'Não foi possível abrir a fotografia.');
  return data.url;
}



export async function renewGalleryAccess(galleryId) {
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const current = await getGallery(galleryId);
  const settings = {
    ...(current.gallery.settings || {}),
    publicUrl: buildGalleryPublicUrl(token),
  };
  const { data, error } = await supabase
    .from(GALLERIES_TABLE)
    .update({
      access_token_hash: tokenHash,
      access_token_preview: token.slice(-8),
      settings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', galleryId)
    .select('*')
    .single();
  if (error) throw error;
  localStorage.setItem(`studioflow.gallery.token.${galleryId}`, token);
  return { gallery: normalizeGallery(data), token };
}

export async function publishGallery(galleryId, status = 'selection') {
  let token = getStoredGalleryToken(galleryId);
  if (!token) {
    const renewed = await renewGalleryAccess(galleryId);
    token = renewed.token;
  }
  const current = await getGallery(galleryId);
  const settings = {
    ...(current.gallery.settings || {}),
    publicUrl: buildGalleryPublicUrl(token),
    publishedAt: new Date().toISOString(),
  };
  const gallery = await updateGallery(galleryId, { status, settings });
  return { gallery, token };
}

export async function updateGalleryPhoto(photoId, changes = {}) {
  const payload = {
    ...(changes.displayName !== undefined ? { display_name: capitalizeName(changes.displayName) } : {}),
    ...(changes.position !== undefined ? { position: Number(changes.position) } : {}),
    ...(changes.status !== undefined ? { status: changes.status } : {}),
    ...(changes.finalPath !== undefined ? { final_path: changes.finalPath || null } : {}),
    ...(changes.metadata !== undefined ? { metadata: changes.metadata || {} } : {}),
  };
  const { data, error } = await supabase
    .from(PHOTOS_TABLE)
    .update(payload)
    .eq('id', photoId)
    .select('*')
    .single();
  if (error) throw error;
  return normalizePhoto(data);
}

export async function deleteGalleryPhoto(photo) {
  const paths = [photo.originalPath, photo.previewPath, photo.finalPath].filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths);
    if (storageError) throw storageError;
  }
  const { error } = await supabase.from(PHOTOS_TABLE).delete().eq('id', photo.id);
  if (error) throw error;
  return true;
}

export async function reorderGalleryPhotos(photoIds = []) {
  const results = await Promise.all(photoIds.map((id, position) => (
    supabase.from(PHOTOS_TABLE).update({ position }).eq('id', id)
  )));
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
  return true;
}

export async function moveGalleryToTrash(galleryId) {
  const detail = await getGallery(galleryId);
  const previousStatus = detail.gallery.status === 'trash'
    ? 'draft'
    : detail.gallery.status;
  const settings = {
    ...(detail.gallery.settings || {}),
    trashPreviousStatus: previousStatus,
  };

  const { data, error } = await supabase
    .from(GALLERIES_TABLE)
    .update({
      status: 'trash',
      deleted_at: new Date().toISOString(),
      settings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', galleryId)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeGallery(data);
}

export async function restoreGallery(galleryId, status = null) {
  const { data: current, error: lookupError } = await supabase
    .from(GALLERIES_TABLE)
    .select('*')
    .eq('id', galleryId)
    .single();
  if (lookupError) throw lookupError;

  const settings = current?.settings || {};
  const restoredStatus = status
    || settings.trashPreviousStatus
    || 'draft';
  const nextSettings = { ...settings };
  delete nextSettings.trashPreviousStatus;

  const { data, error } = await supabase
    .from(GALLERIES_TABLE)
    .update({
      status: restoredStatus === 'trash' ? 'draft' : restoredStatus,
      deleted_at: null,
      settings: nextSettings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', galleryId)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeGallery(data);
}

export async function releaseGalleryDelivery(galleryId) {
  const detail = await getGallery(galleryId);
  const settings = detail.gallery.settings || {};
  const downloadMode = settings.downloadMode
    || (settings.purpose === 'delivery' ? 'all' : 'selected');

  if (downloadMode === 'selected' && !detail.photos.some((photo) => photo.selected)) {
    throw new Error('Nenhuma fotografia foi selecionada para entrega.');
  }

  let token = getStoredGalleryToken(galleryId);
  if (!token) {
    const renewed = await renewGalleryAccess(galleryId);
    token = renewed.token;
  }

  const { data, error } = await supabase
    .from(GALLERIES_TABLE)
    .update({
      status: 'delivery',
      delivery_released_at: new Date().toISOString(),
      settings: {
        ...settings,
        downloadMode,
        publicUrl: buildGalleryPublicUrl(token),
        deliveryReleasedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', galleryId)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeGallery(data);
}

export async function deleteGalleryPermanently(galleryId) {
  const { data: photos, error: photoError } = await supabase
    .from(PHOTOS_TABLE)
    .select('original_path, preview_path, final_path')
    .eq('gallery_id', galleryId);
  if (photoError) throw photoError;

  const paths = (photos || []).flatMap((photo) => [
    photo.original_path,
    photo.preview_path,
    photo.final_path,
  ]).filter(Boolean);

  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths);
    if (storageError) throw storageError;
  }

  await supabase.from(GALLERIES_TABLE).update({ cover_photo_id: null }).eq('id', galleryId);
  const { error } = await supabase.from(GALLERIES_TABLE).delete().eq('id', galleryId);
  if (error) throw error;
  localStorage.removeItem(`studioflow.gallery.token.${galleryId}`);
  return true;
}

export async function renameGalleryPhotos(galleryId, naming = {}) {
  const { data: photos, error } = await supabase
    .from(PHOTOS_TABLE)
    .select('id, original_name, position')
    .eq('gallery_id', galleryId)
    .neq('status', 'deleted')
    .order('position');
  if (error) throw error;

  const mode = naming.mode || 'original';
  const prefix = capitalizeName(naming.prefix || 'Foto');
  const total = (photos || []).length;
  const updates = (photos || []).map((photo, index) => {
    const original = String(photo.original_name || 'Foto').replace(/\.[^.]+$/, '');
    const number = String(index + 1).padStart(Number(naming.pad || 3), '0');
    let displayName = original;
    if (mode === 'sequence') displayName = `${prefix} ${number}`;
    if (mode === 'number') displayName = number;
    if (mode === 'progress') displayName = `${prefix} (${index + 1} de ${total})`;
    return supabase.from(PHOTOS_TABLE).update({ display_name: displayName }).eq('id', photo.id);
  });
  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
  return true;
}


export async function getGalleryOperationalSummary(galleryId) {
  const [{ data: events, error: eventsError }, { data: financeRows, error: financeError }] = await Promise.all([
    supabase
      .from('gallery_events')
      .select('event_type, details, created_at')
      .eq('gallery_id', galleryId)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('financas')
      .select('id, valor, status, created_at, updated_at, detalhes')
      .eq('id', `gallery-additional-${galleryId}`)
      .maybeSingle(),
  ]);

  if (eventsError) throw eventsError;
  if (financeError) throw financeError;

  const rows = events || [];
  const count = (type) => rows.filter((event) => event.event_type === type).length;
  const latest = (type) => rows.find((event) => event.event_type === type) || null;

  return {
    views: count('portal_opened'),
    downloads: count('photo_downloaded') + count('gallery_downloaded'),
    comments: count('photo_comment_updated'),
    selections: count('photo_selected'),
    lastAccessAt: latest('portal_opened')?.created_at || null,
    selectionFinalizedAt: latest('selection_finalized')?.created_at || null,
    additionalCharge: financeRows || null,
    recentEvents: rows.slice(0, 20),
  };
}

export { BUCKET as GALLERY_BUCKET };
