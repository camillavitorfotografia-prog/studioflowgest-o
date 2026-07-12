import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Building2, ChevronDown, ChevronUp, Database, FileSignature, FileText, Link2, Plus, RotateCcw, Save, Settings, ShieldCheck, Users } from 'lucide-react';
import { loadSettings, saveSettings } from '../../utils/settings';
import { readStorage, STORAGE_KEYS } from '../../utils/storage';
import './Configuracoes.css';
import './ConfiguracoesEnhancements.css';
import { DEFAULT_SIDEBAR_SETTINGS, SIDEBAR_MODULES } from '../../utils/sidebarModules';

const tabs = [['general', 'Geral', Settings], ['sidebar', 'Barra lateral', Settings], ['financial', 'Financeiro', ShieldCheck], ['notifications', 'Agenda e Notificações', Bell], ['proposals', 'Modelos de Propostas', FileText], ['contracts', 'Modelos de Contratos', FileSignature], ['integrations', 'Integrações', Link2], ['data', 'Dados e Backup', Database], ['team', 'Equipe e Permissões', Users], ['studio', 'Marca e Estúdio', Building2]];
const Field = ({ label, children }) => <label className="settings-field"><span>{label}</span>{children}</label>;
const Toggle = ({ label, checked, onChange }) => <label className="settings-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;

