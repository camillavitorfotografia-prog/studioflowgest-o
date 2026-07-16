import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Cloud,
  Database,
  Edit3,
  ExternalLink,
  HardDrive,
  Link2,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Unplug,
  Video,
  Users,
} from 'lucide-react';

import { loadSettings, saveSettings } from '../../utils/settings';
import { createBackupPayload, restoreBackupPayload } from '../../utils/backup';
import {
  capitalizeName,
  maskCurrency,
  maskPhone,
} from '../../utils/masks';
import { parseCurrency } from '../../utils/formatters';
import {
  INTEGRATION_PROVIDERS,
  disconnectIntegration,
  loadIntegrationAccounts,
  requestIntegrationAction,
  upsertIntegrationAccount,
  writeIntegrationLog,
} from '../../services/integrationsService';

import './Configuracoes.css';
import './ConfiguracoesEnhancements.css';

const tabs = [
  ['general', 'Geral', Settings],
  ['financial', 'Financeiro', ShieldCheck],
  ['notifications', 'Agenda e Notificações', Bell],
  ['integrations', 'Integrações', Link2],
  ['data', 'Dados e Backup', Database],
  ['team', 'Equipe e Permissões', Users],
  ['studio', 'Marca e Estúdio', Building2],
];

const integrationIcons = {
  googleCalendar: CalendarDays,
  googleDrive: HardDrive,
  email: Mail,
  whatsapp: Link2,
  supabase: Database,
  electronicSignature: ShieldCheck,
  stripe: Cloud,
  googleMeet: Video,
};

const integrationStatusLabels = {
  connected: 'Conectado',
  connecting: 'Conectando',
  error: 'Atenção',
  not_connected: 'Não conectado',
  coming_soon: 'Em breve',
};

const Field = ({ label, children }) => (
  <label className="settings-field">
    <span>{label}</span>
    {children}
  </label>
);

const SettingsSwitch = ({
  checked,
  onCheckedChange,
  ariaLabel,
  disabled = false,
}) => (
  <span className="settings-switch">
    <input
      aria-label={ariaLabel}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />

    <span className="settings-switch-track" />
  </span>
);

const Toggle = ({
  label,
  description,
  checked,
  onChange,
}) => (
  <label className="settings-toggle">
    <span className="settings-toggle-copy">
      <strong>{label}</strong>

      {description && <small>{description}</small>}
    </span>

    <SettingsSwitch
      ariaLabel={label}
      checked={checked}
      onCheckedChange={onChange}
    />
  </label>
);

const Title = ({ title, text }) => (
  <header className="settings-panel-title">
    <h2>{title}</h2>
    <p>{text}</p>
  </header>
);

const Grid = ({ children }) => (
  <div className="settings-grid">
    {children}
  </div>
);

const ListEditor = ({
  label,
  value,
  onChange,
}) => (
  <Field label={`${label} (separadas por vírgula)`}>
    <input
      value={value.join(', ')}
      onChange={(event) => {
        const items = event.target.value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);

        onChange(items);
      }}
    />
  </Field>
);

const emptyTeamMember = {
  id: null,
  nome: '',
  funcao: 'Fotógrafo',
  telefone: '',
  email: '',
  valorDiaria: '',
  ativo: true,
  observacoes: '',
};

