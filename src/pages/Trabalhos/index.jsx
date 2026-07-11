import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarCheck,
  DollarSign,
  Edit3,
  Eye,
  MoreVertical,
  Package,
  Trash2,
} from 'lucide-react';
import Modal from '../../components/Modal';
import { formatMoney } from '../../utils/integratedData';
import {
  emitDbUpdate,
  getDbStudioData,
  subscribeDbUpdates,
} from '../../utils/dbData';
import { supabase } from '../../utils/supabase';
import './Trabalhos.css';

const colunas = [
  { id: 'contrato_fechado', titulo: 'Contrato Fechado' },
  { id: 'fotografando', titulo: 'Fotografando' },
  { id: 'edicao', titulo: 'Edicao' },
  { id: 'entregue', titulo: 'Entregue' },
];

const uniqueProjects = (items = []) => {
  const projectsById = new Map();
  items.forEach((project) => {
    if (project?.id && !projectsById.has(project.id)) projectsById.set(project.id, project);
  });
  return [...projectsById.values()];
};

const projectToDraft = (project) => ({
  clienteNome: project.clienteNome || '',
  tipoServico: project.tipoServico || '',
  data: project.data || '',
  horario: project.horario || '',
  local: project.local || '',
  valorContratado: project.valorContratado ?? 0,
  status: project.status || 'contrato_fechado',
});

