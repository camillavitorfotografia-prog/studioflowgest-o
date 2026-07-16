import { isSupabaseConfigured, supabase } from '../utils/supabase';

export const INTEGRATION_PROVIDERS = {
  googleCalendar: {
    provider: 'google_calendar',
    name: 'Google Calendar',
    description: 'Sincronize trabalhos, reuniões, entregas e prazos com um calendário Google.',
    category: 'google',
    capabilities: ['Eventos de trabalhos', 'Reuniões', 'Prazos e entregas', 'Lembretes'],
    requiredSecrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
  },
  googleMeet: {
    provider: 'google_meet',
    name: 'Google Meet',
    description: 'Gere links de reunião junto com os eventos sincronizados no Calendar.',
    category: 'google',
    capabilities: ['Link automático', 'Reuniões de atendimento', 'Histórico no trabalho'],
    requiredSecrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
  },
  email: {
    provider: 'gmail',
    name: 'Gmail / E-mail',
    description: 'Envie propostas, contratos, lembretes e links usando a conta profissional.',
    category: 'google',
    capabilities: ['Envio pelo StudioFlow', 'Modelos de e-mail', 'Histórico no cliente'],
    requiredSecrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
  },
  googleDrive: {
    provider: 'google_drive',
    name: 'Google Drive',
    description: 'Crie pastas por cliente e trabalho para documentos, contratos e relatórios.',
    category: 'google',
    capabilities: ['Pastas automáticas', 'Contratos e relatórios', 'Documentos do cliente'],
    requiredSecrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
  },
  supabase: {
    provider: 'supabase',
    name: 'Supabase',
    description: 'Banco de dados, autenticação e armazenamento principal do StudioFlow.',
    category: 'core',
    capabilities: ['Banco online', 'Autenticação', 'Storage privado'],
    requiredSecrets: [],
  },
  whatsapp: {
    provider: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'Mensagens transacionais pela API oficial do WhatsApp Business.',
    category: 'future',
    capabilities: ['Lembretes', 'Cobranças', 'Galeria pronta'],
    requiredSecrets: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
  },
  electronicSignature: {
    provider: 'electronic_signature',
    name: 'Assinatura eletrônica',
    description: 'Assinatura de contratos com trilha de auditoria e PDF final.',
    category: 'future',
    capabilities: ['Assinatura online', 'Registro de aceite', 'PDF final'],
    requiredSecrets: [],
  },
  stripe: {
    provider: 'stripe',
    name: 'Pagamentos online',
    description: 'Estrutura preparada para cobrança, Pix, cartão e conciliação automática.',
    category: 'future',
    capabilities: ['Links de cobrança', 'Baixa automática', 'Webhooks'],
    requiredSecrets: [],
  },
};

const ensureSession = async () => {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session || null;
};

export const loadIntegrationAccounts = async () => {
  const session = await ensureSession();
  if (!session) return [];

  const { data, error } = await supabase
    .from('integration_accounts')
    .select('*')
    .eq('user_id', session.user.id)
    .order('provider');

  if (error) throw error;
  return data || [];
};

export const upsertIntegrationAccount = async (provider, patch = {}) => {
  const session = await ensureSession();
  if (!session) throw new Error('Faça login novamente para gerenciar integrações.');

  const payload = {
    user_id: session.user.id,
    provider,
    status: patch.status || 'not_connected',
    account_email: patch.account_email || null,
    account_name: patch.account_name || null,
    scopes: Array.isArray(patch.scopes) ? patch.scopes : [],
    settings: patch.settings || {},
    last_sync_at: patch.last_sync_at || null,
    last_error: patch.last_error || null,
    connected_at: patch.connected_at || null,
    expires_at: patch.expires_at || null,
  };

  const { data, error } = await supabase
    .from('integration_accounts')
    .upsert(payload, { onConflict: 'user_id,provider' })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const disconnectIntegration = async (provider) => {
  const session = await ensureSession();
  if (!session) throw new Error('Faça login novamente para gerenciar integrações.');

  const { error } = await supabase
    .from('integration_accounts')
    .delete()
    .eq('user_id', session.user.id)
    .eq('provider', provider);

  if (error) throw error;
};

export const writeIntegrationLog = async ({ provider, level = 'info', action, message, metadata = {} }) => {
  const session = await ensureSession();
  if (!session) return;

  await supabase.from('integration_logs').insert({
    user_id: session.user.id,
    provider,
    level,
    action,
    message,
    metadata,
  });
};

export const requestIntegrationAction = async (functionName, body = {}) => {
  const session = await ensureSession();
  if (!session) throw new Error('Faça login novamente para continuar.');

  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    const message = String(error.message || '');
    if (/not found|404|failed to send/i.test(message)) {
      throw new Error('O conector seguro ainda precisa ser ativado no Supabase. Cadastre as credenciais do provedor e publique as Edge Functions antes de conectar.');
    }
    throw error;
  }
  return data;
};
