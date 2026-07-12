import { useRef, useState } from 'react';
import {
  Bell,
  Building2,
  Database,
  Link2,
  Save,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { loadSettings, saveSettings } from '../../utils/settings';
import { createBackupPayload, restoreBackupPayload } from '../../utils/backup';

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

const integrationNames = {
  googleCalendar: 'Google Calendar',
  googleDrive: 'Google Drive',
  email: 'Gmail / E-mail',
  whatsapp: 'WhatsApp',
  supabase: 'Supabase',
  electronicSignature: 'Assinatura eletrônica',
  stripe: 'Stripe',
  googleMeet: 'Google Meet',
};

const statusLabels = {
  connected: 'Conectado',
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

export default function Configuracoes() {
  const [active, setActive] = useState('general');
  const [settings, setSettings] = useState(loadSettings);
  const [message, setMessage] = useState('');

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
                title="Integrações"
                text="Conexões reais e recursos preparados para evolução."
              />

              <div className="integration-grid">
                {Object
                  .entries(settings.integrations)
                  .map(([key, status]) => (
                    <article key={key}>
                      <strong>
                        {integrationNames[key] || key}
                      </strong>

                      <span className={`status ${status}`}>
                        {statusLabels[status] || status}
                      </span>

                      <button
                        type="button"
                        disabled
                      >
                        Gerenciar
                      </button>
                    </article>
                  ))}
              </div>
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
                text="Estrutura preparada; convites dependerão de backend multiusuário."
              />

              <div className="role-grid">
                {[
                  'Administrador',
                  'Financeiro',
                  'Atendimento',
                  'Fotógrafo',
                  'Editor',
                ].map((role) => (
                  <article key={role}>
                    <strong>{role}</strong>
                    <span>Sem membros configurados</span>

                    <button
                      type="button"
                      disabled
                    >
                      Gerenciar permissões
                    </button>
                  </article>
                ))}
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
