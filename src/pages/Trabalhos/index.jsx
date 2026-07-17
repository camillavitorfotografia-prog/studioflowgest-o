import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Accessibility,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Camera,
  Archive,
  CopyPlus,
  CheckCircle2,
  ClipboardList,
  ContactRound,
  ChevronLeft,
  Copy,
  ChevronRight,
  Clock3,
  DollarSign,
  Receipt,
  Edit3,
  ExternalLink,
  Eye,
  BadgeCheck,
  FileCheck2,
  FileText,
  FileQuestion,
  Gift,
  HardDrive,
  History,
  LockKeyhole,
  Heart,
  Hotel,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  Link2,
  ListChecks,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Bell,
  Filter,
  Share2,
  MoreVertical,
  Package,
  PartyPopper,
  Plus,
  Route,
  Save,
  Sparkles,
  ShieldCheck,
  Stamp,
  Signature,
  SlidersHorizontal,
  Star,
  TrendingUp,
  Trash2,
  UserRound,
  UtensilsCrossed,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import Modal from '../../components/Modal';
import { formatMoney } from '../../utils/integratedData';
import { capitalizeName, maskCurrency } from '../../utils/masks';
import { parseCurrency } from '../../utils/formatters';
import { calculateProjectFinancials } from '../../utils/financeEngine';
import {
  emitDbUpdate,
  getDbStudioData,
  saveRow,
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
  buildOfficialProjectRegistry,
  getOfficialProjectDate,
  getOfficialProjectYear,
  isCompletedOfficialProject,
} from '../../utils/officialProjects';
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
import { loadSettings } from '../../utils/settings';
import { syncSingleProjectToGoogle } from '../../services/googleCalendarIntegration';
import './Trabalhos.css';

const colunas = OPERATIONAL_PIPELINE;


const createProjectRecordId = () => {
  if (
    isSupabaseConfigured
    && globalThis.crypto?.randomUUID
  ) {
    return globalThis.crypto.randomUUID();
  }

  return createId('project');
};

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


const formatProjectDate = (value) => {
  if (!value) return 'Sem data';

  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('pt-BR');
};


const getProjectDateValue = getOfficialProjectDate;

const getProjectYear = getOfficialProjectYear;

const getProjectClientId = (project = {}) => String(
  project.clientId
  || project.clienteId
  || project.cliente_id
  || '',
);


const getProjectClientName = (project = {}) => String(
  project.clienteNome
  || project.cliente_nome
  || project.clientName
  || '',
).trim();

const getProjectUpdatedTimestamp = (project = {}) => {
  const candidates = [
    project.updated_at,
    project.updatedAt,
    project.created_at,
    project.createdAt,
    getProjectDateValue(project),
  ];

  for (const value of candidates) {
    if (!value) continue;
    const timestamp = new Date(value).getTime();
    if (!Number.isNaN(timestamp)) return timestamp;
  }

  return 0;
};

const selectProjectsSyncedWithClients = (projects = [], clients = [], year) => (
  buildOfficialProjectRegistry({
    projects,
    clients,
    year,
    includeUndated: true,
    includeCancelled: false,
    includeArchived: false,
  })
);


const getDeliveryCountdown = (project = {}) => {
  if (project.dataRealEntrega) {
    return {
      label: 'Entrega realizada',
      tone: 'success',
      days: null,
    };
  }

  if (!project.dataPrevistaEntrega) {
    return {
      label: 'Prazo não informado',
      tone: 'neutral',
      days: null,
    };
  }

  const due = new Date(
    `${String(project.dataPrevistaEntrega).slice(0, 10)}T23:59:59`,
  );

  if (Number.isNaN(due.getTime())) {
    return {
      label: 'Prazo inválido',
      tone: 'warning',
      days: null,
    };
  }

  const days = Math.ceil(
    (due.getTime() - Date.now()) / 86400000,
  );

  if (days < 0) {
    return {
      label: `${Math.abs(days)} dia(s) em atraso`,
      tone: 'danger',
      days,
    };
  }

  if (days === 0) {
    return {
      label: 'Entrega prevista para hoje',
      tone: 'warning',
      days,
    };
  }

  if (days <= 7) {
    return {
      label: `${days} dia(s) para a entrega`,
      tone: 'warning',
      days,
    };
  }

  return {
    label: `${days} dia(s) para a entrega`,
    tone: 'success',
    days,
  };
};

const getProjectMilestones = (project = {}) => {
  const status = getProjectOperationalStatus(project);
  const activeColumns = colunas.filter(
    (column) => column.id !== 'cancelado',
  );
  const currentIndex = activeColumns.findIndex(
    (column) => column.id === status,
  );

  const milestoneDefinitions = [
    {
      id: 'planejamento',
      title: 'Planejamento',
      date: project.createdAt || project.criadoEm || '',
    },
    {
      id: 'pre_producao',
      title: 'Pré-produção',
      date: '',
    },
    {
      id: 'aguardando_evento',
      title: 'Evento agendado',
      date: project.data || '',
    },
    {
      id: 'evento_realizado',
      title: 'Evento realizado',
      date: project.data || '',
    },
    {
      id: 'edicao',
      title: 'Edição',
      date: '',
    },
    {
      id: 'revisao',
      title: 'Revisão',
      date: '',
    },
    {
      id: 'entrega',
      title: 'Entrega prevista',
      date:
        project.dataRealEntrega
        || project.dataPrevistaEntrega
        || '',
    },
    {
      id: 'finalizado',
      title: 'Finalização',
      date: project.dataRealEntrega || '',
    },
  ];

  return milestoneDefinitions.map((milestone) => {
    const milestoneIndex = activeColumns.findIndex(
      (column) => column.id === milestone.id,
    );

    let state = 'pending';

    if (status === 'cancelado') {
      state = 'cancelled';
    } else if (
      milestone.id === 'entrega'
      && project.dataRealEntrega
    ) {
      state = 'completed';
    } else if (
      milestoneIndex >= 0
      && currentIndex > milestoneIndex
    ) {
      state = 'completed';
    } else if (
      milestoneIndex >= 0
      && currentIndex === milestoneIndex
    ) {
      state = 'current';
    }

    return {
      ...milestone,
      state,
    };
  });
};

const getMemberInitials = (name = '') => (
  String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'EQ'
);

const normalizeProjectTeam = (value) => (
  Array.isArray(value)
    ? value.map((item) => ({
      membroId: item.membroId || item.id || '',
      nome: item.nome || '',
      funcao: item.funcao || '',
      valorDiaria: Number(item.valorDiaria || 0),
      confirmado: Boolean(item.confirmado),
      horarioChegada: item.horarioChegada || '',
      observacoes: item.observacoes || '',
    }))
    : []
);

