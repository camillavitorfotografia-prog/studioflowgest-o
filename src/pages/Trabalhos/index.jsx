import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Calendar,
  CalendarCheck,
  DollarSign,
  Edit3,
  Eye,
  MoreVertical,
  Package,
  Plus,
  Trash2,
} from 'lucide-react';
import Modal from '../../components/Modal';
import { formatMoney } from '../../utils/integratedData';
import {
  emitDbUpdate,
  getDbStudioData,
  subscribeDbUpdates,
} from '../../utils/dbData';
import {
  isSupabaseConfigured,
  supabase,
} from '../../utils/supabase';
import {
  createId,
  readStorage,
  STORAGE_KEYS,
  writeStorage,
} from '../../utils/storage';
import {
  calculateDeliveryDate,
  calculateProjectValues,
  COMMERCIAL_STATUSES,
  normalizeProductionStatus,
  OPERATIONAL_PIPELINE,
  PRIORITIES,
  PRODUCTION_STATUSES,
  PROJECT_CATEGORIES,
  projectMatchesSearch,
  SERVICE_TYPES,
} from '../../utils/projectEngine';
import {
  checklistProgress,
  createChecklist,
  normalizeChecklist,
  removeChecklistItem,
  toggleChecklistItem,
  upsertCustomItem,
} from '../../utils/checklistEngine';
import './Trabalhos.css';

const colunas = OPERATIONAL_PIPELINE;

const uniqueProjects = (items = []) => {
  const projectsById = new Map();

  items.forEach((project) => {
    if (
      project?.id
      && !projectsById.has(project.id)
    ) {
      projectsById.set(project.id, project);
    }
  });

  return [...projectsById.values()];
};

const getProjectOperationalStatus = (project = {}) => (
  normalizeProductionStatus(
    project.statusProducao
    || project.status_producao
    || project.financeiro?.statusProducao
    || project.status
    || project.financeiro?.workflowStatus,
  )
);

const getProjectProgress = (project = {}) => {
  const status = getProjectOperationalStatus(project);

  if (status === 'cancelado') {
    return 0;
  }

  const progressColumns = colunas.filter(
    (column) => column.id !== 'cancelado',
  );

  const index = progressColumns.findIndex(
    (column) => column.id === status,
  );

  if (index < 0) {
    return 0;
  }

  if (status === 'finalizado') {
    return 100;
  }

  return Math.round(
    (index / (progressColumns.length - 1)) * 100,
  );
};

