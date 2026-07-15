import { isSupabaseConfigured, supabase } from '../../../utils/supabase';
import { readStorage, writeStorage } from '../../../utils/storage';
import { capitalizeName } from '../../../utils/masks';

const PORTAL_TABLE = 'client_portals';
const PORTALS_KEY = 'studioflow.clientPortals.v1';
const TOKENS_KEY = 'studioflow.clientPortalTokens.v1';

const DEFAULT_SECTIONS = {
  overview: true,
  schedule: true,
  financial: true,
  documents: true,
  files: true,
  messages: true,
};

const randomToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const hashToken = async (token) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const readTokens = () => readStorage(TOKENS_KEY, {});
const saveToken = (portalId, token) => {
  const tokens = readTokens();
  writeStorage(TOKENS_KEY, { ...tokens, [portalId]: token });
};

const normalizePortal = (portal = {}) => ({
  id: portal.id,
  clientId: portal.client_id || portal.clientId || null,
  projectId: portal.project_id || portal.projectId || null,
  name: capitalizeName(portal.name || 'Portal do cliente'),
  status: portal.status || 'active',
  sections: { ...DEFAULT_SECTIONS, ...(portal.sections || {}) },
  welcomeMessage: portal.welcome_message || portal.welcomeMessage || '',
  expiresAt: portal.expires_at || portal.expiresAt || null,
  lastAccessedAt: portal.last_accessed_at || portal.lastAccessedAt || null,
  createdAt: portal.created_at || portal.createdAt || null,
  updatedAt: portal.updated_at || portal.updatedAt || null,
  tokenPreview: portal.access_token_preview || portal.tokenPreview || '',
  token: readTokens()[portal.id] || portal.token || '',
});

const listLocal = async () => readStorage(PORTALS_KEY, []).map(normalizePortal);

const createLocal = async (input) => {
  const token = randomToken();
  const now = new Date().toISOString();
  const portal = normalizePortal({
    ...input,
    id: crypto.randomUUID(),
    token,
    tokenPreview: token.slice(-8),
    createdAt: now,
    updatedAt: now,
  });
  writeStorage(PORTALS_KEY, [portal, ...readStorage(PORTALS_KEY, [])]);
  saveToken(portal.id, token);
  return { ...portal, token };
};

export async function listClientPortals() {
  if (!isSupabaseConfigured) return listLocal();

  const { data, error } = await supabase
    .from(PORTAL_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === 'PGRST205') return listLocal();
    throw error;
  }

  return (data || []).map(normalizePortal);
}

export async function createClientPortal(input) {
  if (!isSupabaseConfigured) return createLocal(input);

  const token = randomToken();
  const tokenHash = await hashToken(token);
  const payload = {
    client_id: input.clientId,
    project_id: input.projectId || null,
    name: capitalizeName(input.name || 'Portal do cliente'),
    status: 'active',
    sections: { ...DEFAULT_SECTIONS, ...(input.sections || {}) },
    welcome_message: input.welcomeMessage || '',
    expires_at: input.expiresAt || null,
    access_token_hash: tokenHash,
    access_token_preview: token.slice(-8),
  };

  const { data, error } = await supabase
    .from(PORTAL_TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST205') return createLocal(input);
    throw error;
  }

  saveToken(data.id, token);
  return { ...normalizePortal(data), token };
}

export async function updateClientPortal(portalId, changes) {
  const payload = {
    ...(changes.name !== undefined ? { name: capitalizeName(changes.name) } : {}),
    ...(changes.status !== undefined ? { status: changes.status } : {}),
    ...(changes.sections !== undefined ? { sections: changes.sections } : {}),
    ...(changes.welcomeMessage !== undefined ? { welcome_message: changes.welcomeMessage } : {}),
    ...(changes.expiresAt !== undefined ? { expires_at: changes.expiresAt || null } : {}),
    updated_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    const portals = readStorage(PORTALS_KEY, []);
    const next = portals.map((portal) => portal.id === portalId ? { ...portal, ...changes, updatedAt: payload.updated_at } : portal);
    writeStorage(PORTALS_KEY, next);
    return normalizePortal(next.find((portal) => portal.id === portalId));
  }

  const { data, error } = await supabase
    .from(PORTAL_TABLE)
    .update(payload)
    .eq('id', portalId)
    .select('*')
    .single();

  if (error) throw error;
  return normalizePortal(data);
}

export async function rotateClientPortalToken(portalId) {
  const token = randomToken();

  if (!isSupabaseConfigured) {
    saveToken(portalId, token);
    return token;
  }

  const tokenHash = await hashToken(token);
  const { error } = await supabase
    .from(PORTAL_TABLE)
    .update({
      access_token_hash: tokenHash,
      access_token_preview: token.slice(-8),
      updated_at: new Date().toISOString(),
    })
    .eq('id', portalId);

  if (error) throw error;
  saveToken(portalId, token);
  return token;
}

export async function loadPublicClientPortal(token) {
  if (!isSupabaseConfigured) {
    const portals = await listLocal();
    const portal = portals.find((item) => item.token === token && item.status === 'active');
    if (!portal) return null;
    return { portal, client: null, projects: [], documents: [] };
  }

  const { data, error } = await supabase.rpc('get_client_portal_by_token', {
    p_token: token,
  });

  if (error) throw error;
  return data || null;
}


export async function createPublicPortalFileUrl(accessToken, fileId) {
  if (!isSupabaseConfigured) {
    throw new Error('O download público exige conexão com o Supabase.');
  }

  const { data, error } = await supabase.functions.invoke(
    'client-file-download',
    {
      body: {
        accessToken,
        fileId,
      },
    },
  );

  if (error) throw error;
  if (!data?.url) {
    throw new Error(data?.error || 'Não foi possível liberar o arquivo.');
  }

  return data.url;
}


export async function deleteClientPortal(portalId) {
  if (!isSupabaseConfigured) {
    const next = readStorage(PORTALS_KEY, []).filter((portal) => portal.id !== portalId);
    writeStorage(PORTALS_KEY, next);
    const tokens = readTokens();
    delete tokens[portalId];
    writeStorage(TOKENS_KEY, tokens);
    return true;
  }

  const { error } = await supabase.from(PORTAL_TABLE).delete().eq('id', portalId);
  if (error) throw error;
  const tokens = readTokens();
  delete tokens[portalId];
  writeStorage(TOKENS_KEY, tokens);
  return true;
}

export { DEFAULT_SECTIONS };