export default function Configuracoes() {
  const [active, setActive] = useState('general');
  const [settings, setSettings] = useState(loadSettings);
  const [message, setMessage] = useState('');
  const importRef = useRef(null);
  const navigate = useNavigate();
  const update = (section, key, value) => setSettings((current) => ({ ...current, [section]: { ...current[section], [key]: value } }));
  const save = () => { saveSettings(settings); setMessage('Configurações salvas com sucesso.'); window.setTimeout(() => setMessage(''), 3000); };
  const exportData = () => {
    const payload = Object.fromEntries(Object.values(STORAGE_KEYS).map((key) => [key, readStorage(key, null)]));
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `studioflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importData = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());
      Object.entries(payload).forEach(([key, value]) => {
        if (Object.values(STORAGE_KEYS).includes(key) && value !== null) {
          localStorage.setItem(key, JSON.stringify(value));
        }
      });
      setSettings(loadSettings());
      setMessage('Backup importado com sucesso.');
    } catch {
      setMessage('Não foi possível importar este arquivo.');
    }

    event.target.value = '';
  };

  const openModelosPropostas = () => {
    navigate('/configuracoes/modelos-propostas');
  };

  const openModelosContratos = () => {
    navigate('/configuracoes/modelos-contratos');
  };

  return <section className="settings-page">
    <header className="settings-heading"><div><span>Central administrativa</span><h1>Configurações</h1><p>Preferências, regras e modelos usados por todo o StudioFlow.</p></div>{!['proposals','contracts'].includes(active) && <button className="btn btn-primary" onClick={save}><Save size={17} /> Salvar alterações</button>}</header>
    {message && <div className="settings-message" role="status">{message}</div>}
    <div className="settings-layout"><nav className="settings-tabs" aria-label="Seções de configurações">{tabs.map(([id, label, Icon]) => <button key={id} className={active === id ? 'active' : ''} onClick={() => setActive(id)}><Icon size={17} /><span>{label}</span></button>)}</nav>
      <main className="settings-panel">
        {active === 'general' && <><Title title="Geral" text="Preferências de experiência e regionalização." /><Grid>
          <Field label="Tema"><select value={settings.general.theme} onChange={(e) => update('general', 'theme', e.target.value)}><option value="dark">Escuro</option><option value="light">Claro</option></select></Field>
          <Field label="Idioma"><select value={settings.general.language} onChange={(e) => update('general', 'language', e.target.value)}><option value="pt-BR">Português (Brasil)</option><option value="en-US">English</option></select></Field>
          <Field label="Formato de data"><select value={settings.general.dateFormat} onChange={(e) => update('general', 'dateFormat', e.target.value)}><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option></select></Field>
          <Field label="Formato de hora"><select value={settings.general.timeFormat} onChange={(e) => update('general', 'timeFormat', e.target.value)}><option value="24h">24 horas</option><option value="12h">12 horas</option></select></Field>
          <Field label="Moeda padrão"><select value={settings.general.currency} onChange={(e) => update('general', 'currency', e.target.value)}><option value="BRL">BRL — Real</option><option value="USD">USD — Dólar</option><option value="EUR">EUR — Euro</option></select></Field>
        </Grid><Toggle label="Ativar animações" checked={settings.general.animations} onChange={(v) => update('general', 'animations', v)} /><Toggle label="Ativar sons" checked={settings.general.sounds} onChange={(v) => update('general', 'sounds', v)} /></>}
        {active === 'financial' && <><Title title="Financeiro" text="Padrões consumidos por propostas, contratos, parcelas e equipamentos." /><Grid>{[['closingDay','Dia de fechamento','number'],['monthlyGoal','Meta mensal','number'],['annualGoal','Meta anual','number'],['depositPercent','Entrada padrão (%)','number'],['maxInstallments','Máximo de parcelas','number'],['interestPercent','Juros (%)','number'],['lateFeePercent','Multa por atraso (%)','number'],['usefulLifeYears','Vida útil padrão (anos)','number'],['residualPercent','Valor residual (%)','number']].map(([key,label,type]) => <Field key={key} label={label}><input type={type} value={settings.financial[key]} onChange={(e) => update('financial', key, Number(e.target.value))} /></Field>)}</Grid><ListEditor label="Formas de pagamento" value={settings.financial.paymentMethods} onChange={(v) => update('financial','paymentMethods',v)} /><ListEditor label="Categorias padrão" value={settings.financial.categories} onChange={(v) => update('financial','categories',v)} /></>}
        {active === 'sidebar' && <SidebarSettings settings={settings} update={update} />}
        {active === 'notifications' && <><Title title="Agenda e Notificações" text="Defina quando e onde os alertas internos devem aparecer." /><Grid><Field label="Antecedência de eventos (horas)"><input type="number" value={settings.notifications.eventLeadHours} onChange={(e) => update('notifications','eventLeadHours',Number(e.target.value))}/></Field><Field label="Horário preferido"><input type="time" value={settings.notifications.preferredTime} onChange={(e) => update('notifications','preferredTime',e.target.value)}/></Field><Field label="Início do expediente"><input type="time" value={settings.notifications.workStart} onChange={(e) => update('notifications','workStart',e.target.value)}/></Field><Field label="Fim do expediente"><input type="time" value={settings.notifications.workEnd} onChange={(e) => update('notifications','workEnd',e.target.value)}/></Field></Grid>{[['events','Eventos próximos'],['installments','Parcelas'],['contracts','Contratos'],['deliveries','Entregas'],['followUps','Follow-ups'],['email','E-mail'],['inApp','No sistema'],['whatsapp','WhatsApp']].map(([key,label]) => <Toggle key={key} label={label} checked={settings.notifications[key]} onChange={(v) => update('notifications',key,v)} />)}</>}
        {active === 'integrations' && <><Title title="Integrações" text="Conexões reais e recursos preparados para evolução." /><div className="integration-grid">{Object.entries(settings.integrations).map(([key,status]) => <article key={key}><strong>{integrationNames[key]}</strong><span className={`status ${status}`}>{statusLabels[status]}</span><button disabled>Gerenciar</button></article>)}</div></>}
        {active === 'data' && <><Title title="Dados e Backup" text="Exporte ou restaure uma cópia local do workspace." /><div className="settings-actions"><button className="btn btn-primary" onClick={exportData}>Exportar dados</button><button className="btn btn-secondary" onClick={() => importRef.current?.click()}>Importar dados</button><input ref={importRef} hidden type="file" accept="application/json" onChange={importData}/></div><div className="danger-zone"><h3>Zona de segurança</h3><p>Limpeza de dados e exclusão de conta exigem backend administrativo e confirmação reforçada. Essas ações permanecem bloqueadas.</p><button className="btn btn-danger" disabled>Excluir workspace</button></div></>}
        {active === 'team' && <><Title title="Equipe e Permissões" text="Estrutura preparada; convites dependerão de backend multiusuário." /><div className="role-grid">{['Administrador','Financeiro','Atendimento','Fotógrafo','Editor'].map((role) => <article key={role}><strong>{role}</strong><span>Sem membros configurados</span><button disabled>Gerenciar permissões</button></article>)}</div></>}
        {active === 'studio' && <><Title title="Marca e Dados do Estúdio" text="Fonte única usada em documentos e comunicações." /><Grid>{[['name','Nome do estúdio'],['legalName','Nome jurídico'],['document','CPF/CNPJ'],['address','Endereço'],['phone','Telefone'],['whatsapp','WhatsApp'],['email','E-mail'],['instagram','Instagram'],['website','Site'],['primaryColor','Cor principal'],['footer','Rodapé padrão']].map(([key,label]) => <Field key={key} label={label}><input type={key === 'primaryColor' ? 'color' : 'text'} value={settings.studio[key]} onChange={(e) => update('studio',key,e.target.value)}/></Field>)}</Grid><Field label="Texto institucional"><textarea rows="5" value={settings.studio.institutionalText} onChange={(e) => update('studio','institutionalText',e.target.value)}/></Field></>}
        {active === 'proposals' && <ModelCards type="proposal" onOpen={openModelosPropostas} />}
        {active === 'contracts' && <ModelCards type="contract" onOpen={openModelosContratos} />}
      </main></div>
  </section>;
}

const Title = ({ title, text }) => <header className="settings-panel-title"><h2>{title}</h2><p>{text}</p></header>;
const Grid = ({ children }) => <div className="settings-grid">{children}</div>;
const ListEditor = ({ label, value, onChange }) => <Field label={`${label} (separadas por vírgula)`}><input value={value.join(', ')} onChange={(e) => onChange(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))}/></Field>;
const ModelCards = ({ type, onOpen }) => {
  const isProposal = type === 'proposal';
  const models = isProposal ? [['Casamento','casamento'],['Ensaio de casal','ensaio'],['Formatura individual','formatura']] : [['Contrato de Casamento','casamento'],['Contrato de Ensaio','ensaio'],['Contrato de Formatura','formatura']];
  return <><Title title={isProposal ? 'Modelos de Propostas' : 'Modelos de Contratos'} text={isProposal ? 'Crie e edite os modelos usados na geração de propostas.' : 'Gerencie os modelos utilizados na preparação de contratos.'} /><div className="settings-model-grid">{models.map(([name,category]) => <article key={name}><span className="model-card-icon">{isProposal ? <FileText /> : <FileSignature />}</span><div><h3>{name}</h3><p>{category} · versão 2026.1</p></div><span className="model-status">Publicado</span><button className="btn btn-secondary" onClick={onOpen}>{isProposal ? 'Abrir modelos' : 'Editar modelo'}</button></article>)}<article className="new-model-card"><span className="model-card-icon"><Plus /></span><div><h3>Criar novo modelo</h3><p>Inicie uma nova estrutura personalizada.</p></div><button className="btn btn-primary" onClick={onOpen}>Continuar</button></article></div></>;
};
const integrationNames={googleCalendar:'Google Calendar',googleDrive:'Google Drive',email:'Gmail / E-mail',whatsapp:'WhatsApp',supabase:'Supabase',electronicSignature:'Assinatura eletrônica',mercadoPago:'Mercado Pago',stripe:'Stripe',googleMeet:'Google Meet'};
const statusLabels={connected:'Conectado',not_connected:'Não conectado',coming_soon:'Em breve'};

const SidebarSettings = ({ settings, update }) => {
  const moduleIds = new Set(SIDEBAR_MODULES.map((item) => item.id));
  const savedOrder = (settings.sidebar.sidebarOrder || []).filter((id) => moduleIds.has(id));
  const currentOrder = [...savedOrder, ...SIDEBAR_MODULES.map((item) => item.id).filter((id) => !savedOrder.includes(id))];
  const currentVisibility = settings.sidebar.sidebarVisibility || {};
  const currentShowLabels = settings.sidebar.sidebarShowLabels;
  const currentShowAvatar = settings.sidebar.sidebarShowAvatar;
  const currentCompact = settings.sidebar.sidebarCompact;
  const currentShowFavorites = settings.sidebar.sidebarShowFavorites;

  const setSidebarValue = (key, value) => {
    const mappedKey = {
      showLabels: 'sidebarShowLabels',
      showAvatar: 'sidebarShowAvatar',
      compact: 'sidebarCompact',
      showFavorites: 'sidebarShowFavorites',
      sidebarOrder: 'sidebarOrder',
      sidebarVisibility: 'sidebarVisibility',
    }[key] || key;
    update('sidebar', mappedKey, value);
  };
  const toggleItemVisibility = (id) => setSidebarValue('sidebarVisibility', { ...currentVisibility, [id]: !currentVisibility[id] });
  const moveItem = (id, direction) => {
    const next = [...currentOrder];
    const index = next.indexOf(id);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSidebarValue('sidebarOrder', next);
  };

  const visibleCount = currentOrder.filter((id) => currentVisibility[id] !== false).length;
  const restore = () => {
    if (!window.confirm('Restaurar apenas a ordem e visibilidade padrão da sidebar?')) return;
    update('sidebar', 'sidebarOrder', DEFAULT_SIDEBAR_SETTINGS.sidebarOrder);
    update('sidebar', 'sidebarVisibility', DEFAULT_SIDEBAR_SETTINGS.sidebarVisibility);
  };
  const preferences = [
    ['showLabels', 'Exibir rótulos', 'Mostrar o nome dos módulos ao lado dos ícones.', currentShowLabels],
    ['showAvatar', 'Mostrar perfil', 'Exibir avatar, nome e e-mail na parte inferior.', currentShowAvatar],
    ['compact', 'Modo compacto', 'Reduzir a largura da navegação principal.', currentCompact],
    ['showFavorites', 'Favoritos', 'Exibir atalhos favoritos quando disponíveis.', currentShowFavorites],
  ];
  return <>
    <Title title="Personalização da barra lateral" text="Organize os módulos sem alterar rotas ou dados." />
    <div className="sidebar-preference-grid">{preferences.map(([key, title, description, checked]) => <label key={key} className="sidebar-preference"><input type="checkbox" checked={checked} onChange={(event) => setSidebarValue(key, event.target.checked)} /><span className="sf-switch" /><span><strong>{title}</strong><small>{description}</small></span></label>)}</div>
    <div className="sidebar-settings-heading"><div><h2>Itens do menu</h2><p>Defina a ordem e a visibilidade dos módulos.</p></div><button className="btn btn-secondary" type="button" onClick={restore}><RotateCcw /> Restaurar padrão</button></div>
    <div className="sidebar-config-layout"><div className="settings-sidebar-list">{currentOrder.map((id, index) => { const module = SIDEBAR_MODULES.find((item) => item.id === id); const Icon = module.icon; const visible = currentVisibility[id] !== false; return <article key={id} className="settings-sidebar-item"><span className="module-icon"><Icon /></span><span className="module-copy"><strong>{module.label}</strong><small>{moduleDescriptions[id]} · {visible ? 'Visível' : 'Oculto'}</small></span><div className="sidebar-order-actions"><button className="btn btn-icon" aria-label={`Mover ${module.label} para cima`} type="button" onClick={() => moveItem(id, -1)} disabled={index === 0}><ChevronUp /></button><button className="btn btn-icon" aria-label={`Mover ${module.label} para baixo`} type="button" onClick={() => moveItem(id, 1)} disabled={index === currentOrder.length - 1}><ChevronDown /></button><label className="visibility-switch"><input aria-label={`Exibir ${module.label}`} type="checkbox" checked={visible} onChange={() => { if (visible && visibleCount === 1) return; toggleItemVisibility(id); }} /><span className="sf-switch" /></label></div></article>; })}</div><aside className={`sidebar-preview${currentCompact ? ' compact' : ''}`}><strong>Prévia</strong>{currentOrder.filter((id) => currentVisibility[id] !== false).map((id) => { const module = SIDEBAR_MODULES.find((item) => item.id === id); const Icon = module.icon; return <div key={id}><Icon />{currentShowLabels && !currentCompact && <span>{module.label}</span>}</div>; })}{currentShowAvatar && <footer><span>CV</span>{currentShowLabels && !currentCompact && <small>Minha conta</small>}</footer>}</aside></div>
  </>;
};

const moduleDescriptions = { dashboard: 'Página inicial e visão geral', crm: 'Relacionamento e oportunidades', clientes: 'Cadastro e histórico', projetos: 'Produções e trabalhos', agenda: 'Eventos e compromissos', financeiro: 'Receitas e despesas', precificacao: 'Formação de preços', documentos: 'Propostas e contratos', equipamentos: 'Acervo e depreciação', relatorios: 'Indicadores e desempenho' };
