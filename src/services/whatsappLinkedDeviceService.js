import { supabase } from '../utils/supabase';

const getBaseUrl = () => String(import.meta.env.VITE_WHATSAPP_CONNECTOR_URL || '').replace(/\/$/, '');

const request = async (path, options = {}) => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error('Configure VITE_WHATSAPP_CONNECTOR_URL com o endereço do conector persistente.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Faça login novamente para conectar o WhatsApp.');
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'O conector do WhatsApp não respondeu corretamente.');
  return payload;
};

export const getLinkedDeviceStatus = () => request('/api/session');
export const startLinkedDeviceSession = () => request('/api/session/start', { method: 'POST', body: '{}' });
export const disconnectLinkedDevice = () => request('/api/session', { method: 'DELETE' });
export const sendLinkedDeviceMessage = ({ to, text, conversationId, contactId }) => request('/api/messages/send', {
  method: 'POST',
  body: JSON.stringify({ to, text, conversationId, contactId }),
});