const createTeamMemberId = () => (
  globalThis.crypto?.randomUUID?.()
  || `team-member-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

export default function Configuracoes() {
  const navigate = useNavigate();
  const [active, setActive] = useState('general');
  const [settings, setSettings] = useState(loadSettings);
  const [message, setMessage] = useState('');
  const [teamDraft, setTeamDraft] = useState(emptyTeamMember);
  const [teamFormOpen, setTeamFormOpen] = useState(false);
  const [integrationAccounts, setIntegrationAccounts] = useState([]);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationBusy, setIntegrationBusy] = useState('');
  const [selectedIntegration, setSelectedIntegration] = useState(null);


  const importRef = useRef(null);

  const update = (section, key, value) => {
    setSettings((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [key]: value,
      },
    }));
  };

  const save = () => {
    saveSettings(settings);
    setMessage('Configurações salvas com sucesso.');

    window.setTimeout(() => {
      setMessage('');
    }, 3000);
  };

  const exportData = () => {
    const payload = createBackupPayload();

    const file = new Blob(
      [JSON.stringify(payload, null, 2)],
      {
        type: 'application/json',
      },
    );

    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `studioflow-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const payload = JSON.parse(await file.text());
      if (!window.confirm('Restaurar este backup? Os dados atuais das áreas presentes no arquivo serão substituídos.')) return;
      restoreBackupPayload(payload);

      setSettings(loadSettings());
      setMessage('Backup importado com sucesso.');
    } catch (error) {
      setMessage(error?.message || 'Não foi possível importar este arquivo.');
    }

    event.target.value = '';
  };

  const openNewTeamMember = () => {
    setTeamDraft(emptyTeamMember);
    setTeamFormOpen(true);
  };

  const openEditTeamMember = (member) => {
    setTeamDraft({
      ...emptyTeamMember,
      ...member,
      valorDiaria: maskCurrency(
        member.valorDiaria || 0,
      ),
    });
    setTeamFormOpen(true);
  };

  const saveTeamMember = () => {
    const nome = String(teamDraft.nome || '').trim();

    if (!nome) {
      setMessage('Informe o nome do membro da equipe.');
      return;
    }

    const now = new Date().toISOString();
    const member = {
      ...teamDraft,
      id: teamDraft.id || createTeamMemberId(),
      nome,
      funcao: String(
        teamDraft.funcao || 'Fotógrafo',
      ).trim(),
      telefone: String(teamDraft.telefone || '').trim(),
      email: String(teamDraft.email || '').trim(),
      valorDiaria: Math.max(
        0,
        parseCurrency(teamDraft.valorDiaria),
      ),
      ativo: teamDraft.ativo !== false,
      observacoes: String(
        teamDraft.observacoes || '',
      ).trim(),
      criadoEm: teamDraft.criadoEm || now,
      atualizadoEm: now,
    };

    setSettings((current) => {
      const members = Array.isArray(
        current.team?.members,
      )
        ? current.team.members
        : [];

      const nextSettings = {
        ...current,
        team: {
          ...current.team,
          members: teamDraft.id
            ? members.map((item) => (
              item.id === teamDraft.id
                ? member
                : item
            ))
            : [...members, member],
        },
      };

      saveSettings(nextSettings);

      return nextSettings;
    });

    setTeamDraft(emptyTeamMember);
    setTeamFormOpen(false);
    setMessage(
      teamDraft.id
        ? 'Membro atualizado e salvo com sucesso.'
        : 'Membro adicionado e salvo com sucesso.',
    );
  };

  const removeTeamMember = (member) => {
    const confirmed = window.confirm(
      `Remover ${member.nome} da equipe central?`,
    );

    if (!confirmed) return;

    setSettings((current) => {
      const nextSettings = {
        ...current,
        team: {
          ...current.team,
          members: (
            current.team?.members || []
          ).filter((item) => item.id !== member.id),
        },
      };

      saveSettings(nextSettings);

      return nextSettings;
    });

    setMessage(
      'Membro removido e alterações salvas.',
    );
  };


  const integrationAccountMap = useMemo(() => (
    Object.fromEntries(
      integrationAccounts.map((account) => [account.provider, account]),
    )
  ), [integrationAccounts]);

  const refreshIntegrations = async () => {
    setIntegrationLoading(true);
    try {
      const accounts = await loadIntegrationAccounts();
      setIntegrationAccounts(accounts);
    } catch (error) {
      setMessage(error?.message || 'Não foi possível carregar as integrações.');
    } finally {
      setIntegrationLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const oauthError = params.get('error');

    if (!state || (!code && !oauthError)) return;

    setIntegrationLoading(true);
    requestIntegrationAction('google-oauth-callback', {
      code,
      state,
      error: oauthError,
    })
      .then(async (response) => {
        setMessage(response?.accountEmail
          ? `Google Workspace conectado: ${response.accountEmail}.`
          : 'Google Workspace conectado com sucesso.');
        window.history.replaceState({}, document.title, window.location.pathname);
        await refreshIntegrations();
      })
      .catch((error) => {
        setMessage(error?.message || 'Não foi possível concluir a conexão Google.');
        window.history.replaceState({}, document.title, window.location.pathname);
      })
      .finally(() => setIntegrationLoading(false));
  }, []);

  useEffect(() => {
    let activeRequest = true;

    loadIntegrationAccounts()
      .then((accounts) => {
        if (activeRequest) setIntegrationAccounts(accounts);
      })
      .catch((error) => {
        if (activeRequest) {
          setMessage(error?.message || 'Não foi possível carregar as integrações.');
        }
      });

    return () => {
      activeRequest = false;
    };
  }, []);

  const getIntegrationStatus = (key) => {
    if (key === 'supabase') return 'connected';
    const config = INTEGRATION_PROVIDERS[key];
    const account = integrationAccountMap[config?.provider];
    return account?.status || settings.integrations?.[key] || 'not_connected';
  };

  const connectIntegration = async (key) => {
    const config = INTEGRATION_PROVIDERS[key];
    if (!config) return;

    if (config.category === 'future') {
      setSelectedIntegration(key);
      return;
    }

    if (key === 'supabase') {
      setMessage('O Supabase já está conectado e é a base principal do StudioFlow.');
      return;
    }

    setIntegrationBusy(key);
    try {
      await upsertIntegrationAccount(config.provider, {
        status: 'connecting',
        settings: {},
      });
      await writeIntegrationLog({
        provider: config.provider,
        action: 'oauth_requested',
        message: 'Conexão solicitada pelo centro de integrações.',
      });
      const response = await requestIntegrationAction('google-oauth-start', {
        provider: config.provider,
        returnUrl: `${window.location.origin}/configuracoes`,
      });
      if (!response?.authorizationUrl) {
        throw new Error('O conector não retornou a URL de autorização do Google.');
      }
      window.location.assign(response.authorizationUrl);
    } catch (error) {
      await upsertIntegrationAccount(config.provider, {
        status: 'error',
        last_error: error?.message || 'Falha ao iniciar conexão.',
      }).catch(() => {});
      setMessage(error?.message || 'Não foi possível iniciar a conexão.');
      await refreshIntegrations();
    } finally {
      setIntegrationBusy('');
    }
  };

  const syncIntegration = async (key) => {
    const config = INTEGRATION_PROVIDERS[key];
    if (!config) return;
    setIntegrationBusy(key);
    try {
      await requestIntegrationAction('integration-sync', { provider: config.provider });
      setMessage(`${config.name} sincronizado com sucesso.`);
      await refreshIntegrations();
    } catch (error) {
      setMessage(error?.message || 'Não foi possível sincronizar agora.');
    } finally {
      setIntegrationBusy('');
    }
  };

  const removeIntegration = async (key) => {
    const config = INTEGRATION_PROVIDERS[key];
    if (!config || key === 'supabase') return;
    if (!window.confirm(`Desconectar ${config.name}?`)) return;
    setIntegrationBusy(key);
    try {
      await requestIntegrationAction('integration-disconnect', { provider: config.provider }).catch(() => null);
      await disconnectIntegration(config.provider);
      setMessage(`${config.name} desconectado.`);
      await refreshIntegrations();
    } catch (error) {
      setMessage(error?.message || 'Não foi possível desconectar.');
    } finally {
      setIntegrationBusy('');
    }
  };

  return (
    <section className="settings-page">
      <header className="settings-heading">
        <div>
          <span>Central administrativa</span>
          <h1>Configurações</h1>

          <p>
            Preferências, regras e modelos usados por todo o StudioFlow.
          </p>
        </div>

        <button
          className="btn btn-primary"
          type="button"
          onClick={save}
        >
          <Save size={17} />
          Salvar alterações
        </button>
      </header>

      {message && (
        <div
          className="settings-message"
          role="status"
        >
          {message}
        </div>
      )}

      <div className="settings-layout">
        <nav
          className="settings-tabs"
          aria-label="Seções de configurações"
        >
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={active === id ? 'active' : ''}
              onClick={() => setActive(id)}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <main className="settings-panel">
          {active === 'general' && (
            <>
              <Title
                title="Geral"
                text="Preferências de experiência e regionalização."
              />

              <Grid>
                <Field label="Tema">
                  <select
                    value={settings.general.theme}
                    onChange={(event) => {
                      update(
                        'general',
                        'theme',
                        event.target.value,
                      );
                    }}
                  >
                    <option value="dark">Escuro</option>
                    <option value="light">Claro</option>
                  </select>
                </Field>

                <Field label="Idioma">
                  <select
                    value={settings.general.language}
                    onChange={(event) => {
                      update(
                        'general',
                        'language',
                        event.target.value,
                      );
                    }}
                  >
                    <option value="pt-BR">
                      Português (Brasil)
                    </option>

                    <option value="en-US">
                      English
                    </option>
                  </select>
                </Field>

                <Field label="Formato de data">
                  <select
                    value={settings.general.dateFormat}
                    onChange={(event) => {
                      update(
                        'general',
                        'dateFormat',
                        event.target.value,
                      );
                    }}
                  >
                    <option value="DD/MM/YYYY">
                      DD/MM/YYYY
                    </option>

                    <option value="MM/DD/YYYY">
                      MM/DD/YYYY
                    </option>
                  </select>
                </Field>

                <Field label="Formato de hora">
                  <select
                    value={settings.general.timeFormat}
                    onChange={(event) => {
                      update(
                        'general',
                        'timeFormat',
                        event.target.value,
                      );
                    }}
                  >
                    <option value="24h">
                      24 horas
                    </option>

                    <option value="12h">
                      12 horas
                    </option>
                  </select>
                </Field>

                <Field label="Moeda padrão">
                  <select
                    value={settings.general.currency}
                    onChange={(event) => {
                      update(
                        'general',
                        'currency',
                        event.target.value,
                      );
                    }}
                  >
                    <option value="BRL">
                      BRL — Real
                    </option>

                    <option value="USD">
                      USD — Dólar
                    </option>

                    <option value="EUR">
                      EUR — Euro
                    </option>
                  </select>
                </Field>
              </Grid>

              <Toggle
                label="Ativar animações"
                checked={settings.general.animations}
                onChange={(value) => {
                  update(
                    'general',
                    'animations',
                    value,
                  );
                }}
              />

              <Toggle
                label="Ativar sons"
                checked={settings.general.sounds}
                onChange={(value) => {
                  update(
                    'general',
                    'sounds',
                    value,
                  );
                }}
              />
            </>
          )}

          {active === 'financial' && (
            <>
              <Title
                title="Financeiro"
                text="Padrões consumidos por propostas, contratos, parcelas e equipamentos."
              />

              <Grid>
                {[
                  [
                    'closingDay',
                    'Dia de fechamento',
                    'number',
                  ],
                  [
                    'monthlyGoal',
                    'Meta mensal',
                    'number',
                  ],
                  [
                    'annualGoal',
                    'Meta anual',
                    'number',
                  ],
                  [
                    'depositPercent',
                    'Entrada padrão (%)',
                    'number',
                  ],
                  [
                    'maxInstallments',
                    'Máximo de parcelas',
                    'number',
                  ],
                  [
                    'interestPercent',
                    'Juros (%)',
                    'number',
                  ],
                  [
                    'lateFeePercent',
                    'Multa por atraso (%)',
                    'number',
                  ],
                  [
                    'usefulLifeYears',
                    'Vida útil padrão (anos)',
                    'number',
                  ],
                  [
                    'residualPercent',
                    'Valor residual (%)',
                    'number',
                  ],
                ].map(([key, label, type]) => (
                  <Field
                    key={key}
                    label={label}
                  >
                    <input
                      type={type}
                      value={settings.financial[key]}
                      onChange={(event) => {
                        update(
                          'financial',
                          key,
                          Number(event.target.value),
                        );
                      }}
                    />
                  </Field>
                ))}
              </Grid>

              <ListEditor
                label="Formas de pagamento"
                value={settings.financial.paymentMethods}
                onChange={(value) => {
                  update(
                    'financial',
                    'paymentMethods',
                    value,
                  );
                }}
              />

              <ListEditor
                label="Categorias padrão"
                value={settings.financial.categories}
                onChange={(value) => {
                  update(
                    'financial',
                    'categories',
                    value,
                  );
                }}
              />
            </>
          )}

          {active === 'notifications' && (
            <>
              <Title
                title="Agenda e Notificações"
                text="Defina quando e onde os alertas internos devem aparecer."
              />

              <Grid>
                <Field label="Antecedência de eventos (horas)">
                  <input
                    type="number"
                    value={settings.notifications.eventLeadHours}
                    onChange={(event) => {
                      update(
                        'notifications',
                        'eventLeadHours',
                        Number(event.target.value),
                      );
                    }}
                  />
                </Field>

                <Field label="Horário preferido">
                  <input
                    type="time"
                    value={settings.notifications.preferredTime}
                    onChange={(event) => {
                      update(
                        'notifications',
                        'preferredTime',
                        event.target.value,
                      );
                    }}
                  />
                </Field>

                <Field label="Início do expediente">
                  <input
                    type="time"
                    value={settings.notifications.workStart}
                    onChange={(event) => {
                      update(
                        'notifications',
                        'workStart',
                        event.target.value,
                      );
                    }}
                  />
                </Field>

                <Field label="Fim do expediente">
                  <input
                    type="time"
                    value={settings.notifications.workEnd}
                    onChange={(event) => {
                      update(
                        'notifications',
                        'workEnd',
                        event.target.value,
                      );
                    }}
                  />
                </Field>
              </Grid>

              {[
                ['events', 'Eventos próximos'],
                ['installments', 'Parcelas'],
                ['contracts', 'Contratos'],
                ['deliveries', 'Entregas'],
                ['followUps', 'Follow-ups'],
                ['email', 'E-mail'],
                ['inApp', 'No sistema'],
                ['whatsapp', 'WhatsApp'],
              ].map(([key, label]) => (
                <Toggle
                  key={key}
                  label={label}
                  checked={settings.notifications[key]}
                  onChange={(value) => {
                    update(
                      'notifications',
                      key,
                      value,
                    );
                  }}
                />
              ))}
            </>
          )}

          {active === 'integrations' && (
            <>
              <Title
                title="Centro de Integrações"
                text="Conecte serviços externos com transparência, permissões mínimas e histórico de sincronização."
              />

              <div className="integration-overview">
                <div>
                  <ShieldCheck size={20} />
                  <span>
                    <strong>Tokens protegidos no backend</strong>
                    <small>Nenhuma credencial deve ficar no navegador ou no código publicado.</small>
                  </span>
                </div>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={refreshIntegrations}
                  disabled={integrationLoading}
                >
                  <RefreshCw size={16} className={integrationLoading ? 'spin' : ''} />
                  Atualizar status
                </button>
              </div>

              <div className="integration-section-heading">
                <div>
                  <h3>Google Workspace</h3>
                  <p>Calendar, Meet, Gmail e Drive usam uma autorização Google central e segura.</p>
                </div>
                <span className="integration-environment">OAuth via Supabase</span>
              </div>

              <div className="integration-cards">
                {Object.entries(INTEGRATION_PROVIDERS).map(([key, config]) => {
                  const Icon = integrationIcons[key] || Link2;
                  const status = getIntegrationStatus(key);
                  const account = integrationAccountMap[config.provider];
                  const connected = status === 'connected';
                  const future = config.category === 'future';
                  const busy = integrationBusy === key;

                  return (
                    <article className={`integration-card ${status}`} key={key}>
                      <div className="integration-card-icon">
                        <Icon size={21} />
                      </div>

                      <div className="integration-card-main">
                        <div className="integration-card-heading">
                          <div>
                            <h3>{config.name}</h3>
                            <p>{config.description}</p>
                          </div>
                          <span className={`status ${status}`}>
                            {status === 'connected' && <CheckCircle2 size={13} />}
                            {status === 'error' && <CircleAlert size={13} />}
                            {integrationStatusLabels[status] || status}
                          </span>
                        </div>

                        <div className="integration-capabilities">
                          {config.capabilities.map((capability) => (
                            <span key={capability}>{capability}</span>
                          ))}
                        </div>

                        {(account?.account_email || account?.last_sync_at || account?.last_error) && (
                          <div className="integration-meta">
                            {account.account_email && <span>Conta: <strong>{account.account_email}</strong></span>}
                            {account.last_sync_at && <span>Última sincronização: <strong>{new Date(account.last_sync_at).toLocaleString('pt-BR')}</strong></span>}
                            {account.last_error && <span className="error">Último erro: {account.last_error}</span>}
                          </div>
                        )}
                      </div>

                      <div className="integration-card-actions">
                        {connected && key !== 'supabase' && (
                          <>
                            <button type="button" onClick={() => syncIntegration(key)} disabled={busy}>
                              <RefreshCw size={15} className={busy ? 'spin' : ''} />
                              Sincronizar
                            </button>
                            <button className="danger" type="button" onClick={() => removeIntegration(key)} disabled={busy}>
                              <Unplug size={15} />
                              Desconectar
                            </button>
                          </>
                        )}

                        {!connected && (
                          <button
                            className="primary"
                            type="button"
                            onClick={() => connectIntegration(key)}
                            disabled={busy || key === 'supabase'}
                          >
                            {busy ? <RefreshCw size={15} className="spin" /> : <ExternalLink size={15} />}
                            {future ? 'Ver preparação' : status === 'error' ? 'Tentar novamente' : 'Conectar'}
                          </button>
                        )}

                        {key === 'supabase' && (
                          <span className="integration-core-note">Base principal ativa</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="integration-setup-note">
                <CircleAlert size={18} />
                <div>
                  <strong>Ativação das integrações Google</strong>
                  <p>O código e as tabelas estão preparados. Para concluir a conexão real, cadastre GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_OAUTH_REDIRECT_URI como segredos do Supabase e publique as Edge Functions de OAuth e sincronização.</p>
                </div>
              </div>

              {selectedIntegration && (
                <div className="integration-detail-panel">
                  <div>
                    <h3>{INTEGRATION_PROVIDERS[selectedIntegration]?.name}</h3>
                    <p>{INTEGRATION_PROVIDERS[selectedIntegration]?.description}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedIntegration(null)}>Fechar</button>
                  <div className="integration-detail-content">
                    <strong>Infraestrutura já preparada</strong>
                    <ul>
                      {INTEGRATION_PROVIDERS[selectedIntegration]?.capabilities.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                    <p>Esta integração será ativada depois do núcleo Google, usando a mesma camada segura de contas, logs e webhooks.</p>
                  </div>
                </div>
              )}
            </>
          )}

          {active === 'data' && (
            <>
              <Title
                title="Dados e Backup"
                text="Exporte ou restaure uma cópia local do workspace."
              />

              <div className="settings-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => navigate('/configuracoes/migracao-dados')}
                >
                  <Database size={16} />
                  Migração de dados
                </button>

                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={exportData}
                >
                  Exportar dados
                </button>

                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => importRef.current?.click()}
                >
                  Importar dados
                </button>

                <input
                  ref={importRef}
                  hidden
                  type="file"
                  accept="application/json"
                  onChange={importData}
                />
              </div>

              <div className="danger-zone">
                <h3>Zona de segurança</h3>

                <p>
                  Limpeza de dados e exclusão de conta exigem backend
                  administrativo e confirmação reforçada. Essas ações
                  permanecem bloqueadas.
                </p>

                <button
                  className="btn btn-danger"
                  type="button"
                  disabled
                >
                  Excluir workspace
                </button>
              </div>
            </>
          )}

          {active === 'team' && (
            <>
              <Title
                title="Equipe e Permissões"
                text="Cadastre a equipe central para reutilizar os mesmos profissionais em todos os trabalhos."
              />

              <div className="settings-team-toolbar">
                <div>
                  <strong>
                    {(settings.team?.members || []).length} membro(s)
                  </strong>

                  <span>
                    A equipe cadastrada poderá ser vinculada aos projetos.
                  </span>
                </div>

                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={openNewTeamMember}
                >
                  <Plus size={16} />
                  Novo membro
                </button>
              </div>

              {teamFormOpen && (
                <div className="settings-team-form">
                  <Grid>
                    <Field label="Nome">
                      <input
                        value={teamDraft.nome}
                        onChange={(event) => {
                          setTeamDraft((draft) => ({
                            ...draft,
                            nome: capitalizeName(
                              event.target.value,
                            ),
                          }));
                        }}
                      />
                    </Field>

                    <Field label="Função principal">
                      <select
                        value={teamDraft.funcao}
                        onChange={(event) => {
                          setTeamDraft((draft) => ({
                            ...draft,
                            funcao: event.target.value,
                          }));
                        }}
                      >
                        {[
                          'Administrador',
                          'Fotógrafo',
                          'Videomaker',
                          'Assistente',
                          'Editor',
                          'Atendimento',
                          'Financeiro',
                          'Outro',
                        ].map((role) => (
                          <option key={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Telefone">
                      <input
                        value={teamDraft.telefone}
                        onChange={(event) => {
                          setTeamDraft((draft) => ({
                            ...draft,
                            telefone: maskPhone(
                              event.target.value,
                            ),
                          }));
                        }}
                      />
                    </Field>

                    <Field label="E-mail">
                      <input
                        type="email"
                        value={teamDraft.email}
                        onChange={(event) => {
                          setTeamDraft((draft) => ({
                            ...draft,
                            email: event.target.value,
                          }));
                        }}
                      />
                    </Field>

                    <Field label="Valor padrão da diária">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={teamDraft.valorDiaria}
                        placeholder="R$ 0,00"
                        onChange={(event) => {
                          setTeamDraft((draft) => ({
                            ...draft,
                            valorDiaria: maskCurrency(
                              event.target.value,
                            ),
                          }));
                        }}
                      />
                    </Field>

                    <Field label="Status">
                      <select
                        value={
                          teamDraft.ativo
                            ? 'ativo'
                            : 'inativo'
                        }
                        onChange={(event) => {
                          setTeamDraft((draft) => ({
                            ...draft,
                            ativo:
                              event.target.value === 'ativo',
                          }));
                        }}
                      >
                        <option value="ativo">Ativo</option>
                        <option value="inativo">Inativo</option>
                      </select>
                    </Field>
                  </Grid>

                  <Field label="Observações">
                    <textarea
                      rows="3"
                      value={teamDraft.observacoes}
                      onChange={(event) => {
                        setTeamDraft((draft) => ({
                          ...draft,
                          observacoes: event.target.value,
                        }));
                      }}
                    />
                  </Field>

                  <div className="settings-team-form-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setTeamFormOpen(false);
                        setTeamDraft(emptyTeamMember);
                      }}
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={saveTeamMember}
                    >
                      <Save size={16} />
                      Salvar membro
                    </button>
                  </div>
                </div>
              )}

              <div className="settings-team-list">
                {(settings.team?.members || []).map((member) => (
                  <article key={member.id}>
                    <div className="settings-team-avatar">
                      {String(member.nome || '?')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>

                    <div className="settings-team-copy">
                      <strong>{member.nome}</strong>

                      <span>
                        {member.funcao}
                        {member.telefone
                          ? ` · ${member.telefone}`
                          : ''}
                      </span>

                      <small>
                        Diária padrão: {Number(
                          member.valorDiaria || 0,
                        ).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </small>
                    </div>

                    <span
                      className={
                        member.ativo
                          ? 'settings-team-status active'
                          : 'settings-team-status'
                      }
                    >
                      {member.ativo ? 'Ativo' : 'Inativo'}
                    </span>

                    <div className="settings-team-actions">
                      <button
                        type="button"
                        title="Editar membro"
                        onClick={() => {
                          openEditTeamMember(member);
                        }}
                      >
                        <Edit3 size={15} />
                      </button>

                      <button
                        type="button"
                        title="Excluir membro"
                        className="danger"
                        onClick={() => {
                          removeTeamMember(member);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                ))}

                {(settings.team?.members || []).length === 0 && (
                  <div className="settings-team-empty">
                    Nenhum membro cadastrado. Use “Novo membro” para criar a equipe central.
                  </div>
                )}
              </div>
            </>
          )}

          {active === 'studio' && (
            <>
              <Title
                title="Marca e Dados do Estúdio"
                text="Fonte única usada em documentos e comunicações."
              />

              <Grid>
                {[
                  ['name', 'Nome do estúdio'],
                  ['legalName', 'Nome jurídico'],
                  ['document', 'CPF/CNPJ'],
                  ['address', 'Endereço'],
                  ['phone', 'Telefone'],
                  ['whatsapp', 'WhatsApp'],
                  ['email', 'E-mail'],
                  ['instagram', 'Instagram'],
                  ['website', 'Site'],
                  ['primaryColor', 'Cor principal'],
                  ['footer', 'Rodapé padrão'],
                ].map(([key, label]) => (
                  <Field
                    key={key}
                    label={label}
                  >
                    <input
                      type={key === 'primaryColor' ? 'color' : 'text'}
                      value={settings.studio[key]}
                      onChange={(event) => {
                        update(
                          'studio',
                          key,
                          event.target.value,
                        );
                      }}
                    />
                  </Field>
                ))}
              </Grid>

              <Field label="Texto institucional">
                <textarea
                  rows="5"
                  value={settings.studio.institutionalText}
                  onChange={(event) => {
                    update(
                      'studio',
                      'institutionalText',
                      event.target.value,
                    );
                  }}
                />
              </Field>
            </>
          )}
        </main>
      </div>
    </section>
  );
}