const projectToDraft = (project = {}) => {
  const operationalStatus = getProjectOperationalStatus(project);

  return {
    titulo: project.titulo || '',
    clienteId:
      project.clientId
      || project.clienteId
      || '',
    clienteNome: project.clienteNome || '',
    categoria: project.categoria || 'Outro',
    tipoServico:
      project.tipoServico
      || 'Fotografia',
    descricao: project.descricao || '',
    observacoes: project.observacoes || '',
    data:
      project.dataEvento
      || project.data
      || '',
    horario:
      project.horaInicio
      || project.horario
      || '',
    horaFim: project.horaFim || '',
    local: project.local || '',
    cidade: project.cidade || '',
    estado: project.estado || '',
    endereco: project.endereco || '',
    statusComercial:
      project.statusComercial
      || 'novo_contato',
    statusProducao: operationalStatus,
    prioridade: project.prioridade || 'normal',
    prazoEntregaDias:
      project.prazoEntregaDias
      ?? '',
    dataPrevistaEntrega:
      project.dataPrevistaEntrega
      || '',
    dataRealEntrega:
      project.dataRealEntrega
      || '',
    custoEstimado:
      project.custoEstimado
      ?? 0,
    custoReal:
      project.custoReal
      ?? 0,
    arquivado: Boolean(project.arquivado),
    valorContratado:
      project.valorContratado
      ?? 0,
    status: operationalStatus,
  };
};

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
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [commercialFilter, setCommercialFilter] = useState('');
  const [productionFilter, setProductionFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [checklistDraft, setChecklistDraft] = useState({
    id: null,
    titulo: '',
    categoria: 'personalizado',
    observacao: '',
  });

  const load = useCallback(async () => {
    try {
      const studio = isSupabaseConfigured
        ? await getDbStudioData()
        : {
          projects: readStorage(
            STORAGE_KEYS.projects,
            [],
          ),
          clients: readStorage(
            STORAGE_KEYS.clients,
            [],
          ),
        };

      const loadedProjects = uniqueProjects(
        studio.projects || [],
      ).map((project) => {
        const statusProducao = getProjectOperationalStatus(
          project,
        );

        return {
          ...project,
          status: statusProducao,
          statusProducao,
        };
      });

      setProjects(loadedProjects);
      setRawProjects(loadedProjects);
      setClients(studio.clients || []);
    } catch (error) {
      console.error(
        'Erro ao carregar projetos:',
        error,
      );
    }
  }, []);

  useEffect(() => {
    setTimeout(() => {
      void load();
    }, 0);

    window.addEventListener('focus', load);

    const unsubscribe = isSupabaseConfigured
      ? subscribeDbUpdates(load)
      : (() => {
        window.addEventListener(
          'sf_storage_update',
          load,
        );

        return () => {
          window.removeEventListener(
            'sf_storage_update',
            load,
          );
        };
      })();

    return () => {
      window.removeEventListener('focus', load);
      unsubscribe();
    };
  }, [load]);

  const setSaving = useCallback((id, saving) => {
    if (!id) return;

    setSavingIds((current) => (
      saving
        ? [...new Set([...current, id])]
        : current.filter((item) => item !== id)
    ));
  }, []);

  const persistProject = useCallback(
    async (project, fields = {}) => {
      const operationalStatus = normalizeProductionStatus(
        fields.statusProducao
        || fields.status_producao
        || fields.status
        || project.statusProducao
        || project.status,
      );

      const calendarSync =
        fields.calendario_sync
        ?? project.calendarSync
        ?? {};

      const horario =
        fields.horario
        ?? project.horario
        ?? '';

      const local =
        fields.local
        ?? project.local
        ?? '';

      const data =
        fields.data
        ?? project.data
        ?? '';

      const financeiro = {
        ...(
          project.financeiro
          && typeof project.financeiro === 'object'
            ? project.financeiro
            : {}
        ),
        workflowStatus: operationalStatus,
        statusProducao: operationalStatus,
        horario,
        local,
        calendarSync,
        agendaSincronizada: Boolean(
          data
          && horario
          && local,
        ),
        agendaAtualizadaEm:
          new Date().toISOString(),
        updatedAt:
          new Date().toISOString(),
      };

      if (Object.hasOwn(fields, 'checklist')) {
        financeiro.checklist = fields.checklist;
      }

      const payload = {
        financeiro,
      };

      if (
        Object.hasOwn(
          fields,
          'tipo_servico',
        )
      ) {
        payload.tipo_servico =
          fields.tipo_servico;
      }

      if (Object.hasOwn(fields, 'data')) {
        payload.data = fields.data;
      }

      if (
        Object.hasOwn(
          fields,
          'valor_contratado',
        )
      ) {
        payload.valor_contratado =
          fields.valor_contratado;
      }

      const complete = {
        ...project,
        ...fields,
        id:
          project.id
          || createId('project'),
        status: operationalStatus,
        statusProducao: operationalStatus,
        financeiro,
        atualizadoEm:
          new Date().toISOString(),
        updatedAt:
          new Date().toISOString(),
      };

      if (!isSupabaseConfigured) {
        const stored = readStorage(
          STORAGE_KEYS.projects,
          [],
        );

        const exists = stored.some(
          (item) => item.id === complete.id,
        );

        const nextProjects = exists
          ? stored.map((item) => (
            item.id === complete.id
              ? complete
              : item
          ))
          : [complete, ...stored];

        writeStorage(
          STORAGE_KEYS.projects,
          nextProjects,
        );

        return complete;
      }

      const supabasePayload = {
        ...payload,
        ...fields,
        financeiro,
      };

      delete supabasePayload.status;
      delete supabasePayload.statusProducao;
      delete supabasePayload.status_producao;

      const request = project.id
        ? supabase
          .from('projetos')
          .update(supabasePayload)
          .eq('id', project.id)
        : supabase
          .from('projetos')
          .insert([
            {
              ...supabasePayload,
              id: complete.id,
            },
          ]);

      const {
        data: savedData,
        error,
      } = await request
        .select('*')
        .single();

      if (error) {
        const message = String(
          error.message || '',
        ).toLowerCase();

        const statusColumnMissing = (
          message.includes('status_producao')
          || message.includes(
            'could not find the'
          )
        );

        if (!statusColumnMissing) {
          throw error;
        }

        const fallbackPayload = {
          ...supabasePayload,
        };

        delete fallbackPayload.status_producao;

        const fallbackRequest = project.id
          ? supabase
            .from('projetos')
            .update(fallbackPayload)
            .eq('id', project.id)
          : supabase
            .from('projetos')
            .insert([
              {
                ...fallbackPayload,
                id: complete.id,
              },
            ]);

        const {
          data: fallbackData,
          error: fallbackError,
        } = await fallbackRequest
          .select('*')
          .single();

        if (fallbackError) {
          throw fallbackError;
        }

        emitDbUpdate();

        return fallbackData;
      }

      emitDbUpdate();

      return savedData;
    },
    [],
  );

  const mudarStatus = useCallback(
    async (id, novoStatus) => {
      const normalizedStatus =
        normalizeProductionStatus(novoStatus);

      const project = rawProjects.find(
        (item) => item.id === id,
      );

      if (
        !project
        || getProjectOperationalStatus(project)
          === normalizedStatus
        || savingIds.includes(id)
      ) {
        return;
      }

      const previousProjects = projects;
      const previousRawProjects = rawProjects;

      const financeiro = {
        ...(
          project.financeiro
          && typeof project.financeiro === 'object'
            ? project.financeiro
            : {}
        ),
        workflowStatus: normalizedStatus,
        statusProducao: normalizedStatus,
        updatedAt: new Date().toISOString(),
      };

      const optimisticProject = {
        ...project,
        status: normalizedStatus,
        statusProducao: normalizedStatus,
        financeiro,
      };

      const updateProject = (item) => (
        item.id === id
          ? optimisticProject
          : item
      );

      setActionError('');
      setActiveMenuId(null);

      setProjects((current) => (
        uniqueProjects(
          current.map(updateProject),
        )
      ));

      setRawProjects((current) => (
        uniqueProjects(
          current.map(updateProject),
        )
      ));

      setSaving(id, true);

      try {
        await persistProject(
          optimisticProject,
          {
            financeiro,
          },
        );

        await load();
      } catch (error) {
        console.error(
          'Erro ao mover projeto:',
          error,
        );

        setProjects(previousProjects);
        setRawProjects(previousRawProjects);

        setActionError(
          'Não foi possível mover o projeto. A etapa anterior foi restaurada.',
        );
      } finally {
        setSaving(id, false);
        setDraggingId(null);
        setDragOverColumn(null);
      }
    },
    [
      load,
      persistProject,
      projects,
      rawProjects,
      savingIds,
      setSaving,
    ],
  );

  const openDetails = (project) => {
    setSelectedProject(project);
    setActiveMenuId(null);
  };

  const openEdit = (project) => {
    setEditingProject(project);
    setProjectDraft(
      projectToDraft(project),
    );
    setActiveMenuId(null);
  };

  const openNew = () => {
    setEditingProject({ id: null });
    setProjectDraft(
      projectToDraft(),
    );
  };

  const closeEdit = () => {
    setEditingProject(null);
    setProjectDraft(null);
  };

  const handleSaveProject = async (
    event,
  ) => {
    event.preventDefault();

    if (
      !editingProject
      || !projectDraft
      || (
        editingProject.id
        && savingIds.includes(
          editingProject.id,
        )
      )
    ) {
      return;
    }

    if (
      !projectDraft.clienteId
      || !projectDraft.titulo.trim()
    ) {
      setActionError(
        'Informe o cliente e o título do trabalho.',
      );

      return;
    }

    if (
      projectDraft.horario
      && projectDraft.horaFim
      && projectDraft.horaFim
        <= projectDraft.horario
    ) {
      setActionError(
        'O horário final deve ser posterior ao horário inicial.',
      );

      return;
    }

    const invalidValues = [
      projectDraft.valorContratado,
      projectDraft.custoEstimado,
      projectDraft.custoReal,
      projectDraft.prazoEntregaDias,
    ].some(
      (value) => Number(value || 0) < 0,
    );

    if (invalidValues) {
      setActionError(
        'Valores, custos e prazo não podem ser negativos.',
      );

      return;
    }

    const previousProjects = projects;
    const previousRawProjects = rawProjects;

    const operationalStatus =
      normalizeProductionStatus(
        projectDraft.statusProducao
        || projectDraft.status,
      );

    const selectedClient = clients.find(
      (client) => (
        String(client.id)
        === String(projectDraft.clienteId)
      ),
    );

    const financeiro = {
      ...(
        editingProject.financeiro
        && typeof editingProject.financeiro === 'object'
          ? editingProject.financeiro
          : {}
      ),
      workflowStatus: operationalStatus,
      statusProducao: operationalStatus,
      updatedAt: new Date().toISOString(),
    };

    const editedProject = {
      ...editingProject,
      ...projectDraft,
      status: operationalStatus,
      statusProducao: operationalStatus,
      financeiro,
      valorContratado: Number(
        projectDraft.valorContratado || 0,
      ),
      custoEstimado: Number(
        projectDraft.custoEstimado || 0,
      ),
      custoReal: Number(
        projectDraft.custoReal || 0,
      ),
      prazoEntregaDias: Number(
        projectDraft.prazoEntregaDias || 0,
      ),
      clienteNome:
        selectedClient?.nome
        || projectDraft.clienteNome,
      criadoEm:
        editingProject.criadoEm
        || new Date().toISOString(),
      checklist: editingProject.id
        ? normalizeChecklist(
          editingProject.checklist,
        )
        : createChecklist(
          projectDraft.tipoServico,
        ),
    };

    const updateProject = (item) => (
      item.id === editedProject.id
        ? editedProject
        : item
    );

    const payload = {
      tipo_servico:
        editedProject.tipoServico,
      data:
        editedProject.data || null,
      horario:
        editedProject.horario || null,
      local:
        editedProject.local || null,
      valor_contratado:
        editedProject.valorContratado,
      financeiro,
      titulo: editedProject.titulo,
      clienteId:
        editedProject.clienteId,
      cliente_id:
        editedProject.clienteId,
      clienteNome:
        editedProject.clienteNome,
      categoria:
        editedProject.categoria,
      descricao:
        editedProject.descricao,
      observacoes:
        editedProject.observacoes,
      dataEvento:
        editedProject.data,
      horaInicio:
        editedProject.horario,
      horaFim:
        editedProject.horaFim,
      cidade:
        editedProject.cidade,
      estado:
        editedProject.estado,
      endereco:
        editedProject.endereco,
      statusComercial:
        editedProject.statusComercial,
      prioridade:
        editedProject.prioridade,
      prazoEntregaDias:
        editedProject.prazoEntregaDias,
      dataPrevistaEntrega:
        editedProject.dataPrevistaEntrega,
      dataRealEntrega:
        editedProject.dataRealEntrega,
      custoEstimado:
        editedProject.custoEstimado,
      custoReal:
        editedProject.custoReal,
      arquivado:
        editedProject.arquivado,
      checklist:
        editedProject.checklist,
    };

    setActionError('');

    setProjects((current) => (
      editingProject.id
        ? uniqueProjects(
          current.map(updateProject),
        )
        : [
          {
            ...editedProject,
            id:
              editedProject.id
              || createId('project'),
          },
          ...current,
        ]
    ));

    setRawProjects((current) => (
      editingProject.id
        ? uniqueProjects(
          current.map(updateProject),
        )
        : [
          {
            ...editedProject,
            id:
              editedProject.id
              || createId('project'),
          },
          ...current,
        ]
    ));

    const savingId =
      editedProject.id
      || 'new-project';

    setSaving(savingId, true);

    try {
      await persistProject(
        editedProject,
        payload,
      );

      closeEdit();
      await load();
    } catch (error) {
      console.error(
        'Erro ao editar projeto:',
        error,
      );

      setProjects(previousProjects);
      setRawProjects(previousRawProjects);

      setActionError(
        'Não foi possível salvar as alterações do projeto.',
      );
    } finally {
      setSaving(savingId, false);
    }
  };

  const handleDeleteProject = async (
    project,
  ) => {
    const links = (
      (project.contratoId ? 1 : 0)
      + (
        project.pagamentos
        || project.financeiro?.receitas
        || []
      ).length
      + (
        project.equipamentoIds
        || []
      ).length
    );

    if (links) {
      setActionError(
        `Este trabalho possui ${links} vínculo(s) e não pode ser excluído. Arquive ou cancele o trabalho.`,
      );

      return;
    }

    const confirmed = window.confirm(
      `Excluir o projeto de ${project.clienteNome}? Esta ação não pode ser desfeita.`,
    );

    if (!confirmed) return;

    const previousProjects = projects;
    const previousRawProjects = rawProjects;

    setActiveMenuId(null);
    setActionError('');

    setProjects((current) => (
      current.filter(
        (item) => item.id !== project.id,
      )
    ));

    setRawProjects((current) => (
      current.filter(
        (item) => item.id !== project.id,
      )
    ));

    setSaving(project.id, true);

    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('projetos')
          .delete()
          .eq('id', project.id);

        if (error) throw error;
      } else {
        writeStorage(
          STORAGE_KEYS.projects,
          readStorage(
            STORAGE_KEYS.projects,
            [],
          ).filter(
            (item) => item.id !== project.id,
          ),
        );
      }

      emitDbUpdate();
      await load();
    } catch (error) {
      console.error(
        'Erro ao excluir projeto:',
        error,
      );

      setProjects(previousProjects);
      setRawProjects(previousRawProjects);

      setActionError(
        'Não foi possível excluir o projeto. O card foi restaurado.',
      );
    } finally {
      setSaving(project.id, false);
    }
  };

  const saveChecklist = async (
    nextChecklist,
  ) => {
    if (!selectedProject) return;

    const latest = rawProjects.find(
      (item) => (
        item.id === selectedProject.id
      ),
    ) || selectedProject;

    const updated = {
      ...latest,
      checklist: nextChecklist,
    };

    setSelectedProject(updated);

    setProjects((current) => (
      current.map((item) => (
        item.id === updated.id
          ? updated
          : item
      ))
    ));

    setRawProjects((current) => (
      current.map((item) => (
        item.id === updated.id
          ? updated
          : item
      ))
    ));

    try {
      await persistProject(
        updated,
        {
          checklist: nextChecklist,
        },
      );
    } catch (error) {
      setActionError(
        `Não foi possível salvar o checklist: ${error.message}`,
      );

      await load();
    }
  };

  const initializeSelectedChecklist = () => {
    if (!selectedProject) return;

    void saveChecklist(
      createChecklist(
        selectedProject.tipoServico,
      ),
    );
  };

  const submitChecklistItem = () => {
    try {
      const next = upsertCustomItem(
        selectedProject.checklist,
        checklistDraft,
      );

      void saveChecklist(next);

      setChecklistDraft({
        id: null,
        titulo: '',
        categoria: 'personalizado',
        observacao: '',
      });
    } catch (error) {
      setActionError(error.message);
    }
  };

  const deleteChecklistItem = (item) => {
    const confirmed = window.confirm(
      `Excluir o item "${item.titulo}" somente deste trabalho?`,
    );

    if (!confirmed) return;

    void saveChecklist(
      removeChecklistItem(
        selectedProject.checklist,
        item.id,
      ),
    );
  };

  const projectsByColumn = useMemo(() => {
    const grouped = Object.fromEntries(
      colunas.map((column) => [
        column.id,
        [],
      ]),
    );

    uniqueProjects(projects)
      .filter((project) => {
        const operationalStatus =
          getProjectOperationalStatus(project);

        const client = clients.find(
          (item) => (
            String(item.id)
            === String(
              project.clientId
              || project.clienteId,
            )
          ),
        );

        return (
          (
            showArchived
            || !project.arquivado
          )
          && (
            !commercialFilter
            || project.statusComercial
              === commercialFilter
          )
          && (
            !productionFilter
            || operationalStatus
              === productionFilter
          )
          && projectMatchesSearch(
            {
              ...project,
              statusProducao:
                operationalStatus,
            },
            client,
            search,
          )
        );
      })
      .forEach((project) => {
        const status =
          getProjectOperationalStatus(project);

        const targetStatus =
          grouped[status]
            ? status
            : 'novo';

        grouped[targetStatus].push({
          ...project,
          status: targetStatus,
          statusProducao: targetStatus,
        });
      });

    return grouped;
  }, [
    clients,
    commercialFilter,
    productionFilter,
    projects,
    search,
    showArchived,
  ]);

  const selectedFinancials = selectedProject
    ? calculateProjectValues(
      selectedProject,
    )
    : null;

  return (
    <div
      className="sf-projects-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        height: '100%',
      }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <h1
            style={{
              color: 'var(--text-main)',
              fontSize: '2rem',
              fontWeight: '600',
            }}
          >
            Trabalhos
          </h1>

          <button
            className="sf-primary-button"
            type="button"
            onClick={openNew}
          >
            <Plus size={16} />
            Novo trabalho
          </button>
        </div>

        {actionError && (
          <p
            className="sf-project-action-error"
            role="alert"
          >
            {actionError}
          </p>
        )}

        <div className="sf-project-filters">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Buscar trabalhos"
          />

          <select
            value={commercialFilter}
            onChange={(event) => {
              setCommercialFilter(
                event.target.value,
              );
            }}
          >
            <option value="">
              Status comercial
            </option>

            {COMMERCIAL_STATUSES.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item.replaceAll('_', ' ')}
                </option>
              ),
            )}
          </select>

          <select
            value={productionFilter}
            onChange={(event) => {
              setProductionFilter(
                event.target.value,
              );
            }}
          >
            <option value="">
              Etapa operacional
            </option>

            {colunas.map((item) => (
              <option
                key={item.id}
                value={item.id}
              >
                {item.titulo}
              </option>
            ))}
          </select>

          <label>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => {
                setShowArchived(
                  event.target.checked,
                );
              }}
            />

            Mostrar arquivados
          </label>
        </div>
      </div>

      <div
        className="sf-projects-board"
        style={{
          display: 'flex',
          gap: '20px',
          overflowX: 'auto',
          paddingBottom: '24px',
          flex: 1,
          alignItems: 'flex-start',
        }}
      >
        {colunas.map((col) => (
          <div
            className={
              `sf-projects-column${
                dragOverColumn === col.id
                  ? ' drag-over'
                  : ''
              }`
            }
            key={col.id}
            onDragOver={(event) => {
              if (!draggingId) return;

              event.preventDefault();
              event.dataTransfer.dropEffect =
                'move';

              setDragOverColumn(col.id);
            }}
            onDragLeave={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget,
                )
              ) {
                setDragOverColumn(null);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();

              const projectId =
                event.dataTransfer.getData(
                  'projectId',
                )
                || draggingId;

              setDragOverColumn(null);

              if (projectId) {
                void mudarStatus(
                  projectId,
                  col.id,
                );
              }
            }}
            style={{
              minWidth: '260px',
              width: '260px',
            }}
          >
            <h3
              style={{
                color: 'var(--text-secondary)',
                marginBottom: '16px',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              {col.titulo}

              <span
                style={{
                  marginLeft: '6px',
                  color: 'var(--color-highlight)',
                }}
              >
                {projectsByColumn[col.id]?.length || 0}
              </span>
            </h3>

            <div
              className="sf-projects-card-list"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {(projectsByColumn[col.id] || [])
                .map((project) => {
                  const progress =
                    getProjectProgress(project);

                  return (
                    <div
                      key={project.id}
                      className={
                        `glass sf-project-card${
                          draggingId === project.id
                            ? ' dragging'
                            : ''
                        }${
                          savingIds.includes(
                            project.id,
                          )
                            ? ' saving'
                            : ''
                        }`
                      }
                      draggable={
                        !savingIds.includes(
                          project.id,
                        )
                      }
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed =
                          'move';

                        event.dataTransfer.setData(
                          'projectId',
                          project.id,
                        );

                        setDraggingId(project.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverColumn(null);
                      }}
                      style={{
                        padding: '16px',
                        borderRadius: '10px',
                        borderLeft:
                          '4px solid var(--color-highlight)',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent:
                            'space-between',
                          marginBottom: '8px',
                          alignItems: 'flex-start',
                        }}
                      >
                        <span
                          style={{
                            color:
                              'var(--text-main)',
                            fontWeight: '600',
                            fontSize: '0.95rem',
                          }}
                        >
                          {project.clienteNome
                            || 'Cliente não informado'}
                        </span>

                        <button
                          type="button"
                          aria-label={
                            `Ações do projeto de ${project.clienteNome}`
                          }
                          onClick={() => {
                            setActiveMenuId(
                              activeMenuId
                                === project.id
                                ? null
                                : project.id,
                            );
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            height: 'max-content',
                          }}
                        >
                          <MoreVertical
                            size={16}
                            color="var(--text-secondary)"
                          />
                        </button>

                        {activeMenuId
                          === project.id && (
                          <div className="sf-project-menu">
                            <button
                              type="button"
                              onClick={() => {
                                openDetails(project);
                              }}
                            >
                              <Eye size={14} />
                              Abrir detalhes
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                openEdit(project);
                              }}
                            >
                              <Edit3 size={14} />
                              Editar projeto
                            </button>

                            <div className="sf-project-menu-label">
                              Mover para
                            </div>

                            {colunas
                              .filter(
                                (item) => (
                                  item.id
                                  !== getProjectOperationalStatus(
                                    project,
                                  )
                                ),
                              )
                              .map((novaCol) => (
                                <button
                                  type="button"
                                  key={novaCol.id}
                                  onClick={() => {
                                    void mudarStatus(
                                      project.id,
                                      novaCol.id,
                                    );
                                  }}
                                >
                                  {novaCol.titulo}
                                </button>
                              ))}

                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                void handleDeleteProject(
                                  project,
                                );
                              }}
                            >
                              <Trash2 size={14} />
                              Excluir projeto
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="sf-project-service">
                        {project.titulo
                          || project.tipoServico}
                      </div>

                      <div
                        style={{
                          marginBottom: '10px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent:
                              'space-between',
                            gap: '8px',
                            marginBottom: '5px',
                            color:
                              'var(--text-secondary)',
                            fontSize: '0.68rem',
                          }}
                        >
                          <span>
                            {col.titulo}
                          </span>

                          <strong
                            style={{
                              color:
                                'var(--color-highlight)',
                            }}
                          >
                            {progress}%
                          </strong>
                        </div>

                        <div
                          style={{
                            width: '100%',
                            height: '5px',
                            overflow: 'hidden',
                            background:
                              'rgba(255,255,255,.07)',
                            borderRadius: '999px',
                          }}
                        >
                          <div
                            style={{
                              width: `${progress}%`,
                              height: '100%',
                              background:
                                'var(--color-highlight)',
                              borderRadius: '999px',
                              transition:
                                'width 180ms ease',
                            }}
                          />
                        </div>
                      </div>

                      <div
                        className={
                          project.data
                          && project.horario
                          && project.local
                            ? 'sf-project-agenda-status synced'
                            : 'sf-project-agenda-status'
                        }
                      >
                        <CalendarCheck size={13} />

                        {project.data
                        && project.horario
                        && project.local
                          ? 'Agenda sincronizada'
                          : 'Agenda aguardando dados'}
                      </div>

                      <div className="sf-project-card-meta">
                        <span>
                          <Calendar size={13} />

                          <span>
                            {project.data
                              || 'Sem data'}

                            {project.horario
                              ? ` · ${project.horario}`
                              : ''}
                          </span>
                        </span>

                        <span>
                          <DollarSign size={13} />

                          <strong>
                            {formatMoney(
                              project.valorContratado,
                            )}
                          </strong>
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: '10px',
                          color:
                            'var(--text-secondary)',
                          fontSize: '0.72rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <Package size={12} />

                        {project
                          .equipamentosDetalhados
                          ?.length
                          || project
                            .equipamentoIds
                            ?.length
                          || 0}{' '}
                        equipamentos vinculados
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      <Modal
        isOpen={Boolean(selectedProject)}
        onClose={() => {
          setSelectedProject(null);
        }}
        title="Detalhes do projeto"
      >
        {selectedProject && (
          <div className="sf-project-detail-layout">
            <div className="sf-project-details">
              <ProjectDetail
                label="Cliente"
                value={
                  selectedProject.clienteNome
                }
              />

              <ProjectDetail
                label="Serviço"
                value={
                  selectedProject.tipoServico
                }
              />

              <ProjectDetail
                label="Etapa"
                value={
                  colunas.find(
                    (column) => (
                      column.id
                      === getProjectOperationalStatus(
                        selectedProject,
                      )
                    ),
                  )?.titulo
                }
              />

              <ProjectDetail
                label="Progresso"
                value={
                  `${getProjectProgress(
                    selectedProject,
                  )}%`
                }
              />

              <ProjectDetail
                label="Data"
                value={
                  selectedProject.data
                  || 'Não informada'
                }
              />

              <ProjectDetail
                label="Horário"
                value={
                  selectedProject.horario
                  || 'Não informado'
                }
              />

              <ProjectDetail
                label="Local"
                value={
                  selectedProject.local
                  || 'Não informado'
                }
              />

              <ProjectDetail
                label="Valor contratado"
                value={formatMoney(
                  selectedFinancials
                    ?.valorContratado
                  ?? selectedProject
                    .valorContratado,
                )}
              />

              <ProjectDetail
                label="Valor recebido"
                value={formatMoney(
                  selectedFinancials
                    ?.valorRecebido,
                )}
              />

              <ProjectDetail
                label="Saldo pendente"
                value={formatMoney(
                  selectedFinancials
                    ?.saldoPendente,
                )}
              />

              <ProjectDetail
                label="Lucro estimado"
                value={formatMoney(
                  selectedFinancials
                    ?.lucroEstimado,
                )}
              />

              <ProjectDetail
                label="Margem estimada"
                value={
                  `${
                    Number(
                      selectedFinancials
                        ?.margemEstimada
                      || 0,
                    ).toFixed(1)
                  }%`
                }
              />
            </div>

            <section className="sf-project-checklist">
              <header>
                <div>
                  <h3>
                    Checklist de produção
                  </h3>

                  {normalizeChecklist(
                    selectedProject.checklist,
                  ).itens.length > 0 && (
                    (() => {
                      const progress =
                        checklistProgress(
                          selectedProject.checklist,
                        );

                      return (
                        <p>
                          {progress.completed} de{' '}
                          {progress.total}{' '}
                          concluídos ·{' '}
                          {progress.percentage}%
                          concluído
                        </p>
                      );
                    })()
                  )}
                </div>
              </header>

              {normalizeChecklist(
                selectedProject.checklist,
              ).itens.length === 0 ? (
                <button
                  type="button"
                  className="sf-secondary-button"
                  onClick={
                    initializeSelectedChecklist
                  }
                >
                  Criar checklist padrão
                </button>
              ) : (
                <>
                  {[
                    'pre_evento',
                    'pos_evento',
                    'personalizado',
                  ].map((category) => {
                    const items =
                      normalizeChecklist(
                        selectedProject.checklist,
                      ).itens.filter(
                        (item) => (
                          item.categoria
                          === category
                        ),
                      );

                    if (!items.length) {
                      return null;
                    }

                    const progress =
                      checklistProgress(
                        selectedProject.checklist,
                        category,
                      );

                    const categoryTitle =
                      category === 'pre_evento'
                        ? 'Pré-evento'
                        : (
                          category === 'pos_evento'
                            ? 'Pós-evento'
                            : 'Personalizados'
                        );

                    return (
                      <details
                        key={category}
                        open
                      >
                        <summary>
                          {categoryTitle}

                          <span>
                            {progress.percentage}%
                          </span>
                        </summary>

                        <div className="sf-checklist-items">
                          {items.map((item) => (
                            <div
                              key={item.id}
                              className={
                                item.concluido
                                  ? 'done'
                                  : ''
                              }
                            >
                              <label>
                                <input
                                  type="checkbox"
                                  checked={
                                    item.concluido
                                  }
                                  onChange={(
                                    event,
                                  ) => {
                                    void saveChecklist(
                                      toggleChecklistItem(
                                        selectedProject
                                          .checklist,
                                        item.id,
                                        event.target
                                          .checked,
                                      ),
                                    );
                                  }}
                                />

                                <span>
                                  {item.titulo}

                                  {item.observacao && (
                                    <small>
                                      {
                                        item.observacao
                                      }
                                    </small>
                                  )}
                                </span>
                              </label>

                              <button
                                type="button"
                                title="Editar item"
                                onClick={() => {
                                  setChecklistDraft({
                                    id: item.id,
                                    titulo:
                                      item.titulo,
                                    categoria:
                                      item.categoria,
                                    observacao:
                                      item.observacao
                                      || '',
                                  });
                                }}
                              >
                                <Edit3 size={14} />
                              </button>

                              <button
                                type="button"
                                title="Excluir item deste trabalho"
                                onClick={() => {
                                  deleteChecklistItem(
                                    item,
                                  );
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })}

                  <div className="sf-checklist-editor">
                    <input
                      placeholder="Novo item personalizado"
                      value={
                        checklistDraft.titulo
                      }
                      onChange={(event) => {
                        setChecklistDraft(
                          (draft) => ({
                            ...draft,
                            titulo:
                              event.target.value,
                          }),
                        );
                      }}
                    />

                    <select
                      value={
                        checklistDraft.categoria
                      }
                      onChange={(event) => {
                        setChecklistDraft(
                          (draft) => ({
                            ...draft,
                            categoria:
                              event.target.value,
                          }),
                        );
                      }}
                    >
                      <option value="pre_evento">
                        Pré-evento
                      </option>

                      <option value="pos_evento">
                        Pós-evento
                      </option>

                      <option value="personalizado">
                        Personalizado
                      </option>
                    </select>

                    <input
                      placeholder="Observação opcional"
                      value={
                        checklistDraft.observacao
                      }
                      onChange={(event) => {
                        setChecklistDraft(
                          (draft) => ({
                            ...draft,
                            observacao:
                              event.target.value,
                          }),
                        );
                      }}
                    />

                    <button
                      type="button"
                      className="sf-secondary-button"
                      onClick={
                        submitChecklistItem
                      }
                    >
                      {checklistDraft.id
                        ? 'Atualizar'
                        : 'Adicionar'}
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(editingProject)}
        onClose={closeEdit}
        title={
          editingProject?.id
            ? 'Editar projeto'
            : 'Novo trabalho'
        }
      >
        {projectDraft && (
          <form
            className="sf-project-edit-form"
            onSubmit={handleSaveProject}
          >
            <label>
              Cliente

              <select
                required
                value={
                  projectDraft.clienteId
                }
                onChange={(event) => {
                  setProjectDraft(
                    (draft) => ({
                      ...draft,
                      clienteId:
                        event.target.value,
                    }),
                  );
                }}
              >
                <option value="">
                  Selecione um cliente
                </option>

                {clients.map((client) => (
                  <option
                    key={client.id}
                    value={client.id}
                  >
                    {client.nome} ·{' '}
                    {client.telefone
                      || client.email
                      || client.cidade
                      || 'sem contato'}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Título

              <input
                required
                value={projectDraft.titulo}
                onChange={(event) => {
                  setProjectDraft(
                    (draft) => ({
                      ...draft,
                      titulo:
                        event.target.value,
                    }),
                  );
                }}
              />
            </label>

            <div className="sf-project-form-row">
              <label>
                Categoria

                <select
                  value={
                    projectDraft.categoria
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        categoria:
                          event.target.value,
                      }),
                    );
                  }}
                >
                  {PROJECT_CATEGORIES.map(
                    (item) => (
                      <option key={item}>
                        {item}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label>
                Serviço

                <select
                  value={
                    projectDraft.tipoServico
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        tipoServico:
                          event.target.value,
                      }),
                    );
                  }}
                >
                  {SERVICE_TYPES.map(
                    (item) => (
                      <option key={item}>
                        {item}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            <div className="sf-project-form-row">
              <label>
                Etapa operacional

                <select
                  value={
                    projectDraft.statusProducao
                  }
                  onChange={(event) => {
                    const status =
                      normalizeProductionStatus(
                        event.target.value,
                      );

                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        status,
                        statusProducao:
                          status,
                      }),
                    );
                  }}
                >
                  {colunas.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.titulo}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Status comercial

                <select
                  value={
                    projectDraft.statusComercial
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        statusComercial:
                          event.target.value,
                      }),
                    );
                  }}
                >
                  {COMMERCIAL_STATUSES.map(
                    (item) => (
                      <option
                        key={item}
                        value={item}
                      >
                        {item.replaceAll(
                          '_',
                          ' ',
                        )}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label>
                Prioridade

                <select
                  value={
                    projectDraft.prioridade
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        prioridade:
                          event.target.value,
                      }),
                    );
                  }}
                >
                  {PRIORITIES.map(
                    (item) => (
                      <option key={item}>
                        {item}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            <div className="sf-project-form-row">
              <label>
                Data

                <input
                  type="date"
                  value={projectDraft.data}
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        data:
                          event.target.value,
                        dataPrevistaEntrega:
                          draft.prazoEntregaDias
                          !== ''
                            ? calculateDeliveryDate(
                              event.target.value,
                              draft.prazoEntregaDias,
                            )
                            : draft
                              .dataPrevistaEntrega,
                      }),
                    );
                  }}
                />
              </label>

              <label>
                Início

                <input
                  type="time"
                  value={
                    projectDraft.horario
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        horario:
                          event.target.value,
                      }),
                    );
                  }}
                />
              </label>

              <label>
                Fim

                <input
                  type="time"
                  value={
                    projectDraft.horaFim
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        horaFim:
                          event.target.value,
                      }),
                    );
                  }}
                />
              </label>
            </div>

            <div className="sf-project-form-row">
              <label>
                Local

                <input
                  value={projectDraft.local}
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        local:
                          event.target.value,
                      }),
                    );
                  }}
                />
              </label>

              <label>
                Cidade

                <input
                  value={
                    projectDraft.cidade
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        cidade:
                          event.target.value,
                      }),
                    );
                  }}
                />
              </label>
            </div>

            <div className="sf-project-form-row">
              <label>
                Prazo (dias)

                <input
                  type="number"
                  min="0"
                  value={
                    projectDraft
                      .prazoEntregaDias
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        prazoEntregaDias:
                          event.target.value,
                        dataPrevistaEntrega:
                          calculateDeliveryDate(
                            draft.data,
                            event.target.value,
                          ),
                      }),
                    );
                  }}
                />
              </label>

              <label>
                Entrega prevista

                <input
                  type="date"
                  value={
                    projectDraft
                      .dataPrevistaEntrega
                  }
                  min={
                    projectDraft.data
                    || undefined
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        dataPrevistaEntrega:
                          event.target.value,
                      }),
                    );
                  }}
                />
              </label>

              <label>
                Entrega real

                <input
                  type="date"
                  value={
                    projectDraft
                      .dataRealEntrega
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        dataRealEntrega:
                          event.target.value,
                      }),
                    );
                  }}
                />
              </label>
            </div>

            <div className="sf-project-form-row">
              <label>
                Valor contratado

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    projectDraft
                      .valorContratado
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        valorContratado:
                          event.target.value,
                      }),
                    );
                  }}
                />
              </label>

              <label>
                Custo estimado

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    projectDraft
                      .custoEstimado
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        custoEstimado:
                          event.target.value,
                      }),
                    );
                  }}
                />
              </label>

              <label>
                Custo real

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    projectDraft.custoReal
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        custoReal:
                          event.target.value,
                      }),
                    );
                  }}
                />
              </label>
            </div>

            <label>
              Observações

              <textarea
                rows="3"
                value={
                  projectDraft.observacoes
                }
                onChange={(event) => {
                  setProjectDraft(
                    (draft) => ({
                      ...draft,
                      observacoes:
                        event.target.value,
                    }),
                  );
                }}
              />
            </label>

            <label className="sf-project-archive">
              <input
                type="checkbox"
                checked={
                  projectDraft.arquivado
                }
                onChange={(event) => {
                  setProjectDraft(
                    (draft) => ({
                      ...draft,
                      arquivado:
                        event.target.checked,
                    }),
                  );
                }}
              />

              Trabalho arquivado
            </label>

            <div className="sf-project-form-actions">
              <button
                type="button"
                onClick={closeEdit}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="primary"
                disabled={
                  Boolean(
                    editingProject?.id
                    && savingIds.includes(
                      editingProject.id,
                    ),
                  )
                }
              >
                Salvar alterações
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function ProjectDetail({
  label,
  value,
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}