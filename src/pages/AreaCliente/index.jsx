import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  FileText,
  FolderOpen,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Smartphone,
  WalletCards,
  Users,
  Trash2,
  X,
} from 'lucide-react';
import { getDbStudioData } from '../../utils/dbData';
import { capitalizeName } from '../../utils/masks';
import {
  createClientPortal,
  deleteClientPortal,
  DEFAULT_SECTIONS,
  listClientPortals,
  rotateClientPortalToken,
  updateClientPortal,
} from '../../features/clientPortal/storage/clientPortalStorage';
import './AreaCliente.css';

const SECTION_OPTIONS = {
  overview: { label: 'Visão geral', description: 'Resumo do trabalho e informações principais.', icon: Sparkles },
  schedule: { label: 'Cronograma', description: 'Datas, etapas e andamento da produção.', icon: CalendarDays },
  financial: { label: 'Financeiro', description: 'Valores contratados, recebidos e pendentes.', icon: WalletCards },
  documents: { label: 'Documentos', description: 'Contratos, propostas e documentos liberados.', icon: FileText },
  files: { label: 'Arquivos', description: 'Galerias, entregas e materiais disponíveis.', icon: FolderOpen },
  messages: { label: 'Contato', description: 'Canais de atendimento e avisos do estúdio.', icon: Smartphone },
};

const initialForm = {
  clientId: '',
  projectId: '',
  name: '',
  welcomeMessage: 'Preparamos este espaço para que você acompanhe cada etapa do seu trabalho com tranquilidade.',
  expiresAt: '',
  sections: { ...DEFAULT_SECTIONS },
};

