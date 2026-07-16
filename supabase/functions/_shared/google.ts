const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const getEncryptionKey = async () => {
  const raw = Deno.env.get('INTEGRATION_ENCRYPTION_KEY');
  if (!raw) throw new Error('INTEGRATION_ENCRYPTION_KEY não configurada.');
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(raw));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
};

export const encryptSecret = async (value?: string | null) => {
  if (!value) return null;
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(value)));
  return `${toBase64(iv)}.${toBase64(encrypted)}`;
};

export const decryptSecret = async (value?: string | null) => {
  if (!value) return null;
  const [ivRaw, encryptedRaw] = value.split('.');
  if (!ivRaw || !encryptedRaw) throw new Error('Token criptografado inválido.');
  const key = await getEncryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivRaw) },
    key,
    fromBase64(encryptedRaw),
  );
  return textDecoder.decode(decrypted);
};

export const googleConfig = () => {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const redirectUri = Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI');
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Credenciais Google incompletas no Supabase. Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_OAUTH_REDIRECT_URI.');
  }
  return { clientId, clientSecret, redirectUri };
};

export const googleScopes = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.file',
];

export const exchangeCode = async (code: string) => {
  const { clientId, clientSecret, redirectUri } = googleConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || payload.error || 'Falha ao trocar o código OAuth.');
  return payload;
};

export const refreshAccessToken = async (refreshToken: string) => {
  const { clientId, clientSecret } = googleConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || payload.error || 'Não foi possível renovar o acesso Google.');
  return payload;
};
