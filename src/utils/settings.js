import { readStorage, writeStorage } from './storage';
import { DEFAULT_SIDEBAR_SETTINGS } from './sidebarModules';

export const SETTINGS_KEY = 'cv_studio_settings_v1';

export const DEFAULT_SETTINGS = {
  version: 1,
  general: { theme: 'dark', language: 'pt-BR', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', currency: 'BRL', weekStartsOn: '1', animations: true, sounds: false, density: 'comfortable' },
  financial: { closingDay: 30, monthlyGoal: 0, annualGoal: 0, categories: ['Equipamentos', 'Transporte', 'Marketing', 'Assinaturas'], paymentMethods: ['Pix', 'Cartão', 'Transferência', 'Dinheiro'], depositPercent: 30, maxInstallments: 12, interestPercent: 0, lateFeePercent: 2, dueWarnings: true, installmentWarnings: true, depreciationMethod: 'linear', usefulLifeYears: 5, residualPercent: 10 },
  notifications: { events: true, eventLeadHours: 24, installments: true, contracts: true, deliveries: true, followUps: true, preferredTime: '09:00', workDays: ['seg', 'ter', 'qua', 'qui', 'sex'], workStart: '08:00', workEnd: '18:00', email: true, inApp: true, whatsapp: false },
  studio: { name: 'StudioFlow', legalName: '', document: '', address: '', phone: '', whatsapp: '', email: '', instagram: '', website: '', logo: '', icon: '', primaryColor: '#C9A06C', signature: '', footer: '', institutionalText: '' },
  sidebar: DEFAULT_SIDEBAR_SETTINGS,
  integrations: { googleCalendar: 'not_connected', googleDrive: 'not_connected', email: 'not_connected', whatsapp: 'coming_soon', supabase: 'connected', electronicSignature: 'coming_soon', stripe: 'coming_soon', googleMeet: 'coming_soon' },
  templates: [
    { id: 'template-proposta', name: 'Proposta padrão', type: 'proposta', title: 'Proposta comercial', text: 'Olá {{cliente_nome}}, apresentamos nossa proposta para {{servico}}.', clauses: '', header: '{{studio_nome}}', footer: '{{studio_email}} · {{studio_whatsapp}}', isDefault: true },
    { id: 'template-contrato', name: 'Contrato padrão', type: 'contrato', title: 'Contrato de prestação de serviços', text: 'Contrato entre {{studio_nome}} e {{cliente_nome}}, referente a {{servico}}, no valor de {{valor_total}}.', clauses: 'O serviço será executado conforme condições acordadas entre as partes.', header: '{{studio_nome}}', footer: '{{studio_cnpj}} · {{studio_email}}', isDefault: true },
  ],
};

const merge = (base, value) => Object.fromEntries(Object.entries(base).map(([key, fallback]) => [key, fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? merge(fallback, value?.[key] || {}) : value?.[key] ?? fallback]));

export const loadSettings = () => {
  const stored = readStorage(SETTINGS_KEY, null);
  if (stored) return merge(DEFAULT_SETTINGS, stored);
  const profile = readStorage('cv_perfil_data', {});
  const migrated = merge(DEFAULT_SETTINGS, { general: { language: profile.idioma, dateFormat: profile.formatoData, currency: String(profile.formatoMoeda || '').startsWith('BRL') ? 'BRL' : undefined }, studio: { name: profile.empresaNome || profile.nomeEmpresa, legalName: profile.nomeFantasia, document: profile.cnpj || profile.cpf, address: [profile.rua, profile.numero, profile.bairro, profile.cidade, profile.estado].filter(Boolean).join(', '), phone: profile.telefone, whatsapp: profile.whatsapp, email: profile.email, instagram: profile.instagram, website: profile.site, signature: profile.assinatura } });
  writeStorage(SETTINGS_KEY, migrated);
  return migrated;
};

export const saveSettings = (settings) => writeStorage(SETTINGS_KEY, { ...settings, version: 1, updatedAt: new Date().toISOString() });

export const interpolateTemplate = (text = '', values = {}) => text.replace(/{{\s*([\w_]+)\s*}}/g, (_, key) => values[key] ?? `{{${key}}}`);
