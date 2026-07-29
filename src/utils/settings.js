import { readStorage, writeStorage } from './storage';
import { DEFAULT_SIDEBAR_SETTINGS } from './sidebarModules';

export const SETTINGS_KEY = 'cv_studio_settings_v1';

const loadProfilePersistence = async () => {
  const module = await import('./dbData');
  return {
    loadProfileFromDb: module.loadProfileFromDb,
    saveProfileToDb: module.saveProfileToDb,
  };
};

export const DEFAULT_SETTINGS = {
  version: 2,
  updatedAt: '',
  general: {
    theme: 'dark',
    language: 'pt-BR',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    currency: 'BRL',
    weekStartsOn: '1',
    animations: true,
    sounds: false,
    density: 'comfortable',
  },
  financial: {
    closingDay: 30,
    monthlyGoal: 0,
    annualGoal: 0,
    categories: [
      'Equipamentos',
      'Transporte',
      'Marketing',
      'Assinaturas',
    ],
    paymentMethods: [
      'Pix',
      'Cartão',
      'Transferência',
      'Dinheiro',
    ],
    depositPercent: 30,
    maxInstallments: 12,
    interestPercent: 0,
    lateFeePercent: 2,
    dueWarnings: true,
    installmentWarnings: true,
    depreciationMethod: 'linear',
    usefulLifeYears: 5,
    residualPercent: 10,
  },
  notifications: {
    events: true,
    eventLeadHours: 24,
    installments: true,
    contracts: true,
    deliveries: true,
    followUps: true,
    preferredTime: '09:00',
    workDays: ['seg', 'ter', 'qua', 'qui', 'sex'],
    workStart: '08:00',
    workEnd: '18:00',
    email: true,
    inApp: true,
  },
  studio: {
    name: 'StudioFlow',
    legalName: '',
    document: '',
    address: '',
    phone: '',
    whatsapp: '',
    email: '',
    instagram: '',
    website: '',
    logo: '',
    icon: '',
    primaryColor: '#C9A06C',
    signature: '',
    footer: '',
    institutionalText: '',
  },
  team: {
    members: [],
  },
  sidebar: DEFAULT_SIDEBAR_SETTINGS,
  integrations: {
    googleCalendar: 'not_connected',
    googleDrive: 'not_connected',
    email: 'not_connected',
    supabase: 'connected',
    electronicSignature: 'coming_soon',
    stripe: 'coming_soon',
    googleMeet: 'coming_soon',
  },
  templates: [
    {
      id: 'template-proposta',
      name: 'Proposta padrão',
      type: 'proposta',
      title: 'Proposta comercial',
      text: 'Olá {{cliente_nome}}, apresentamos nossa proposta para {{servico}}.',
      clauses: '',
      header: '{{studio_nome}}',
      footer: '{{studio_email}} · {{studio_whatsapp}}',
      isDefault: true,
    },
    {
      id: 'template-contrato',
      name: 'Contrato padrão',
      type: 'contrato',
      title: 'Contrato de prestação de serviços',
      text: 'Contrato entre {{studio_nome}} e {{cliente_nome}}, referente a {{servico}}, no valor de {{valor_total}}.',
      clauses: 'O serviço será executado conforme condições acordadas entre as partes.',
      header: '{{studio_nome}}',
      footer: '{{studio_cnpj}} · {{studio_email}}',
      isDefault: true,
    },
  ],
};

const merge = (base, value) => Object.fromEntries(
  Object.entries(base).map(([key, fallback]) => [
    key,
    fallback
    && typeof fallback === 'object'
    && !Array.isArray(fallback)
      ? merge(fallback, value?.[key] || {})
      : value?.[key] ?? fallback,
  ]),
);