const projectToDraft = (project = {}) => {
  const operationalStatus = getProjectOperationalStatus(project);

  return {
    titulo: capitalizeName(project.titulo || ''),
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
    local: capitalizeName(project.local || ''),
    cidade: capitalizeName(project.cidade || ''),
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
    custoEstimado: maskCurrency(
      project.custoEstimado ?? 0,
    ),
    custoReal: maskCurrency(
      project.custoReal ?? 0,
    ),
    arquivado: Boolean(project.arquivado),
    equipeProjeto: normalizeProjectTeam(
      project.equipeProjeto
      || project.equipe
      || [],
    ),
    equipamentoIds:
      project.equipamentoIds
      || project.equipmentIds
      || [],
    logistica: {
      transporte: project.logistica?.transporte || '',
      horarioSaida: project.logistica?.horarioSaida || '',
      observacoes: project.logistica?.observacoes || '',
    },
    valorContratado: maskCurrency(
      project.valorContratado ?? 0,
    ),
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
  const [equipment, setEquipment] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [profitDraft, setProfitDraft] = useState({
    transporte: '',
    alimentacao: '',
    hospedagem: '',
    outros: '',
  });
  const [expenseDraft, setExpenseDraft] = useState({
    descricao: '',
    categoria: 'Transporte',
    valor: '',
    vencimento: new Date().toISOString().slice(0, 10),
    status: 'Pendente',
  });
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [managementDraft, setManagementDraft] = useState({
    briefing: {
      estiloDesejado: '',
      momentosEssenciais: '',
      restricoes: '',
      referencias: '',
    },
    contatos: {
      cerimonialista: '',
      telefoneCerimonialista: '',
      localContato: '',
      telefoneLocal: '',
      outrosFornecedores: '',
    },
    comunicacao: {
      proximoContato: '',
      canal: 'WhatsApp',
      assunto: '',
      historico: [],
    },
    contingencia: {
      planoChuva: '',
      equipamentoReserva: '',
      responsavelEmergencia: '',
      observacoes: '',
    },
    posEntrega: {
      avaliacaoSolicitada: false,
      depoimentoRecebido: false,
      autorizacaoPublicacao: false,
      indicacoes: '',
      observacoes: '',
    },
  });
  const [communicationEntry, setCommunicationEntry] = useState({
    data: new Date().toISOString().slice(0, 10),
    canal: 'WhatsApp',
    assunto: '',
    observacao: '',
  });
  const [eventOperationDraft, setEventOperationDraft] = useState({
    roteiro: [],
    fotosEssenciais: [],
    pessoasChave: [],
    deslocamentos: [],
    pendencias: [],
  });
  const [eventOperationEntry, setEventOperationEntry] = useState({
    roteiro: {
      horario: '',
      titulo: '',
      local: '',
      observacao: '',
    },
    fotosEssenciais: {
      titulo: '',
      categoria: 'Cerimônia',
      prioridade: 'normal',
    },
    pessoasChave: {
      nome: '',
      papel: '',
      contato: '',
      observacao: '',
    },
    deslocamentos: {
      origem: '',
      destino: '',
      horarioSaida: '',
      observacao: '',
    },
    pendencias: {
      titulo: '',
      responsavel: '',
      prazo: '',
      concluida: false,
    },
  });
  const [postProductionDraft, setPostProductionDraft] = useState({
    backup: {
      cartoesCopiados: false,
      copiaPrincipal: '',
      copiaSeguranca: '',
      nuvem: '',
      verificadoEm: '',
      observacoes: '',
    },
    selecao: {
      totalArquivos: '',
      selecionadas: '',
      rejeitadas: '',
      responsavel: '',
      concluida: false,
      observacoes: '',
    },
    edicao: {
      loteAtual: '',
      percentual: 0,
      presetPerfil: '',
      responsavel: '',
      prazoInterno: '',
      observacoes: '',
    },
    revisao: {
      enviadaAoCliente: false,
      enviadaEm: '',
      limiteRevisoes: 1,
      revisoesUsadas: 0,
      feedback: '',
      ajustesPendentes: '',
    },
    controleQualidade: {
      nomesConferidos: false,
      sequenciaConferida: false,
      corConferida: false,
      exportacaoConferida: false,
      linksTestados: false,
      aprovadoParaEntrega: false,
      observacoes: '',
    },
  });
  const [governanceDraft, setGovernanceDraft] = useState({
    obrigacoes: {
      contratoAssinado: false,
      sinalRecebido: false,
      cronogramaAprovado: false,
      autorizacoesRecebidas: false,
      dadosConferidos: false,
      observacoes: '',
    },
    alteracoes: [],
    privacidade: {
      acessoRestrito: false,
      consentimentoPublicacao: false,
      dadosSensiveisRevisados: false,
      prazoRetencaoDefinido: false,
      observacoes: '',
    },
    ocorrencias: [],
    encerramento: {
      pendenciasResolvidas: false,
      financeiroConferido: false,
      arquivosConferidos: false,
      clienteNotificado: false,
      projetoEncerrado: false,
      dataEncerramento: '',
      observacoes: '',
    },
  });
  const [governanceEntry, setGovernanceEntry] = useState({
    alteracao: {
      titulo: '',
      solicitadoPor: '',
      data: '',
      impactoPrazo: '',
      impactoValor: '',
      aprovado: false,
      observacao: '',
    },
    ocorrencia: {
      titulo: '',
      data: '',
      gravidade: 'baixa',
      responsavel: '',
      resolucao: '',
    },
  });
  const [clientExperienceDraft, setClientExperienceDraft] = useState({
    preferencias: {
      tratamentoPreferido: '',
      canalPreferido: 'WhatsApp',
      horarioContato: '',
      estiloDirecao: '',
      privacidade: '',
      observacoes: '',
    },
    gruposFamiliares: [],
    acessibilidade: {
      mobilidadeReduzida: false,
      restricaoAuditiva: false,
      restricaoVisual: false,
      neurodivergencia: false,
      gestanteIdoso: false,
      observacoes: '',
    },
    momentosEspeciais: [],
    hospitalidade: {
      aguaDisponivel: false,
      refeicaoEquipe: false,
      localDescanso: false,
      tomadaEnergia: false,
      banheiroProximo: false,
      observacoes: '',
    },
  });
  const [clientExperienceEntry, setClientExperienceEntry] = useState({
    grupoFamiliar: {
      titulo: '',
      pessoas: '',
      prioridade: 'normal',
      observacao: '',
    },
    momentoEspecial: {
      titulo: '',
      horario: '',
      responsavel: '',
      segredo: false,
      observacao: '',
    },
  });
  const [preparationDraft, setPreparationDraft] = useState({
    reunioes: [],
    questionarios: {
      casalEnviado: false,
      casalRecebido: false,
      cerimonialEnviado: false,
      cerimonialRecebido: false,
      observacoes: '',
    },
    autorizacoes: {
      usoImagem: false,
      acessoLocal: false,
      autorizacaoDrone: false,
      autorizacaoSom: false,
      observacoes: '',
    },
    viagem: {
      hospedagemReservada: false,
      hotel: '',
      checkIn: '',
      checkOut: '',
      transporteConfirmado: false,
      observacoes: '',
    },
    lembretes: [],
  });
  const [preparationEntry, setPreparationEntry] = useState({
    reuniao: {
      titulo: '',
      data: '',
      horario: '',
      local: '',
      observacao: '',
    },
    lembrete: {
      titulo: '',
      data: '',
      prioridade: 'normal',
      concluido: false,
    },
  });
  const [commercialDeliveryDraft, setCommercialDeliveryDraft] = useState({
    entregaveis: [
      {
        id: 'galeria-fotos',
        titulo: 'Galeria de fotos',
        prazo: '',
        concluido: false,
      },
      {
        id: 'filme-principal',
        titulo: 'Filme principal',
        prazo: '',
        concluido: false,
      },
      {
        id: 'teaser',
        titulo: 'Teaser ou Reels',
        prazo: '',
        concluido: false,
      },
    ],
    conteudoSocial: {
      teaserPublicado: false,
      reelsPublicado: false,
      carrosselPublicado: false,
      dataPlanejada: '',
      legendaTema: '',
      observacoes: '',
    },
    album: {
      contratado: false,
      quantidadeFotos: '',
      selecaoRecebida: false,
      diagramacaoConcluida: false,
      aprovadoCliente: false,
      enviadoGrafica: false,
      entregue: false,
      prazo: '',
      observacoes: '',
    },
    acervo: {
      pastaMaster: '',
      pastaEntrega: '',
      manterAte: '',
      backupFinalConferido: false,
      podeApagarCartoes: false,
      observacoes: '',
    },
    experienciaCliente: {
      nota: '',
      feedback: '',
      retornoAgendado: '',
      oportunidadeFutura: '',
      indicacaoRecebida: false,
      clienteVip: false,
    },
  });
  const [newDeliverable, setNewDeliverable] = useState({
    titulo: '',
    prazo: '',
  });
  const [deliveryDraft, setDeliveryDraft] = useState({
    galeriaUrl: '',
    filmeUrl: '',
    driveUrl: '',
    observacoes: '',
    enviadoEm: '',
    recebido: false,
  });
  const [resourceDraft, setResourceDraft] = useState({
    equipeProjeto: [],
    equipamentoIds: [],
    logistica: {
      transporte: '',
      horarioSaida: '',
      observacoes: '',
    },
  });
  const [search, setSearch] = useState('');
  const [commercialFilter, setCommercialFilter] = useState('');
  const [productionFilter, setProductionFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState('');
  const [financeFilter, setFinanceFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [viewMode, setViewMode] = useState(() => (
    globalThis.localStorage?.getItem('sf_projects_view_mode') || 'list'
  ));
  const [previewProjectId, setPreviewProjectId] = useState(null);
  const [density, setDensity] = useState(() => (
    globalThis.localStorage?.getItem('sf_projects_density') || 'compact'
  ));
  const boardRef = useRef(null);
  const [checklistDraft, setChecklistDraft] = useState({
    id: null,
    titulo: '',
    categoria: 'personalizado',
    observacao: '',
  });
  const [operationalDraft, setOperationalDraft] = useState({
    proximaAcao: '',
    observacoesOperacionais: '',
  });
  const [savingDashboard, setSavingDashboard] = useState(false);

  useEffect(() => {
    globalThis.localStorage?.setItem('sf_projects_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    globalThis.localStorage?.setItem('sf_projects_density', density);
  }, [density]);

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
      setEquipment(studio.equipment || []);
      setDocuments(
        readStorage(STORAGE_KEYS.documents, []),
      );
      setContracts(
        readStorage(STORAGE_KEYS.contracts, []),
      );
      setTransactions(
        readStorage(STORAGE_KEYS.finances, []),
      );

      const settings = loadSettings();
      setTeamMembers(
        (settings.team?.members || []).filter(
          (member) => member.ativo !== false,
        ),
      );
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

  const updateBoardNavigation = useCallback(() => {
    const board = boardRef.current;

    if (!board) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    const tolerance = 4;

    setCanScrollLeft(board.scrollLeft > tolerance);
    setCanScrollRight(
      board.scrollLeft + board.clientWidth
        < board.scrollWidth - tolerance,
    );
  }, []);

  useEffect(() => {
    const board = boardRef.current;

    if (!board) return undefined;

    const handleResize = () => {
      updateBoardNavigation();
    };

    updateBoardNavigation();
    board.addEventListener('scroll', updateBoardNavigation);
    window.addEventListener('resize', handleResize);

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateBoardNavigation)
      : null;

    resizeObserver?.observe(board);

    return () => {
      board.removeEventListener('scroll', updateBoardNavigation);
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, [projects, updateBoardNavigation]);

  const scrollBoard = useCallback((direction) => {
    const board = boardRef.current;

    if (!board) return;

    const firstColumn = board.querySelector('.sf-projects-column');
    const computedGap = Number.parseFloat(
      window.getComputedStyle(board).columnGap
      || window.getComputedStyle(board).gap
      || '16',
    );
    const distance = firstColumn
      ? firstColumn.getBoundingClientRect().width + computedGap
      : board.clientWidth * 0.85;

    board.scrollBy({
      left: direction * distance,
      behavior: 'smooth',
    });
  }, []);

  const handleBoardWheel = useCallback((event) => {
    const board = boardRef.current;

    if (!board || board.scrollWidth <= board.clientWidth) return;

    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    event.preventDefault();
    board.scrollLeft += event.deltaY;
  }, []);

  const setSaving = useCallback((id, saving) => {
    if (!id) return;

    setSavingIds((current) => (
      saving
        ? [...new Set([...current, id])]
        : current.filter((item) => item !== id)
    ));
  }, []);

  const persistProject = useCallback(
    async (project, fields = {}, options = {}) => {
      const isNewProject = options.isNew === true;
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

      const existingFinance = (
        project.financeiro
        && typeof project.financeiro === 'object'
          ? project.financeiro
          : {}
      );

      const source = {
        ...project,
        ...fields,
      };

      const projectData = {
        ...(
          existingFinance.projectData
          && typeof existingFinance.projectData === 'object'
            ? existingFinance.projectData
            : {}
        ),
        titulo: source.titulo || '',
        clienteNome: source.clienteNome || '',
        categoria: source.categoria || 'Outro',
        tipoServico:
          source.tipoServico
          || source.tipo_servico
          || 'Fotografia',
        descricao: source.descricao || '',
        observacoes: source.observacoes || '',
        data:
          source.data
          || source.dataEvento
          || '',
        horario:
          source.horario
          || source.horaInicio
          || '',
        horaFim: source.horaFim || '',
        local: source.local || '',
        cidade: source.cidade || '',
        estado: source.estado || '',
        endereco: source.endereco || '',
        statusComercial:
          source.statusComercial
          || 'novo_contato',
        prioridade: source.prioridade || 'normal',
        prazoEntregaDias: Number(
          source.prazoEntregaDias || 0,
        ),
        dataPrevistaEntrega:
          source.dataPrevistaEntrega || '',
        dataRealEntrega:
          source.dataRealEntrega || '',
        custoEstimado: Number(
          source.custoEstimado || 0,
        ),
        custoReal: Number(
          source.custoReal || 0,
        ),
        arquivado: Boolean(source.arquivado),
        proximaAcao:
          source.proximaAcao
          || source.proxima_acao
          || '',
        observacoesOperacionais:
          source.observacoesOperacionais
          || source.observacoes_operacionais
          || '',
        equipeProjeto: normalizeProjectTeam(
          source.equipeProjeto
          || source.equipe
          || [],
        ),
        equipamentoIds:
          source.equipamentoIds
          || source.equipmentIds
          || [],
        logistica: {
          transporte:
            source.logistica?.transporte || '',
          horarioSaida:
            source.logistica?.horarioSaida || '',
          observacoes:
            source.logistica?.observacoes || '',
        },
        entregas: {
          galeriaUrl: source.entregas?.galeriaUrl || '',
          filmeUrl: source.entregas?.filmeUrl || '',
          driveUrl: source.entregas?.driveUrl || '',
          observacoes: source.entregas?.observacoes || '',
          enviadoEm: source.entregas?.enviadoEm || '',
          recebido: Boolean(source.entregas?.recebido),
        },
        rentabilidade: {
          transporte: Number(source.rentabilidade?.transporte || 0),
          alimentacao: Number(source.rentabilidade?.alimentacao || 0),
          hospedagem: Number(source.rentabilidade?.hospedagem || 0),
          outros: Number(source.rentabilidade?.outros || 0),
        },
        governanca: {
          obrigacoes: {
            contratoAssinado: Boolean(
              source.governanca?.obrigacoes?.contratoAssinado,
            ),
            sinalRecebido: Boolean(
              source.governanca?.obrigacoes?.sinalRecebido,
            ),
            cronogramaAprovado: Boolean(
              source.governanca?.obrigacoes?.cronogramaAprovado,
            ),
            autorizacoesRecebidas: Boolean(
              source.governanca?.obrigacoes?.autorizacoesRecebidas,
            ),
            dadosConferidos: Boolean(
              source.governanca?.obrigacoes?.dadosConferidos,
            ),
            observacoes:
              source.governanca?.obrigacoes?.observacoes || '',
          },
          alteracoes: Array.isArray(source.governanca?.alteracoes)
            ? source.governanca.alteracoes
            : [],
          privacidade: {
            acessoRestrito: Boolean(
              source.governanca?.privacidade?.acessoRestrito,
            ),
            consentimentoPublicacao: Boolean(
              source.governanca?.privacidade?.consentimentoPublicacao,
            ),
            dadosSensiveisRevisados: Boolean(
              source.governanca?.privacidade?.dadosSensiveisRevisados,
            ),
            prazoRetencaoDefinido: Boolean(
              source.governanca?.privacidade?.prazoRetencaoDefinido,
            ),
            observacoes:
              source.governanca?.privacidade?.observacoes || '',
          },
          ocorrencias: Array.isArray(source.governanca?.ocorrencias)
            ? source.governanca.ocorrencias
            : [],
          encerramento: {
            pendenciasResolvidas: Boolean(
              source.governanca?.encerramento?.pendenciasResolvidas,
            ),
            financeiroConferido: Boolean(
              source.governanca?.encerramento?.financeiroConferido,
            ),
            arquivosConferidos: Boolean(
              source.governanca?.encerramento?.arquivosConferidos,
            ),
            clienteNotificado: Boolean(
              source.governanca?.encerramento?.clienteNotificado,
            ),
            projetoEncerrado: Boolean(
              source.governanca?.encerramento?.projetoEncerrado,
            ),
            dataEncerramento:
              source.governanca?.encerramento?.dataEncerramento || '',
            observacoes:
              source.governanca?.encerramento?.observacoes || '',
          },
        },
        experienciaCliente: {
          preferencias: {
            tratamentoPreferido:
              source.experienciaCliente?.preferencias?.tratamentoPreferido || '',
            canalPreferido:
              source.experienciaCliente?.preferencias?.canalPreferido || 'WhatsApp',
            horarioContato:
              source.experienciaCliente?.preferencias?.horarioContato || '',
            estiloDirecao:
              source.experienciaCliente?.preferencias?.estiloDirecao || '',
            privacidade:
              source.experienciaCliente?.preferencias?.privacidade || '',
            observacoes:
              source.experienciaCliente?.preferencias?.observacoes || '',
          },
          gruposFamiliares: Array.isArray(
            source.experienciaCliente?.gruposFamiliares,
          )
            ? source.experienciaCliente.gruposFamiliares
            : [],
          acessibilidade: {
            mobilidadeReduzida: Boolean(
              source.experienciaCliente?.acessibilidade?.mobilidadeReduzida,
            ),
            restricaoAuditiva: Boolean(
              source.experienciaCliente?.acessibilidade?.restricaoAuditiva,
            ),
            restricaoVisual: Boolean(
              source.experienciaCliente?.acessibilidade?.restricaoVisual,
            ),
            neurodivergencia: Boolean(
              source.experienciaCliente?.acessibilidade?.neurodivergencia,
            ),
            gestanteIdoso: Boolean(
              source.experienciaCliente?.acessibilidade?.gestanteIdoso,
            ),
            observacoes:
              source.experienciaCliente?.acessibilidade?.observacoes || '',
          },
          momentosEspeciais: Array.isArray(
            source.experienciaCliente?.momentosEspeciais,
          )
            ? source.experienciaCliente.momentosEspeciais
            : [],
          hospitalidade: {
            aguaDisponivel: Boolean(
              source.experienciaCliente?.hospitalidade?.aguaDisponivel,
            ),
            refeicaoEquipe: Boolean(
              source.experienciaCliente?.hospitalidade?.refeicaoEquipe,
            ),
            localDescanso: Boolean(
              source.experienciaCliente?.hospitalidade?.localDescanso,
            ),
            tomadaEnergia: Boolean(
              source.experienciaCliente?.hospitalidade?.tomadaEnergia,
            ),
            banheiroProximo: Boolean(
              source.experienciaCliente?.hospitalidade?.banheiroProximo,
            ),
            observacoes:
              source.experienciaCliente?.hospitalidade?.observacoes || '',
          },
        },
        preparacao: {
          reunioes: Array.isArray(source.preparacao?.reunioes)
            ? source.preparacao.reunioes
            : [],
          questionarios: {
            casalEnviado: Boolean(
              source.preparacao?.questionarios?.casalEnviado,
            ),
            casalRecebido: Boolean(
              source.preparacao?.questionarios?.casalRecebido,
            ),
            cerimonialEnviado: Boolean(
              source.preparacao?.questionarios?.cerimonialEnviado,
            ),
            cerimonialRecebido: Boolean(
              source.preparacao?.questionarios?.cerimonialRecebido,
            ),
            observacoes:
              source.preparacao?.questionarios?.observacoes || '',
          },
          autorizacoes: {
            usoImagem: Boolean(
              source.preparacao?.autorizacoes?.usoImagem,
            ),
            acessoLocal: Boolean(
              source.preparacao?.autorizacoes?.acessoLocal,
            ),
            autorizacaoDrone: Boolean(
              source.preparacao?.autorizacoes?.autorizacaoDrone,
            ),
            autorizacaoSom: Boolean(
              source.preparacao?.autorizacoes?.autorizacaoSom,
            ),
            observacoes:
              source.preparacao?.autorizacoes?.observacoes || '',
          },
          viagem: {
            hospedagemReservada: Boolean(
              source.preparacao?.viagem?.hospedagemReservada,
            ),
            hotel:
              source.preparacao?.viagem?.hotel || '',
            checkIn:
              source.preparacao?.viagem?.checkIn || '',
            checkOut:
              source.preparacao?.viagem?.checkOut || '',
            transporteConfirmado: Boolean(
              source.preparacao?.viagem?.transporteConfirmado,
            ),
            observacoes:
              source.preparacao?.viagem?.observacoes || '',
          },
          lembretes: Array.isArray(source.preparacao?.lembretes)
            ? source.preparacao.lembretes
            : [],
        },
        entregaComercial: {
          entregaveis: Array.isArray(
            source.entregaComercial?.entregaveis,
          )
            ? source.entregaComercial.entregaveis
            : [],
          conteudoSocial: {
            teaserPublicado: Boolean(
              source.entregaComercial?.conteudoSocial?.teaserPublicado,
            ),
            reelsPublicado: Boolean(
              source.entregaComercial?.conteudoSocial?.reelsPublicado,
            ),
            carrosselPublicado: Boolean(
              source.entregaComercial?.conteudoSocial?.carrosselPublicado,
            ),
            dataPlanejada:
              source.entregaComercial?.conteudoSocial?.dataPlanejada || '',
            legendaTema:
              source.entregaComercial?.conteudoSocial?.legendaTema || '',
            observacoes:
              source.entregaComercial?.conteudoSocial?.observacoes || '',
          },
          album: {
            contratado: Boolean(
              source.entregaComercial?.album?.contratado,
            ),
            quantidadeFotos:
              source.entregaComercial?.album?.quantidadeFotos || '',
            selecaoRecebida: Boolean(
              source.entregaComercial?.album?.selecaoRecebida,
            ),
            diagramacaoConcluida: Boolean(
              source.entregaComercial?.album?.diagramacaoConcluida,
            ),
            aprovadoCliente: Boolean(
              source.entregaComercial?.album?.aprovadoCliente,
            ),
            enviadoGrafica: Boolean(
              source.entregaComercial?.album?.enviadoGrafica,
            ),
            entregue: Boolean(
              source.entregaComercial?.album?.entregue,
            ),
            prazo:
              source.entregaComercial?.album?.prazo || '',
            observacoes:
              source.entregaComercial?.album?.observacoes || '',
          },
          acervo: {
            pastaMaster:
              source.entregaComercial?.acervo?.pastaMaster || '',
            pastaEntrega:
              source.entregaComercial?.acervo?.pastaEntrega || '',
            manterAte:
              source.entregaComercial?.acervo?.manterAte || '',
            backupFinalConferido: Boolean(
              source.entregaComercial?.acervo?.backupFinalConferido,
            ),
            podeApagarCartoes: Boolean(
              source.entregaComercial?.acervo?.podeApagarCartoes,
            ),
            observacoes:
              source.entregaComercial?.acervo?.observacoes || '',
          },
          experienciaCliente: {
            nota:
              source.entregaComercial?.experienciaCliente?.nota || '',
            feedback:
              source.entregaComercial?.experienciaCliente?.feedback || '',
            retornoAgendado:
              source.entregaComercial?.experienciaCliente?.retornoAgendado || '',
            oportunidadeFutura:
              source.entregaComercial?.experienciaCliente?.oportunidadeFutura || '',
            indicacaoRecebida: Boolean(
              source.entregaComercial?.experienciaCliente?.indicacaoRecebida,
            ),
            clienteVip: Boolean(
              source.entregaComercial?.experienciaCliente?.clienteVip,
            ),
          },
        },
        posProducao: {
          backup: {
            cartoesCopiados: Boolean(
              source.posProducao?.backup?.cartoesCopiados,
            ),
            copiaPrincipal:
              source.posProducao?.backup?.copiaPrincipal || '',
            copiaSeguranca:
              source.posProducao?.backup?.copiaSeguranca || '',
            nuvem:
              source.posProducao?.backup?.nuvem || '',
            verificadoEm:
              source.posProducao?.backup?.verificadoEm || '',
            observacoes:
              source.posProducao?.backup?.observacoes || '',
          },
          selecao: {
            totalArquivos:
              source.posProducao?.selecao?.totalArquivos || '',
            selecionadas:
              source.posProducao?.selecao?.selecionadas || '',
            rejeitadas:
              source.posProducao?.selecao?.rejeitadas || '',
            responsavel:
              source.posProducao?.selecao?.responsavel || '',
            concluida: Boolean(
              source.posProducao?.selecao?.concluida,
            ),
            observacoes:
              source.posProducao?.selecao?.observacoes || '',
          },
          edicao: {
            loteAtual:
              source.posProducao?.edicao?.loteAtual || '',
            percentual: Number(
              source.posProducao?.edicao?.percentual || 0,
            ),
            presetPerfil:
              source.posProducao?.edicao?.presetPerfil || '',
            responsavel:
              source.posProducao?.edicao?.responsavel || '',
            prazoInterno:
              source.posProducao?.edicao?.prazoInterno || '',
            observacoes:
              source.posProducao?.edicao?.observacoes || '',
          },
          revisao: {
            enviadaAoCliente: Boolean(
              source.posProducao?.revisao?.enviadaAoCliente,
            ),
            enviadaEm:
              source.posProducao?.revisao?.enviadaEm || '',
            limiteRevisoes: Number(
              source.posProducao?.revisao?.limiteRevisoes ?? 1,
            ),
            revisoesUsadas: Number(
              source.posProducao?.revisao?.revisoesUsadas || 0,
            ),
            feedback:
              source.posProducao?.revisao?.feedback || '',
            ajustesPendentes:
              source.posProducao?.revisao?.ajustesPendentes || '',
          },
          controleQualidade: {
            nomesConferidos: Boolean(
              source.posProducao?.controleQualidade?.nomesConferidos,
            ),
            sequenciaConferida: Boolean(
              source.posProducao?.controleQualidade?.sequenciaConferida,
            ),
            corConferida: Boolean(
              source.posProducao?.controleQualidade?.corConferida,
            ),
            exportacaoConferida: Boolean(
              source.posProducao?.controleQualidade?.exportacaoConferida,
            ),
            linksTestados: Boolean(
              source.posProducao?.controleQualidade?.linksTestados,
            ),
            aprovadoParaEntrega: Boolean(
              source.posProducao?.controleQualidade?.aprovadoParaEntrega,
            ),
            observacoes:
              source.posProducao?.controleQualidade?.observacoes || '',
          },
        },
        operacaoEvento: {
          roteiro: Array.isArray(source.operacaoEvento?.roteiro)
            ? source.operacaoEvento.roteiro
            : [],
          fotosEssenciais: Array.isArray(
            source.operacaoEvento?.fotosEssenciais,
          )
            ? source.operacaoEvento.fotosEssenciais
            : [],
          pessoasChave: Array.isArray(
            source.operacaoEvento?.pessoasChave,
          )
            ? source.operacaoEvento.pessoasChave
            : [],
          deslocamentos: Array.isArray(
            source.operacaoEvento?.deslocamentos,
          )
            ? source.operacaoEvento.deslocamentos
            : [],
          pendencias: Array.isArray(
            source.operacaoEvento?.pendencias,
          )
            ? source.operacaoEvento.pendencias
            : [],
        },
        gestao: {
          briefing: {
            estiloDesejado:
              source.gestao?.briefing?.estiloDesejado || '',
            momentosEssenciais:
              source.gestao?.briefing?.momentosEssenciais || '',
            restricoes:
              source.gestao?.briefing?.restricoes || '',
            referencias:
              source.gestao?.briefing?.referencias || '',
          },
          contatos: {
            cerimonialista:
              source.gestao?.contatos?.cerimonialista || '',
            telefoneCerimonialista:
              source.gestao?.contatos?.telefoneCerimonialista || '',
            localContato:
              source.gestao?.contatos?.localContato || '',
            telefoneLocal:
              source.gestao?.contatos?.telefoneLocal || '',
            outrosFornecedores:
              source.gestao?.contatos?.outrosFornecedores || '',
          },
          comunicacao: {
            proximoContato:
              source.gestao?.comunicacao?.proximoContato || '',
            canal:
              source.gestao?.comunicacao?.canal || 'WhatsApp',
            assunto:
              source.gestao?.comunicacao?.assunto || '',
            historico: Array.isArray(
              source.gestao?.comunicacao?.historico,
            )
              ? source.gestao.comunicacao.historico
              : [],
          },
          contingencia: {
            planoChuva:
              source.gestao?.contingencia?.planoChuva || '',
            equipamentoReserva:
              source.gestao?.contingencia?.equipamentoReserva || '',
            responsavelEmergencia:
              source.gestao?.contingencia?.responsavelEmergencia || '',
            observacoes:
              source.gestao?.contingencia?.observacoes || '',
          },
          posEntrega: {
            avaliacaoSolicitada: Boolean(
              source.gestao?.posEntrega?.avaliacaoSolicitada,
            ),
            depoimentoRecebido: Boolean(
              source.gestao?.posEntrega?.depoimentoRecebido,
            ),
            autorizacaoPublicacao: Boolean(
              source.gestao?.posEntrega?.autorizacaoPublicacao,
            ),
            indicacoes:
              source.gestao?.posEntrega?.indicacoes || '',
            observacoes:
              source.gestao?.posEntrega?.observacoes || '',
          },
        },
        atualizadoEm: new Date().toISOString(),
      };

      const financeiro = {
        ...existingFinance,
        projectData,
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

      const complete = {
        ...project,
        ...fields,
        ...projectData,
        id:
          project.id
          || createProjectRecordId(),
        clienteId:
          source.clienteId
          || source.clientId
          || source.cliente_id
          || '',
        clientId:
          source.clientId
          || source.clienteId
          || source.cliente_id
          || '',
        tipoServico: projectData.tipoServico,
        data: projectData.data,
        horario: projectData.horario,
        valorContratado: Number(
          source.valorContratado
          ?? source.valor_contratado
          ?? 0,
        ),
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

        void syncSingleProjectToGoogle(complete).catch(() => null);
        return complete;
      }

      const supabasePayload = {
        cliente_id:
          complete.clienteId
          || complete.clientId
          || null,
        tipo_servico:
          complete.tipoServico
          || 'Fotografia',
        data: complete.data || null,
        valor_contratado: Number(
          complete.valorContratado || 0,
        ),
        financeiro,
      };

      const savedData = await saveRow({
        table: 'projetos',
        id: isNewProject
          ? null
          : (project.id || null),
        payload: isNewProject
          ? {
            ...supabasePayload,
            id: complete.id,
          }
          : supabasePayload,
      });

      emitDbUpdate();

      void syncSingleProjectToGoogle(complete).catch((error) => {
        console.warn('Projeto salvo, mas a sincronização com o Google Calendar não foi concluída:', error?.message || error);
      });

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

      const previousStatus = getProjectOperationalStatus(project);
      const now = new Date().toISOString();
      const existingTimeline = Array.isArray(
        project.financeiro?.timeline,
      )
        ? project.financeiro.timeline
        : [];

      const financeiro = {
        ...(
          project.financeiro
          && typeof project.financeiro === 'object'
            ? project.financeiro
            : {}
        ),
        workflowStatus: normalizedStatus,
        statusProducao: normalizedStatus,
        timeline: [
          ...existingTimeline,
          {
            id: createId('timeline'),
            tipo: 'mudanca_status',
            titulo: 'Etapa alterada',
            descricao: `${
              colunas.find((item) => item.id === previousStatus)?.titulo
              || previousStatus
            } → ${
              colunas.find((item) => item.id === normalizedStatus)?.titulo
              || normalizedStatus
            }`,
            data: now,
            statusAnterior: previousStatus,
            statusNovo: normalizedStatus,
          },
        ],
        updatedAt: now,
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
    setOperationalDraft({
      proximaAcao: project.proximaAcao || '',
      observacoesOperacionais:
        project.observacoesOperacionais || '',
    });
    const savedManagement = (
      project.gestao
      || project.financeiro?.projectData?.gestao
      || {}
    );

    setManagementDraft({
      briefing: {
        estiloDesejado:
          savedManagement.briefing?.estiloDesejado || '',
        momentosEssenciais:
          savedManagement.briefing?.momentosEssenciais || '',
        restricoes:
          savedManagement.briefing?.restricoes || '',
        referencias:
          savedManagement.briefing?.referencias || '',
      },
      contatos: {
        cerimonialista:
          savedManagement.contatos?.cerimonialista || '',
        telefoneCerimonialista:
          savedManagement.contatos?.telefoneCerimonialista || '',
        localContato:
          savedManagement.contatos?.localContato || '',
        telefoneLocal:
          savedManagement.contatos?.telefoneLocal || '',
        outrosFornecedores:
          savedManagement.contatos?.outrosFornecedores || '',
      },
      comunicacao: {
        proximoContato:
          savedManagement.comunicacao?.proximoContato || '',
        canal:
          savedManagement.comunicacao?.canal || 'WhatsApp',
        assunto:
          savedManagement.comunicacao?.assunto || '',
        historico: Array.isArray(
          savedManagement.comunicacao?.historico,
        )
          ? savedManagement.comunicacao.historico
          : [],
      },
      contingencia: {
        planoChuva:
          savedManagement.contingencia?.planoChuva || '',
        equipamentoReserva:
          savedManagement.contingencia?.equipamentoReserva || '',
        responsavelEmergencia:
          savedManagement.contingencia?.responsavelEmergencia || '',
        observacoes:
          savedManagement.contingencia?.observacoes || '',
      },
      posEntrega: {
        avaliacaoSolicitada: Boolean(
          savedManagement.posEntrega?.avaliacaoSolicitada,
        ),
        depoimentoRecebido: Boolean(
          savedManagement.posEntrega?.depoimentoRecebido,
        ),
        autorizacaoPublicacao: Boolean(
          savedManagement.posEntrega?.autorizacaoPublicacao,
        ),
        indicacoes:
          savedManagement.posEntrega?.indicacoes || '',
        observacoes:
          savedManagement.posEntrega?.observacoes || '',
      },
    });

    setCommunicationEntry({
      data: new Date().toISOString().slice(0, 10),
      canal: 'WhatsApp',
      assunto: '',
      observacao: '',
    });

    const savedEventOperation = (
      project.operacaoEvento
      || project.financeiro?.projectData?.operacaoEvento
      || {}
    );

    setEventOperationDraft({
      roteiro: Array.isArray(savedEventOperation.roteiro)
        ? savedEventOperation.roteiro
        : [],
      fotosEssenciais: Array.isArray(
        savedEventOperation.fotosEssenciais,
      )
        ? savedEventOperation.fotosEssenciais
        : [],
      pessoasChave: Array.isArray(
        savedEventOperation.pessoasChave,
      )
        ? savedEventOperation.pessoasChave
        : [],
      deslocamentos: Array.isArray(
        savedEventOperation.deslocamentos,
      )
        ? savedEventOperation.deslocamentos
        : [],
      pendencias: Array.isArray(
        savedEventOperation.pendencias,
      )
        ? savedEventOperation.pendencias
        : [],
    });

    setEventOperationEntry({
      roteiro: {
        horario: '',
        titulo: '',
        local: '',
        observacao: '',
      },
      fotosEssenciais: {
        titulo: '',
        categoria: 'Cerimônia',
        prioridade: 'normal',
      },
      pessoasChave: {
        nome: '',
        papel: '',
        contato: '',
        observacao: '',
      },
      deslocamentos: {
        origem: '',
        destino: '',
        horarioSaida: '',
        observacao: '',
      },
      pendencias: {
        titulo: '',
        responsavel: '',
        prazo: '',
        concluida: false,
      },
    });

    const savedPostProduction = (
      project.posProducao
      || project.financeiro?.projectData?.posProducao
      || {}
    );

    setPostProductionDraft({
      backup: {
        cartoesCopiados: Boolean(
          savedPostProduction.backup?.cartoesCopiados,
        ),
        copiaPrincipal:
          savedPostProduction.backup?.copiaPrincipal || '',
        copiaSeguranca:
          savedPostProduction.backup?.copiaSeguranca || '',
        nuvem:
          savedPostProduction.backup?.nuvem || '',
        verificadoEm:
          savedPostProduction.backup?.verificadoEm || '',
        observacoes:
          savedPostProduction.backup?.observacoes || '',
      },
      selecao: {
        totalArquivos:
          savedPostProduction.selecao?.totalArquivos || '',
        selecionadas:
          savedPostProduction.selecao?.selecionadas || '',
        rejeitadas:
          savedPostProduction.selecao?.rejeitadas || '',
        responsavel:
          savedPostProduction.selecao?.responsavel || '',
        concluida: Boolean(
          savedPostProduction.selecao?.concluida,
        ),
        observacoes:
          savedPostProduction.selecao?.observacoes || '',
      },
      edicao: {
        loteAtual:
          savedPostProduction.edicao?.loteAtual || '',
        percentual: Number(
          savedPostProduction.edicao?.percentual || 0,
        ),
        presetPerfil:
          savedPostProduction.edicao?.presetPerfil || '',
        responsavel:
          savedPostProduction.edicao?.responsavel || '',
        prazoInterno:
          savedPostProduction.edicao?.prazoInterno || '',
        observacoes:
          savedPostProduction.edicao?.observacoes || '',
      },
      revisao: {
        enviadaAoCliente: Boolean(
          savedPostProduction.revisao?.enviadaAoCliente,
        ),
        enviadaEm:
          savedPostProduction.revisao?.enviadaEm || '',
        limiteRevisoes: Number(
          savedPostProduction.revisao?.limiteRevisoes ?? 1,
        ),
        revisoesUsadas: Number(
          savedPostProduction.revisao?.revisoesUsadas || 0,
        ),
        feedback:
          savedPostProduction.revisao?.feedback || '',
        ajustesPendentes:
          savedPostProduction.revisao?.ajustesPendentes || '',
      },
      controleQualidade: {
        nomesConferidos: Boolean(
          savedPostProduction.controleQualidade?.nomesConferidos,
        ),
        sequenciaConferida: Boolean(
          savedPostProduction.controleQualidade?.sequenciaConferida,
        ),
        corConferida: Boolean(
          savedPostProduction.controleQualidade?.corConferida,
        ),
        exportacaoConferida: Boolean(
          savedPostProduction.controleQualidade?.exportacaoConferida,
        ),
        linksTestados: Boolean(
          savedPostProduction.controleQualidade?.linksTestados,
        ),
        aprovadoParaEntrega: Boolean(
          savedPostProduction.controleQualidade?.aprovadoParaEntrega,
        ),
        observacoes:
          savedPostProduction.controleQualidade?.observacoes || '',
      },
    });


    const savedGovernance = (
      project.governanca
      || project.financeiro?.projectData?.governanca
      || {}
    );

    setGovernanceDraft({
      obrigacoes: {
        contratoAssinado: Boolean(
          savedGovernance.obrigacoes?.contratoAssinado,
        ),
        sinalRecebido: Boolean(
          savedGovernance.obrigacoes?.sinalRecebido,
        ),
        cronogramaAprovado: Boolean(
          savedGovernance.obrigacoes?.cronogramaAprovado,
        ),
        autorizacoesRecebidas: Boolean(
          savedGovernance.obrigacoes?.autorizacoesRecebidas,
        ),
        dadosConferidos: Boolean(
          savedGovernance.obrigacoes?.dadosConferidos,
        ),
        observacoes:
          savedGovernance.obrigacoes?.observacoes || '',
      },
      alteracoes: Array.isArray(savedGovernance.alteracoes)
        ? savedGovernance.alteracoes
        : [],
      privacidade: {
        acessoRestrito: Boolean(
          savedGovernance.privacidade?.acessoRestrito,
        ),
        consentimentoPublicacao: Boolean(
          savedGovernance.privacidade?.consentimentoPublicacao,
        ),
        dadosSensiveisRevisados: Boolean(
          savedGovernance.privacidade?.dadosSensiveisRevisados,
        ),
        prazoRetencaoDefinido: Boolean(
          savedGovernance.privacidade?.prazoRetencaoDefinido,
        ),
        observacoes:
          savedGovernance.privacidade?.observacoes || '',
      },
      ocorrencias: Array.isArray(savedGovernance.ocorrencias)
        ? savedGovernance.ocorrencias
        : [],
      encerramento: {
        pendenciasResolvidas: Boolean(
          savedGovernance.encerramento?.pendenciasResolvidas,
        ),
        financeiroConferido: Boolean(
          savedGovernance.encerramento?.financeiroConferido,
        ),
        arquivosConferidos: Boolean(
          savedGovernance.encerramento?.arquivosConferidos,
        ),
        clienteNotificado: Boolean(
          savedGovernance.encerramento?.clienteNotificado,
        ),
        projetoEncerrado: Boolean(
          savedGovernance.encerramento?.projetoEncerrado,
        ),
        dataEncerramento:
          savedGovernance.encerramento?.dataEncerramento || '',
        observacoes:
          savedGovernance.encerramento?.observacoes || '',
      },
    });

    setGovernanceEntry({
      alteracao: {
        titulo: '',
        solicitadoPor: '',
        data: '',
        impactoPrazo: '',
        impactoValor: '',
        aprovado: false,
        observacao: '',
      },
      ocorrencia: {
        titulo: '',
        data: '',
        gravidade: 'baixa',
        responsavel: '',
        resolucao: '',
      },
    });

    const savedClientExperience = (
      project.experienciaCliente
      || project.financeiro?.projectData?.experienciaCliente
      || {}
    );

    setClientExperienceDraft({
      preferencias: {
        tratamentoPreferido:
          savedClientExperience.preferencias?.tratamentoPreferido || '',
        canalPreferido:
          savedClientExperience.preferencias?.canalPreferido || 'WhatsApp',
        horarioContato:
          savedClientExperience.preferencias?.horarioContato || '',
        estiloDirecao:
          savedClientExperience.preferencias?.estiloDirecao || '',
        privacidade:
          savedClientExperience.preferencias?.privacidade || '',
        observacoes:
          savedClientExperience.preferencias?.observacoes || '',
      },
      gruposFamiliares: Array.isArray(
        savedClientExperience.gruposFamiliares,
      )
        ? savedClientExperience.gruposFamiliares
        : [],
      acessibilidade: {
        mobilidadeReduzida: Boolean(
          savedClientExperience.acessibilidade?.mobilidadeReduzida,
        ),
        restricaoAuditiva: Boolean(
          savedClientExperience.acessibilidade?.restricaoAuditiva,
        ),
        restricaoVisual: Boolean(
          savedClientExperience.acessibilidade?.restricaoVisual,
        ),
        neurodivergencia: Boolean(
          savedClientExperience.acessibilidade?.neurodivergencia,
        ),
        gestanteIdoso: Boolean(
          savedClientExperience.acessibilidade?.gestanteIdoso,
        ),
        observacoes:
          savedClientExperience.acessibilidade?.observacoes || '',
      },
      momentosEspeciais: Array.isArray(
        savedClientExperience.momentosEspeciais,
      )
        ? savedClientExperience.momentosEspeciais
        : [],
      hospitalidade: {
        aguaDisponivel: Boolean(
          savedClientExperience.hospitalidade?.aguaDisponivel,
        ),
        refeicaoEquipe: Boolean(
          savedClientExperience.hospitalidade?.refeicaoEquipe,
        ),
        localDescanso: Boolean(
          savedClientExperience.hospitalidade?.localDescanso,
        ),
        tomadaEnergia: Boolean(
          savedClientExperience.hospitalidade?.tomadaEnergia,
        ),
        banheiroProximo: Boolean(
          savedClientExperience.hospitalidade?.banheiroProximo,
        ),
        observacoes:
          savedClientExperience.hospitalidade?.observacoes || '',
      },
    });

    setClientExperienceEntry({
      grupoFamiliar: {
        titulo: '',
        pessoas: '',
        prioridade: 'normal',
        observacao: '',
      },
      momentoEspecial: {
        titulo: '',
        horario: '',
        responsavel: '',
        segredo: false,
        observacao: '',
      },
    });

    const savedPreparation = (
      project.preparacao
      || project.financeiro?.projectData?.preparacao
      || {}
    );

    setPreparationDraft({
      reunioes: Array.isArray(savedPreparation.reunioes)
        ? savedPreparation.reunioes
        : [],
      questionarios: {
        casalEnviado: Boolean(
          savedPreparation.questionarios?.casalEnviado,
        ),
        casalRecebido: Boolean(
          savedPreparation.questionarios?.casalRecebido,
        ),
        cerimonialEnviado: Boolean(
          savedPreparation.questionarios?.cerimonialEnviado,
        ),
        cerimonialRecebido: Boolean(
          savedPreparation.questionarios?.cerimonialRecebido,
        ),
        observacoes:
          savedPreparation.questionarios?.observacoes || '',
      },
      autorizacoes: {
        usoImagem: Boolean(
          savedPreparation.autorizacoes?.usoImagem,
        ),
        acessoLocal: Boolean(
          savedPreparation.autorizacoes?.acessoLocal,
        ),
        autorizacaoDrone: Boolean(
          savedPreparation.autorizacoes?.autorizacaoDrone,
        ),
        autorizacaoSom: Boolean(
          savedPreparation.autorizacoes?.autorizacaoSom,
        ),
        observacoes:
          savedPreparation.autorizacoes?.observacoes || '',
      },
      viagem: {
        hospedagemReservada: Boolean(
          savedPreparation.viagem?.hospedagemReservada,
        ),
        hotel:
          savedPreparation.viagem?.hotel || '',
        checkIn:
          savedPreparation.viagem?.checkIn || '',
        checkOut:
          savedPreparation.viagem?.checkOut || '',
        transporteConfirmado: Boolean(
          savedPreparation.viagem?.transporteConfirmado,
        ),
        observacoes:
          savedPreparation.viagem?.observacoes || '',
      },
      lembretes: Array.isArray(savedPreparation.lembretes)
        ? savedPreparation.lembretes
        : [],
    });

    setPreparationEntry({
      reuniao: {
        titulo: '',
        data: '',
        horario: '',
        local: '',
        observacao: '',
      },
      lembrete: {
        titulo: '',
        data: '',
        prioridade: 'normal',
        concluido: false,
      },
    });

    const savedCommercialDelivery = (
      project.entregaComercial
      || project.financeiro?.projectData?.entregaComercial
      || {}
    );

    setCommercialDeliveryDraft({
      entregaveis: Array.isArray(
        savedCommercialDelivery.entregaveis,
      ) && savedCommercialDelivery.entregaveis.length > 0
        ? savedCommercialDelivery.entregaveis
        : [
          {
            id: 'galeria-fotos',
            titulo: 'Galeria de fotos',
            prazo: '',
            concluido: false,
          },
          {
            id: 'filme-principal',
            titulo: 'Filme principal',
            prazo: '',
            concluido: false,
          },
          {
            id: 'teaser',
            titulo: 'Teaser ou Reels',
            prazo: '',
            concluido: false,
          },
        ],
      conteudoSocial: {
        teaserPublicado: Boolean(
          savedCommercialDelivery.conteudoSocial?.teaserPublicado,
        ),
        reelsPublicado: Boolean(
          savedCommercialDelivery.conteudoSocial?.reelsPublicado,
        ),
        carrosselPublicado: Boolean(
          savedCommercialDelivery.conteudoSocial?.carrosselPublicado,
        ),
        dataPlanejada:
          savedCommercialDelivery.conteudoSocial?.dataPlanejada || '',
        legendaTema:
          savedCommercialDelivery.conteudoSocial?.legendaTema || '',
        observacoes:
          savedCommercialDelivery.conteudoSocial?.observacoes || '',
      },
      album: {
        contratado: Boolean(
          savedCommercialDelivery.album?.contratado,
        ),
        quantidadeFotos:
          savedCommercialDelivery.album?.quantidadeFotos || '',
        selecaoRecebida: Boolean(
          savedCommercialDelivery.album?.selecaoRecebida,
        ),
        diagramacaoConcluida: Boolean(
          savedCommercialDelivery.album?.diagramacaoConcluida,
        ),
        aprovadoCliente: Boolean(
          savedCommercialDelivery.album?.aprovadoCliente,
        ),
        enviadoGrafica: Boolean(
          savedCommercialDelivery.album?.enviadoGrafica,
        ),
        entregue: Boolean(
          savedCommercialDelivery.album?.entregue,
        ),
        prazo:
          savedCommercialDelivery.album?.prazo || '',
        observacoes:
          savedCommercialDelivery.album?.observacoes || '',
      },
      acervo: {
        pastaMaster:
          savedCommercialDelivery.acervo?.pastaMaster || '',
        pastaEntrega:
          savedCommercialDelivery.acervo?.pastaEntrega || '',
        manterAte:
          savedCommercialDelivery.acervo?.manterAte || '',
        backupFinalConferido: Boolean(
          savedCommercialDelivery.acervo?.backupFinalConferido,
        ),
        podeApagarCartoes: Boolean(
          savedCommercialDelivery.acervo?.podeApagarCartoes,
        ),
        observacoes:
          savedCommercialDelivery.acervo?.observacoes || '',
      },
      experienciaCliente: {
        nota:
          savedCommercialDelivery.experienciaCliente?.nota || '',
        feedback:
          savedCommercialDelivery.experienciaCliente?.feedback || '',
        retornoAgendado:
          savedCommercialDelivery.experienciaCliente?.retornoAgendado || '',
        oportunidadeFutura:
          savedCommercialDelivery.experienciaCliente?.oportunidadeFutura || '',
        indicacaoRecebida: Boolean(
          savedCommercialDelivery.experienciaCliente?.indicacaoRecebida,
        ),
        clienteVip: Boolean(
          savedCommercialDelivery.experienciaCliente?.clienteVip,
        ),
      },
    });

    setNewDeliverable({
      titulo: '',
      prazo: '',
    });

    setProfitDraft({
      transporte: maskCurrency(
        project.rentabilidade?.transporte
        || project.financeiro?.projectData?.rentabilidade?.transporte
        || 0,
      ),
      alimentacao: maskCurrency(
        project.rentabilidade?.alimentacao
        || project.financeiro?.projectData?.rentabilidade?.alimentacao
        || 0,
      ),
      hospedagem: maskCurrency(
        project.rentabilidade?.hospedagem
        || project.financeiro?.projectData?.rentabilidade?.hospedagem
        || 0,
      ),
      outros: maskCurrency(
        project.rentabilidade?.outros
        || project.financeiro?.projectData?.rentabilidade?.outros
        || 0,
      ),
    });
    setExpenseDraft({
      descricao: '',
      categoria: 'Transporte',
      valor: '',
      vencimento: new Date().toISOString().slice(0, 10),
      status: 'Pendente',
    });
    setShowExpenseForm(false);
    setDeliveryDraft({
      galeriaUrl:
        project.entregas?.galeriaUrl
        || project.financeiro?.projectData?.entregas?.galeriaUrl
        || '',
      filmeUrl:
        project.entregas?.filmeUrl
        || project.financeiro?.projectData?.entregas?.filmeUrl
        || '',
      driveUrl:
        project.entregas?.driveUrl
        || project.financeiro?.projectData?.entregas?.driveUrl
        || '',
      observacoes:
        project.entregas?.observacoes
        || project.financeiro?.projectData?.entregas?.observacoes
        || '',
      enviadoEm:
        project.entregas?.enviadoEm
        || project.financeiro?.projectData?.entregas?.enviadoEm
        || '',
      recebido: Boolean(
        project.entregas?.recebido
        || project.financeiro?.projectData?.entregas?.recebido
      ),
    });
    setResourceDraft({
      equipeProjeto: normalizeProjectTeam(
        project.equipeProjeto
        || project.equipe
        || [],
      ),
      equipamentoIds:
        project.equipamentoIds
        || project.equipmentIds
        || [],
      logistica: {
        transporte: project.logistica?.transporte || '',
        horarioSaida: project.logistica?.horarioSaida || '',
        observacoes: project.logistica?.observacoes || '',
      },
    });
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
      parseCurrency(projectDraft.valorContratado),
      parseCurrency(projectDraft.custoEstimado),
      parseCurrency(projectDraft.custoReal),
      Number(projectDraft.prazoEntregaDias || 0),
    ].some(
      (value) => !Number.isFinite(value) || value < 0,
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

    const projectId =
      editingProject.id
      || createProjectRecordId();

    const editedProject = {
      ...editingProject,
      id: projectId,
      ...projectDraft,
      status: operationalStatus,
      statusProducao: operationalStatus,
      financeiro,
      valorContratado: parseCurrency(
        projectDraft.valorContratado,
      ),
      custoEstimado: parseCurrency(
        projectDraft.custoEstimado,
      ),
      custoReal: parseCurrency(
        projectDraft.custoReal,
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
            id: editedProject.id,
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
            id: editedProject.id,
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
        {
          isNew: !editingProject.id,
        },
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

  const handleDeleteProject = async (project) => {
    if (!project?.id || savingIds.includes(project.id)) return;

    const clientId = getProjectClientId(project);
    const client = clients.find((item) => String(item.id) === String(clientId));
    const clientName = client?.nome || client?.name || project.clienteNome || 'cliente não informado';
    const linkedProjects = uniqueProjects(rawProjects).filter(
      (item) => getProjectClientId(item) === String(clientId),
    );

    if (!clientId || !client) {
      setActionError('Este trabalho não possui um cliente oficial vinculado.');
      return;
    }

    const confirmed = window.confirm(
      `Excluir o trabalho de ${clientName}?

Como a aba Trabalhos está sincronizada com Clientes, esta ação também excluirá o cadastro do cliente e ${linkedProjects.length} trabalho(s) vinculados. Esta ação não pode ser desfeita.`,
    );

    if (!confirmed) return;

    const previousProjects = projects;
    const previousRawProjects = rawProjects;
    const previousClients = clients;

    setActiveMenuId(null);
    setActionError('');
    setSaving(project.id, true);

    try {
      if (isSupabaseConfigured) {
        const projectIds = linkedProjects.map((item) => item.id).filter(Boolean);

        if (projectIds.length) {
          const { error: projectsError } = await supabase
            .from('projetos')
            .delete()
            .in('id', projectIds);

          if (projectsError) throw projectsError;
        }

        const { error: clientError } = await supabase
          .from('clientes')
          .delete()
          .eq('id', clientId);

        if (clientError) throw clientError;
      } else {
        writeStorage(
          STORAGE_KEYS.projects,
          readStorage(STORAGE_KEYS.projects, []).filter(
            (item) => getProjectClientId(item) !== String(clientId),
          ),
        );
        writeStorage(
          STORAGE_KEYS.clients,
          readStorage(STORAGE_KEYS.clients, []).filter(
            (item) => String(item.id) !== String(clientId),
          ),
        );
      }

      setProjects((current) => current.filter(
        (item) => getProjectClientId(item) !== String(clientId),
      ));
      setRawProjects((current) => current.filter(
        (item) => getProjectClientId(item) !== String(clientId),
      ));
      setClients((current) => current.filter(
        (item) => String(item.id) !== String(clientId),
      ));

      if (selectedProject && getProjectClientId(selectedProject) === String(clientId)) {
        setSelectedProject(null);
      }
      if (previewProject && getProjectClientId(previewProject) === String(clientId)) {
        setPreviewProjectId(null);
      }

      emitDbUpdate();
      await load();
    } catch (error) {
      console.error('Erro ao excluir trabalho e cliente:', error);
      setProjects(previousProjects);
      setRawProjects(previousRawProjects);
      setClients(previousClients);
      setActionError(
        `Não foi possível excluir o trabalho e o cliente: ${error?.message || 'erro desconhecido'}`,
      );
    } finally {
      setSaving(project.id, false);
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


  const saveOperationalDashboard = async () => {
    if (!selectedProject || savingDashboard) return;

    const latest = rawProjects.find(
      (item) => item.id === selectedProject.id,
    ) || selectedProject;

    const now = new Date().toISOString();
    const existingTimeline = Array.isArray(
      latest.financeiro?.timeline,
    )
      ? latest.financeiro.timeline
      : [];

    const updated = {
      ...latest,
      proximaAcao: operationalDraft.proximaAcao.trim(),
      observacoesOperacionais:
        operationalDraft.observacoesOperacionais.trim(),
      financeiro: {
        ...latest.financeiro,
        timeline: [
          ...existingTimeline,
          {
            id: createId('timeline'),
            tipo: 'atualizacao_operacional',
            titulo: 'Planejamento operacional atualizado',
            descricao:
              operationalDraft.proximaAcao.trim()
              || 'Observações operacionais atualizadas.',
            data: now,
          },
        ],
        updatedAt: now,
      },
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(updated, {
        proximaAcao: updated.proximaAcao,
        observacoesOperacionais:
          updated.observacoesOperacionais,
        financeiro: updated.financeiro,
      });

      setSelectedProject(updated);
      setProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
      setRawProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
    } catch (error) {
      console.error(
        'Erro ao salvar planejamento operacional:',
        error,
      );
      setActionError(
        'Não foi possível salvar a próxima ação e as observações.',
      );
    } finally {
      setSavingDashboard(false);
    }
  };

  const markProjectDelivered = async () => {
    if (!selectedProject || savingDashboard) return;

    const confirmed = window.confirm(
      'Registrar a entrega deste trabalho como realizada hoje?',
    );

    if (!confirmed) return;

    const latest = rawProjects.find(
      (item) => item.id === selectedProject.id,
    ) || selectedProject;

    const now = new Date().toISOString();
    const todayValue = now.slice(0, 10);
    const existingTimeline = Array.isArray(
      latest.financeiro?.timeline,
    )
      ? latest.financeiro.timeline
      : [];

    const financeiro = {
      ...latest.financeiro,
      workflowStatus: 'entrega',
      statusProducao: 'entrega',
      timeline: [
        ...existingTimeline,
        {
          id: createId('timeline'),
          tipo: 'entrega',
          titulo: 'Material entregue',
          descricao: `Entrega registrada em ${formatProjectDate(
            todayValue,
          )}.`,
          data: now,
        },
      ],
      updatedAt: now,
    };

    const updated = {
      ...latest,
      dataRealEntrega: todayValue,
      status: 'entrega',
      statusProducao: 'entrega',
      financeiro,
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(updated, {
        dataRealEntrega: todayValue,
        status: 'entrega',
        statusProducao: 'entrega',
        financeiro,
      });

      setSelectedProject(updated);
      setProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
      setRawProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
    } catch (error) {
      console.error(
        'Erro ao registrar entrega:',
        error,
      );
      setActionError(
        'Não foi possível registrar a entrega.',
      );
    } finally {
      setSavingDashboard(false);
    }
  };

  const toggleTeamMemberForProject = (member) => {
    setResourceDraft((draft) => {
      const exists = draft.equipeProjeto.some(
        (item) => item.membroId === member.id,
      );

      return {
        ...draft,
        equipeProjeto: exists
          ? draft.equipeProjeto.filter(
            (item) => item.membroId !== member.id,
          )
          : [
            ...draft.equipeProjeto,
            {
              membroId: member.id,
              nome: member.nome,
              funcao: member.funcao,
              valorDiaria: Number(
                member.valorDiaria || 0,
              ),
              confirmado: false,
              horarioChegada: '',
              observacoes: '',
            },
          ],
      };
    });
  };

  const updateProjectTeamMember = (
    memberId,
    key,
    value,
  ) => {
    setResourceDraft((draft) => ({
      ...draft,
      equipeProjeto: draft.equipeProjeto.map(
        (item) => (
          item.membroId === memberId
            ? {
              ...item,
              [key]: value,
            }
            : item
        ),
      ),
    }));
  };

  const toggleEquipmentForProject = (equipmentId) => {
    setResourceDraft((draft) => {
      const exists = draft.equipamentoIds.some(
        (id) => String(id) === String(equipmentId),
      );

      return {
        ...draft,
        equipamentoIds: exists
          ? draft.equipamentoIds.filter(
            (id) => String(id) !== String(equipmentId),
          )
          : [...draft.equipamentoIds, equipmentId],
      };
    });
  };

  const saveProjectResources = async () => {
    if (!selectedProject || savingDashboard) return;

    const latest = rawProjects.find(
      (item) => item.id === selectedProject.id,
    ) || selectedProject;

    const now = new Date().toISOString();
    const existingTimeline = Array.isArray(
      latest.financeiro?.timeline,
    )
      ? latest.financeiro.timeline
      : [];

    const updated = {
      ...latest,
      equipeProjeto: normalizeProjectTeam(
        resourceDraft.equipeProjeto,
      ),
      equipamentoIds: resourceDraft.equipamentoIds,
      logistica: {
        ...resourceDraft.logistica,
      },
      financeiro: {
        ...latest.financeiro,
        timeline: [
          ...existingTimeline,
          {
            id: createId('timeline'),
            tipo: 'recursos',
            titulo: 'Equipe e equipamentos atualizados',
            descricao: `${
              resourceDraft.equipeProjeto.length
            } membro(s) e ${
              resourceDraft.equipamentoIds.length
            } equipamento(s) vinculados.`,
            data: now,
          },
        ],
        updatedAt: now,
      },
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(updated, {
        equipeProjeto: updated.equipeProjeto,
        equipamentoIds: updated.equipamentoIds,
        logistica: updated.logistica,
        financeiro: updated.financeiro,
      });

      setSelectedProject(updated);
      setProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
      setRawProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
    } catch (error) {
      console.error(
        'Erro ao salvar equipe e equipamentos:',
        error,
      );
      setActionError(
        'Não foi possível salvar equipe, equipamentos e logística.',
      );
    } finally {
      setSavingDashboard(false);
    }
  };

  const saveProjectDocuments = async () => {
    if (!selectedProject || savingDashboard) return;

    const latest = rawProjects.find(
      (item) => item.id === selectedProject.id,
    ) || selectedProject;

    const now = new Date().toISOString();
    const existingTimeline = Array.isArray(
      latest.financeiro?.timeline,
    )
      ? latest.financeiro.timeline
      : [];

    const entregas = {
      ...deliveryDraft,
      galeriaUrl: deliveryDraft.galeriaUrl.trim(),
      filmeUrl: deliveryDraft.filmeUrl.trim(),
      driveUrl: deliveryDraft.driveUrl.trim(),
      observacoes: deliveryDraft.observacoes.trim(),
    };

    const updated = {
      ...latest,
      entregas,
      financeiro: {
        ...latest.financeiro,
        timeline: [
          ...existingTimeline,
          {
            id: createId('timeline'),
            tipo: 'documentos_entregas',
            titulo: 'Documentos e links atualizados',
            descricao: entregas.enviadoEm
              ? `Materiais enviados em ${formatProjectDate(
                entregas.enviadoEm,
              )}.`
              : 'Links e informações de entrega atualizados.',
            data: now,
          },
        ],
        updatedAt: now,
      },
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(updated, {
        entregas,
        financeiro: updated.financeiro,
      });

      setSelectedProject(updated);
      setProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
      setRawProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
    } catch (error) {
      console.error(
        'Erro ao salvar documentos e entregas:',
        error,
      );
      setActionError(
        'Não foi possível salvar os documentos e links de entrega.',
      );
    } finally {
      setSavingDashboard(false);
    }
  };

  const copyProjectLink = async (value) => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      window.prompt('Copie o link:', value);
    }
  };

  const saveProjectProfitability = async () => {
    if (!selectedProject || savingDashboard) return;

    const latest = rawProjects.find(
      (item) => item.id === selectedProject.id,
    ) || selectedProject;

    const rentabilidade = {
      transporte: parseCurrency(profitDraft.transporte),
      alimentacao: parseCurrency(profitDraft.alimentacao),
      hospedagem: parseCurrency(profitDraft.hospedagem),
      outros: parseCurrency(profitDraft.outros),
    };

    const now = new Date().toISOString();
    const existingTimeline = Array.isArray(
      latest.financeiro?.timeline,
    )
      ? latest.financeiro.timeline
      : [];

    const updated = {
      ...latest,
      rentabilidade,
      financeiro: {
        ...latest.financeiro,
        timeline: [
          ...existingTimeline,
          {
            id: createId('timeline'),
            tipo: 'rentabilidade',
            titulo: 'Custos do trabalho atualizados',
            descricao: `Custos adicionais registrados: ${formatMoney(
              Object.values(rentabilidade).reduce(
                (sum, value) => sum + Number(value || 0),
                0,
              ),
            )}.`,
            data: now,
          },
        ],
        updatedAt: now,
      },
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(updated, {
        rentabilidade,
        financeiro: updated.financeiro,
      });

      setSelectedProject(updated);
      setProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
      setRawProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
    } catch (error) {
      console.error('Erro ao salvar rentabilidade:', error);
      setActionError(
        'Não foi possível salvar os custos e a rentabilidade.',
      );
    } finally {
      setSavingDashboard(false);
    }
  };

  const addProjectExpense = async () => {
    if (!selectedProject || savingDashboard) return;

    const value = parseCurrency(expenseDraft.valor);

    if (!expenseDraft.descricao.trim() || value <= 0) {
      setActionError(
        'Informe a descrição e um valor válido para a despesa.',
      );
      return;
    }

    const expense = {
      id: createId('expense'),
      trabalhoId: selectedProject.id,
      projectId: selectedProject.id,
      clienteId:
        selectedProject.clienteId
        || selectedProject.clientId
        || '',
      descricao: expenseDraft.descricao.trim(),
      nome: expenseDraft.descricao.trim(),
      categoria: expenseDraft.categoria,
      valor: value,
      vencimento: expenseDraft.vencimento,
      data: expenseDraft.vencimento,
      status: expenseDraft.status,
      tipo: 'variavel',
      tipoGeral: 'Saida',
      contaOrigem: 'empresa',
      formaPagamento: '',
      observacoes: '',
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };

    const nextTransactions = [expense, ...transactions];

    setSavingDashboard(true);
    setActionError('');

    try {
      writeStorage(STORAGE_KEYS.finances, nextTransactions);
      setTransactions(nextTransactions);

      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('financas')
          .upsert([{
            id: String(expense.id),
            project_id: selectedProject.id,
            cliente_id: expense.clienteId || null,
            descricao: expense.descricao,
            nome: expense.nome,
            categoria: expense.categoria,
            valor: expense.valor,
            data: expense.data,
            data_vencimento: expense.vencimento,
            tipo: expense.tipo,
            tipo_geral: expense.tipoGeral,
            status: expense.status,
            conta_origem: expense.contaOrigem,
            updated_at: expense.atualizadoEm,
          }]);

        if (error) throw error;
      }

      setExpenseDraft({
        descricao: '',
        categoria: 'Transporte',
        valor: '',
        vencimento: new Date().toISOString().slice(0, 10),
        status: 'Pendente',
      });
      setShowExpenseForm(false);
      window.dispatchEvent(
        new CustomEvent('sf_storage_update'),
      );
    } catch (error) {
      console.error('Erro ao adicionar despesa:', error);
      setActionError(
        'Não foi possível adicionar a despesa ao trabalho.',
      );
    } finally {
      setSavingDashboard(false);
    }
  };

  const updateManagementSection = (
    section,
    key,
    value,
  ) => {
    setManagementDraft((draft) => ({
      ...draft,
      [section]: {
        ...draft[section],
        [key]: value,
      },
    }));
  };

  const addCommunicationHistory = () => {
    if (!communicationEntry.assunto.trim()) {
      setActionError(
        'Informe o assunto do contato antes de adicionar ao histórico.',
      );
      return;
    }

    const entry = {
      id: createId('communication'),
      data:
        communicationEntry.data
        || new Date().toISOString().slice(0, 10),
      canal: communicationEntry.canal || 'WhatsApp',
      assunto: communicationEntry.assunto.trim(),
      observacao: communicationEntry.observacao.trim(),
      criadoEm: new Date().toISOString(),
    };

    setManagementDraft((draft) => ({
      ...draft,
      comunicacao: {
        ...draft.comunicacao,
        historico: [
          entry,
          ...(draft.comunicacao.historico || []),
        ],
      },
    }));

    setCommunicationEntry({
      data: new Date().toISOString().slice(0, 10),
      canal: 'WhatsApp',
      assunto: '',
      observacao: '',
    });
    setActionError('');
  };

  const removeCommunicationHistory = (entryId) => {
    setManagementDraft((draft) => ({
      ...draft,
      comunicacao: {
        ...draft.comunicacao,
        historico: (
          draft.comunicacao.historico || []
        ).filter((entry) => entry.id !== entryId),
      },
    }));
  };

  const saveAdvancedManagement = async () => {
    if (!selectedProject || savingDashboard) return;

    const latest = rawProjects.find(
      (item) => item.id === selectedProject.id,
    ) || selectedProject;

    const gestao = {
      briefing: {
        ...managementDraft.briefing,
      },
      contatos: {
        ...managementDraft.contatos,
      },
      comunicacao: {
        ...managementDraft.comunicacao,
        historico: [
          ...(managementDraft.comunicacao.historico || []),
        ],
      },
      contingencia: {
        ...managementDraft.contingencia,
      },
      posEntrega: {
        ...managementDraft.posEntrega,
      },
    };

    const now = new Date().toISOString();
    const existingTimeline = Array.isArray(
      latest.financeiro?.timeline,
    )
      ? latest.financeiro.timeline
      : [];

    const updated = {
      ...latest,
      gestao,
      financeiro: {
        ...latest.financeiro,
        timeline: [
          ...existingTimeline,
          {
            id: createId('timeline'),
            tipo: 'gestao_avancada',
            titulo: 'Gestão avançada atualizada',
            descricao:
              'Briefing, contatos, comunicação, contingência e pós-entrega foram atualizados.',
            data: now,
          },
        ],
        updatedAt: now,
      },
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(updated, {
        gestao,
        financeiro: updated.financeiro,
      });

      setSelectedProject(updated);
      setProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
      setRawProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
    } catch (error) {
      console.error(
        'Erro ao salvar gestão avançada:',
        error,
      );
      setActionError(
        'Não foi possível salvar a gestão avançada do trabalho.',
      );
    } finally {
      setSavingDashboard(false);
    }
  };

  const updateEventOperationEntry = (
    section,
    key,
    value,
  ) => {
    setEventOperationEntry((draft) => ({
      ...draft,
      [section]: {
        ...draft[section],
        [key]: value,
      },
    }));
  };

  const addEventOperationItem = (section) => {
    const entry = eventOperationEntry[section];

    if (
      !entry
      || (
        section === 'roteiro'
        && !entry.titulo.trim()
      )
      || (
        section === 'fotosEssenciais'
        && !entry.titulo.trim()
      )
      || (
        section === 'pessoasChave'
        && !entry.nome.trim()
      )
      || (
        section === 'deslocamentos'
        && !entry.destino.trim()
      )
      || (
        section === 'pendencias'
        && !entry.titulo.trim()
      )
    ) {
      setActionError(
        'Preencha o campo principal antes de adicionar.',
      );
      return;
    }

    const item = {
      ...entry,
      id: createId(section),
      criadoEm: new Date().toISOString(),
    };

    setEventOperationDraft((draft) => ({
      ...draft,
      [section]: [
        ...(draft[section] || []),
        item,
      ],
    }));

    setEventOperationEntry((draft) => ({
      ...draft,
      [section]: {
        ...(section === 'roteiro'
          ? {
            horario: '',
            titulo: '',
            local: '',
            observacao: '',
          }
          : section === 'fotosEssenciais'
            ? {
              titulo: '',
              categoria: 'Cerimônia',
              prioridade: 'normal',
            }
            : section === 'pessoasChave'
              ? {
                nome: '',
                papel: '',
                contato: '',
                observacao: '',
              }
              : section === 'deslocamentos'
                ? {
                  origem: '',
                  destino: '',
                  horarioSaida: '',
                  observacao: '',
                }
                : {
                  titulo: '',
                  responsavel: '',
                  prazo: '',
                  concluida: false,
                }),
      },
    }));

    setActionError('');
  };

  const updateEventOperationItem = (
    section,
    itemId,
    key,
    value,
  ) => {
    setEventOperationDraft((draft) => ({
      ...draft,
      [section]: (draft[section] || []).map((item) => (
        item.id === itemId
          ? {
            ...item,
            [key]: value,
          }
          : item
      )),
    }));
  };

  const removeEventOperationItem = (
    section,
    itemId,
  ) => {
    setEventOperationDraft((draft) => ({
      ...draft,
      [section]: (draft[section] || []).filter(
        (item) => item.id !== itemId,
      ),
    }));
  };

  const saveEventOperation = async () => {
    if (!selectedProject || savingDashboard) return;

    const latest = rawProjects.find(
      (item) => item.id === selectedProject.id,
    ) || selectedProject;

    const operacaoEvento = {
      roteiro: [...eventOperationDraft.roteiro],
      fotosEssenciais: [
        ...eventOperationDraft.fotosEssenciais,
      ],
      pessoasChave: [
        ...eventOperationDraft.pessoasChave,
      ],
      deslocamentos: [
        ...eventOperationDraft.deslocamentos,
      ],
      pendencias: [...eventOperationDraft.pendencias],
    };

    const now = new Date().toISOString();
    const existingTimeline = Array.isArray(
      latest.financeiro?.timeline,
    )
      ? latest.financeiro.timeline
      : [];

    const updated = {
      ...latest,
      operacaoEvento,
      financeiro: {
        ...latest.financeiro,
        timeline: [
          ...existingTimeline,
          {
            id: createId('timeline'),
            tipo: 'operacao_evento',
            titulo: 'Operação do evento atualizada',
            descricao:
              'Roteiro, fotos essenciais, pessoas-chave, deslocamentos e pendências foram atualizados.',
            data: now,
          },
        ],
        updatedAt: now,
      },
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(updated, {
        operacaoEvento,
        financeiro: updated.financeiro,
      });

      setSelectedProject(updated);
      setProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
      setRawProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
    } catch (error) {
      console.error(
        'Erro ao salvar operação do evento:',
        error,
      );
      setActionError(
        'Não foi possível salvar a operação do evento.',
      );
    } finally {
      setSavingDashboard(false);
    }
  };

  const updatePostProductionSection = (
    section,
    key,
    value,
  ) => {
    setPostProductionDraft((draft) => ({
      ...draft,
      [section]: {
        ...draft[section],
        [key]: value,
      },
    }));
  };

  const savePostProduction = async () => {
    if (!selectedProject || savingDashboard) return;

    const latest = rawProjects.find(
      (item) => item.id === selectedProject.id,
    ) || selectedProject;

    const posProducao = {
      backup: {
        ...postProductionDraft.backup,
      },
      selecao: {
        ...postProductionDraft.selecao,
      },
      edicao: {
        ...postProductionDraft.edicao,
        percentual: Math.min(
          100,
          Math.max(
            0,
            Number(postProductionDraft.edicao.percentual || 0),
          ),
        ),
      },
      revisao: {
        ...postProductionDraft.revisao,
        limiteRevisoes: Math.max(
          0,
          Number(
            postProductionDraft.revisao.limiteRevisoes || 0,
          ),
        ),
        revisoesUsadas: Math.max(
          0,
          Number(
            postProductionDraft.revisao.revisoesUsadas || 0,
          ),
        ),
      },
      controleQualidade: {
        ...postProductionDraft.controleQualidade,
      },
    };

    const now = new Date().toISOString();
    const existingTimeline = Array.isArray(
      latest.financeiro?.timeline,
    )
      ? latest.financeiro.timeline
      : [];

    const updated = {
      ...latest,
      posProducao,
      financeiro: {
        ...latest.financeiro,
        timeline: [
          ...existingTimeline,
          {
            id: createId('timeline'),
            tipo: 'pos_producao',
            titulo: 'Pós-produção atualizada',
            descricao:
              'Backup, seleção, edição, revisão e controle de qualidade foram atualizados.',
            data: now,
          },
        ],
        updatedAt: now,
      },
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(updated, {
        posProducao,
        financeiro: updated.financeiro,
      });

      setSelectedProject(updated);
      setProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
      setRawProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
    } catch (error) {
      console.error(
        'Erro ao salvar pós-produção:',
        error,
      );
      setActionError(
        'Não foi possível salvar os dados de pós-produção.',
      );
    } finally {
      setSavingDashboard(false);
    }
  };

  const updateCommercialDeliverySection = (
    section,
    key,
    value,
  ) => {
    setCommercialDeliveryDraft((draft) => ({
      ...draft,
      [section]: {
        ...draft[section],
        [key]: value,
      },
    }));
  };

  const addCommercialDeliverable = () => {
    if (!newDeliverable.titulo.trim()) {
      setActionError(
        'Informe o nome do entregável antes de adicionar.',
      );
      return;
    }

    setCommercialDeliveryDraft((draft) => ({
      ...draft,
      entregaveis: [
        ...draft.entregaveis,
        {
          id: createId('deliverable'),
          titulo: newDeliverable.titulo.trim(),
          prazo: newDeliverable.prazo,
          concluido: false,
        },
      ],
    }));

    setNewDeliverable({
      titulo: '',
      prazo: '',
    });
    setActionError('');
  };

  const updateCommercialDeliverable = (
    deliverableId,
    key,
    value,
  ) => {
    setCommercialDeliveryDraft((draft) => ({
      ...draft,
      entregaveis: draft.entregaveis.map((item) => (
        item.id === deliverableId
          ? {
            ...item,
            [key]: value,
          }
          : item
      )),
    }));
  };

  const removeCommercialDeliverable = (deliverableId) => {
    setCommercialDeliveryDraft((draft) => ({
      ...draft,
      entregaveis: draft.entregaveis.filter(
        (item) => item.id !== deliverableId,
      ),
    }));
  };

  const saveCommercialDelivery = async () => {
    if (!selectedProject || savingDashboard) return;

    const latest = rawProjects.find(
      (item) => item.id === selectedProject.id,
    ) || selectedProject;

    const entregaComercial = {
      entregaveis: [
        ...commercialDeliveryDraft.entregaveis,
      ],
      conteudoSocial: {
        ...commercialDeliveryDraft.conteudoSocial,
      },
      album: {
        ...commercialDeliveryDraft.album,
      },
      acervo: {
        ...commercialDeliveryDraft.acervo,
      },
      experienciaCliente: {
        ...commercialDeliveryDraft.experienciaCliente,
      },
    };

    const now = new Date().toISOString();
    const existingTimeline = Array.isArray(
      latest.financeiro?.timeline,
    )
      ? latest.financeiro.timeline
      : [];

    const updated = {
      ...latest,
      entregaComercial,
      financeiro: {
        ...latest.financeiro,
        timeline: [
          ...existingTimeline,
          {
            id: createId('timeline'),
            tipo: 'entrega_comercial',
            titulo: 'Entrega comercial atualizada',
            descricao:
              'Entregáveis, conteúdo social, álbum, acervo e experiência do cliente foram atualizados.',
            data: now,
          },
        ],
        updatedAt: now,
      },
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(updated, {
        entregaComercial,
        financeiro: updated.financeiro,
      });

      setSelectedProject(updated);
      setProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
      setRawProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
    } catch (error) {
      console.error(
        'Erro ao salvar entrega comercial:',
        error,
      );
      setActionError(
        'Não foi possível salvar a entrega comercial e o acervo.',
      );
    } finally {
      setSavingDashboard(false);
    }
  };

  const updatePreparationSection = (
    section,
    key,
    value,
  ) => {
    setPreparationDraft((draft) => ({
      ...draft,
      [section]: {
        ...draft[section],
        [key]: value,
      },
    }));
  };

  const updatePreparationEntry = (
    section,
    key,
    value,
  ) => {
    setPreparationEntry((draft) => ({
      ...draft,
      [section]: {
        ...draft[section],
        [key]: value,
      },
    }));
  };

  const addPreparationMeeting = () => {
    const entry = preparationEntry.reuniao;

    if (!entry.titulo.trim() || !entry.data) {
      setActionError(
        'Informe o título e a data da reunião.',
      );
      return;
    }

    setPreparationDraft((draft) => ({
      ...draft,
      reunioes: [
        ...draft.reunioes,
        {
          ...entry,
          id: createId('meeting'),
          criadoEm: new Date().toISOString(),
        },
      ],
    }));

    setPreparationEntry((draft) => ({
      ...draft,
      reuniao: {
        titulo: '',
        data: '',
        horario: '',
        local: '',
        observacao: '',
      },
    }));
    setActionError('');
  };

  const addPreparationReminder = () => {
    const entry = preparationEntry.lembrete;

    if (!entry.titulo.trim()) {
      setActionError(
        'Informe o texto do lembrete.',
      );
      return;
    }

    setPreparationDraft((draft) => ({
      ...draft,
      lembretes: [
        ...draft.lembretes,
        {
          ...entry,
          id: createId('reminder'),
          criadoEm: new Date().toISOString(),
        },
      ],
    }));

    setPreparationEntry((draft) => ({
      ...draft,
      lembrete: {
        titulo: '',
        data: '',
        prioridade: 'normal',
        concluido: false,
      },
    }));
    setActionError('');
  };

  const updatePreparationListItem = (
    section,
    itemId,
    key,
    value,
  ) => {
    setPreparationDraft((draft) => ({
      ...draft,
      [section]: (draft[section] || []).map((item) => (
        item.id === itemId
          ? {
            ...item,
            [key]: value,
          }
          : item
      )),
    }));
  };

  const removePreparationListItem = (
    section,
    itemId,
  ) => {
    setPreparationDraft((draft) => ({
      ...draft,
      [section]: (draft[section] || []).filter(
        (item) => item.id !== itemId,
      ),
    }));
  };

  const savePreparationCenter = async () => {
    if (!selectedProject || savingDashboard) return;

    const latest = rawProjects.find(
      (item) => item.id === selectedProject.id,
    ) || selectedProject;

    const preparacao = {
      reunioes: [...preparationDraft.reunioes],
      questionarios: {
        ...preparationDraft.questionarios,
      },
      autorizacoes: {
        ...preparationDraft.autorizacoes,
      },
      viagem: {
        ...preparationDraft.viagem,
      },
      lembretes: [...preparationDraft.lembretes],
    };

    const now = new Date().toISOString();
    const existingTimeline = Array.isArray(
      latest.financeiro?.timeline,
    )
      ? latest.financeiro.timeline
      : [];

    const updated = {
      ...latest,
      preparacao,
      financeiro: {
        ...latest.financeiro,
        timeline: [
          ...existingTimeline,
          {
            id: createId('timeline'),
            tipo: 'preparacao',
            titulo: 'Preparação do trabalho atualizada',
            descricao:
              'Reuniões, questionários, autorizações, viagem e lembretes foram atualizados.',
            data: now,
          },
        ],
        updatedAt: now,
      },
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(updated, {
        preparacao,
        financeiro: updated.financeiro,
      });

      setSelectedProject(updated);
      setProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
      setRawProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
    } catch (error) {
      console.error(
        'Erro ao salvar preparação:',
        error,
      );
      setActionError(
        'Não foi possível salvar a central de preparação.',
      );
    } finally {
      setSavingDashboard(false);
    }
  };

  const updateClientExperienceSection = (
    section,
    key,
    value,
  ) => {
    setClientExperienceDraft((draft) => ({
      ...draft,
      [section]: {
        ...draft[section],
        [key]: value,
      },
    }));
  };

  const updateClientExperienceEntry = (
    section,
    key,
    value,
  ) => {
    setClientExperienceEntry((draft) => ({
      ...draft,
      [section]: {
        ...draft[section],
        [key]: value,
      },
    }));
  };

  const addFamilyGroup = () => {
    const entry = clientExperienceEntry.grupoFamiliar;

    if (!entry.titulo.trim() || !entry.pessoas.trim()) {
      setActionError(
        'Informe o nome do grupo e as pessoas participantes.',
      );
      return;
    }

    setClientExperienceDraft((draft) => ({
      ...draft,
      gruposFamiliares: [
        ...draft.gruposFamiliares,
        {
          ...entry,
          id: createId('family-group'),
          criadoEm: new Date().toISOString(),
        },
      ],
    }));

    setClientExperienceEntry((draft) => ({
      ...draft,
      grupoFamiliar: {
        titulo: '',
        pessoas: '',
        prioridade: 'normal',
        observacao: '',
      },
    }));
    setActionError('');
  };

  const addSpecialMoment = () => {
    const entry = clientExperienceEntry.momentoEspecial;

    if (!entry.titulo.trim()) {
      setActionError(
        'Informe o momento especial antes de adicionar.',
      );
      return;
    }

    setClientExperienceDraft((draft) => ({
      ...draft,
      momentosEspeciais: [
        ...draft.momentosEspeciais,
        {
          ...entry,
          id: createId('special-moment'),
          criadoEm: new Date().toISOString(),
        },
      ],
    }));

    setClientExperienceEntry((draft) => ({
      ...draft,
      momentoEspecial: {
        titulo: '',
        horario: '',
        responsavel: '',
        segredo: false,
        observacao: '',
      },
    }));
    setActionError('');
  };

  const removeClientExperienceItem = (
    section,
    itemId,
  ) => {
    setClientExperienceDraft((draft) => ({
      ...draft,
      [section]: (draft[section] || []).filter(
        (item) => item.id !== itemId,
      ),
    }));
  };

  const saveClientExperience = async () => {
    if (!selectedProject || savingDashboard) return;

    const latest = rawProjects.find(
      (item) => item.id === selectedProject.id,
    ) || selectedProject;

    const experienciaCliente = {
      preferencias: {
        ...clientExperienceDraft.preferencias,
      },
      gruposFamiliares: [
        ...clientExperienceDraft.gruposFamiliares,
      ],
      acessibilidade: {
        ...clientExperienceDraft.acessibilidade,
      },
      momentosEspeciais: [
        ...clientExperienceDraft.momentosEspeciais,
      ],
      hospitalidade: {
        ...clientExperienceDraft.hospitalidade,
      },
    };

    const now = new Date().toISOString();
    const existingTimeline = Array.isArray(
      latest.financeiro?.timeline,
    )
      ? latest.financeiro.timeline
      : [];

    const updated = {
      ...latest,
      experienciaCliente,
      financeiro: {
        ...latest.financeiro,
        timeline: [
          ...existingTimeline,
          {
            id: createId('timeline'),
            tipo: 'experiencia_cliente',
            titulo: 'Experiência do cliente atualizada',
            descricao:
              'Preferências, grupos familiares, acessibilidade, momentos especiais e hospitalidade foram atualizados.',
            data: now,
          },
        ],
        updatedAt: now,
      },
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(updated, {
        experienciaCliente,
        financeiro: updated.financeiro,
      });

      setSelectedProject(updated);
      setProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
      setRawProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
    } catch (error) {
      console.error(
        'Erro ao salvar experiência do cliente:',
        error,
      );
      setActionError(
        'Não foi possível salvar a experiência do cliente.',
      );
    } finally {
      setSavingDashboard(false);
    }
  };

  const updateGovernanceSection = (
    section,
    key,
    value,
  ) => {
    setGovernanceDraft((draft) => ({
      ...draft,
      [section]: {
        ...draft[section],
        [key]: value,
      },
    }));
  };

  const updateGovernanceEntry = (
    section,
    key,
    value,
  ) => {
    setGovernanceEntry((draft) => ({
      ...draft,
      [section]: {
        ...draft[section],
        [key]: value,
      },
    }));
  };

  const addGovernanceChange = () => {
    const entry = governanceEntry.alteracao;

    if (!entry.titulo.trim()) {
      setActionError(
        'Informe a alteração solicitada.',
      );
      return;
    }

    setGovernanceDraft((draft) => ({
      ...draft,
      alteracoes: [
        ...draft.alteracoes,
        {
          ...entry,
          id: createId('change-request'),
          impactoValor: parseCurrency(entry.impactoValor),
          criadoEm: new Date().toISOString(),
        },
      ],
    }));

    setGovernanceEntry((draft) => ({
      ...draft,
      alteracao: {
        titulo: '',
        solicitadoPor: '',
        data: '',
        impactoPrazo: '',
        impactoValor: '',
        aprovado: false,
        observacao: '',
      },
    }));
    setActionError('');
  };

  const addGovernanceIncident = () => {
    const entry = governanceEntry.ocorrencia;

    if (!entry.titulo.trim()) {
      setActionError(
        'Informe a ocorrência antes de adicionar.',
      );
      return;
    }

    setGovernanceDraft((draft) => ({
      ...draft,
      ocorrencias: [
        ...draft.ocorrencias,
        {
          ...entry,
          id: createId('incident'),
          criadoEm: new Date().toISOString(),
        },
      ],
    }));

    setGovernanceEntry((draft) => ({
      ...draft,
      ocorrencia: {
        titulo: '',
        data: '',
        gravidade: 'baixa',
        responsavel: '',
        resolucao: '',
      },
    }));
    setActionError('');
  };

  const removeGovernanceItem = (
    section,
    itemId,
  ) => {
    setGovernanceDraft((draft) => ({
      ...draft,
      [section]: (draft[section] || []).filter(
        (item) => item.id !== itemId,
      ),
    }));
  };

  const saveGovernance = async () => {
    if (!selectedProject || savingDashboard) return;

    const latest = rawProjects.find(
      (item) => item.id === selectedProject.id,
    ) || selectedProject;

    const governanca = {
      obrigacoes: {
        ...governanceDraft.obrigacoes,
      },
      alteracoes: [...governanceDraft.alteracoes],
      privacidade: {
        ...governanceDraft.privacidade,
      },
      ocorrencias: [...governanceDraft.ocorrencias],
      encerramento: {
        ...governanceDraft.encerramento,
      },
    };

    const now = new Date().toISOString();
    const existingTimeline = Array.isArray(
      latest.financeiro?.timeline,
    )
      ? latest.financeiro.timeline
      : [];

    const updated = {
      ...latest,
      governanca,
      financeiro: {
        ...latest.financeiro,
        timeline: [
          ...existingTimeline,
          {
            id: createId('timeline'),
            tipo: 'governanca',
            titulo: 'Governança do trabalho atualizada',
            descricao:
              'Obrigações, alterações, privacidade, ocorrências e encerramento foram atualizados.',
            data: now,
          },
        ],
        updatedAt: now,
      },
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(updated, {
        governanca,
        financeiro: updated.financeiro,
      });

      setSelectedProject(updated);
      setProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
      setRawProjects((current) => (
        current.map((item) => (
          item.id === updated.id ? updated : item
        ))
      ));
    } catch (error) {
      console.error(
        'Erro ao salvar governança:',
        error,
      );
      setActionError(
        'Não foi possível salvar a governança do trabalho.',
      );
    } finally {
      setSavingDashboard(false);
    }
  };


  const duplicateProject = async (project) => {
    if (!project || savingDashboard) return;

    const now = new Date().toISOString();
    const duplicated = {
      ...JSON.parse(JSON.stringify(project)),
      id: createProjectRecordId(),
      titulo: `${project.titulo || project.tipoServico || 'Trabalho'} — Cópia`,
      arquivado: false,
      status: 'novo',
      statusProducao: 'novo',
      criadoEm: now,
      createdAt: now,
      atualizadoEm: now,
      updatedAt: now,
      financeiro: {
        ...(project.financeiro || {}),
        workflowStatus: 'novo',
        statusProducao: 'novo',
        timeline: [
          {
            id: createId('timeline'),
            tipo: 'duplicacao',
            titulo: 'Trabalho duplicado',
            descricao:
              'A estrutura, a equipe, o checklist e as configurações foram copiados.',
            data: now,
          },
        ],
        updatedAt: now,
      },
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(
        duplicated,
        {
          status: 'novo',
          statusProducao: 'novo',
          arquivado: false,
          financeiro: duplicated.financeiro,
        },
        { isNew: true },
      );

      setProjects((current) => uniqueProjects([duplicated, ...current]));
      setRawProjects((current) => uniqueProjects([duplicated, ...current]));
      setSelectedProject(duplicated);
    } catch (error) {
      console.error('Erro ao duplicar trabalho:', error);
      setActionError('Não foi possível duplicar o trabalho.');
    } finally {
      setSavingDashboard(false);
    }
  };

  const applyProjectTemplate = async (project) => {
    if (!project || savingDashboard) return;

    const kind = String(
      project.categoria || project.tipoServico || '',
    ).toLowerCase();

    const template = kind.includes('casamento')
      ? {
        name: 'Casamento',
        checklist: [
          'Confirmar cronograma final',
          'Conferir equipe e equipamentos',
          'Confirmar making of, cerimônia e festa',
          'Validar fotos familiares obrigatórias',
          'Preparar backup e logística',
        ],
        deliverables: [
          'Galeria de fotos',
          'Filme principal',
          'Teaser ou Reels',
        ],
      }
      : kind.includes('formatura')
        ? {
          name: 'Formatura',
          checklist: [
            'Confirmar lista de formandos',
            'Conferir horários da solenidade',
            'Organizar fotos individuais e coletivas',
            'Confirmar equipe e iluminação',
            'Preparar identificação dos alunos',
          ],
          deliverables: [
            'Galeria da turma',
            'Fotos individuais',
            'Seleção para divulgação',
          ],
        }
        : kind.includes('gestante')
          ? {
            name: 'Ensaio gestante',
            checklist: [
              'Confirmar roupas e acessórios',
              'Verificar horário e luz',
              'Confirmar local e deslocamento',
              'Orientar acompanhantes',
              'Preparar referências',
            ],
            deliverables: [
              'Galeria de fotos',
              'Prévia para Stories',
            ],
          }
          : kind.includes('ensaio')
            ? {
              name: 'Ensaio',
              checklist: [
                'Confirmar local e horário',
                'Orientar roupas',
                'Validar referências',
                'Verificar previsão do tempo',
                'Preparar equipamentos',
              ],
              deliverables: [
                'Galeria de fotos',
                'Prévia para redes sociais',
              ],
            }
            : {
              name: 'Evento',
              checklist: [
                'Confirmar programação',
                'Conferir responsáveis',
                'Validar local e acesso',
                'Preparar equipamentos',
                'Confirmar prazo de entrega',
              ],
              deliverables: [
                'Galeria de fotos',
                'Material de destaque',
              ],
            };

    const currentChecklistSource = (
      project.checklist
      || project.financeiro?.checklist
    );

    const currentChecklist = normalizeChecklist(
      currentChecklistSource,
    ).itens;

    const checklist = [
      ...currentChecklist,
      ...template.checklist
        .filter((title) => (
          !currentChecklist.some(
            (item) => String(item.titulo || '').toLowerCase()
              === title.toLowerCase(),
          )
        ))
        .map((title) => ({
          id: createId('checklist'),
          titulo: title,
          categoria: 'modelo',
          concluido: false,
          observacao: '',
        })),
    ];

    const currentDeliverables = Array.isArray(
      project.entregaComercial?.entregaveis,
    )
      ? project.entregaComercial.entregaveis
      : [];

    const entregaveis = [
      ...currentDeliverables,
      ...template.deliverables
        .filter((title) => (
          !currentDeliverables.some(
            (item) => String(item.titulo || '').toLowerCase()
              === title.toLowerCase(),
          )
        ))
        .map((title) => ({
          id: createId('deliverable'),
          titulo: title,
          prazo: '',
          concluido: false,
        })),
    ];

    const now = new Date().toISOString();
    const updated = {
      ...project,
      checklist: {
        itens: checklist,
      },
      entregaComercial: {
        ...(project.entregaComercial || {}),
        entregaveis,
      },
      financeiro: {
        ...(project.financeiro || {}),
        checklist,
        timeline: [
          ...(Array.isArray(project.financeiro?.timeline)
            ? project.financeiro.timeline
            : []),
          {
            id: createId('timeline'),
            tipo: 'modelo_aplicado',
            titulo: `Modelo ${template.name} aplicado`,
            descricao:
              'Checklist e entregáveis foram adicionados sem remover dados existentes.',
            data: now,
          },
        ],
        updatedAt: now,
      },
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(updated, {
        entregaComercial: updated.entregaComercial,
        checklist,
        financeiro: updated.financeiro,
      });

      setSelectedProject(updated);
      setCommercialDeliveryDraft((draft) => ({
        ...draft,
        entregaveis,
      }));
      setProjects((current) => current.map(
        (item) => item.id === updated.id ? updated : item,
      ));
      setRawProjects((current) => current.map(
        (item) => item.id === updated.id ? updated : item,
      ));
    } catch (error) {
      console.error('Erro ao aplicar modelo:', error);
      setActionError('Não foi possível aplicar o modelo.');
    } finally {
      setSavingDashboard(false);
    }
  };

  const toggleProjectArchive = async (project) => {
    if (!project || savingDashboard) return;

    const arquivado = !project.arquivado;
    const now = new Date().toISOString();
    const updated = {
      ...project,
      arquivado,
      financeiro: {
        ...(project.financeiro || {}),
        timeline: [
          ...(Array.isArray(project.financeiro?.timeline)
            ? project.financeiro.timeline
            : []),
          {
            id: createId('timeline'),
            tipo: arquivado ? 'arquivamento' : 'restauracao',
            titulo: arquivado
              ? 'Trabalho arquivado'
              : 'Trabalho restaurado',
            descricao: arquivado
              ? 'O trabalho foi removido da visualização principal.'
              : 'O trabalho voltou para a visualização principal.',
            data: now,
          },
        ],
        updatedAt: now,
      },
    };

    setSavingDashboard(true);
    setActionError('');

    try {
      await persistProject(updated, {
        arquivado,
        financeiro: updated.financeiro,
      });
      setSelectedProject(updated);
      setProjects((current) => current.map(
        (item) => item.id === updated.id ? updated : item,
      ));
      setRawProjects((current) => current.map(
        (item) => item.id === updated.id ? updated : item,
      ));
    } catch (error) {
      console.error('Erro ao arquivar trabalho:', error);
      setActionError('Não foi possível alterar o arquivamento.');
    } finally {
      setSavingDashboard(false);
    }
  };

  const clearAdvancedFilters = () => {
    setTypeFilter('');
    setResponsibleFilter('');
    setFinanceFilter('');
    setDateFromFilter('');
    setDateToFilter('');
  };

  const availableYears = useMemo(() => {
    const years = new Set([new Date().getFullYear()]);
    uniqueProjects(projects).forEach((project) => {
      const year = getProjectYear(project);
      if (year) years.add(year);
    });
    return [...years].sort((a, b) => b - a);
  }, [projects]);

  const officialClientIds = useMemo(() => new Set(
    clients
      .filter((client) => client?.id)
      .map((client) => String(client.id)),
  ), [clients]);

  const syncedProjects = useMemo(() => (
    selectProjectsSyncedWithClients(projects, clients, selectedYear)
  ), [clients, projects, selectedYear]);

  const projectsByColumn = useMemo(() => {
    const grouped = Object.fromEntries(
      colunas.map((column) => [
        column.id,
        [],
      ]),
    );

    syncedProjects
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

        const projectType = String(
          project.categoria || project.tipoServico || '',
        ).toLowerCase();

        const projectDate = project.data
          ? new Date(`${project.data}T12:00:00`)
          : null;

        const team = normalizeProjectTeam(
          project.equipeProjeto || project.equipe || [],
        );

        const financialSummary = calculateProjectFinancials(
          project,
          transactions,
        );

        const pendingBalance = Number(
          financialSummary.saldoPendente
          ?? financialSummary.saldo
          ?? financialSummary.aReceber
          ?? 0,
        );

        const financeMatches = (
          !financeFilter
          || (
            financeFilter === 'pendente'
            && pendingBalance > 0
          )
          || (
            financeFilter === 'quitado'
            && pendingBalance <= 0
            && Number(project.valorContratado || 0) > 0
          )
          || (
            financeFilter === 'sem_valor'
            && Number(project.valorContratado || 0) <= 0
          )
        );

        const projectClientId = getProjectClientId(project);
        const belongsToOfficialClient = (
          projectClientId
          && officialClientIds.has(projectClientId)
        );
        const belongsToSelectedYear = (
          getProjectYear(project) === Number(selectedYear)
        );

        return (
          belongsToOfficialClient
          && belongsToSelectedYear
          && (
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
          && (
            !typeFilter
            || projectType.includes(typeFilter.toLowerCase())
          )
          && (
            !responsibleFilter
            || team.some((member) => (
              String(
                member.membroId
                || member.id
                || member.nome
                || '',
              ) === String(responsibleFilter)
            ))
          )
          && financeMatches
          && (
            !dateFromFilter
            || (
              projectDate
              && projectDate >= new Date(`${dateFromFilter}T00:00:00`)
            )
          )
          && (
            !dateToFilter
            || (
              projectDate
              && projectDate <= new Date(`${dateToFilter}T23:59:59`)
            )
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
    dateFromFilter,
    dateToFilter,
    financeFilter,
    officialClientIds,
    productionFilter,
    syncedProjects,
    responsibleFilter,
    search,
    selectedYear,
    showArchived,
    transactions,
    typeFilter,
  ]);


  const visibleProjects = useMemo(() => (
    colunas.flatMap((column) => projectsByColumn[column.id] || [])
  ), [projectsByColumn]);

  const visibleClientCount = useMemo(() => new Set(
    visibleProjects.map((project) => getProjectClientId(project)).filter(Boolean),
  ).size, [visibleProjects]);

  const undatedProjects = useMemo(() => syncedProjects.filter((project) => {
    const clientId = getProjectClientId(project);
    if (!clientId || !officialClientIds.has(clientId) || project.arquivado) return false;
    if (getProjectDateValue(project)) return false;
    if (productionFilter && getProjectOperationalStatus(project) !== productionFilter) return false;
    if (!projectMatchesSearch(project, clients.find((client) => String(client.id) === clientId), search)) return false;
    return true;
  }), [clients, officialClientIds, productionFilter, search, syncedProjects]);

  const previewProject = useMemo(() => (
    visibleProjects.find((project) => project.id === previewProjectId)
    || undatedProjects.find((project) => project.id === previewProjectId)
    || visibleProjects[0]
    || null
  ), [previewProjectId, undatedProjects, visibleProjects]);

  const visibleCompletedCount = visibleProjects.filter(
    isCompletedOfficialProject,
  ).length;

  const visibleUpcomingCount = visibleProjects.length - visibleCompletedCount;

  const selectedExecutiveFinance = selectedProject
    ? calculateProjectFinancials(selectedProject, transactions)
    : {};

  const selectedPendingBalance = Number(
    selectedExecutiveFinance.saldoPendente
    ?? selectedExecutiveFinance.saldo
    ?? selectedExecutiveFinance.aReceber
    ?? 0,
  );

  const selectedPendingTasks = selectedProject
    ? normalizeChecklist(
      selectedProject.checklist
      || selectedProject.financeiro?.checklist,
    ).itens.filter((item) => !item.concluido).length
    : 0;

  const selectedPendingDeliverables = (
    commercialDeliveryDraft.entregaveis || []
  ).filter((item) => !item.concluido).length;

  const selectedProjectAlerts = selectedProject
    ? [
      !governanceDraft.obrigacoes.contratoAssinado
        ? {
          id: 'contract',
          level: 'warning',
          title: 'Contrato ainda não confirmado',
          description:
            'Marque o contrato como assinado em Governança.',
        }
        : null,
      selectedPendingBalance > 0
        ? {
          id: 'finance',
          level: 'warning',
          title: 'Existe saldo financeiro pendente',
          description: formatMoney(selectedPendingBalance),
        }
        : null,
      selectedProject.data
      && new Date(`${selectedProject.data}T23:59:59`) < new Date()
      && !postProductionDraft.backup.cartoesCopiados
        ? {
          id: 'backup',
          level: 'critical',
          title: 'Backup ainda não confirmado',
          description:
            'O evento já ocorreu e os cartões não foram marcados como copiados.',
        }
        : null,
      selectedPendingTasks > 0
        ? {
          id: 'tasks',
          level: 'info',
          title: `${selectedPendingTasks} item(ns) de checklist pendente(s)`,
          description: 'Revise as próximas ações.',
        }
        : null,
      selectedPendingDeliverables > 0
        ? {
          id: 'deliverables',
          level: 'info',
          title: `${selectedPendingDeliverables} entregável(is) pendente(s)`,
          description: 'Acompanhe os prazos comerciais.',
        }
        : null,
      selectedProject.data
      && new Date(`${selectedProject.data}T12:00:00`) >= new Date()
      && (
        new Date(`${selectedProject.data}T12:00:00`).getTime()
        - new Date().getTime()
      ) <= 7 * 24 * 60 * 60 * 1000
        ? {
          id: 'event-soon',
          level: 'warning',
          title: 'Evento próximo',
          description: 'O trabalho acontece nos próximos sete dias.',
        }
        : null,
    ].filter(Boolean)
    : [];

  const selectedDeliverablesCompleted = (
    commercialDeliveryDraft.entregaveis || []
  ).filter((item) => item.concluido).length;

  const selectedDeliverablesTotal = (
    commercialDeliveryDraft.entregaveis || []
  ).length;

  const selectedCommercialDeliveryProgress = (
    selectedDeliverablesTotal > 0
      ? Math.round(
        selectedDeliverablesCompleted
        / selectedDeliverablesTotal
        * 100,
      )
      : 0
  );

  const selectedQualityChecks = Object.values(
    postProductionDraft.controleQualidade,
  ).filter((value) => value === true).length;

  const selectedQualityTotal = 6;

  const selectedPostProductionProgress = Math.round(
    (
      (
        postProductionDraft.backup.cartoesCopiados ? 20 : 0
      )
      + (
        postProductionDraft.selecao.concluida ? 20 : 0
      )
      + (
        Math.min(
          100,
          Number(postProductionDraft.edicao.percentual || 0),
        ) * 0.2
      )
      + (
        postProductionDraft.revisao.enviadaAoCliente ? 20 : 0
      )
      + (
        selectedQualityChecks / selectedQualityTotal * 20
      )
    ),
  );

  const selectedDocuments = selectedProject
    ? documents.filter((item) => (
      String(item.projectId || item.trabalhoId || '')
      === String(selectedProject.id)
    ))
    : [];

  const selectedContracts = selectedProject
    ? contracts.filter((item) => (
      String(item.trabalhoId || item.projectId || '')
      === String(selectedProject.id)
    ))
    : [];

  const selectedProjectFinance = selectedProject
    ? calculateProjectFinancials({
      project: selectedProject,
      contracts,
      receitasAvulsas: transactions.filter((item) => (
        item.tipo === 'receita_avulsa'
        || item.tipo === 'avulsa'
      )),
      despesas: transactions.filter((item) => (
        item.tipo === 'fixa'
        || item.tipo === 'variavel'
      )),
    })
    : null;

  const selectedTeamCost = resourceDraft.equipeProjeto.reduce(
    (sum, member) => (
      sum + Number(member.valorDiaria || 0)
    ),
    0,
  );

  const selectedLogisticsCost = [
    profitDraft.transporte,
    profitDraft.alimentacao,
    profitDraft.hospedagem,
    profitDraft.outros,
  ].reduce(
    (sum, value) => sum + parseCurrency(value),
    0,
  );

  const selectedLinkedExpenses = selectedProject
    ? transactions.filter((item) => (
      (item.tipo === 'fixa' || item.tipo === 'variavel')
      && String(item.trabalhoId || item.projectId || '')
        === String(selectedProject.id)
      && !['cancelado', 'cancelada'].includes(
        String(item.status || '').toLowerCase(),
      )
    ))
    : [];

  const selectedExpenseTotal = selectedLinkedExpenses.reduce(
    (sum, item) => sum + Number(item.valor || 0),
    0,
  );

  const selectedTotalCost = (
    selectedTeamCost
    + selectedLogisticsCost
    + selectedExpenseTotal
  );

  const selectedRevenueBase = Number(
    selectedProjectFinance?.receitaContratada
    || selectedProject?.valorContratado
    || 0,
  );

  const selectedEstimatedProfit = (
    selectedRevenueBase - selectedTotalCost
  );

  const selectedProfitMargin = selectedRevenueBase > 0
    ? (selectedEstimatedProfit / selectedRevenueBase) * 100
    : 0;

  const selectedFinancials = selectedProject
    ? calculateProjectValues(
      selectedProject,
    )
    : null;

  const selectedChecklistSource = (
    selectedProject?.checklist
    || selectedProject?.financeiro?.checklist
  );

  const selectedChecklist = selectedProject
    ? normalizeChecklist(selectedChecklistSource)
    : normalizeChecklist();

  const selectedChecklistProgress = selectedProject
    ? checklistProgress(selectedChecklistSource)
    : {
      completed: 0,
      total: 0,
      percentage: 0,
    };

  const selectedOperationalStatus = selectedProject
    ? getProjectOperationalStatus(selectedProject)
    : 'novo';

  const selectedStageIndex = colunas.findIndex(
    (column) => column.id === selectedOperationalStatus,
  );

  const selectedStage = selectedStageIndex >= 0
    ? colunas[selectedStageIndex]
    : colunas[0];

  const selectedNextStage = (
    selectedOperationalStatus !== 'cancelado'
    && selectedStageIndex >= 0
  )
    ? colunas
      .slice(selectedStageIndex + 1)
      .find((column) => column.id !== 'cancelado')
    : null;

  const selectedAlerts = selectedProject
    ? [
      !selectedProject.data
        ? 'A data do trabalho ainda não foi informada.'
        : null,
      !selectedProject.horario
        ? 'O horário inicial ainda não foi informado.'
        : null,
      !selectedProject.local
        ? 'O local do trabalho ainda não foi informado.'
        : null,
      selectedFinancials?.saldoPendente > 0
        ? `Existe saldo pendente de ${formatMoney(
          selectedFinancials.saldoPendente,
        )}.`
        : null,
      selectedProject.dataPrevistaEntrega
      && !selectedProject.dataRealEntrega
      && new Date(`${selectedProject.dataPrevistaEntrega}T23:59:59`)
        < new Date()
        ? 'O prazo previsto de entrega está vencido.'
        : null,
      selectedChecklistProgress.total > 0
      && selectedChecklistProgress.percentage < 100
        ? `${selectedChecklistProgress.total
          - selectedChecklistProgress.completed} item(ns) do checklist ainda estão pendentes.`
        : null,
      selectedContracts.length === 0
        ? 'Nenhum contrato está vinculado a este trabalho.'
        : null,
      !deliveryDraft.galeriaUrl
      && !deliveryDraft.filmeUrl
      && !deliveryDraft.driveUrl
        ? 'Nenhum link de entrega foi cadastrado.'
        : null,
    ].filter(Boolean)
    : [];

  const selectedMilestones = selectedProject
    ? getProjectMilestones(selectedProject)
    : [];

  const selectedDeliveryCountdown = selectedProject
    ? getDeliveryCountdown(selectedProject)
    : {
      label: '',
      tone: 'neutral',
      days: null,
    };

  const selectedTimeline = selectedProject
    ? (
      Array.isArray(selectedProject.financeiro?.timeline)
        ? selectedProject.financeiro.timeline
        : (
          Array.isArray(selectedProject.timelineCompleta)
            ? selectedProject.timelineCompleta
            : []
        )
    )
      .slice()
      .sort((a, b) => (
        new Date(b.data || b.createdAt || 0)
        - new Date(a.data || a.createdAt || 0)
      ))
      .slice(0, 8)
    : [];

  return (
    <div
      className={`sf-projects-page density-${density}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        height: '100%',
      }}
    >
      <div>
        <div className="sf-projects-header">
          <div className="sf-projects-heading">
            <h1>Trabalhos</h1>
            <span>{visibleProjects.length} trabalho(s) em {selectedYear}</span>
          </div>

          <div className="sf-projects-header-actions">
            <div className="sf-project-view-switch" aria-label="Modo de visualização">
              <button
                type="button"
                className={viewMode === 'kanban' ? 'active' : ''}
                onClick={() => setViewMode('kanban')}
              >
                <LayoutTemplate size={15} />
                Kanban
              </button>
              <button
                type="button"
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => setViewMode('list')}
              >
                <ListChecks size={15} />
                Lista
              </button>
            </div>

            <select
              className="sf-project-density-select"
              value={density}
              aria-label="Densidade dos cartões"
              onChange={(event) => setDensity(event.target.value)}
            >
              <option value="compact">Compacto</option>
              <option value="comfortable">Confortável</option>
            </select>

            <button
              className="sf-primary-button"
              type="button"
              onClick={openNew}
            >
              <Plus size={16} />
              Novo trabalho
            </button>
          </div>
        </div>

        <div className="sf-projects-overview">
          <div>
            <strong>{visibleProjects.length}</strong>
            <span>Trabalhos em {selectedYear}</span>
          </div>
          <div>
            <strong>{visibleUpcomingCount}</strong>
            <span>A realizar</span>
          </div>
          <div>
            <strong>{visibleCompletedCount}</strong>
            <span>Já realizados</span>
          </div>
          <div>
            <strong>{visibleClientCount}</strong>
            <span>Clientes do ano</span>
          </div>
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
            className="sf-project-year-filter"
            value={selectedYear}
            aria-label="Ano dos trabalhos"
            onChange={(event) => {
              setSelectedYear(Number(event.target.value));
            }}
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                Trabalhos de {year}
              </option>
            ))}
          </select>

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

          <button
            type="button"
            className={
              showAdvancedFilters
                ? 'sf-project-filter-toggle active'
                : 'sf-project-filter-toggle'
            }
            onClick={() => {
              setShowAdvancedFilters((current) => !current);
            }}
          >
            <Filter size={15} />
            Filtros avançados
          </button>

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

        {showAdvancedFilters && (
          <div className="sf-project-advanced-filters-panel">
            <label>
              <span>Tipo de trabalho</span>
              <input
                value={typeFilter}
                placeholder="Casamento, ensaio, formatura..."
                onChange={(event) => setTypeFilter(event.target.value)}
              />
            </label>

            <label>
              <span>Responsável</span>
              <select
                value={responsibleFilter}
                onChange={(event) => {
                  setResponsibleFilter(event.target.value);
                }}
              >
                <option value="">Todos</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.nome}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Situação financeira</span>
              <select
                value={financeFilter}
                onChange={(event) => setFinanceFilter(event.target.value)}
              >
                <option value="">Todas</option>
                <option value="pendente">Com saldo pendente</option>
                <option value="quitado">Quitado</option>
                <option value="sem_valor">Sem valor contratado</option>
              </select>
            </label>

            <label>
              <span>Data inicial</span>
              <input
                type="date"
                value={dateFromFilter}
                onChange={(event) => setDateFromFilter(event.target.value)}
              />
            </label>

            <label>
              <span>Data final</span>
              <input
                type="date"
                value={dateToFilter}
                onChange={(event) => setDateToFilter(event.target.value)}
              />
            </label>

            <button
              type="button"
              className="sf-secondary-button"
              onClick={clearAdvancedFilters}
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {viewMode === 'kanban' ? (
      <section className="sf-projects-board-shell">
        <div className="sf-projects-board-toolbar">
          <span>Arraste ou use as setas para navegar pelas etapas</span>

          <div className="sf-projects-board-actions">
            <button
              type="button"
              aria-label="Voltar etapas"
              disabled={!canScrollLeft}
              onClick={() => scrollBoard(-1)}
            >
              <ChevronLeft size={18} />
            </button>

            <button
              type="button"
              aria-label="Avançar etapas"
              disabled={!canScrollRight}
              onClick={() => scrollBoard(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div
          ref={boardRef}
          className="sf-projects-board"
          onWheel={handleBoardWheel}
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
      </section>
      ) : (
        <section className="sf-workspace-layout">
          <div className="sf-workspace-main">
            <div className="sf-projects-list-shell">
              <div className="sf-projects-list-title">
                <strong>Com data definida</strong>
                <span>{visibleProjects.length}</span>
              </div>
              <div className="sf-projects-list-header">
                <span>Cliente</span><span>Serviço</span><span>Data do evento</span><span>Status</span>
                <span>Contratado</span><span>Recebido</span><span>Ações</span>
              </div>
              <div className="sf-projects-list-body">
                {colunas.flatMap((column) => (projectsByColumn[column.id] || []).map((project) => ({ project, column })))
                  .sort((a, b) => String(a.project.data || '').localeCompare(String(b.project.data || '')))
                  .map(({ project, column }) => {
                    const financials = calculateProjectFinancials(project, transactions);
                    const received = Number(financials.valorRecebido ?? financials.recebido ?? project.valorRecebido ?? project.valor_recebido ?? 0);
                    const contracted = Number(project.valorContratado || project.valor_contratado || 0);
                    const percent = contracted > 0 ? Math.min(100, Math.round((received / contracted) * 100)) : 0;
                    return (
                      <div className={`sf-project-list-row${previewProject?.id === project.id ? ' selected' : ''}`} key={project.id}>
                        <button type="button" className="sf-project-row-main" onClick={() => setPreviewProjectId(project.id)}>
                          <span className="sf-project-list-client"><span className="sf-project-avatar">{(project.clienteNome || 'CI').split(/\s+/).slice(0,2).map((part)=>part[0]).join('').toUpperCase()}</span><span><strong>{project.clienteNome || 'Cliente não informado'}</strong><small>{project.categoria || project.tipoServico || 'Trabalho'}</small></span></span>
                          <span>{project.titulo || project.tipoServico || 'Não informado'}</span>
                          <span><strong>{formatProjectDate(getProjectDateValue(project))}</strong><small>{project.horario || ''}</small></span>
                          <span><small className="sf-project-stage-badge">{column.titulo}</small></span>
                          <span>{formatMoney(contracted)}</span>
                          <span className="sf-project-received-cell"><strong>{formatMoney(received)}</strong><small>{percent}%</small><i><b style={{ width: `${percent}%` }} /></i></span>
                        </button>
                        <div className="sf-project-row-actions">
                          <button type="button" title="Editar" onClick={() => openDetails(project)}><Edit3 size={15}/></button>
                          <label className="sf-project-status-control" title="Alterar status">
                            <span>{column.titulo}</span>
                            <select
                              value={getProjectOperationalStatus(project)}
                              onChange={(event) => void mudarStatus(project.id, event.target.value)}
                              disabled={savingIds.includes(project.id)}
                            >
                              {colunas.map((item) => (
                                <option key={item.id} value={item.id}>{item.titulo}</option>
                              ))}
                            </select>
                          </label>
                          <button type="button" className="danger" title="Excluir" onClick={() => void handleDeleteProject(project)} disabled={savingIds.includes(project.id)}><Trash2 size={15}/></button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {undatedProjects.length > 0 && <div className="sf-projects-list-shell sf-undated-shell">
              <div className="sf-projects-list-title"><strong>Sem data definida</strong><span>{undatedProjects.length}</span></div>
              <div className="sf-projects-list-body">
                {undatedProjects.map((project) => {
                  const financials = calculateProjectFinancials(project, transactions);
                  const received = Number(financials.valorRecebido ?? project.valorRecebido ?? 0);
                  return <div className="sf-project-list-row sf-undated-row" key={project.id}>
                    <button type="button" className="sf-project-row-main" onClick={() => setPreviewProjectId(project.id)}>
                      <span className="sf-project-list-client"><span className="sf-project-avatar">{(project.clienteNome || 'CI').slice(0,2).toUpperCase()}</span><span><strong>{project.clienteNome || 'Cliente não informado'}</strong><small>{project.tipoServico || 'Trabalho'}</small></span></span>
                      <span>{project.titulo || project.tipoServico || 'Não informado'}</span><span>—</span>
                      <span><small className="sf-project-stage-badge">{colunas.find((item)=>item.id===getProjectOperationalStatus(project))?.titulo || 'Pendente'}</small></span>
                      <span>{formatMoney(project.valorContratado || 0)}</span><span>{formatMoney(received)}</span>
                    </button>
                    <div className="sf-project-row-actions"><button type="button" onClick={() => openDetails(project)}><Edit3 size={15}/></button><button type="button" className="danger" onClick={() => void handleDeleteProject(project)}><Trash2 size={15}/></button></div>
                  </div>;
                })}
              </div>
            </div>}
          </div>

          <aside className="sf-project-preview">
            {previewProject ? <>
              <div className="sf-project-preview-head"><div><h3>{previewProject.clienteNome || 'Cliente'}</h3><small className="sf-project-stage-badge">{colunas.find((item)=>item.id===getProjectOperationalStatus(previewProject))?.titulo}</small></div></div>
              <div className="sf-project-preview-tabs"><span className="active">Resumo</span><span>Financeiro</span><span>Progresso</span><span>Arquivos</span></div>
              <div className="sf-project-preview-section"><label>Cliente</label><strong>{previewProject.clienteNome || 'Não informado'}</strong><label>Serviço</label><strong>{previewProject.titulo || previewProject.tipoServico || 'Não informado'}</strong><label>Data do evento</label><strong>{formatProjectDate(getProjectDateValue(previewProject))}</strong><label>Local</label><strong>{previewProject.local || 'Não informado'}</strong></div>
              <div className="sf-project-preview-section"><h4>Contrato</h4><div><span>Valor contratado</span><strong>{formatMoney(previewProject.valorContratado || 0)}</strong></div></div>
              <div className="sf-project-preview-section"><h4>Financeiro</h4>{(()=>{const f=calculateProjectFinancials(previewProject,transactions);const r=Number(f.valorRecebido??f.recebido??previewProject.valorRecebido??0);const c=Number(previewProject.valorContratado||0);return <><div><span>Recebido</span><strong className="paid">{formatMoney(r)}</strong></div><div><span>Pendente</span><strong className="pending">{formatMoney(Math.max(0,c-r))}</strong></div></>})()}<button type="button" className="sf-preview-open" onClick={() => openDetails(previewProject)}>Abrir painel completo</button></div>
              <div className="sf-project-preview-section"><h4>Progresso do trabalho</h4><div><span>Etapa atual</span><strong>{getProjectProgress(previewProject)}%</strong></div><div className="sf-preview-progress"><i style={{width:`${getProjectProgress(previewProject)}%`}}/></div></div>
            </> : <div className="sf-project-preview-empty">Selecione um trabalho para visualizar os detalhes.</div>}
          </aside>
        </section>
      )}

      <Modal
        isOpen={Boolean(selectedProject)}
        onClose={() => {
          setSelectedProject(null);
        }}
        title="Painel do projeto"
        maxWidth="1120px"
      >
        {selectedProject && (
          <div className="sf-project-dashboard">
            <header className="sf-project-dashboard-hero">
              <div className="sf-project-dashboard-heading">
                <span className="sf-project-dashboard-eyebrow">
                  {selectedProject.categoria || 'Projeto'}
                </span>

                <h2>
                  {selectedProject.titulo
                    || selectedProject.tipoServico
                    || 'Trabalho sem título'}
                </h2>

                <p>
                  {selectedProject.clienteNome
                    || 'Cliente não informado'}
                </p>
              </div>

              <div className="sf-project-dashboard-actions">
                <span
                  className={
                    `sf-project-dashboard-priority priority-${
                      selectedProject.prioridade || 'normal'
                    }`
                  }
                >
                  Prioridade {selectedProject.prioridade || 'normal'}
                </span>

                <button
                  type="button"
                  className="sf-secondary-button"
                  disabled={savingDashboard}
                  onClick={() => {
                    void applyProjectTemplate(selectedProject);
                  }}
                >
                  <Sparkles size={15} />
                  Aplicar modelo
                </button>

                <button
                  type="button"
                  className="sf-secondary-button"
                  disabled={savingDashboard}
                  onClick={() => {
                    void duplicateProject(selectedProject);
                  }}
                >
                  <CopyPlus size={15} />
                  Duplicar
                </button>

                <button
                  type="button"
                  className="sf-secondary-button"
                  disabled={savingDashboard}
                  onClick={() => {
                    void toggleProjectArchive(selectedProject);
                  }}
                >
                  <Archive size={15} />
                  {selectedProject.arquivado ? 'Restaurar' : 'Arquivar'}
                </button>

                <button
                  type="button"
                  className="sf-secondary-button sf-project-dashboard-edit"
                  onClick={() => {
                    const project = selectedProject;
                    setSelectedProject(null);
                    openEdit(project);
                  }}
                >
                  <Edit3 size={15} />
                  Editar projeto
                </button>
              </div>
            </header>

            <section className="sf-project-executive-summary">
              <header>
                <div>
                  <LayoutDashboard size={17} />
                  <div>
                    <h3>Resumo executivo</h3>
                    <p>Visão rápida do trabalho antes dos detalhes</p>
                  </div>
                </div>
              </header>

              <div className="sf-project-executive-cards">
                <article>
                  <span>Etapa</span>
                  <strong>{selectedStage?.titulo || 'Novo'}</strong>
                  <small>{getProjectProgress(selectedProject)}% concluído</small>
                </article>

                <article>
                  <span>Financeiro</span>
                  <strong>
                    {selectedPendingBalance > 0
                      ? formatMoney(selectedPendingBalance)
                      : 'Quitado'}
                  </strong>
                  <small>Saldo pendente</small>
                </article>

                <article>
                  <span>Checklist</span>
                  <strong>{selectedPendingTasks}</strong>
                  <small>Itens pendentes</small>
                </article>

                <article>
                  <span>Entregas</span>
                  <strong>{selectedPendingDeliverables}</strong>
                  <small>Entregáveis pendentes</small>
                </article>

                <article>
                  <span>Equipe</span>
                  <strong>{resourceDraft.equipeProjeto.length}</strong>
                  <small>Membros selecionados</small>
                </article>

                <article>
                  <span>Alertas</span>
                  <strong>{selectedProjectAlerts.length}</strong>
                  <small>Pontos de atenção</small>
                </article>
              </div>

              {selectedProjectAlerts.length > 0 ? (
                <div className="sf-project-automatic-alerts">
                  {selectedProjectAlerts.map((alert) => (
                    <article
                      key={alert.id}
                      className={`level-${alert.level}`}
                    >
                      <AlertTriangle size={15} />
                      <div>
                        <strong>{alert.title}</strong>
                        <span>{alert.description}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="sf-project-no-alerts">
                  <CheckCircle2 size={16} />
                  Nenhum alerta crítico identificado.
                </div>
              )}
            </section>

            <section className="sf-project-dashboard-progress">
              <div className="sf-project-dashboard-progress-copy">
                <div>
                  <span>Progresso operacional</span>
                  <strong>
                    {getProjectProgress(selectedProject)}%
                  </strong>
                </div>

                <p>
                  Etapa atual: <strong>{selectedStage?.titulo}</strong>
                </p>
              </div>

              <div className="sf-project-dashboard-progress-track">
                <div
                  style={{
                    width: `${getProjectProgress(selectedProject)}%`,
                  }}
                />
              </div>

              <div className="sf-project-dashboard-next-step">
                <span>
                  Próxima etapa
                </span>

                <strong>
                  {selectedNextStage?.titulo
                    || (
                      selectedOperationalStatus === 'cancelado'
                        ? 'Projeto cancelado'
                        : 'Fluxo concluído'
                    )}
                </strong>

                {selectedNextStage && (
                  <ArrowRight size={16} />
                )}
              </div>
            </section>

            <section className="sf-project-dashboard-metrics">
              <DashboardMetric
                icon={<Wallet size={18} />}
                label="Valor contratado"
                value={formatMoney(
                  selectedFinancials?.valorContratado
                  ?? selectedProject.valorContratado,
                )}
              />

              <DashboardMetric
                icon={<CheckCircle2 size={18} />}
                label="Valor recebido"
                value={formatMoney(
                  selectedFinancials?.valorRecebido,
                )}
              />

              <DashboardMetric
                icon={<DollarSign size={18} />}
                label="Saldo pendente"
                value={formatMoney(
                  selectedFinancials?.saldoPendente,
                )}
                tone={
                  selectedFinancials?.saldoPendente > 0
                    ? 'warning'
                    : 'success'
                }
              />

              <DashboardMetric
                icon={<TrendingUp size={18} />}
                label="Lucro estimado"
                value={formatMoney(
                  selectedFinancials?.lucroEstimado,
                )}
                secondary={
                  `${Number(
                    selectedFinancials?.margemEstimada || 0,
                  ).toFixed(1)}% de margem`
                }
              />
            </section>

            <div className="sf-project-dashboard-grid">
              <div className="sf-project-dashboard-main">
                <section className="sf-project-dashboard-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <BriefcaseBusiness size={17} />
                      </span>

                      <div>
                        <h3>Informações principais</h3>
                        <p>Dados operacionais do trabalho</p>
                      </div>
                    </div>
                  </header>

                  <div className="sf-project-dashboard-info-grid">
                    <DashboardInfo
                      icon={<UserRound size={16} />}
                      label="Cliente"
                      value={
                        selectedProject.clienteNome
                        || 'Não informado'
                      }
                    />

                    <DashboardInfo
                      icon={<BriefcaseBusiness size={16} />}
                      label="Serviço"
                      value={
                        selectedProject.tipoServico
                        || 'Não informado'
                      }
                    />

                    <DashboardInfo
                      icon={<Calendar size={16} />}
                      label="Data"
                      value={
                        selectedProject.data
                        || 'Não informada'
                      }
                    />

                    <DashboardInfo
                      icon={<Clock3 size={16} />}
                      label="Horário"
                      value={[
                        selectedProject.horario,
                        selectedProject.horaFim,
                      ].filter(Boolean).join(' às ')
                        || 'Não informado'}
                    />

                    <DashboardInfo
                      icon={<MapPin size={16} />}
                      label="Local"
                      value={[
                        selectedProject.local,
                        selectedProject.cidade,
                        selectedProject.estado,
                      ].filter(Boolean).join(' · ')
                        || 'Não informado'}
                    />

                    <DashboardInfo
                      icon={<CalendarCheck size={16} />}
                      label="Entrega prevista"
                      value={
                        selectedProject.dataPrevistaEntrega
                        || 'Não informada'
                      }
                    />
                  </div>

                  {(selectedProject.descricao
                    || selectedProject.observacoes) && (
                    <div className="sf-project-dashboard-notes">
                      {selectedProject.descricao && (
                        <div>
                          <span>Descrição</span>
                          <p>{selectedProject.descricao}</p>
                        </div>
                      )}

                      {selectedProject.observacoes && (
                        <div>
                          <span>Observações</span>
                          <p>{selectedProject.observacoes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <section className="sf-project-dashboard-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <CalendarCheck size={17} />
                      </span>

                      <div>
                        <h3>Cronograma do projeto</h3>
                        <p>Marcos operacionais e histórico recente</p>
                      </div>
                    </div>

                    <span
                      className={
                        `sf-project-delivery-countdown tone-${
                          selectedDeliveryCountdown.tone
                        }`
                      }
                    >
                      {selectedDeliveryCountdown.label}
                    </span>
                  </header>

                  <div className="sf-project-timeline">
                    {selectedMilestones.map((milestone) => (
                      <div
                        key={milestone.id}
                        className={
                          `sf-project-timeline-item state-${milestone.state}`
                        }
                      >
                        <span className="sf-project-timeline-marker">
                          {milestone.state === 'completed' ? (
                            <CheckCircle2 size={14} />
                          ) : (
                            <span />
                          )}
                        </span>

                        <div>
                          <strong>{milestone.title}</strong>
                          <span>
                            {milestone.date
                              ? formatProjectDate(milestone.date)
                              : (
                                milestone.state === 'current'
                                  ? 'Etapa atual'
                                  : 'Sem data específica'
                              )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="sf-project-operational-editor">
                    <label>
                      Próxima ação

                      <input
                        value={operationalDraft.proximaAcao}
                        placeholder="Ex.: Confirmar cronograma com o cliente"
                        onChange={(event) => {
                          setOperationalDraft((draft) => ({
                            ...draft,
                            proximaAcao: event.target.value,
                          }));
                        }}
                      />
                    </label>

                    <label>
                      Observações operacionais

                      <textarea
                        rows="3"
                        value={
                          operationalDraft.observacoesOperacionais
                        }
                        placeholder="Orientações, pendências e informações para a produção"
                        onChange={(event) => {
                          setOperationalDraft((draft) => ({
                            ...draft,
                            observacoesOperacionais:
                              event.target.value,
                          }));
                        }}
                      />
                    </label>

                    <div className="sf-project-operational-actions">
                      <button
                        type="button"
                        className="sf-secondary-button"
                        disabled={savingDashboard}
                        onClick={() => {
                          void saveOperationalDashboard();
                        }}
                      >
                        <Save size={15} />
                        {savingDashboard
                          ? 'Salvando...'
                          : 'Salvar planejamento'}
                      </button>

                      {!selectedProject.dataRealEntrega && (
                        <button
                          type="button"
                          className="sf-project-delivery-button"
                          disabled={savingDashboard}
                          onClick={() => {
                            void markProjectDelivered();
                          }}
                        >
                          <CheckCircle2 size={15} />
                          Registrar entrega
                        </button>
                      )}
                    </div>
                  </div>

                  {selectedTimeline.length > 0 && (
                    <div className="sf-project-history">
                      <h4>Histórico recente</h4>

                      {selectedTimeline.map((entry, index) => (
                        <div
                          key={
                            entry.id
                            || `${entry.data || 'timeline'}-${index}`
                          }
                        >
                          <span className="sf-project-history-dot" />

                          <div>
                            <strong>
                              {entry.titulo || 'Atualização do projeto'}
                            </strong>

                            {entry.descricao && (
                              <p>{entry.descricao}</p>
                            )}

                            <small>
                              {entry.data
                                ? new Date(entry.data)
                                  .toLocaleString('pt-BR')
                                : 'Data não informada'}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="sf-project-dashboard-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <Users size={17} />
                      </span>

                      <div>
                        <h3>Equipe, equipamentos e logística</h3>
                        <p>Recursos vinculados especificamente a este trabalho</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="sf-secondary-button"
                      disabled={savingDashboard}
                      onClick={() => {
                        void saveProjectResources();
                      }}
                    >
                      <Save size={15} />
                      {savingDashboard
                        ? 'Salvando...'
                        : 'Salvar recursos'}
                    </button>
                  </header>

                  <div className="sf-project-resources-grid">
                    <div className="sf-project-resource-section">
                      <div className="sf-project-resource-heading">
                        <Users size={16} />
                        <strong>Equipe</strong>
                        <span>
                          {resourceDraft.equipeProjeto.length} selecionado(s)
                        </span>
                      </div>

                      {teamMembers.length > 0 ? (
                        <div className="sf-project-team-picker">
                          {teamMembers.map((member) => {
                            const assignment =
                              resourceDraft.equipeProjeto.find(
                                (item) => (
                                  item.membroId === member.id
                                ),
                              );

                            return (
                              <article
                                key={member.id}
                                className={
                                  assignment ? 'selected' : ''
                                }
                              >
                                <label className="sf-project-resource-check">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(assignment)}
                                    onChange={() => {
                                      toggleTeamMemberForProject(member);
                                    }}
                                  />

                                  <span className="sf-project-team-avatar">
                                    {getMemberInitials(member.nome)}
                                  </span>

                                  <span className="sf-project-resource-member-copy">
                                    <strong>{member.nome}</strong>
                                    <small>
                                      {member.funcao}
                                    </small>
                                  </span>

                                  <span
                                    className={
                                      assignment
                                        ? 'sf-project-member-badge selected'
                                        : 'sf-project-member-badge'
                                    }
                                  >
                                    {assignment
                                      ? 'Selecionado'
                                      : 'Selecionar'}
                                  </span>
                                </label>

                                {assignment && (
                                  <div className="sf-project-team-fields">
                                    <label>
                                      <span>Função no trabalho</span>

                                      <input
                                        value={assignment.funcao}
                                        placeholder="Ex.: Fotógrafo principal"
                                        onChange={(event) => {
                                          updateProjectTeamMember(
                                            member.id,
                                            'funcao',
                                            event.target.value,
                                          );
                                        }}
                                      />
                                    </label>

                                    <label>
                                      <span>Valor da diária</span>

                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={maskCurrency(
                                          assignment.valorDiaria || 0,
                                        )}
                                        placeholder="R$ 0,00"
                                        onChange={(event) => {
                                          updateProjectTeamMember(
                                            member.id,
                                            'valorDiaria',
                                            parseCurrency(
                                              maskCurrency(
                                                event.target.value,
                                              ),
                                            ),
                                          );
                                        }}
                                      />
                                    </label>

                                    <label>
                                      <span>Horário de chegada</span>

                                      <input
                                        type="time"
                                        value={
                                          assignment.horarioChegada
                                        }
                                        onChange={(event) => {
                                          updateProjectTeamMember(
                                            member.id,
                                            'horarioChegada',
                                            event.target.value,
                                          );
                                        }}
                                      />
                                    </label>

                                    <label className="sf-project-team-confirm">
                                      <span>Status</span>

                                      <span className="sf-project-team-confirm-control">
                                        <input
                                          type="checkbox"
                                          checked={
                                            assignment.confirmado
                                          }
                                          onChange={(event) => {
                                            updateProjectTeamMember(
                                              member.id,
                                              'confirmado',
                                              event.target.checked,
                                            );
                                          }}
                                        />

                                        {assignment.confirmado
                                          ? 'Confirmado'
                                          : 'Aguardando confirmação'}
                                      </span>
                                    </label>

                                    <label className="wide">
                                      <span>Observações para este trabalho</span>

                                      <input
                                        value={
                                          assignment.observacoes
                                        }
                                        placeholder="Ex.: Responsável pelos votos e making of"
                                        onChange={(event) => {
                                          updateProjectTeamMember(
                                            member.id,
                                            'observacoes',
                                            event.target.value,
                                          );
                                        }}
                                      />
                                    </label>
                                  </div>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="sf-project-resource-empty">
                          Cadastre membros em Configurações → Equipe e Permissões.
                        </div>
                      )}
                    </div>

                    <div className="sf-project-resource-section">
                      <div className="sf-project-resource-heading">
                        <Wrench size={16} />
                        <strong>Equipamentos</strong>
                        <span>
                          {resourceDraft.equipamentoIds.length} selecionado(s)
                        </span>
                      </div>

                      {equipment.length > 0 ? (
                        <div className="sf-project-equipment-picker">
                          {equipment.map((item) => {
                            const selected =
                              resourceDraft.equipamentoIds.some(
                                (id) => (
                                  String(id)
                                  === String(item.id)
                                ),
                              );

                            return (
                              <label
                                key={item.id}
                                className={
                                  selected ? 'selected' : ''
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => {
                                    toggleEquipmentForProject(
                                      item.id,
                                    );
                                  }}
                                />

                                <span>
                                  <strong>
                                    {item.nome
                                      || item.modelo
                                      || 'Equipamento'}
                                  </strong>

                                  <small>
                                    {item.situacao
                                      || 'disponível'}
                                  </small>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="sf-project-resource-empty">
                          Nenhum equipamento cadastrado no acervo.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="sf-project-logistics-grid">
                    <label>
                      Transporte

                      <input
                        value={
                          resourceDraft.logistica.transporte
                        }
                        placeholder="Ex.: Carro próprio"
                        onChange={(event) => {
                          setResourceDraft((draft) => ({
                            ...draft,
                            logistica: {
                              ...draft.logistica,
                              transporte: event.target.value,
                            },
                          }));
                        }}
                      />
                    </label>

                    <label>
                      Horário de saída

                      <input
                        type="time"
                        value={
                          resourceDraft.logistica.horarioSaida
                        }
                        onChange={(event) => {
                          setResourceDraft((draft) => ({
                            ...draft,
                            logistica: {
                              ...draft.logistica,
                              horarioSaida: event.target.value,
                            },
                          }));
                        }}
                      />
                    </label>

                    <label className="wide">
                      Observações de logística

                      <textarea
                        rows="2"
                        value={
                          resourceDraft.logistica.observacoes
                        }
                        placeholder="Rota, alimentação, hospedagem, pontos de encontro..."
                        onChange={(event) => {
                          setResourceDraft((draft) => ({
                            ...draft,
                            logistica: {
                              ...draft.logistica,
                              observacoes: event.target.value,
                            },
                          }));
                        }}
                      />
                    </label>
                  </div>
                </section>

                <section className="sf-project-dashboard-panel sf-project-profitability-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <TrendingUp size={17} />
                      </span>

                      <div>
                        <h3>Custos e rentabilidade</h3>
                        <p>Resultado financeiro específico deste trabalho</p>
                      </div>
                    </div>

                    <div className="sf-project-profitability-actions">
                      <button
                        type="button"
                        className="sf-secondary-button"
                        onClick={() => {
                          setShowExpenseForm((current) => !current);
                        }}
                      >
                        <Plus size={15} />
                        Adicionar despesa
                      </button>

                      <button
                        type="button"
                        className="sf-secondary-button"
                        disabled={savingDashboard}
                        onClick={() => {
                          void saveProjectProfitability();
                        }}
                      >
                        <Save size={15} />
                        {savingDashboard ? 'Salvando...' : 'Salvar custos'}
                      </button>
                    </div>
                  </header>

                  <div className="sf-project-profitability-summary">
                    <DashboardMetric
                      icon={<Wallet size={17} />}
                      label="Receita contratada"
                      value={formatMoney(selectedRevenueBase)}
                    />

                    <DashboardMetric
                      icon={<Users size={17} />}
                      label="Custo da equipe"
                      value={formatMoney(selectedTeamCost)}
                    />

                    <DashboardMetric
                      icon={<Receipt size={17} />}
                      label="Despesas vinculadas"
                      value={formatMoney(selectedExpenseTotal)}
                    />

                    <DashboardMetric
                      icon={<TrendingUp size={17} />}
                      label="Lucro estimado"
                      value={formatMoney(selectedEstimatedProfit)}
                      secondary={`${selectedProfitMargin.toFixed(1)}% de margem`}
                      tone={
                        selectedEstimatedProfit < 0
                          ? 'warning'
                          : 'success'
                      }
                    />
                  </div>

                  {selectedProfitMargin < 20 && selectedRevenueBase > 0 && (
                    <div
                      className={
                        `sf-project-profit-alert ${
                          selectedEstimatedProfit < 0 ? 'danger' : ''
                        }`
                      }
                    >
                      <AlertTriangle size={16} />

                      <span>
                        {selectedEstimatedProfit < 0
                          ? 'Este trabalho está projetado com prejuízo.'
                          : 'A margem estimada deste trabalho está abaixo de 20%.'}
                      </span>
                    </div>
                  )}

                  <div className="sf-project-profit-cost-grid">
                    {[
                      ['transporte', 'Transporte'],
                      ['alimentacao', 'Alimentação'],
                      ['hospedagem', 'Hospedagem'],
                      ['outros', 'Outros custos'],
                    ].map(([key, label]) => (
                      <label key={key}>
                        <span>{label}</span>

                        <input
                          type="text"
                          inputMode="numeric"
                          value={profitDraft[key]}
                          placeholder="R$ 0,00"
                          onChange={(event) => {
                            setProfitDraft((draft) => ({
                              ...draft,
                              [key]: maskCurrency(event.target.value),
                            }));
                          }}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="sf-project-profit-total">
                    <div>
                      <span>Equipe</span>
                      <strong>{formatMoney(selectedTeamCost)}</strong>
                    </div>

                    <div>
                      <span>Logística e adicionais</span>
                      <strong>{formatMoney(selectedLogisticsCost)}</strong>
                    </div>

                    <div>
                      <span>Despesas do financeiro</span>
                      <strong>{formatMoney(selectedExpenseTotal)}</strong>
                    </div>

                    <div className="highlight">
                      <span>Custo total estimado</span>
                      <strong>{formatMoney(selectedTotalCost)}</strong>
                    </div>
                  </div>

                  {showExpenseForm && (
                    <div className="sf-project-expense-form">
                      <label className="wide">
                        <span>Descrição da despesa</span>

                        <input
                          value={expenseDraft.descricao}
                          placeholder="Ex.: Combustível para deslocamento"
                          onChange={(event) => {
                            setExpenseDraft((draft) => ({
                              ...draft,
                              descricao: event.target.value,
                            }));
                          }}
                        />
                      </label>

                      <label>
                        <span>Categoria</span>

                        <select
                          value={expenseDraft.categoria}
                          onChange={(event) => {
                            setExpenseDraft((draft) => ({
                              ...draft,
                              categoria: event.target.value,
                            }));
                          }}
                        >
                          <option value="Freelancer">Freelancer</option>
                          <option value="Transporte">Transporte</option>
                          <option value="Hospedagem">Hospedagem</option>
                          <option value="Alimentação em trabalho">
                            Alimentação em trabalho
                          </option>
                          <option value="Impressão">Impressão</option>
                          <option value="Álbum">Álbum</option>
                          <option value="Materiais">Materiais</option>
                          <option value="Taxas">Taxas</option>
                          <option value="Outras">Outras</option>
                        </select>
                      </label>

                      <label>
                        <span>Valor</span>

                        <input
                          type="text"
                          inputMode="numeric"
                          value={expenseDraft.valor}
                          placeholder="R$ 0,00"
                          onChange={(event) => {
                            setExpenseDraft((draft) => ({
                              ...draft,
                              valor: maskCurrency(event.target.value),
                            }));
                          }}
                        />
                      </label>

                      <label>
                        <span>Vencimento</span>

                        <input
                          type="date"
                          value={expenseDraft.vencimento}
                          onChange={(event) => {
                            setExpenseDraft((draft) => ({
                              ...draft,
                              vencimento: event.target.value,
                            }));
                          }}
                        />
                      </label>

                      <label>
                        <span>Status</span>

                        <select
                          value={expenseDraft.status}
                          onChange={(event) => {
                            setExpenseDraft((draft) => ({
                              ...draft,
                              status: event.target.value,
                            }));
                          }}
                        >
                          <option value="Pendente">Pendente</option>
                          <option value="Pago">Pago</option>
                        </select>
                      </label>

                      <div className="sf-project-expense-actions wide">
                        <button
                          type="button"
                          className="sf-secondary-button"
                          onClick={() => setShowExpenseForm(false)}
                        >
                          Cancelar
                        </button>

                        <button
                          type="button"
                          className="sf-project-delivery-button"
                          disabled={savingDashboard}
                          onClick={() => {
                            void addProjectExpense();
                          }}
                        >
                          <Plus size={15} />
                          Salvar despesa
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedLinkedExpenses.length > 0 && (
                    <div className="sf-project-expense-list">
                      <h4>Despesas vinculadas</h4>

                      {selectedLinkedExpenses.slice(0, 6).map((expense) => (
                        <div key={expense.id}>
                          <span>
                            <strong>{expense.descricao}</strong>
                            <small>
                              {expense.categoria || 'Sem categoria'}
                            </small>
                          </span>

                          <strong>{formatMoney(expense.valor)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="sf-project-dashboard-panel sf-project-documents-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <FileText size={17} />
                      </span>

                      <div>
                        <h3>Documentos e entregas</h3>
                        <p>Contratos, propostas e links vinculados ao trabalho</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="sf-secondary-button"
                      disabled={savingDashboard}
                      onClick={() => {
                        void saveProjectDocuments();
                      }}
                    >
                      <Save size={15} />
                      {savingDashboard
                        ? 'Salvando...'
                        : 'Salvar documentos'}
                    </button>
                  </header>

                  <div className="sf-project-document-summary">
                    <div>
                      <strong>{selectedDocuments.length}</strong>
                      <span>documento(s)</span>
                    </div>

                    <div>
                      <strong>{selectedContracts.length}</strong>
                      <span>contrato(s)</span>
                    </div>

                    <div>
                      <strong>
                        {deliveryDraft.recebido ? 'Sim' : 'Não'}
                      </strong>
                      <span>recebimento confirmado</span>
                    </div>
                  </div>

                  {(selectedDocuments.length > 0
                    || selectedContracts.length > 0) && (
                    <div className="sf-project-linked-documents">
                      {selectedDocuments.map((document) => (
                        <article key={document.id}>
                          <span className="sf-project-linked-document-icon">
                            <FileText size={15} />
                          </span>

                          <div>
                            <strong>
                              {document.title || document.type || 'Documento'}
                            </strong>
                            <small>
                              {document.type || 'documento'} ·{' '}
                              {document.status || 'rascunho'}
                            </small>
                          </div>

                          <span className="sf-project-document-status">
                            {document.status || 'rascunho'}
                          </span>
                        </article>
                      ))}

                      {selectedContracts.map((contract) => (
                        <article key={contract.id}>
                          <span className="sf-project-linked-document-icon">
                            <FileText size={15} />
                          </span>

                          <div>
                            <strong>
                              {contract.titulo || 'Contrato'}
                            </strong>
                            <small>
                              {formatMoney(contract.valorTotal || 0)}
                            </small>
                          </div>

                          <span className="sf-project-document-status">
                            {contract.status || 'rascunho'}
                          </span>
                        </article>
                      ))}
                    </div>
                  )}

                  <div className="sf-project-delivery-links">
                    {[
                      {
                        key: 'galeriaUrl',
                        label: 'Galeria de fotos',
                        placeholder: 'https://galeria...',
                      },
                      {
                        key: 'filmeUrl',
                        label: 'Filme',
                        placeholder: 'https://youtube.com/...',
                      },
                      {
                        key: 'driveUrl',
                        label: 'Pasta do Drive',
                        placeholder: 'https://drive.google.com/...',
                      },
                    ].map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>

                        <div className="sf-project-link-input">
                          <Link2 size={15} />

                          <input
                            type="url"
                            value={deliveryDraft[field.key]}
                            placeholder={field.placeholder}
                            onChange={(event) => {
                              setDeliveryDraft((draft) => ({
                                ...draft,
                                [field.key]: event.target.value,
                              }));
                            }}
                          />

                          {deliveryDraft[field.key] && (
                            <>
                              <button
                                type="button"
                                title="Copiar link"
                                onClick={() => {
                                  void copyProjectLink(
                                    deliveryDraft[field.key],
                                  );
                                }}
                              >
                                <Copy size={14} />
                              </button>

                              <a
                                href={deliveryDraft[field.key]}
                                target="_blank"
                                rel="noreferrer"
                                title="Abrir link"
                              >
                                <ExternalLink size={14} />
                              </a>
                            </>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="sf-project-delivery-meta">
                    <label>
                      <span>Data de envio</span>

                      <input
                        type="date"
                        value={deliveryDraft.enviadoEm}
                        onChange={(event) => {
                          setDeliveryDraft((draft) => ({
                            ...draft,
                            enviadoEm: event.target.value,
                          }));
                        }}
                      />
                    </label>

                    <label className="sf-project-delivery-received">
                      <span>Confirmação</span>

                      <span>
                        <input
                          type="checkbox"
                          checked={deliveryDraft.recebido}
                          onChange={(event) => {
                            setDeliveryDraft((draft) => ({
                              ...draft,
                              recebido: event.target.checked,
                            }));
                          }}
                        />
                        Cliente confirmou o recebimento
                      </span>
                    </label>

                    <label className="wide">
                      <span>Observações da entrega</span>

                      <textarea
                        rows="3"
                        value={deliveryDraft.observacoes}
                        placeholder="Senha da galeria, orientações ou informações enviadas ao cliente"
                        onChange={(event) => {
                          setDeliveryDraft((draft) => ({
                            ...draft,
                            observacoes: event.target.value,
                          }));
                        }}
                      />
                    </label>
                  </div>
                </section>

                <section className="sf-project-dashboard-panel sf-project-history-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <History size={17} />
                      </span>
                      <div>
                        <h3>Histórico completo</h3>
                        <p>Registro das alterações e decisões do trabalho</p>
                      </div>
                    </div>

                    <span className="sf-project-history-count">
                      {selectedTimeline.length} registro(s)
                    </span>
                  </header>

                  {selectedTimeline.length > 0 ? (
                    <div className="sf-project-history-list">
                      {selectedTimeline.map((item) => (
                        <article key={item.id}>
                          <span className="dot" />
                          <div>
                            <strong>
                              {item.titulo || 'Atualização do trabalho'}
                            </strong>
                            <small>
                              {item.data
                                ? formatProjectDate(item.data)
                                : 'Data não informada'}
                            </small>
                            {item.descricao && <p>{item.descricao}</p>}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="sf-project-resource-empty">
                      Nenhum registro no histórico deste trabalho.
                    </div>
                  )}
                </section>

                <section className="sf-project-dashboard-panel sf-project-governance-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <ShieldCheck size={17} />
                      </span>

                      <div>
                        <h3>Governança e encerramento</h3>
                        <p>Cinco controles para proteger, registrar e concluir o trabalho</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="sf-secondary-button"
                      disabled={savingDashboard}
                      onClick={() => {
                        void saveGovernance();
                      }}
                    >
                      <Save size={15} />
                      {savingDashboard
                        ? 'Salvando...'
                        : 'Salvar governança'}
                    </button>
                  </header>

                  <div className="sf-project-governance-sections">
                    <details open>
                      <summary>
                        <span>
                          <FileCheck2 size={16} />
                          Obrigações e conferências
                        </span>

                        <small>01</small>
                      </summary>

                      <div className="sf-project-governance-checks">
                        {[
                          ['contratoAssinado', 'Contrato assinado'],
                          ['sinalRecebido', 'Sinal ou entrada recebida'],
                          ['cronogramaAprovado', 'Cronograma aprovado'],
                          ['autorizacoesRecebidas', 'Autorizações recebidas'],
                          ['dadosConferidos', 'Dados do cliente conferidos'],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <span>{label}</span>

                            <input
                              type="checkbox"
                              checked={
                                governanceDraft.obrigacoes[key]
                              }
                              onChange={(event) => {
                                updateGovernanceSection(
                                  'obrigacoes',
                                  key,
                                  event.target.checked,
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>

                      <div className="sf-project-governance-grid">
                        <label className="wide">
                          <span>Observações</span>

                          <textarea
                            rows="3"
                            value={governanceDraft.obrigacoes.observacoes}
                            placeholder="Pendências contratuais, confirmações ou documentos faltantes"
                            onChange={(event) => {
                              updateGovernanceSection(
                                'obrigacoes',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <History size={16} />
                          Solicitações de alteração
                        </span>

                        <small>{governanceDraft.alteracoes.length}</small>
                      </summary>

                      <div className="sf-project-governance-grid">
                        <label className="wide">
                          <span>Alteração solicitada</span>

                          <input
                            value={governanceEntry.alteracao.titulo}
                            placeholder="Ex.: Acrescentar duas horas de cobertura"
                            onChange={(event) => {
                              updateGovernanceEntry(
                                'alteracao',
                                'titulo',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Solicitado por</span>

                          <input
                            value={governanceEntry.alteracao.solicitadoPor}
                            placeholder="Nome da pessoa"
                            onChange={(event) => {
                              updateGovernanceEntry(
                                'alteracao',
                                'solicitadoPor',
                                capitalizeName(event.target.value),
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Data</span>

                          <input
                            type="date"
                            value={governanceEntry.alteracao.data}
                            onChange={(event) => {
                              updateGovernanceEntry(
                                'alteracao',
                                'data',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Impacto no prazo</span>

                          <input
                            value={governanceEntry.alteracao.impactoPrazo}
                            placeholder="Ex.: +7 dias"
                            onChange={(event) => {
                              updateGovernanceEntry(
                                'alteracao',
                                'impactoPrazo',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Impacto no valor</span>

                          <input
                            type="text"
                            inputMode="numeric"
                            value={governanceEntry.alteracao.impactoValor}
                            placeholder="R$ 0,00"
                            onChange={(event) => {
                              updateGovernanceEntry(
                                'alteracao',
                                'impactoValor',
                                maskCurrency(event.target.value),
                              );
                            }}
                          />
                        </label>

                        <label className="sf-project-governance-toggle wide">
                          <span>Alteração aprovada</span>

                          <input
                            type="checkbox"
                            checked={governanceEntry.alteracao.aprovado}
                            onChange={(event) => {
                              updateGovernanceEntry(
                                'alteracao',
                                'aprovado',
                                event.target.checked,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observação</span>

                          <textarea
                            rows="2"
                            value={governanceEntry.alteracao.observacao}
                            placeholder="O que foi combinado e como será executado"
                            onChange={(event) => {
                              updateGovernanceEntry(
                                'alteracao',
                                'observacao',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className="sf-secondary-button wide"
                          onClick={addGovernanceChange}
                        >
                          <Plus size={15} />
                          Adicionar alteração
                        </button>
                      </div>

                      <div className="sf-project-governance-list">
                        {governanceDraft.alteracoes.map((item) => (
                          <article key={item.id}>
                            <div>
                              <strong>{item.titulo}</strong>
                              <small>
                                {[
                                  item.solicitadoPor,
                                  item.data
                                    ? formatProjectDate(item.data)
                                    : '',
                                  item.aprovado
                                    ? 'Aprovada'
                                    : 'Pendente',
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </small>

                              <p>
                                {item.impactoPrazo
                                  ? `Prazo: ${item.impactoPrazo}. `
                                  : ''}
                                {Number(item.impactoValor || 0) > 0
                                  ? `Valor: ${formatMoney(item.impactoValor)}.`
                                  : ''}
                              </p>

                              {item.observacao && (
                                <p>{item.observacao}</p>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                removeGovernanceItem(
                                  'alteracoes',
                                  item.id,
                                );
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </article>
                        ))}
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <LockKeyhole size={16} />
                          Privacidade e proteção de dados
                        </span>

                        <small>03</small>
                      </summary>

                      <div className="sf-project-governance-checks">
                        {[
                          ['acessoRestrito', 'Acesso restrito aos arquivos'],
                          ['consentimentoPublicacao', 'Consentimento de publicação registrado'],
                          ['dadosSensiveisRevisados', 'Dados sensíveis revisados'],
                          ['prazoRetencaoDefinido', 'Prazo de retenção definido'],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <span>{label}</span>

                            <input
                              type="checkbox"
                              checked={
                                governanceDraft.privacidade[key]
                              }
                              onChange={(event) => {
                                updateGovernanceSection(
                                  'privacidade',
                                  key,
                                  event.target.checked,
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>

                      <div className="sf-project-governance-grid">
                        <label className="wide">
                          <span>Observações</span>

                          <textarea
                            rows="3"
                            value={governanceDraft.privacidade.observacoes}
                            placeholder="Restrições de acesso, publicação, compartilhamento ou armazenamento"
                            onChange={(event) => {
                              updateGovernanceSection(
                                'privacidade',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <AlertOctagon size={16} />
                          Registro de ocorrências
                        </span>

                        <small>{governanceDraft.ocorrencias.length}</small>
                      </summary>

                      <div className="sf-project-governance-grid">
                        <label className="wide">
                          <span>Ocorrência</span>

                          <input
                            value={governanceEntry.ocorrencia.titulo}
                            placeholder="Ex.: Atraso no início da cerimônia"
                            onChange={(event) => {
                              updateGovernanceEntry(
                                'ocorrencia',
                                'titulo',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Data</span>

                          <input
                            type="date"
                            value={governanceEntry.ocorrencia.data}
                            onChange={(event) => {
                              updateGovernanceEntry(
                                'ocorrencia',
                                'data',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Gravidade</span>

                          <select
                            value={governanceEntry.ocorrencia.gravidade}
                            onChange={(event) => {
                              updateGovernanceEntry(
                                'ocorrencia',
                                'gravidade',
                                event.target.value,
                              );
                            }}
                          >
                            <option value="baixa">Baixa</option>
                            <option value="media">Média</option>
                            <option value="alta">Alta</option>
                            <option value="critica">Crítica</option>
                          </select>
                        </label>

                        <label>
                          <span>Responsável</span>

                          <input
                            value={governanceEntry.ocorrencia.responsavel}
                            placeholder="Quem acompanhou"
                            onChange={(event) => {
                              updateGovernanceEntry(
                                'ocorrencia',
                                'responsavel',
                                capitalizeName(event.target.value),
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Resolução</span>

                          <textarea
                            rows="2"
                            value={governanceEntry.ocorrencia.resolucao}
                            placeholder="Como a situação foi resolvida"
                            onChange={(event) => {
                              updateGovernanceEntry(
                                'ocorrencia',
                                'resolucao',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className="sf-secondary-button wide"
                          onClick={addGovernanceIncident}
                        >
                          <Plus size={15} />
                          Adicionar ocorrência
                        </button>
                      </div>

                      <div className="sf-project-governance-list">
                        {governanceDraft.ocorrencias.map((item) => (
                          <article key={item.id}>
                            <div>
                              <strong>{item.titulo}</strong>
                              <small>
                                {[
                                  item.data
                                    ? formatProjectDate(item.data)
                                    : '',
                                  item.gravidade,
                                  item.responsavel,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </small>

                              {item.resolucao && (
                                <p>{item.resolucao}</p>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                removeGovernanceItem(
                                  'ocorrencias',
                                  item.id,
                                );
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </article>
                        ))}
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <Stamp size={16} />
                          Encerramento do trabalho
                        </span>

                        <small>05</small>
                      </summary>

                      <div className="sf-project-governance-checks">
                        {[
                          ['pendenciasResolvidas', 'Pendências resolvidas'],
                          ['financeiroConferido', 'Financeiro conferido'],
                          ['arquivosConferidos', 'Arquivos e backups conferidos'],
                          ['clienteNotificado', 'Cliente notificado do encerramento'],
                          ['projetoEncerrado', 'Projeto oficialmente encerrado'],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <span>{label}</span>

                            <input
                              type="checkbox"
                              checked={
                                governanceDraft.encerramento[key]
                              }
                              onChange={(event) => {
                                updateGovernanceSection(
                                  'encerramento',
                                  key,
                                  event.target.checked,
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>

                      <div className="sf-project-governance-grid">
                        <label>
                          <span>Data de encerramento</span>

                          <input
                            type="date"
                            value={
                              governanceDraft
                                .encerramento.dataEncerramento
                            }
                            onChange={(event) => {
                              updateGovernanceSection(
                                'encerramento',
                                'dataEncerramento',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observações finais</span>

                          <textarea
                            rows="3"
                            value={
                              governanceDraft.encerramento.observacoes
                            }
                            placeholder="Resumo final, pendências futuras ou aprendizados"
                            onChange={(event) => {
                              updateGovernanceSection(
                                'encerramento',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>
                  </div>
                </section>

                <section className="sf-project-dashboard-panel sf-project-client-experience-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <Heart size={17} />
                      </span>

                      <div>
                        <h3>Experiência e personalização</h3>
                        <p>Cinco controles para atender cada cliente com mais cuidado</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="sf-secondary-button"
                      disabled={savingDashboard}
                      onClick={() => {
                        void saveClientExperience();
                      }}
                    >
                      <Save size={15} />
                      {savingDashboard
                        ? 'Salvando...'
                        : 'Salvar experiência'}
                    </button>
                  </header>

                  <div className="sf-project-client-experience-sections">
                    <details open>
                      <summary>
                        <span>
                          <Heart size={16} />
                          Preferências do cliente
                        </span>

                        <small>01</small>
                      </summary>

                      <div className="sf-project-client-experience-grid">
                        <label>
                          <span>Como prefere ser chamado</span>

                          <input
                            value={
                              clientExperienceDraft
                                .preferencias.tratamentoPreferido
                            }
                            placeholder="Ex.: Camilla e Junior"
                            onChange={(event) => {
                              updateClientExperienceSection(
                                'preferencias',
                                'tratamentoPreferido',
                                capitalizeName(event.target.value),
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Canal preferido</span>

                          <select
                            value={
                              clientExperienceDraft
                                .preferencias.canalPreferido
                            }
                            onChange={(event) => {
                              updateClientExperienceSection(
                                'preferencias',
                                'canalPreferido',
                                event.target.value,
                              );
                            }}
                          >
                            <option value="WhatsApp">WhatsApp</option>
                            <option value="Ligação">Ligação</option>
                            <option value="E-mail">E-mail</option>
                            <option value="Reunião">Reunião</option>
                          </select>
                        </label>

                        <label>
                          <span>Melhor horário para contato</span>

                          <input
                            value={
                              clientExperienceDraft
                                .preferencias.horarioContato
                            }
                            placeholder="Ex.: Após as 18h"
                            onChange={(event) => {
                              updateClientExperienceSection(
                                'preferencias',
                                'horarioContato',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Estilo de direção</span>

                          <select
                            value={
                              clientExperienceDraft
                                .preferencias.estiloDirecao
                            }
                            onChange={(event) => {
                              updateClientExperienceSection(
                                'preferencias',
                                'estiloDirecao',
                                event.target.value,
                              );
                            }}
                          >
                            <option value="">Não informado</option>
                            <option value="Discreta">Discreta</option>
                            <option value="Guiada">Guiada</option>
                            <option value="Espontânea">Espontânea</option>
                            <option value="Mista">Mista</option>
                          </select>
                        </label>

                        <label className="wide">
                          <span>Preferências de privacidade</span>

                          <textarea
                            rows="2"
                            value={
                              clientExperienceDraft
                                .preferencias.privacidade
                            }
                            placeholder="Pessoas que não devem aparecer, restrições de postagem ou perfis fechados"
                            onChange={(event) => {
                              updateClientExperienceSection(
                                'preferencias',
                                'privacidade',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observações</span>

                          <textarea
                            rows="2"
                            value={
                              clientExperienceDraft
                                .preferencias.observacoes
                            }
                            placeholder="Detalhes pessoais importantes para o atendimento"
                            onChange={(event) => {
                              updateClientExperienceSection(
                                'preferencias',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <Users size={16} />
                          Grupos familiares
                        </span>

                        <small>
                          {clientExperienceDraft.gruposFamiliares.length}
                        </small>
                      </summary>

                      <div className="sf-project-client-experience-grid">
                        <label>
                          <span>Nome do grupo</span>

                          <input
                            value={
                              clientExperienceEntry
                                .grupoFamiliar.titulo
                            }
                            placeholder="Ex.: Família da noiva"
                            onChange={(event) => {
                              updateClientExperienceEntry(
                                'grupoFamiliar',
                                'titulo',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Prioridade</span>

                          <select
                            value={
                              clientExperienceEntry
                                .grupoFamiliar.prioridade
                            }
                            onChange={(event) => {
                              updateClientExperienceEntry(
                                'grupoFamiliar',
                                'prioridade',
                                event.target.value,
                              );
                            }}
                          >
                            <option value="normal">Normal</option>
                            <option value="alta">Alta</option>
                            <option value="obrigatoria">Obrigatória</option>
                          </select>
                        </label>

                        <label className="wide">
                          <span>Pessoas</span>

                          <input
                            value={
                              clientExperienceEntry
                                .grupoFamiliar.pessoas
                            }
                            placeholder="Ex.: Noiva, mãe, pai, irmãos e avós"
                            onChange={(event) => {
                              updateClientExperienceEntry(
                                'grupoFamiliar',
                                'pessoas',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observação</span>

                          <input
                            value={
                              clientExperienceEntry
                                .grupoFamiliar.observacao
                            }
                            placeholder="Ordem, local ou cuidado especial"
                            onChange={(event) => {
                              updateClientExperienceEntry(
                                'grupoFamiliar',
                                'observacao',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className="sf-secondary-button wide"
                          onClick={addFamilyGroup}
                        >
                          <Plus size={15} />
                          Adicionar grupo
                        </button>
                      </div>

                      <div className="sf-project-client-experience-list">
                        {clientExperienceDraft.gruposFamiliares.map(
                          (item) => (
                            <article key={item.id}>
                              <div>
                                <strong>{item.titulo}</strong>
                                <small>
                                  {item.pessoas} · {item.prioridade}
                                </small>

                                {item.observacao && (
                                  <p>{item.observacao}</p>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  removeClientExperienceItem(
                                    'gruposFamiliares',
                                    item.id,
                                  );
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </article>
                          ),
                        )}
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <Accessibility size={16} />
                          Acessibilidade e sensibilidades
                        </span>

                        <small>03</small>
                      </summary>

                      <div className="sf-project-client-experience-checks">
                        {[
                          ['mobilidadeReduzida', 'Mobilidade reduzida'],
                          ['restricaoAuditiva', 'Restrição auditiva'],
                          ['restricaoVisual', 'Restrição visual'],
                          ['neurodivergencia', 'Neurodivergência ou sensibilidade'],
                          ['gestanteIdoso', 'Gestante, idoso ou criança pequena'],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <span>{label}</span>

                            <input
                              type="checkbox"
                              checked={
                                clientExperienceDraft.acessibilidade[key]
                              }
                              onChange={(event) => {
                                updateClientExperienceSection(
                                  'acessibilidade',
                                  key,
                                  event.target.checked,
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>

                      <div className="sf-project-client-experience-grid">
                        <label className="wide">
                          <span>Orientações específicas</span>

                          <textarea
                            rows="3"
                            value={
                              clientExperienceDraft
                                .acessibilidade.observacoes
                            }
                            placeholder="Tempo de descanso, ruídos, iluminação, deslocamento ou comunicação"
                            onChange={(event) => {
                              updateClientExperienceSection(
                                'acessibilidade',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <PartyPopper size={16} />
                          Surpresas e momentos especiais
                        </span>

                        <small>
                          {clientExperienceDraft.momentosEspeciais.length}
                        </small>
                      </summary>

                      <div className="sf-project-client-experience-grid">
                        <label className="wide">
                          <span>Momento especial</span>

                          <input
                            value={
                              clientExperienceEntry
                                .momentoEspecial.titulo
                            }
                            placeholder="Ex.: Presente surpresa dos pais"
                            onChange={(event) => {
                              updateClientExperienceEntry(
                                'momentoEspecial',
                                'titulo',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Horário</span>

                          <input
                            type="time"
                            value={
                              clientExperienceEntry
                                .momentoEspecial.horario
                            }
                            onChange={(event) => {
                              updateClientExperienceEntry(
                                'momentoEspecial',
                                'horario',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Responsável</span>

                          <input
                            value={
                              clientExperienceEntry
                                .momentoEspecial.responsavel
                            }
                            placeholder="Quem vai organizar"
                            onChange={(event) => {
                              updateClientExperienceEntry(
                                'momentoEspecial',
                                'responsavel',
                                capitalizeName(event.target.value),
                              );
                            }}
                          />
                        </label>

                        <label className="sf-project-client-experience-toggle wide">
                          <span>Informação confidencial para o cliente</span>

                          <input
                            type="checkbox"
                            checked={
                              clientExperienceEntry
                                .momentoEspecial.segredo
                            }
                            onChange={(event) => {
                              updateClientExperienceEntry(
                                'momentoEspecial',
                                'segredo',
                                event.target.checked,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observação</span>

                          <input
                            value={
                              clientExperienceEntry
                                .momentoEspecial.observacao
                            }
                            placeholder="Posicionamento da equipe ou orientação especial"
                            onChange={(event) => {
                              updateClientExperienceEntry(
                                'momentoEspecial',
                                'observacao',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className="sf-secondary-button wide"
                          onClick={addSpecialMoment}
                        >
                          <Plus size={15} />
                          Adicionar momento
                        </button>
                      </div>

                      <div className="sf-project-client-experience-list">
                        {clientExperienceDraft.momentosEspeciais.map(
                          (item) => (
                            <article key={item.id}>
                              <div>
                                <strong>{item.titulo}</strong>
                                <small>
                                  {[
                                    item.horario,
                                    item.responsavel,
                                    item.segredo ? 'Confidencial' : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </small>

                                {item.observacao && (
                                  <p>{item.observacao}</p>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  removeClientExperienceItem(
                                    'momentosEspeciais',
                                    item.id,
                                  );
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </article>
                          ),
                        )}
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <UtensilsCrossed size={16} />
                          Hospitalidade e conforto
                        </span>

                        <small>05</small>
                      </summary>

                      <div className="sf-project-client-experience-checks">
                        {[
                          ['aguaDisponivel', 'Água disponível'],
                          ['refeicaoEquipe', 'Refeição da equipe confirmada'],
                          ['localDescanso', 'Local de descanso disponível'],
                          ['tomadaEnergia', 'Tomada ou energia disponível'],
                          ['banheiroProximo', 'Banheiro próximo'],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <span>{label}</span>

                            <input
                              type="checkbox"
                              checked={
                                clientExperienceDraft.hospitalidade[key]
                              }
                              onChange={(event) => {
                                updateClientExperienceSection(
                                  'hospitalidade',
                                  key,
                                  event.target.checked,
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>

                      <div className="sf-project-client-experience-grid">
                        <label className="wide">
                          <span>Observações</span>

                          <textarea
                            rows="3"
                            value={
                              clientExperienceDraft
                                .hospitalidade.observacoes
                            }
                            placeholder="Restrições alimentares, pausas, armazenamento ou necessidades da equipe"
                            onChange={(event) => {
                              updateClientExperienceSection(
                                'hospitalidade',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>
                  </div>
                </section>

                <section className="sf-project-dashboard-panel sf-project-preparation-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <CalendarDays size={17} />
                      </span>

                      <div>
                        <h3>Central de preparação</h3>
                        <p>Cinco controles para organizar tudo antes do trabalho</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="sf-secondary-button"
                      disabled={savingDashboard}
                      onClick={() => {
                        void savePreparationCenter();
                      }}
                    >
                      <Save size={15} />
                      {savingDashboard
                        ? 'Salvando...'
                        : 'Salvar preparação'}
                    </button>
                  </header>

                  <div className="sf-project-preparation-sections">
                    <details open>
                      <summary>
                        <span>
                          <CalendarDays size={16} />
                          Reuniões e compromissos
                        </span>

                        <small>{preparationDraft.reunioes.length}</small>
                      </summary>

                      <div className="sf-project-preparation-grid">
                        <label>
                          <span>Título</span>

                          <input
                            value={preparationEntry.reuniao.titulo}
                            placeholder="Ex.: Reunião final com o casal"
                            onChange={(event) => {
                              updatePreparationEntry(
                                'reuniao',
                                'titulo',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Data</span>

                          <input
                            type="date"
                            value={preparationEntry.reuniao.data}
                            onChange={(event) => {
                              updatePreparationEntry(
                                'reuniao',
                                'data',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Horário</span>

                          <input
                            type="time"
                            value={preparationEntry.reuniao.horario}
                            onChange={(event) => {
                              updatePreparationEntry(
                                'reuniao',
                                'horario',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Local ou link</span>

                          <input
                            value={preparationEntry.reuniao.local}
                            placeholder="Ex.: Google Meet"
                            onChange={(event) => {
                              updatePreparationEntry(
                                'reuniao',
                                'local',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observação</span>

                          <input
                            value={preparationEntry.reuniao.observacao}
                            placeholder="Pauta ou informações importantes"
                            onChange={(event) => {
                              updatePreparationEntry(
                                'reuniao',
                                'observacao',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className="sf-secondary-button wide"
                          onClick={addPreparationMeeting}
                        >
                          <Plus size={15} />
                          Adicionar reunião
                        </button>
                      </div>

                      <div className="sf-project-preparation-list">
                        {preparationDraft.reunioes.map((item) => (
                          <article key={item.id}>
                            <div>
                              <strong>{item.titulo}</strong>
                              <small>
                                {formatProjectDate(item.data)}
                                {item.horario ? ` · ${item.horario}` : ''}
                                {item.local ? ` · ${item.local}` : ''}
                              </small>

                              {item.observacao && (
                                <p>{item.observacao}</p>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                removePreparationListItem(
                                  'reunioes',
                                  item.id,
                                );
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </article>
                        ))}
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <FileQuestion size={16} />
                          Questionários
                        </span>

                        <small>02</small>
                      </summary>

                      <div className="sf-project-preparation-checks">
                        {[
                          ['casalEnviado', 'Questionário do casal enviado'],
                          ['casalRecebido', 'Questionário do casal recebido'],
                          ['cerimonialEnviado', 'Questionário da cerimonial enviado'],
                          ['cerimonialRecebido', 'Questionário da cerimonial recebido'],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <span>{label}</span>

                            <input
                              type="checkbox"
                              checked={
                                preparationDraft.questionarios[key]
                              }
                              onChange={(event) => {
                                updatePreparationSection(
                                  'questionarios',
                                  key,
                                  event.target.checked,
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>

                      <div className="sf-project-preparation-grid">
                        <label className="wide">
                          <span>Observações</span>

                          <textarea
                            rows="3"
                            value={
                              preparationDraft.questionarios.observacoes
                            }
                            placeholder="Pendências, respostas importantes ou informações incompletas"
                            onChange={(event) => {
                              updatePreparationSection(
                                'questionarios',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <Signature size={16} />
                          Autorizações e permissões
                        </span>

                        <small>03</small>
                      </summary>

                      <div className="sf-project-preparation-checks">
                        {[
                          ['usoImagem', 'Autorização de uso de imagem'],
                          ['acessoLocal', 'Acesso ao local confirmado'],
                          ['autorizacaoDrone', 'Autorização para drone'],
                          ['autorizacaoSom', 'Autorização para captação de áudio'],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <span>{label}</span>

                            <input
                              type="checkbox"
                              checked={
                                preparationDraft.autorizacoes[key]
                              }
                              onChange={(event) => {
                                updatePreparationSection(
                                  'autorizacoes',
                                  key,
                                  event.target.checked,
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>

                      <div className="sf-project-preparation-grid">
                        <label className="wide">
                          <span>Observações</span>

                          <textarea
                            rows="3"
                            value={
                              preparationDraft.autorizacoes.observacoes
                            }
                            placeholder="Regras do local, restrições de voo, som ou publicação"
                            onChange={(event) => {
                              updatePreparationSection(
                                'autorizacoes',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <Hotel size={16} />
                          Viagem e hospedagem
                        </span>

                        <small>04</small>
                      </summary>

                      <div className="sf-project-preparation-checks">
                        {[
                          ['hospedagemReservada', 'Hospedagem reservada'],
                          ['transporteConfirmado', 'Transporte confirmado'],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <span>{label}</span>

                            <input
                              type="checkbox"
                              checked={
                                preparationDraft.viagem[key]
                              }
                              onChange={(event) => {
                                updatePreparationSection(
                                  'viagem',
                                  key,
                                  event.target.checked,
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>

                      <div className="sf-project-preparation-grid">
                        <label>
                          <span>Hotel ou hospedagem</span>

                          <input
                            value={preparationDraft.viagem.hotel}
                            placeholder="Nome e endereço"
                            onChange={(event) => {
                              updatePreparationSection(
                                'viagem',
                                'hotel',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Check-in</span>

                          <input
                            type="date"
                            value={preparationDraft.viagem.checkIn}
                            onChange={(event) => {
                              updatePreparationSection(
                                'viagem',
                                'checkIn',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Check-out</span>

                          <input
                            type="date"
                            value={preparationDraft.viagem.checkOut}
                            onChange={(event) => {
                              updatePreparationSection(
                                'viagem',
                                'checkOut',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observações</span>

                          <textarea
                            rows="3"
                            value={preparationDraft.viagem.observacoes}
                            placeholder="Reserva, estacionamento, bagagem ou horário de saída"
                            onChange={(event) => {
                              updatePreparationSection(
                                'viagem',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <Bell size={16} />
                          Lembretes internos
                        </span>

                        <small>
                          {
                            preparationDraft.lembretes.filter(
                              (item) => !item.concluido,
                            ).length
                          }
                        </small>
                      </summary>

                      <div className="sf-project-preparation-grid">
                        <label className="wide">
                          <span>Lembrete</span>

                          <input
                            value={preparationEntry.lembrete.titulo}
                            placeholder="Ex.: Carregar todas as baterias"
                            onChange={(event) => {
                              updatePreparationEntry(
                                'lembrete',
                                'titulo',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Data</span>

                          <input
                            type="date"
                            value={preparationEntry.lembrete.data}
                            onChange={(event) => {
                              updatePreparationEntry(
                                'lembrete',
                                'data',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Prioridade</span>

                          <select
                            value={preparationEntry.lembrete.prioridade}
                            onChange={(event) => {
                              updatePreparationEntry(
                                'lembrete',
                                'prioridade',
                                event.target.value,
                              );
                            }}
                          >
                            <option value="normal">Normal</option>
                            <option value="alta">Alta</option>
                            <option value="urgente">Urgente</option>
                          </select>
                        </label>

                        <button
                          type="button"
                          className="sf-secondary-button wide"
                          onClick={addPreparationReminder}
                        >
                          <Plus size={15} />
                          Adicionar lembrete
                        </button>
                      </div>

                      <div className="sf-project-preparation-reminders">
                        {preparationDraft.lembretes.map((item) => (
                          <article key={item.id}>
                            <input
                              type="checkbox"
                              checked={Boolean(item.concluido)}
                              onChange={(event) => {
                                updatePreparationListItem(
                                  'lembretes',
                                  item.id,
                                  'concluido',
                                  event.target.checked,
                                );
                              }}
                            />

                            <div>
                              <strong>{item.titulo}</strong>
                              <small>
                                {item.data
                                  ? formatProjectDate(item.data)
                                  : 'Sem data'}
                                {' · '}
                                {item.prioridade}
                              </small>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                removePreparationListItem(
                                  'lembretes',
                                  item.id,
                                );
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </article>
                        ))}
                      </div>
                    </details>
                  </div>
                </section>

                <section className="sf-project-dashboard-panel sf-project-commercial-delivery-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <Gift size={17} />
                      </span>

                      <div>
                        <h3>Entrega comercial e acervo</h3>
                        <p>Cinco controles para concluir e valorizar o trabalho</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="sf-secondary-button"
                      disabled={savingDashboard}
                      onClick={() => {
                        void saveCommercialDelivery();
                      }}
                    >
                      <Save size={15} />
                      {savingDashboard
                        ? 'Salvando...'
                        : 'Salvar entrega comercial'}
                    </button>
                  </header>

                  <div className="sf-project-commercial-progress">
                    <div>
                      <span>Entregáveis concluídos</span>
                      <strong>
                        {selectedDeliverablesCompleted}
                        /
                        {selectedDeliverablesTotal}
                        {' · '}
                        {selectedCommercialDeliveryProgress}%
                      </strong>
                    </div>

                    <div className="track">
                      <span
                        style={{
                          width: `${selectedCommercialDeliveryProgress}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="sf-project-commercial-sections">
                    <details open>
                      <summary>
                        <span>
                          <Gift size={16} />
                          Entregáveis contratados
                        </span>

                        <small>{selectedDeliverablesTotal}</small>
                      </summary>

                      <div className="sf-project-deliverable-form">
                        <label>
                          <span>Novo entregável</span>

                          <input
                            value={newDeliverable.titulo}
                            placeholder="Ex.: Álbum 30x30"
                            onChange={(event) => {
                              setNewDeliverable((draft) => ({
                                ...draft,
                                titulo: event.target.value,
                              }));
                            }}
                          />
                        </label>

                        <label>
                          <span>Prazo</span>

                          <input
                            type="date"
                            value={newDeliverable.prazo}
                            onChange={(event) => {
                              setNewDeliverable((draft) => ({
                                ...draft,
                                prazo: event.target.value,
                              }));
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className="sf-secondary-button"
                          onClick={addCommercialDeliverable}
                        >
                          <Plus size={15} />
                          Adicionar
                        </button>
                      </div>

                      <div className="sf-project-deliverable-list">
                        {commercialDeliveryDraft.entregaveis.map(
                          (item) => (
                            <article key={item.id}>
                              <input
                                type="checkbox"
                                checked={Boolean(item.concluido)}
                                onChange={(event) => {
                                  updateCommercialDeliverable(
                                    item.id,
                                    'concluido',
                                    event.target.checked,
                                  );
                                }}
                              />

                              <div>
                                <strong>{item.titulo}</strong>
                                <small>
                                  {item.prazo
                                    ? `Prazo: ${formatProjectDate(item.prazo)}`
                                    : 'Sem prazo definido'}
                                </small>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  removeCommercialDeliverable(item.id);
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </article>
                          ),
                        )}
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <Share2 size={16} />
                          Conteúdo social
                        </span>

                        <small>02</small>
                      </summary>

                      <div className="sf-project-commercial-checks">
                        {[
                          ['teaserPublicado', 'Teaser publicado'],
                          ['reelsPublicado', 'Reels publicado'],
                          ['carrosselPublicado', 'Carrossel publicado'],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <span>{label}</span>

                            <input
                              type="checkbox"
                              checked={
                                commercialDeliveryDraft.conteudoSocial[key]
                              }
                              onChange={(event) => {
                                updateCommercialDeliverySection(
                                  'conteudoSocial',
                                  key,
                                  event.target.checked,
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>

                      <div className="sf-project-commercial-grid">
                        <label>
                          <span>Data planejada</span>

                          <input
                            type="date"
                            value={
                              commercialDeliveryDraft
                                .conteudoSocial.dataPlanejada
                            }
                            onChange={(event) => {
                              updateCommercialDeliverySection(
                                'conteudoSocial',
                                'dataPlanejada',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Tema da legenda</span>

                          <input
                            value={
                              commercialDeliveryDraft
                                .conteudoSocial.legendaTema
                            }
                            placeholder="Ex.: Casamento na praia em Porto Seguro"
                            onChange={(event) => {
                              updateCommercialDeliverySection(
                                'conteudoSocial',
                                'legendaTema',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observações</span>

                          <textarea
                            rows="2"
                            value={
                              commercialDeliveryDraft
                                .conteudoSocial.observacoes
                            }
                            placeholder="Perfil dos fornecedores, marcações e orientações"
                            onChange={(event) => {
                              updateCommercialDeliverySection(
                                'conteudoSocial',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <LayoutTemplate size={16} />
                          Fluxo do álbum
                        </span>

                        <small>03</small>
                      </summary>

                      <div className="sf-project-commercial-checks">
                        {[
                          ['contratado', 'Álbum contratado'],
                          ['selecaoRecebida', 'Seleção recebida'],
                          ['diagramacaoConcluida', 'Diagramação concluída'],
                          ['aprovadoCliente', 'Aprovado pelo cliente'],
                          ['enviadoGrafica', 'Enviado para a gráfica'],
                          ['entregue', 'Álbum entregue'],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <span>{label}</span>

                            <input
                              type="checkbox"
                              checked={
                                commercialDeliveryDraft.album[key]
                              }
                              onChange={(event) => {
                                updateCommercialDeliverySection(
                                  'album',
                                  key,
                                  event.target.checked,
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>

                      <div className="sf-project-commercial-grid">
                        <label>
                          <span>Quantidade de fotos</span>

                          <input
                            type="number"
                            min="0"
                            value={
                              commercialDeliveryDraft.album.quantidadeFotos
                            }
                            onChange={(event) => {
                              updateCommercialDeliverySection(
                                'album',
                                'quantidadeFotos',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Prazo do álbum</span>

                          <input
                            type="date"
                            value={
                              commercialDeliveryDraft.album.prazo
                            }
                            onChange={(event) => {
                              updateCommercialDeliverySection(
                                'album',
                                'prazo',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observações</span>

                          <textarea
                            rows="2"
                            value={
                              commercialDeliveryDraft.album.observacoes
                            }
                            placeholder="Modelo, acabamento, gráfica ou ajustes da diagramação"
                            onChange={(event) => {
                              updateCommercialDeliverySection(
                                'album',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <Archive size={16} />
                          Acervo e retenção
                        </span>

                        <small>04</small>
                      </summary>

                      <div className="sf-project-commercial-checks">
                        {[
                          ['backupFinalConferido', 'Backup final conferido'],
                          ['podeApagarCartoes', 'Cartões liberados para formatação'],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <span>{label}</span>

                            <input
                              type="checkbox"
                              checked={
                                commercialDeliveryDraft.acervo[key]
                              }
                              onChange={(event) => {
                                updateCommercialDeliverySection(
                                  'acervo',
                                  key,
                                  event.target.checked,
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>

                      <div className="sf-project-commercial-grid">
                        <label>
                          <span>Pasta master</span>

                          <input
                            value={
                              commercialDeliveryDraft.acervo.pastaMaster
                            }
                            placeholder="Ex.: SSD 02 / Casamentos / 2026"
                            onChange={(event) => {
                              updateCommercialDeliverySection(
                                'acervo',
                                'pastaMaster',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Pasta de entrega</span>

                          <input
                            value={
                              commercialDeliveryDraft.acervo.pastaEntrega
                            }
                            placeholder="Ex.: Drive / Cliente / Final"
                            onChange={(event) => {
                              updateCommercialDeliverySection(
                                'acervo',
                                'pastaEntrega',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Manter arquivos até</span>

                          <input
                            type="date"
                            value={
                              commercialDeliveryDraft.acervo.manterAte
                            }
                            onChange={(event) => {
                              updateCommercialDeliverySection(
                                'acervo',
                                'manterAte',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observações</span>

                          <textarea
                            rows="2"
                            value={
                              commercialDeliveryDraft.acervo.observacoes
                            }
                            placeholder="Política de retenção, localização e cuidados com o acervo"
                            onChange={(event) => {
                              updateCommercialDeliverySection(
                                'acervo',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <Star size={16} />
                          Experiência do cliente
                        </span>

                        <small>05</small>
                      </summary>

                      <div className="sf-project-commercial-checks">
                        {[
                          ['indicacaoRecebida', 'Indicação recebida'],
                          ['clienteVip', 'Marcar como cliente VIP'],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <span>{label}</span>

                            <input
                              type="checkbox"
                              checked={
                                commercialDeliveryDraft
                                  .experienciaCliente[key]
                              }
                              onChange={(event) => {
                                updateCommercialDeliverySection(
                                  'experienciaCliente',
                                  key,
                                  event.target.checked,
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>

                      <div className="sf-project-commercial-grid">
                        <label>
                          <span>Nota do cliente</span>

                          <select
                            value={
                              commercialDeliveryDraft
                                .experienciaCliente.nota
                            }
                            onChange={(event) => {
                              updateCommercialDeliverySection(
                                'experienciaCliente',
                                'nota',
                                event.target.value,
                              );
                            }}
                          >
                            <option value="">Não informada</option>
                            {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(
                              (value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ),
                            )}
                          </select>
                        </label>

                        <label>
                          <span>Retorno agendado</span>

                          <input
                            type="date"
                            value={
                              commercialDeliveryDraft
                                .experienciaCliente.retornoAgendado
                            }
                            onChange={(event) => {
                              updateCommercialDeliverySection(
                                'experienciaCliente',
                                'retornoAgendado',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Feedback</span>

                          <textarea
                            rows="3"
                            value={
                              commercialDeliveryDraft
                                .experienciaCliente.feedback
                            }
                            placeholder="O que o cliente mais gostou e o que pode ser melhorado"
                            onChange={(event) => {
                              updateCommercialDeliverySection(
                                'experienciaCliente',
                                'feedback',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Oportunidade futura</span>

                          <textarea
                            rows="2"
                            value={
                              commercialDeliveryDraft
                                .experienciaCliente.oportunidadeFutura
                            }
                            placeholder="Álbum, ensaio de aniversário, gestante, família ou indicação"
                            onChange={(event) => {
                              updateCommercialDeliverySection(
                                'experienciaCliente',
                                'oportunidadeFutura',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>
                  </div>
                </section>

                <section className="sf-project-dashboard-panel sf-project-post-production-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <SlidersHorizontal size={17} />
                      </span>

                      <div>
                        <h3>Pós-produção e qualidade</h3>
                        <p>Cinco controles para acompanhar o material até a entrega</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="sf-secondary-button"
                      disabled={savingDashboard}
                      onClick={() => {
                        void savePostProduction();
                      }}
                    >
                      <Save size={15} />
                      {savingDashboard
                        ? 'Salvando...'
                        : 'Salvar pós-produção'}
                    </button>
                  </header>

                  <div className="sf-project-post-production-progress">
                    <div>
                      <span>Progresso da pós-produção</span>
                      <strong>{selectedPostProductionProgress}%</strong>
                    </div>

                    <div className="track">
                      <span
                        style={{
                          width: `${selectedPostProductionProgress}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="sf-project-post-production-sections">
                    <details open>
                      <summary>
                        <span>
                          <HardDrive size={16} />
                          Backup e segurança
                        </span>

                        <small>
                          {postProductionDraft.backup.cartoesCopiados
                            ? 'Concluído'
                            : 'Pendente'}
                        </small>
                      </summary>

                      <div className="sf-project-post-production-grid">
                        <label className="sf-project-post-production-check wide">
                          <input
                            type="checkbox"
                            checked={
                              postProductionDraft.backup.cartoesCopiados
                            }
                            onChange={(event) => {
                              updatePostProductionSection(
                                'backup',
                                'cartoesCopiados',
                                event.target.checked,
                              );
                            }}
                          />

                          <span>Todos os cartões foram copiados e conferidos</span>
                        </label>

                        <label>
                          <span>Cópia principal</span>

                          <input
                            value={
                              postProductionDraft.backup.copiaPrincipal
                            }
                            placeholder="Ex.: SSD Trabalho 01"
                            onChange={(event) => {
                              updatePostProductionSection(
                                'backup',
                                'copiaPrincipal',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Cópia de segurança</span>

                          <input
                            value={
                              postProductionDraft.backup.copiaSeguranca
                            }
                            placeholder="Ex.: HD Backup Casamentos"
                            onChange={(event) => {
                              updatePostProductionSection(
                                'backup',
                                'copiaSeguranca',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Nuvem</span>

                          <input
                            value={
                              postProductionDraft.backup.nuvem
                            }
                            placeholder="Ex.: Drive ou Backblaze"
                            onChange={(event) => {
                              updatePostProductionSection(
                                'backup',
                                'nuvem',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Verificado em</span>

                          <input
                            type="date"
                            value={
                              postProductionDraft.backup.verificadoEm
                            }
                            onChange={(event) => {
                              updatePostProductionSection(
                                'backup',
                                'verificadoEm',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observações</span>

                          <textarea
                            rows="2"
                            value={
                              postProductionDraft.backup.observacoes
                            }
                            placeholder="Integridade dos arquivos, pastas e cópias extras"
                            onChange={(event) => {
                              updatePostProductionSection(
                                'backup',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <Images size={16} />
                          Seleção do material
                        </span>

                        <small>
                          {postProductionDraft.selecao.concluida
                            ? 'Concluída'
                            : 'Em andamento'}
                        </small>
                      </summary>

                      <div className="sf-project-post-production-grid">
                        <label>
                          <span>Total de arquivos</span>

                          <input
                            type="number"
                            min="0"
                            value={
                              postProductionDraft.selecao.totalArquivos
                            }
                            onChange={(event) => {
                              updatePostProductionSection(
                                'selecao',
                                'totalArquivos',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Selecionadas</span>

                          <input
                            type="number"
                            min="0"
                            value={
                              postProductionDraft.selecao.selecionadas
                            }
                            onChange={(event) => {
                              updatePostProductionSection(
                                'selecao',
                                'selecionadas',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Rejeitadas</span>

                          <input
                            type="number"
                            min="0"
                            value={
                              postProductionDraft.selecao.rejeitadas
                            }
                            onChange={(event) => {
                              updatePostProductionSection(
                                'selecao',
                                'rejeitadas',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Responsável</span>

                          <input
                            value={
                              postProductionDraft.selecao.responsavel
                            }
                            placeholder="Quem fez a seleção"
                            onChange={(event) => {
                              updatePostProductionSection(
                                'selecao',
                                'responsavel',
                                capitalizeName(event.target.value),
                              );
                            }}
                          />
                        </label>

                        <label className="sf-project-post-production-check wide">
                          <input
                            type="checkbox"
                            checked={
                              postProductionDraft.selecao.concluida
                            }
                            onChange={(event) => {
                              updatePostProductionSection(
                                'selecao',
                                'concluida',
                                event.target.checked,
                              );
                            }}
                          />

                          <span>Seleção concluída</span>
                        </label>

                        <label className="wide">
                          <span>Observações</span>

                          <textarea
                            rows="2"
                            value={
                              postProductionDraft.selecao.observacoes
                            }
                            placeholder="Critérios, dúvidas ou arquivos separados"
                            onChange={(event) => {
                              updatePostProductionSection(
                                'selecao',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <SlidersHorizontal size={16} />
                          Edição
                        </span>

                        <small>
                          {Math.min(
                            100,
                            Number(
                              postProductionDraft.edicao.percentual || 0,
                            ),
                          )}
                          %
                        </small>
                      </summary>

                      <div className="sf-project-post-production-grid">
                        <label className="wide">
                          <span>Progresso da edição</span>

                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={
                              postProductionDraft.edicao.percentual
                            }
                            onChange={(event) => {
                              updatePostProductionSection(
                                'edicao',
                                'percentual',
                                Number(event.target.value),
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Lote atual</span>

                          <input
                            value={
                              postProductionDraft.edicao.loteAtual
                            }
                            placeholder="Ex.: Cerimônia"
                            onChange={(event) => {
                              updatePostProductionSection(
                                'edicao',
                                'loteAtual',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Preset ou perfil</span>

                          <input
                            value={
                              postProductionDraft.edicao.presetPerfil
                            }
                            placeholder="Ex.: Casamento Praia 2026"
                            onChange={(event) => {
                              updatePostProductionSection(
                                'edicao',
                                'presetPerfil',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Responsável</span>

                          <input
                            value={
                              postProductionDraft.edicao.responsavel
                            }
                            placeholder="Editor responsável"
                            onChange={(event) => {
                              updatePostProductionSection(
                                'edicao',
                                'responsavel',
                                capitalizeName(event.target.value),
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Prazo interno</span>

                          <input
                            type="date"
                            value={
                              postProductionDraft.edicao.prazoInterno
                            }
                            onChange={(event) => {
                              updatePostProductionSection(
                                'edicao',
                                'prazoInterno',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observações</span>

                          <textarea
                            rows="2"
                            value={
                              postProductionDraft.edicao.observacoes
                            }
                            placeholder="Ajustes de cor, consistência entre câmeras ou observações do editor"
                            onChange={(event) => {
                              updatePostProductionSection(
                                'edicao',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <MessageSquareText size={16} />
                          Revisão e feedback
                        </span>

                        <small>
                          {postProductionDraft.revisao.revisoesUsadas}
                          /
                          {postProductionDraft.revisao.limiteRevisoes}
                        </small>
                      </summary>

                      <div className="sf-project-post-production-grid">
                        <label className="sf-project-post-production-check wide">
                          <input
                            type="checkbox"
                            checked={
                              postProductionDraft.revisao.enviadaAoCliente
                            }
                            onChange={(event) => {
                              updatePostProductionSection(
                                'revisao',
                                'enviadaAoCliente',
                                event.target.checked,
                              );
                            }}
                          />

                          <span>Prévia ou revisão enviada ao cliente</span>
                        </label>

                        <label>
                          <span>Enviada em</span>

                          <input
                            type="date"
                            value={
                              postProductionDraft.revisao.enviadaEm
                            }
                            onChange={(event) => {
                              updatePostProductionSection(
                                'revisao',
                                'enviadaEm',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Limite de revisões</span>

                          <input
                            type="number"
                            min="0"
                            value={
                              postProductionDraft.revisao.limiteRevisoes
                            }
                            onChange={(event) => {
                              updatePostProductionSection(
                                'revisao',
                                'limiteRevisoes',
                                Number(event.target.value),
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Revisões usadas</span>

                          <input
                            type="number"
                            min="0"
                            value={
                              postProductionDraft.revisao.revisoesUsadas
                            }
                            onChange={(event) => {
                              updatePostProductionSection(
                                'revisao',
                                'revisoesUsadas',
                                Number(event.target.value),
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Feedback recebido</span>

                          <textarea
                            rows="3"
                            value={
                              postProductionDraft.revisao.feedback
                            }
                            placeholder="Resumo do retorno do cliente"
                            onChange={(event) => {
                              updatePostProductionSection(
                                'revisao',
                                'feedback',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Ajustes pendentes</span>

                          <textarea
                            rows="2"
                            value={
                              postProductionDraft.revisao.ajustesPendentes
                            }
                            placeholder="Alterações que ainda precisam ser realizadas"
                            onChange={(event) => {
                              updatePostProductionSection(
                                'revisao',
                                'ajustesPendentes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <BadgeCheck size={16} />
                          Controle final de qualidade
                        </span>

                        <small>
                          {selectedQualityChecks}/{selectedQualityTotal}
                        </small>
                      </summary>

                      <div className="sf-project-quality-checks">
                        {[
                          ['nomesConferidos', 'Nomes e identificação conferidos'],
                          ['sequenciaConferida', 'Sequência e narrativa conferidas'],
                          ['corConferida', 'Cor e consistência conferidas'],
                          ['exportacaoConferida', 'Exportação e resolução conferidas'],
                          ['linksTestados', 'Links e permissões testados'],
                          ['aprovadoParaEntrega', 'Material aprovado para entrega'],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <input
                              type="checkbox"
                              checked={
                                postProductionDraft.controleQualidade[key]
                              }
                              onChange={(event) => {
                                updatePostProductionSection(
                                  'controleQualidade',
                                  key,
                                  event.target.checked,
                                );
                              }}
                            />

                            <span>{label}</span>
                          </label>
                        ))}
                      </div>

                      <div className="sf-project-post-production-grid">
                        <label className="wide">
                          <span>Observações finais</span>

                          <textarea
                            rows="3"
                            value={
                              postProductionDraft
                                .controleQualidade.observacoes
                            }
                            placeholder="Últimas conferências antes da entrega"
                            onChange={(event) => {
                              updatePostProductionSection(
                                'controleQualidade',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>
                  </div>
                </section>

                <section className="sf-project-dashboard-panel sf-project-event-operation-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <Route size={17} />
                      </span>

                      <div>
                        <h3>Operação do evento</h3>
                        <p>Cinco controles para organizar o dia do trabalho</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="sf-secondary-button"
                      disabled={savingDashboard}
                      onClick={() => {
                        void saveEventOperation();
                      }}
                    >
                      <Save size={15} />
                      {savingDashboard
                        ? 'Salvando...'
                        : 'Salvar operação'}
                    </button>
                  </header>

                  <div className="sf-project-event-operation-sections">
                    <details open>
                      <summary>
                        <span>
                          <Calendar size={16} />
                          Roteiro do dia
                        </span>

                        <small>
                          {eventOperationDraft.roteiro.length}
                        </small>
                      </summary>

                      <div className="sf-project-event-entry-grid">
                        <label>
                          <span>Horário</span>

                          <input
                            type="time"
                            value={
                              eventOperationEntry.roteiro.horario
                            }
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'roteiro',
                                'horario',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Etapa</span>

                          <input
                            value={
                              eventOperationEntry.roteiro.titulo
                            }
                            placeholder="Ex.: Making of da noiva"
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'roteiro',
                                'titulo',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Local</span>

                          <input
                            value={
                              eventOperationEntry.roteiro.local
                            }
                            placeholder="Ex.: Hotel ou cerimônia"
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'roteiro',
                                'local',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observação</span>

                          <input
                            value={
                              eventOperationEntry.roteiro.observacao
                            }
                            placeholder="Informações importantes desta etapa"
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'roteiro',
                                'observacao',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className="sf-secondary-button wide"
                          onClick={() => addEventOperationItem('roteiro')}
                        >
                          <Plus size={15} />
                          Adicionar etapa
                        </button>
                      </div>

                      <div className="sf-project-event-list">
                        {eventOperationDraft.roteiro.map((item) => (
                          <article key={item.id}>
                            <span className="time">
                              {item.horario || '--:--'}
                            </span>

                            <div>
                              <strong>{item.titulo}</strong>
                              <small>
                                {[item.local, item.observacao]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </small>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                removeEventOperationItem(
                                  'roteiro',
                                  item.id,
                                );
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </article>
                        ))}
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <Camera size={16} />
                          Fotos essenciais
                        </span>

                        <small>
                          {eventOperationDraft.fotosEssenciais.length}
                        </small>
                      </summary>

                      <div className="sf-project-event-entry-grid">
                        <label className="wide">
                          <span>Foto ou momento</span>

                          <input
                            value={
                              eventOperationEntry
                                .fotosEssenciais.titulo
                            }
                            placeholder="Ex.: Foto com os avós após a cerimônia"
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'fotosEssenciais',
                                'titulo',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Categoria</span>

                          <select
                            value={
                              eventOperationEntry
                                .fotosEssenciais.categoria
                            }
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'fotosEssenciais',
                                'categoria',
                                event.target.value,
                              );
                            }}
                          >
                            <option value="Making of">Making of</option>
                            <option value="Cerimônia">Cerimônia</option>
                            <option value="Família">Família</option>
                            <option value="Casal">Casal</option>
                            <option value="Festa">Festa</option>
                            <option value="Detalhes">Detalhes</option>
                          </select>
                        </label>

                        <label>
                          <span>Prioridade</span>

                          <select
                            value={
                              eventOperationEntry
                                .fotosEssenciais.prioridade
                            }
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'fotosEssenciais',
                                'prioridade',
                                event.target.value,
                              );
                            }}
                          >
                            <option value="normal">Normal</option>
                            <option value="alta">Alta</option>
                            <option value="obrigatoria">Obrigatória</option>
                          </select>
                        </label>

                        <button
                          type="button"
                          className="sf-secondary-button wide"
                          onClick={() => {
                            addEventOperationItem(
                              'fotosEssenciais',
                            );
                          }}
                        >
                          <Plus size={15} />
                          Adicionar foto
                        </button>
                      </div>

                      <div className="sf-project-event-check-list">
                        {eventOperationDraft.fotosEssenciais.map(
                          (item) => (
                            <label key={item.id}>
                              <input
                                type="checkbox"
                                checked={Boolean(item.concluida)}
                                onChange={(event) => {
                                  updateEventOperationItem(
                                    'fotosEssenciais',
                                    item.id,
                                    'concluida',
                                    event.target.checked,
                                  );
                                }}
                              />

                              <span>
                                <strong>{item.titulo}</strong>
                                <small>
                                  {item.categoria} · {item.prioridade}
                                </small>
                              </span>

                              <button
                                type="button"
                                onClick={() => {
                                  removeEventOperationItem(
                                    'fotosEssenciais',
                                    item.id,
                                  );
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </label>
                          ),
                        )}
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <Users size={16} />
                          Pessoas-chave
                        </span>

                        <small>
                          {eventOperationDraft.pessoasChave.length}
                        </small>
                      </summary>

                      <div className="sf-project-event-entry-grid">
                        <label>
                          <span>Nome</span>

                          <input
                            value={
                              eventOperationEntry.pessoasChave.nome
                            }
                            placeholder="Nome da pessoa"
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'pessoasChave',
                                'nome',
                                capitalizeName(event.target.value),
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Papel</span>

                          <input
                            value={
                              eventOperationEntry.pessoasChave.papel
                            }
                            placeholder="Ex.: Mãe da noiva"
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'pessoasChave',
                                'papel',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Contato</span>

                          <input
                            value={
                              eventOperationEntry
                                .pessoasChave.contato
                            }
                            placeholder="(00) 0 0000-0000"
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'pessoasChave',
                                'contato',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observação</span>

                          <input
                            value={
                              eventOperationEntry
                                .pessoasChave.observacao
                            }
                            placeholder="Orientações ou importância desta pessoa"
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'pessoasChave',
                                'observacao',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className="sf-secondary-button wide"
                          onClick={() => {
                            addEventOperationItem('pessoasChave');
                          }}
                        >
                          <Plus size={15} />
                          Adicionar pessoa
                        </button>
                      </div>

                      <div className="sf-project-event-card-list">
                        {eventOperationDraft.pessoasChave.map(
                          (item) => (
                            <article key={item.id}>
                              <div className="avatar">
                                {getMemberInitials(item.nome)}
                              </div>

                              <div>
                                <strong>{item.nome}</strong>
                                <small>
                                  {[item.papel, item.contato]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </small>

                                {item.observacao && (
                                  <p>{item.observacao}</p>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  removeEventOperationItem(
                                    'pessoasChave',
                                    item.id,
                                  );
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </article>
                          ),
                        )}
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <Route size={16} />
                          Deslocamentos
                        </span>

                        <small>
                          {eventOperationDraft.deslocamentos.length}
                        </small>
                      </summary>

                      <div className="sf-project-event-entry-grid">
                        <label>
                          <span>Origem</span>

                          <input
                            value={
                              eventOperationEntry.deslocamentos.origem
                            }
                            placeholder="Ponto de saída"
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'deslocamentos',
                                'origem',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Destino</span>

                          <input
                            value={
                              eventOperationEntry
                                .deslocamentos.destino
                            }
                            placeholder="Local de destino"
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'deslocamentos',
                                'destino',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Horário de saída</span>

                          <input
                            type="time"
                            value={
                              eventOperationEntry
                                .deslocamentos.horarioSaida
                            }
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'deslocamentos',
                                'horarioSaida',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observação</span>

                          <input
                            value={
                              eventOperationEntry
                                .deslocamentos.observacao
                            }
                            placeholder="Tempo estimado, estacionamento ou rota"
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'deslocamentos',
                                'observacao',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className="sf-secondary-button wide"
                          onClick={() => {
                            addEventOperationItem(
                              'deslocamentos',
                            );
                          }}
                        >
                          <Plus size={15} />
                          Adicionar deslocamento
                        </button>
                      </div>

                      <div className="sf-project-event-list">
                        {eventOperationDraft.deslocamentos.map(
                          (item) => (
                            <article key={item.id}>
                              <span className="time">
                                {item.horarioSaida || '--:--'}
                              </span>

                              <div>
                                <strong>
                                  {[item.origem, item.destino]
                                    .filter(Boolean)
                                    .join(' → ')}
                                </strong>
                                <small>{item.observacao}</small>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  removeEventOperationItem(
                                    'deslocamentos',
                                    item.id,
                                  );
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </article>
                          ),
                        )}
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <ListChecks size={16} />
                          Pendências rápidas
                        </span>

                        <small>
                          {
                            eventOperationDraft.pendencias.filter(
                              (item) => !item.concluida,
                            ).length
                          }
                        </small>
                      </summary>

                      <div className="sf-project-event-entry-grid">
                        <label className="wide">
                          <span>Pendência</span>

                          <input
                            value={
                              eventOperationEntry.pendencias.titulo
                            }
                            placeholder="Ex.: Confirmar horário do celebrante"
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'pendencias',
                                'titulo',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Responsável</span>

                          <input
                            value={
                              eventOperationEntry
                                .pendencias.responsavel
                            }
                            placeholder="Quem ficará responsável"
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'pendencias',
                                'responsavel',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Prazo</span>

                          <input
                            type="date"
                            value={
                              eventOperationEntry.pendencias.prazo
                            }
                            onChange={(event) => {
                              updateEventOperationEntry(
                                'pendencias',
                                'prazo',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className="sf-secondary-button wide"
                          onClick={() => {
                            addEventOperationItem('pendencias');
                          }}
                        >
                          <Plus size={15} />
                          Adicionar pendência
                        </button>
                      </div>

                      <div className="sf-project-event-check-list">
                        {eventOperationDraft.pendencias.map(
                          (item) => (
                            <label key={item.id}>
                              <input
                                type="checkbox"
                                checked={Boolean(item.concluida)}
                                onChange={(event) => {
                                  updateEventOperationItem(
                                    'pendencias',
                                    item.id,
                                    'concluida',
                                    event.target.checked,
                                  );
                                }}
                              />

                              <span>
                                <strong>{item.titulo}</strong>
                                <small>
                                  {[
                                    item.responsavel,
                                    item.prazo
                                      ? formatProjectDate(item.prazo)
                                      : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </small>
                              </span>

                              <button
                                type="button"
                                onClick={() => {
                                  removeEventOperationItem(
                                    'pendencias',
                                    item.id,
                                  );
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </label>
                          ),
                        )}
                      </div>
                    </details>
                  </div>
                </section>

                <section className="sf-project-dashboard-panel sf-project-advanced-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <ClipboardList size={17} />
                      </span>

                      <div>
                        <h3>Gestão avançada do trabalho</h3>
                        <p>Cinco áreas operacionais reunidas em um único painel</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="sf-secondary-button"
                      disabled={savingDashboard}
                      onClick={() => {
                        void saveAdvancedManagement();
                      }}
                    >
                      <Save size={15} />
                      {savingDashboard
                        ? 'Salvando...'
                        : 'Salvar gestão'}
                    </button>
                  </header>

                  <div className="sf-project-advanced-sections">
                    <details open>
                      <summary>
                        <span>
                          <ClipboardList size={16} />
                          Briefing e preferências
                        </span>

                        <small>01</small>
                      </summary>

                      <div className="sf-project-advanced-grid">
                        <label>
                          <span>Estilo desejado</span>

                          <input
                            value={
                              managementDraft.briefing.estiloDesejado
                            }
                            placeholder="Ex.: documental, leve e espontâneo"
                            onChange={(event) => {
                              updateManagementSection(
                                'briefing',
                                'estiloDesejado',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Referências</span>

                          <input
                            value={
                              managementDraft.briefing.referencias
                            }
                            placeholder="Links, nomes ou inspirações"
                            onChange={(event) => {
                              updateManagementSection(
                                'briefing',
                                'referencias',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Momentos essenciais</span>

                          <textarea
                            rows="3"
                            value={
                              managementDraft.briefing.momentosEssenciais
                            }
                            placeholder="Pessoas, detalhes e acontecimentos que não podem faltar"
                            onChange={(event) => {
                              updateManagementSection(
                                'briefing',
                                'momentosEssenciais',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Restrições e cuidados</span>

                          <textarea
                            rows="2"
                            value={
                              managementDraft.briefing.restricoes
                            }
                            placeholder="Restrições do local, familiares, privacidade ou orientações especiais"
                            onChange={(event) => {
                              updateManagementSection(
                                'briefing',
                                'restricoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <ContactRound size={16} />
                          Contatos e fornecedores
                        </span>

                        <small>02</small>
                      </summary>

                      <div className="sf-project-advanced-grid">
                        <label>
                          <span>Cerimonialista</span>

                          <input
                            value={
                              managementDraft.contatos.cerimonialista
                            }
                            placeholder="Nome da cerimonialista"
                            onChange={(event) => {
                              updateManagementSection(
                                'contatos',
                                'cerimonialista',
                                capitalizeName(event.target.value),
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Telefone da cerimonialista</span>

                          <input
                            value={
                              managementDraft.contatos
                                .telefoneCerimonialista
                            }
                            placeholder="(00) 0 0000-0000"
                            onChange={(event) => {
                              updateManagementSection(
                                'contatos',
                                'telefoneCerimonialista',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Contato do local</span>

                          <input
                            value={
                              managementDraft.contatos.localContato
                            }
                            placeholder="Nome do responsável pelo espaço"
                            onChange={(event) => {
                              updateManagementSection(
                                'contatos',
                                'localContato',
                                capitalizeName(event.target.value),
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Telefone do local</span>

                          <input
                            value={
                              managementDraft.contatos.telefoneLocal
                            }
                            placeholder="(00) 0 0000-0000"
                            onChange={(event) => {
                              updateManagementSection(
                                'contatos',
                                'telefoneLocal',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Outros fornecedores</span>

                          <textarea
                            rows="3"
                            value={
                              managementDraft.contatos.outrosFornecedores
                            }
                            placeholder="Buffet, maquiagem, decoração, DJ, celebrante e demais contatos"
                            onChange={(event) => {
                              updateManagementSection(
                                'contatos',
                                'outrosFornecedores',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <MessageCircle size={16} />
                          Comunicação e follow-up
                        </span>

                        <small>03</small>
                      </summary>

                      <div className="sf-project-advanced-grid">
                        <label>
                          <span>Próximo contato</span>

                          <input
                            type="date"
                            value={
                              managementDraft.comunicacao.proximoContato
                            }
                            onChange={(event) => {
                              updateManagementSection(
                                'comunicacao',
                                'proximoContato',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Canal preferencial</span>

                          <select
                            value={
                              managementDraft.comunicacao.canal
                            }
                            onChange={(event) => {
                              updateManagementSection(
                                'comunicacao',
                                'canal',
                                event.target.value,
                              );
                            }}
                          >
                            <option value="WhatsApp">WhatsApp</option>
                            <option value="Ligação">Ligação</option>
                            <option value="E-mail">E-mail</option>
                            <option value="Reunião">Reunião</option>
                          </select>
                        </label>

                        <label className="wide">
                          <span>Assunto do próximo contato</span>

                          <input
                            value={
                              managementDraft.comunicacao.assunto
                            }
                            placeholder="Ex.: Confirmar cronograma final"
                            onChange={(event) => {
                              updateManagementSection(
                                'comunicacao',
                                'assunto',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>

                      <div className="sf-project-communication-form">
                        <label>
                          <span>Data</span>

                          <input
                            type="date"
                            value={communicationEntry.data}
                            onChange={(event) => {
                              setCommunicationEntry((draft) => ({
                                ...draft,
                                data: event.target.value,
                              }));
                            }}
                          />
                        </label>

                        <label>
                          <span>Canal</span>

                          <select
                            value={communicationEntry.canal}
                            onChange={(event) => {
                              setCommunicationEntry((draft) => ({
                                ...draft,
                                canal: event.target.value,
                              }));
                            }}
                          >
                            <option value="WhatsApp">WhatsApp</option>
                            <option value="Ligação">Ligação</option>
                            <option value="E-mail">E-mail</option>
                            <option value="Reunião">Reunião</option>
                          </select>
                        </label>

                        <label className="wide">
                          <span>Assunto do contato realizado</span>

                          <input
                            value={communicationEntry.assunto}
                            placeholder="Ex.: Cronograma confirmado"
                            onChange={(event) => {
                              setCommunicationEntry((draft) => ({
                                ...draft,
                                assunto: event.target.value,
                              }));
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observação</span>

                          <textarea
                            rows="2"
                            value={communicationEntry.observacao}
                            placeholder="Resumo do que foi combinado"
                            onChange={(event) => {
                              setCommunicationEntry((draft) => ({
                                ...draft,
                                observacao: event.target.value,
                              }));
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className="sf-secondary-button wide"
                          onClick={addCommunicationHistory}
                        >
                          <Plus size={15} />
                          Adicionar ao histórico
                        </button>
                      </div>

                      {managementDraft.comunicacao.historico.length > 0 && (
                        <div className="sf-project-communication-history">
                          {managementDraft.comunicacao.historico
                            .slice(0, 8)
                            .map((entry) => (
                              <article key={entry.id}>
                                <div>
                                  <strong>{entry.assunto}</strong>
                                  <span>
                                    {formatProjectDate(entry.data)}
                                    {' · '}
                                    {entry.canal}
                                  </span>

                                  {entry.observacao && (
                                    <p>{entry.observacao}</p>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  aria-label="Excluir registro"
                                  onClick={() => {
                                    removeCommunicationHistory(
                                      entry.id,
                                    );
                                  }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </article>
                            ))}
                        </div>
                      )}
                    </details>

                    <details>
                      <summary>
                        <span>
                          <ShieldCheck size={16} />
                          Riscos e contingência
                        </span>

                        <small>04</small>
                      </summary>

                      <div className="sf-project-advanced-grid">
                        <label className="wide">
                          <span>Plano para chuva ou mudança de local</span>

                          <textarea
                            rows="3"
                            value={
                              managementDraft.contingencia.planoChuva
                            }
                            placeholder="Alternativa coberta, horários e responsáveis pela decisão"
                            onChange={(event) => {
                              updateManagementSection(
                                'contingencia',
                                'planoChuva',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Equipamento reserva</span>

                          <input
                            value={
                              managementDraft.contingencia
                                .equipamentoReserva
                            }
                            placeholder="Câmera, lente, áudio e iluminação reserva"
                            onChange={(event) => {
                              updateManagementSection(
                                'contingencia',
                                'equipamentoReserva',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label>
                          <span>Responsável de emergência</span>

                          <input
                            value={
                              managementDraft.contingencia
                                .responsavelEmergencia
                            }
                            placeholder="Nome e telefone"
                            onChange={(event) => {
                              updateManagementSection(
                                'contingencia',
                                'responsavelEmergencia',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Outros riscos e observações</span>

                          <textarea
                            rows="2"
                            value={
                              managementDraft.contingencia.observacoes
                            }
                            placeholder="Acesso, estacionamento, energia, maré, deslocamento ou segurança"
                            onChange={(event) => {
                              updateManagementSection(
                                'contingencia',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    <details>
                      <summary>
                        <span>
                          <Star size={16} />
                          Pós-entrega e relacionamento
                        </span>

                        <small>05</small>
                      </summary>

                      <div className="sf-project-post-delivery-checks">
                        {[
                          [
                            'avaliacaoSolicitada',
                            'Avaliação no Google solicitada',
                          ],
                          [
                            'depoimentoRecebido',
                            'Depoimento recebido',
                          ],
                          [
                            'autorizacaoPublicacao',
                            'Autorização para publicação confirmada',
                          ],
                        ].map(([key, label]) => (
                          <label key={key}>
                            <input
                              type="checkbox"
                              checked={
                                managementDraft.posEntrega[key]
                              }
                              onChange={(event) => {
                                updateManagementSection(
                                  'posEntrega',
                                  key,
                                  event.target.checked,
                                );
                              }}
                            />

                            <span>{label}</span>
                          </label>
                        ))}
                      </div>

                      <div className="sf-project-advanced-grid">
                        <label className="wide">
                          <span>Indicações recebidas</span>

                          <textarea
                            rows="2"
                            value={
                              managementDraft.posEntrega.indicacoes
                            }
                            placeholder="Nomes, contatos ou oportunidades indicadas pelo cliente"
                            onChange={(event) => {
                              updateManagementSection(
                                'posEntrega',
                                'indicacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>

                        <label className="wide">
                          <span>Observações do relacionamento</span>

                          <textarea
                            rows="3"
                            value={
                              managementDraft.posEntrega.observacoes
                            }
                            placeholder="Retorno do cliente, possibilidade de álbum, ensaios futuros ou aniversário"
                            onChange={(event) => {
                              updateManagementSection(
                                'posEntrega',
                                'observacoes',
                                event.target.value,
                              );
                            }}
                          />
                        </label>
                      </div>
                    </details>
                  </div>
                </section>

                <section className="sf-project-checklist sf-project-dashboard-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <CheckCircle2 size={17} />
                      </span>

                      <div>
                        <h3>Checklist de produção</h3>

                        <p>
                          {selectedChecklistProgress.completed} de{' '}
                          {selectedChecklistProgress.total}{' '}
                          concluídos ·{' '}
                          {selectedChecklistProgress.percentage}%
                        </p>
                      </div>
                    </div>

                    <span className="sf-project-dashboard-checklist-badge">
                      {selectedChecklistProgress.percentage}%
                    </span>
                  </header>

                  {selectedChecklist.itens.length === 0 ? (
                    <button
                      type="button"
                      className="sf-secondary-button"
                      onClick={initializeSelectedChecklist}
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
                        const items = selectedChecklist.itens.filter(
                          (item) => item.categoria === category,
                        );

                        if (!items.length) {
                          return null;
                        }

                        const progress = checklistProgress(
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
                                      checked={item.concluido}
                                      onChange={(event) => {
                                        void saveChecklist(
                                          toggleChecklistItem(
                                            selectedProject.checklist,
                                            item.id,
                                            event.target.checked,
                                          ),
                                        );
                                      }}
                                    />

                                    <span>
                                      {item.titulo}

                                      {item.observacao && (
                                        <small>
                                          {item.observacao}
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
                                        titulo: item.titulo,
                                        categoria: item.categoria,
                                        observacao:
                                          item.observacao || '',
                                      });
                                    }}
                                  >
                                    <Edit3 size={14} />
                                  </button>

                                  <button
                                    type="button"
                                    title="Excluir item deste trabalho"
                                    onClick={() => {
                                      deleteChecklistItem(item);
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
                          value={checklistDraft.titulo}
                          onChange={(event) => {
                            setChecklistDraft((draft) => ({
                              ...draft,
                              titulo: event.target.value,
                            }));
                          }}
                        />

                        <select
                          value={checklistDraft.categoria}
                          onChange={(event) => {
                            setChecklistDraft((draft) => ({
                              ...draft,
                              categoria: event.target.value,
                            }));
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
                          value={checklistDraft.observacao}
                          onChange={(event) => {
                            setChecklistDraft((draft) => ({
                              ...draft,
                              observacao: event.target.value,
                            }));
                          }}
                        />

                        <button
                          type="button"
                          className="sf-secondary-button"
                          onClick={submitChecklistItem}
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

              <aside className="sf-project-dashboard-sidebar">
                <section className="sf-project-dashboard-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <AlertTriangle size={17} />
                      </span>

                      <div>
                        <h3>Alertas</h3>
                        <p>Pontos que precisam de atenção</p>
                      </div>
                    </div>
                  </header>

                  {selectedAlerts.length > 0 ? (
                    <div className="sf-project-dashboard-alerts">
                      {selectedAlerts.map((alert) => (
                        <div key={alert}>
                          <AlertTriangle size={15} />
                          <span>{alert}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="sf-project-dashboard-all-good">
                      <CheckCircle2 size={18} />
                      <span>Nenhum alerta pendente.</span>
                    </div>
                  )}
                </section>

                <section className="sf-project-dashboard-panel">
                  <header>
                    <div>
                      <span className="sf-project-dashboard-panel-icon">
                        <CalendarCheck size={17} />
                      </span>

                      <div>
                        <h3>Entrega</h3>
                        <p>Acompanhamento do prazo</p>
                      </div>
                    </div>
                  </header>

                  <div className="sf-project-dashboard-delivery">
                    <div
                      className={
                        `sf-project-delivery-summary tone-${
                          selectedDeliveryCountdown.tone
                        }`
                      }
                    >
                      <Clock3 size={17} />
                      <strong>
                        {selectedDeliveryCountdown.label}
                      </strong>
                    </div>

                    <DashboardInfo
                      label="Prazo contratado"
                      value={
                        selectedProject.prazoEntregaDias
                          ? `${selectedProject.prazoEntregaDias} dias`
                          : 'Não informado'
                      }
                    />

                    <DashboardInfo
                      label="Entrega prevista"
                      value={
                        selectedProject.dataPrevistaEntrega
                          ? formatProjectDate(
                            selectedProject.dataPrevistaEntrega,
                          )
                          : 'Não informada'
                      }
                    />

                    <DashboardInfo
                      label="Entrega realizada"
                      value={
                        selectedProject.dataRealEntrega
                          ? formatProjectDate(
                            selectedProject.dataRealEntrega,
                          )
                          : 'Ainda não realizada'
                      }
                    />
                  </div>
                </section>

              </aside>
            </div>
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
                        capitalizeName(
                          event.target.value,
                        ),
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
                          capitalizeName(
                            event.target.value,
                          ),
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
                          capitalizeName(
                            event.target.value,
                          ),
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
                  type="text"
                  inputMode="numeric"
                  value={
                    projectDraft
                      .valorContratado
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        valorContratado:
                          maskCurrency(
                            event.target.value,
                          ),
                      }),
                    );
                  }}
                />
              </label>

              <label>
                Custo estimado

                <input
                  type="text"
                  inputMode="numeric"
                  value={
                    projectDraft
                      .custoEstimado
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        custoEstimado:
                          maskCurrency(
                            event.target.value,
                          ),
                      }),
                    );
                  }}
                />
              </label>

              <label>
                Custo real

                <input
                  type="text"
                  inputMode="numeric"
                  value={
                    projectDraft
                      .custoReal
                  }
                  onChange={(event) => {
                    setProjectDraft(
                      (draft) => ({
                        ...draft,
                        custoReal:
                          maskCurrency(
                            event.target.value,
                          ),
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

function DashboardMetric({
  icon,
  label,
  value,
  secondary,
  tone = 'default',
}) {
  return (
    <article
      className={`sf-project-dashboard-metric tone-${tone}`}
    >
      <span className="sf-project-dashboard-metric-icon">
        {icon}
      </span>

      <div>
        <span>{label}</span>
        <strong>{value || '-'}</strong>

        {secondary && (
          <small>{secondary}</small>
        )}
      </div>
    </article>
  );
}

function DashboardInfo({
  icon,
  label,
  value,
}) {
  return (
    <div className="sf-project-dashboard-info">
      {icon && (
        <span className="sf-project-dashboard-info-icon">
          {icon}
        </span>
      )}

      <div>
        <span>{label}</span>
        <strong>{value || '-'}</strong>
      </div>
    </div>
  );
}