export default function Trabalhos() {
  const [projects, setProjects] = useState([]);
  const [rawProjects, setRawProjects] = useState([]);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [projectDraft, setProjectDraft] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [savingIds, setSavingIds] = useState([]);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    try {
      const studio = await getDbStudioData();
      const loadedProjects = uniqueProjects(studio.projects || []);
      setProjects(loadedProjects);
      setRawProjects(loadedProjects);
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
    }
  }, []);

  useEffect(() => {
    setTimeout(() => { void load(); }, 0);
    window.addEventListener('focus', load);
    const unsubscribe = subscribeDbUpdates(load);
    return () => {
      window.removeEventListener('focus', load);
      unsubscribe();
    };
  }, [load]);

  const setSaving = useCallback((id, saving) => {
    setSavingIds((current) => (
      saving ? [...new Set([...current, id])] : current.filter((item) => item !== id)
    ));
  }, []);

  const persistProject = useCallback(async (project, fields = {}) => {
    const status = fields.status ?? project.status;
    const calendarSync = fields.calendario_sync ?? project.calendarSync ?? {};
    const horario = fields.horario ?? project.horario ?? '';
    const local = fields.local ?? project.local ?? '';
    const financeiro = {
      ...(project.financeiro && typeof project.financeiro === 'object' ? project.financeiro : {}),
      workflowStatus: status,
      horario,
      local,
      calendarSync,
      agendaSincronizada: Boolean((fields.data ?? project.data) && horario && local),
      agendaAtualizadaEm: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const payload = {
      financeiro,
    };
    if (Object.hasOwn(fields, 'tipo_servico')) payload.tipo_servico = fields.tipo_servico;
    if (Object.hasOwn(fields, 'data')) payload.data = fields.data;
    if (Object.hasOwn(fields, 'valor_contratado')) payload.valor_contratado = fields.valor_contratado;

    const { data, error } = await supabase
      .from('projetos')
      .update(payload)
      .eq('id', project.id)
      .select('*')
      .single();
    if (error) throw error;
    emitDbUpdate();
    return data;
  }, []);

  const mudarStatus = useCallback(async (id, novoStatus) => {
    const project = rawProjects.find((item) => item.id === id);
    if (!project || project.status === novoStatus || savingIds.includes(id)) return;

    const previousProjects = projects;
    const previousRawProjects = rawProjects;
    const optimisticProject = { ...project, status: novoStatus };
    const updateProject = (item) => (item.id === id ? optimisticProject : item);

    setActionError('');
    setActiveMenuId(null);
    setProjects((current) => uniqueProjects(current.map(updateProject)));
    setRawProjects((current) => uniqueProjects(current.map(updateProject)));
    setSaving(id, true);

    try {
      await persistProject(optimisticProject, { status: novoStatus });
      await load();
    } catch (error) {
      console.error('Erro ao mover projeto:', error);
      setProjects(previousProjects);
      setRawProjects(previousRawProjects);
      setActionError('Nao foi possivel mover o projeto. A etapa anterior foi restaurada.');
    } finally {
      setSaving(id, false);
      setDraggingId(null);
      setDragOverColumn(null);
    }
  }, [load, persistProject, projects, rawProjects, savingIds, setSaving]);

  const openDetails = (project) => {
    setSelectedProject(project);
    setActiveMenuId(null);
  };

  const openEdit = (project) => {
    setEditingProject(project);
    setProjectDraft(projectToDraft(project));
    setActiveMenuId(null);
  };

  const handleSaveProject = async (event) => {
    event.preventDefault();
    if (!editingProject || !projectDraft || savingIds.includes(editingProject.id)) return;

    const previousProjects = projects;
    const previousRawProjects = rawProjects;
    const editedProject = {
      ...editingProject,
      ...projectDraft,
      valorContratado: Number(projectDraft.valorContratado || 0),
    };
    const updateProject = (item) => (item.id === editedProject.id ? editedProject : item);
    const payload = {
      tipo_servico: editedProject.tipoServico,
      data: editedProject.data || null,
      horario: editedProject.horario || null,
      local: editedProject.local || null,
      valor_contratado: editedProject.valorContratado,
      status: editedProject.status,
    };

    setActionError('');
    setProjects((current) => uniqueProjects(current.map(updateProject)));
    setRawProjects((current) => uniqueProjects(current.map(updateProject)));
    setSaving(editedProject.id, true);

    try {
      await persistProject(editedProject, payload);
      setEditingProject(null);
      setProjectDraft(null);
      await load();
    } catch (error) {
      console.error('Erro ao editar projeto:', error);
      setProjects(previousProjects);
      setRawProjects(previousRawProjects);
      setActionError('Nao foi possivel salvar as alteracoes do projeto.');
    } finally {
      setSaving(editedProject.id, false);
    }
  };

  const handleDeleteProject = async (project) => {
    const confirmed = window.confirm(`Excluir o projeto de ${project.clienteNome}? Esta acao nao pode ser desfeita.`);
    if (!confirmed) return;

    const previousProjects = projects;
    const previousRawProjects = rawProjects;
    setActiveMenuId(null);
    setActionError('');
    setProjects((current) => current.filter((item) => item.id !== project.id));
    setRawProjects((current) => current.filter((item) => item.id !== project.id));
    setSaving(project.id, true);

    try {
      const { error } = await supabase.from('projetos').delete().eq('id', project.id);
      if (error) throw error;
      emitDbUpdate();
      await load();
    } catch (error) {
      console.error('Erro ao excluir projeto:', error);
      setProjects(previousProjects);
      setRawProjects(previousRawProjects);
      setActionError('Nao foi possivel excluir o projeto. O card foi restaurado.');
    } finally {
      setSaving(project.id, false);
    }
  };

  const projectsByColumn = useMemo(() => {
    const grouped = Object.fromEntries(colunas.map((column) => [column.id, []]));
    uniqueProjects(projects).forEach((project) => {
      const status = grouped[project.status] ? project.status : 'contrato_fechado';
      grouped[status].push(project);
    });
    return grouped;
  }, [projects]);

  return (
    <div className="sf-projects-page" style={{ display: 'flex', flexDirection: 'column', gap: '32px', height: '100%' }}>
      <div>
        <h1 style={{ color: 'var(--text-main)', fontSize: '2rem', fontWeight: '600' }}>Trabalhos</h1>
        {actionError && <p className="sf-project-action-error" role="alert">{actionError}</p>}
      </div>

      <div className="sf-projects-board" style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '24px', flex: 1, alignItems: 'flex-start' }}>
        {colunas.map((col) => (
          <div
            className={`sf-projects-column${dragOverColumn === col.id ? ' drag-over' : ''}`}
            key={col.id}
            onDragOver={(event) => {
              if (!draggingId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDragOverColumn(col.id);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setDragOverColumn(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const projectId = event.dataTransfer.getData('projectId') || draggingId;
              setDragOverColumn(null);
              if (projectId) void mudarStatus(projectId, col.id);
            }}
            style={{ minWidth: '260px', width: '260px' }}
          >
            <h3 style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {col.titulo}
            </h3>
            <div className="sf-projects-card-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(projectsByColumn[col.id] || []).map((project) => (
                <div
                  key={project.id}
                  className={`glass sf-project-card${draggingId === project.id ? ' dragging' : ''}${savingIds.includes(project.id) ? ' saving' : ''}`}
                  draggable={!savingIds.includes(project.id)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('projectId', project.id);
                    setDraggingId(project.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverColumn(null);
                  }}
                  style={{ padding: '16px', borderRadius: '10px', borderLeft: '4px solid var(--color-highlight)', position: 'relative' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--text-main)', fontWeight: '600', fontSize: '0.95rem' }}>{project.clienteNome}</span>
                    <button
                      type="button"
                      aria-label={`Acoes do projeto de ${project.clienteNome}`}
                      onClick={() => setActiveMenuId(activeMenuId === project.id ? null : project.id)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', height: 'max-content' }}
                    >
                      <MoreVertical size={16} color="var(--text-secondary)" />
                    </button>
                    {activeMenuId === project.id && (
                      <div className="sf-project-menu">
                        <button type="button" onClick={() => openDetails(project)}><Eye size={14} /> Abrir detalhes</button>
                        <button type="button" onClick={() => openEdit(project)}><Edit3 size={14} /> Editar projeto</button>
                        <div className="sf-project-menu-label">Mover para</div>
                        {colunas.filter((item) => item.id !== project.status).map((novaCol) => (
                          <button type="button" key={novaCol.id} onClick={() => void mudarStatus(project.id, novaCol.id)}>
                            {novaCol.titulo}
                          </button>
                        ))}
                        <button type="button" className="danger" onClick={() => void handleDeleteProject(project)}><Trash2 size={14} /> Excluir projeto</button>
                      </div>
                    )}
                  </div>

                  <div className="sf-project-service">{project.tipoServico}</div>
                  <div className={project.data && project.horario && project.local ? 'sf-project-agenda-status synced' : 'sf-project-agenda-status'}>
                    <CalendarCheck size={13} />
                    {project.data && project.horario && project.local ? 'Agenda sincronizada' : 'Agenda aguardando dados'}
                  </div>
                  <div className="sf-project-card-meta">
                    <span><Calendar size={13} /><span>{project.data || 'Sem data'}{project.horario ? ` · ${project.horario}` : ''}</span></span>
                    <span><DollarSign size={13} /><strong>{formatMoney(project.valorContratado)}</strong></span>
                  </div>
                  <div style={{ marginTop: '10px', color: 'var(--text-secondary)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Package size={12} /> {project.equipamentosDetalhados?.length || 0} equipamentos vinculados
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={Boolean(selectedProject)} onClose={() => setSelectedProject(null)} title="Detalhes do projeto">
        {selectedProject && (
          <div className="sf-project-details">
            <ProjectDetail label="Cliente" value={selectedProject.clienteNome} />
            <ProjectDetail label="Servico" value={selectedProject.tipoServico} />
            <ProjectDetail label="Etapa" value={colunas.find((column) => column.id === selectedProject.status)?.titulo} />
            <ProjectDetail label="Data" value={selectedProject.data || 'Nao informada'} />
            <ProjectDetail label="Horario" value={selectedProject.horario || 'Nao informado'} />
            <ProjectDetail label="Local" value={selectedProject.local || 'Nao informado'} />
            <ProjectDetail label="Valor contratado" value={formatMoney(selectedProject.valorContratado)} />
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(editingProject)} onClose={() => { setEditingProject(null); setProjectDraft(null); }} title="Editar projeto">
        {projectDraft && (
          <form className="sf-project-edit-form" onSubmit={handleSaveProject}>
            <label>Cliente<input value={projectDraft.clienteNome} disabled /></label>
            <label>Servico<input required value={projectDraft.tipoServico} onChange={(event) => setProjectDraft((draft) => ({ ...draft, tipoServico: event.target.value }))} /></label>
            <div className="sf-project-form-row">
              <label>Data<input type="date" value={projectDraft.data} onChange={(event) => setProjectDraft((draft) => ({ ...draft, data: event.target.value }))} /></label>
              <label>Horario<input type="time" value={projectDraft.horario} onChange={(event) => setProjectDraft((draft) => ({ ...draft, horario: event.target.value }))} /></label>
            </div>
            <label>Local<input value={projectDraft.local} onChange={(event) => setProjectDraft((draft) => ({ ...draft, local: event.target.value }))} /></label>
            <label>Valor contratado<input type="number" min="0" step="0.01" value={projectDraft.valorContratado} onChange={(event) => setProjectDraft((draft) => ({ ...draft, valorContratado: event.target.value }))} /></label>
            <label>Etapa<select value={projectDraft.status} onChange={(event) => setProjectDraft((draft) => ({ ...draft, status: event.target.value }))}>{colunas.map((column) => <option key={column.id} value={column.id}>{column.titulo}</option>)}</select></label>
            <div className="sf-project-form-actions">
              <button type="button" onClick={() => { setEditingProject(null); setProjectDraft(null); }}>Cancelar</button>
              <button type="submit" className="primary" disabled={savingIds.includes(editingProject?.id)}>Salvar alteracoes</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function ProjectDetail({ label, value }) {
  return <div><span>{label}</span><strong>{value || '-'}</strong></div>;
}