const getStableTeamMemberId = (member = {}, index = 0) => {
  const identity = [
    member.nome,
    member.email,
    member.telefone,
  ]
    .filter(Boolean)
    .join('-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 48);

  return `team-member-${index}-${identity || 'legacy'}`;
};

const normalizeTeamMember = (member = {}, index = 0) => ({
  id:
    member.id
    || getStableTeamMemberId(member, index),
  nome: String(member.nome || '').trim(),
  funcao: String(member.funcao || 'Fotógrafo').trim(),
  telefone: String(member.telefone || '').trim(),
  email: String(member.email || '').trim(),
  valorDiaria: Number(member.valorDiaria || 0),
  ativo: member.ativo !== false,
  observacoes: String(member.observacoes || '').trim(),
  criadoEm:
    member.criadoEm
    || new Date().toISOString(),
  atualizadoEm:
    member.atualizadoEm
    || new Date().toISOString(),
});

export const normalizeSettings = (value) => {
  const merged = merge(DEFAULT_SETTINGS, value || {});

  return {
    ...merged,
    version: 2,
    updatedAt: String(value?.updatedAt || merged.updatedAt || ''),
    team: {
      ...merged.team,
      members: Array.isArray(merged.team?.members)
        ? merged.team.members.map(normalizeTeamMember)
        : [],
    },
  };
};

export const loadSettings = () => {
  const stored = readStorage(SETTINGS_KEY, null);

  if (stored) {
    return normalizeSettings(stored);
  }

  const profile = readStorage('cv_perfil_data', {});

  const migrated = normalizeSettings({
    general: {
      language: profile.idioma,
      dateFormat: profile.formatoData,
      currency: String(
        profile.formatoMoeda || '',
      ).startsWith('BRL')
        ? 'BRL'
        : undefined,
    },
    studio: {
      name: profile.empresaNome || profile.nomeEmpresa,
      legalName: profile.nomeFantasia,
      document: profile.cnpj || profile.cpf,
      address: [
        profile.rua,
        profile.numero,
        profile.bairro,
        profile.cidade,
        profile.estado,
      ].filter(Boolean).join(', '),
      phone: profile.telefone,
      whatsapp: profile.whatsapp,
      email: profile.email,
      instagram: profile.instagram,
      website: profile.site,
      signature: profile.assinatura,
    },
  });

  writeStorage(SETTINGS_KEY, migrated);

  return migrated;
};

export const saveSettings = (settings, { preserveTimestamp = false } = {}) => {
  const normalized = normalizeSettings(settings);

  return writeStorage(SETTINGS_KEY, {
    ...normalized,
    version: 2,
    updatedAt: preserveTimestamp
      ? normalized.updatedAt || new Date().toISOString()
      : new Date().toISOString(),
  });
};

/**
 * Carrega a cópia persistida no perfil do Supabase. O localStorage continua
 * sendo usado como cache rápido, mas deixa de ser a única fonte das
 * configurações e da equipe central.
 */
export const loadSettingsFromDb = async () => {
  try {
    const local = loadSettings();
    const { loadProfileFromDb, saveProfileToDb } = await loadProfilePersistence();
    const profile = await loadProfileFromDb();
    const remote = profile?.studioflowSettings
      || profile?.studioflow_settings
      || null;

    if (!remote) {
      // Migra a configuração local existente sem impedir a abertura da tela.
      if (local?.team?.members?.length || local?.updatedAt) {
        await saveProfileToDb({
          ...(profile || {}),
          studioflowSettings: local,
        }).catch(() => null);
      }
      return local;
    }

    const normalizedRemote = normalizeSettings(remote);
    const localTimestamp = Date.parse(local?.updatedAt || '') || 0;
    const remoteTimestamp = Date.parse(normalizedRemote?.updatedAt || '') || 0;

    // Uma gravação local mais recente não deve ser substituída por uma cópia
    // remota antiga. Isso também recupera membros cadastrados antes da migração.
    if (localTimestamp > remoteTimestamp) {
      await saveProfileToDb({
        ...(profile || {}),
        studioflowSettings: local,
      }).catch(() => null);
      return local;
    }

    saveSettings(normalizedRemote, { preserveTimestamp: true });
    return normalizedRemote;
  } catch (error) {
    console.warn('Não foi possível carregar as configurações remotas:', error);
    return loadSettings();
  }
};

/**
 * Salva no perfil remoto sem apagar os demais dados do estúdio já existentes.
 * Retorna também se o cache local pôde ser atualizado, permitindo que a
 * interface não mostre uma confirmação falsa quando o navegador está cheio.
 */
export const saveSettingsToDb = async (settings) => {
  const normalized = normalizeSettings({
    ...settings,
    version: 2,
    updatedAt: new Date().toISOString(),
  });
  const localSaved = saveSettings(normalized);

  try {
    const { loadProfileFromDb, saveProfileToDb } = await loadProfilePersistence();
    const currentProfile = await loadProfileFromDb().catch(() => ({}));
    const savedProfile = await saveProfileToDb({
      ...(currentProfile || {}),
      studioflowSettings: normalized,
    });

    const savedSettings = normalizeSettings(
      savedProfile?.studioflowSettings || normalized,
    );

    if (!localSaved) saveSettings(savedSettings);

    return {
      ok: true,
      localSaved,
      settings: savedSettings,
    };
  } catch (error) {
    return {
      ok: localSaved,
      localSaved,
      settings: normalized,
      error,
    };
  }
};

export const interpolateTemplate = (
  text = '',
  values = {},
) => text.replace(
  /{{\s*([\w_]+)\s*}}/g,
  (_, key) => values[key] ?? `{{${key}}}`,
);