export default function AreaCliente() {
  const [portals, setPortals] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [copiedId, setCopiedId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [studioData, portalRows] = await Promise.all([
        getDbStudioData(),
        listClientPortals(),
      ]);
      setClients(studioData.clients || []);
      setProjects(studioData.projects || []);
      setPortals(portalRows || []);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar a Área do Cliente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const availableProjects = useMemo(() => (
    projects.filter((project) => String(project.clientId || project.clienteId || '') === String(form.clientId || ''))
  ), [form.clientId, projects]);

  const clientName = (id) => capitalizeName(clients.find((client) => String(client.id) === String(id))?.nome || 'Cliente');
  const projectName = (id) => {
    const project = projects.find((item) => String(item.id) === String(id));
    return capitalizeName(project?.titulo || project?.tipoServico || project?.tipo_servico || 'Todos os trabalhos');
  };

  const openCreate = () => {
    setForm(initialForm);
    setModalOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.clientId) return;
    setSaving(true);
    setError('');
    try {
      const client = clients.find((item) => String(item.id) === String(form.clientId));
      const created = await createClientPortal({
        ...form,
        name: capitalizeName(form.name || `Portal de ${client?.nome || 'cliente'}`),
      });
      setPortals((current) => [created, ...current]);
      setModalOpen(false);
      setForm(initialForm);
    } catch (saveError) {
      setError(saveError.message || 'Não foi possível criar o portal.');
    } finally {
      setSaving(false);
    }
  };

  const buildUrl = (portal) => portal.token ? `${window.location.origin}/portal/${portal.token}` : '';

  const copyLink = async (portal) => {
    let token = portal.token;
    if (!token) {
      token = await rotateClientPortalToken(portal.id);
      setPortals((current) => current.map((item) => item.id === portal.id ? { ...item, token } : item));
    }
    await navigator.clipboard.writeText(`${window.location.origin}/portal/${token}`);
    setCopiedId(portal.id);
    window.setTimeout(() => setCopiedId(''), 1800);
  };

  const toggleStatus = async (portal) => {
    const status = portal.status === 'active' ? 'disabled' : 'active';
    const updated = await updateClientPortal(portal.id, { status });
    setPortals((current) => current.map((item) => item.id === portal.id ? { ...item, ...updated } : item));
  };

  const removePortal = async (portal) => {
    const confirmed = window.confirm(`Excluir permanentemente o portal “${capitalizeName(portal.name)}”? O link deixará de funcionar imediatamente. Os dados do cliente e do trabalho serão preservados.`);
    if (!confirmed) return;
    setSaving(true);
    setError('');
    try {
      await deleteClientPortal(portal.id);
      setPortals((current) => current.filter((item) => item.id !== portal.id));
    } catch (deleteError) {
      setError(deleteError.message || 'Não foi possível excluir o portal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="client-area-admin">
      <header className="client-area-page-header">
        <div>
          <span className="client-area-page-eyebrow">Experiência do cliente</span>
          <h1>Área do Cliente</h1>
          <p>Crie portais privados para seus clientes acompanharem trabalhos, documentos, agenda e pagamentos.</p>
        </div>
        <button type="button" className="client-area-primary" onClick={openCreate}>
          <Plus size={17} /> Novo portal
        </button>
      </header>

      <section className="client-area-summary">
        <article><span><Users /></span><div><strong>{portals.length}</strong><small>Portais criados</small></div></article>
        <article><span><ShieldCheck /></span><div><strong>{portals.filter((item) => item.status === 'active').length}</strong><small>Links ativos</small></div></article>
        <article><span><Smartphone /></span><div><strong>Responsivo</strong><small>Experiência otimizada para celular</small></div></article>
      </section>

      <div className="client-area-toolbar">
        <div><span className="client-area-live-dot" /> Portal conectado aos dados do StudioFlow</div>
        <button type="button" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Atualizar</button>
      </div>

      {error && <div className="client-area-error">{error}</div>}

      <section className="client-area-list">
        {loading ? (
          <div className="client-area-empty"><LoaderCircle className="spin" /><p>Carregando portais…</p></div>
        ) : portals.length === 0 ? (
          <div className="client-area-empty"><Link2 /><h2>Nenhum portal criado</h2><p>Crie o primeiro acesso privado para um cliente.</p><button type="button" onClick={openCreate}>Criar primeiro portal</button></div>
        ) : portals.map((portal) => (
          <article className="client-portal-card" key={portal.id}>
            <div className="client-portal-card-main">
              <span className={`client-portal-status ${portal.status}`}>{portal.status === 'active' ? 'Ativo' : 'Desativado'}</span>
              <h2>{capitalizeName(portal.name)}</h2>
              <p>{clientName(portal.clientId)} · {projectName(portal.projectId)}</p>
              <div className="client-portal-sections">
                {Object.entries(portal.sections || {}).filter(([, enabled]) => enabled).map(([key]) => <span key={key}>{SECTION_OPTIONS[key]?.label || key}</span>)}
              </div>
            </div>
            <div className="client-portal-card-actions">
              <button type="button" onClick={() => copyLink(portal)}>{copiedId === portal.id ? <Check /> : <Copy />} {copiedId === portal.id ? 'Copiado' : 'Copiar link'}</button>
              {buildUrl(portal) && <a href={buildUrl(portal)} target="_blank" rel="noreferrer"><ExternalLink /> Abrir</a>}
              <button type="button" className="secondary" onClick={() => toggleStatus(portal)}>{portal.status === 'active' ? <X /> : <ShieldCheck />} {portal.status === 'active' ? 'Desativar' : 'Ativar'}</button>
              <button type="button" className="secondary" onClick={() => copyLink({ ...portal, token: '' })}><KeyRound /> Renovar link</button>
              <button type="button" className="danger" disabled={saving} onClick={() => removePortal(portal)}><Trash2 /> Excluir portal</button>
            </div>
          </article>
        ))}
      </section>

      {modalOpen && (
        <div className="client-area-modal-backdrop" onMouseDown={() => setModalOpen(false)}>
          <form className="client-area-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
            <header className="client-area-modal-header">
              <div className="client-area-modal-title">
                <span className="client-area-modal-icon"><Link2 /></span>
                <div><small>Novo acesso</small><h2>Criar portal do cliente</h2><p>Defina o conteúdo que este cliente poderá acompanhar.</p></div>
              </div>
              <button className="client-area-modal-close" type="button" onClick={() => setModalOpen(false)} aria-label="Fechar"><X /></button>
            </header>
            <div className="client-area-form-grid">
              <label><span>Cliente</span><select value={form.clientId} onChange={(event) => setForm((current) => ({ ...current, clientId: event.target.value, projectId: '' }))} required><option value="">Selecione um cliente</option>{clients.map((client) => <option value={client.id} key={client.id}>{capitalizeName(client.nome)}</option>)}</select></label>
              <label><span>Trabalho vinculado</span><select value={form.projectId} onChange={(event) => setForm((current) => ({ ...current, projectId: event.target.value }))}><option value="">Todos os trabalhos do cliente</option>{availableProjects.map((project) => <option value={project.id} key={project.id}>{capitalizeName(project.titulo || project.tipoServico || 'Trabalho')}</option>)}</select></label>
              <label className="wide"><span>Nome do portal</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: capitalizeName(event.target.value) }))} onBlur={(event) => setForm((current) => ({ ...current, name: capitalizeName(event.target.value) }))} placeholder="Ex.: Casamento de Ana e Lucas" autoComplete="off" /></label>
              <label className="wide"><span>Mensagem de boas-vindas</span><textarea value={form.welcomeMessage} onChange={(event) => setForm((current) => ({ ...current, welcomeMessage: event.target.value }))} rows="3" /></label>
              <label><span>Validade do link</span><input type="date" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} /></label>
            </div>
            <fieldset className="client-area-sections-fieldset">
              <div className="client-area-sections-heading"><div><strong>Conteúdo disponível</strong><small>Escolha o que será exibido no portal.</small></div><span>{Object.values(form.sections).filter(Boolean).length} seções</span></div>
              <div className="client-area-section-options">{Object.entries(SECTION_OPTIONS).map(([key, option]) => { const Icon = option.icon; return <label className={form.sections[key] ? 'selected' : ''} key={key}><input type="checkbox" checked={form.sections[key]} onChange={(event) => setForm((current) => ({ ...current, sections: { ...current.sections, [key]: event.target.checked } }))} /><span className="client-area-section-icon"><Icon /></span><span className="client-area-section-copy"><strong>{option.label}</strong><small>{option.description}</small></span><span className="client-area-switch" aria-hidden="true" /></label>; })}</div>
            </fieldset>
            <footer><button type="button" className="secondary" onClick={() => setModalOpen(false)}>Cancelar</button><button type="submit" disabled={saving || !form.clientId}>{saving ? <LoaderCircle className="spin" /> : <ShieldCheck />} Criar acesso seguro</button></footer>
          </form>
        </div>
      )}
    </div>
  );
}
