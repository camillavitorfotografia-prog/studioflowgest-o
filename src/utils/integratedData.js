export const INTEGRATION_KEYS = {
  leads: 'cv_crm_leads',
  clients: 'cv_studio_clients',
  projects: 'cv_studio_projects',
  finances: 'cv_studio_financas',
  agendaEvents: 'meusEventosAgenda',
  equipment: 'cv_studio_equipamentos',
  checklists: 'cv_studio_checklists',
  contracts: 'cv_studio_contracts',
  questionnaires: 'cv_studio_questionnaires',
  files: 'cv_studio_files',
  balances: 'cv_finance_saldos',
  config: 'cv_finance_config',
};

const safeParse = (key, fallback = []) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const createId = (prefix) => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const parseMoney = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const clean = value.toString().replace(/\D/g, '');
  return clean ? Number(clean) / 100 : 0;
};

export const formatMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const dateOnly = (value = new Date()) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const normalize = (value = '') => value.toString().toLowerCase().replace(/\D/g, '');
const normalizeName = (value = '') => value.toString().trim().toLowerCase();

const projectStatusFromClient = (client = {}) => client.statusTrabalho || client.statusProjeto || 'contrato_fechado';

const defaultChecklist = (project) => [
  { id: createId('task'), title: 'Contrato assinado', done: Boolean(project.contrato?.status === 'assinado') },
  { id: createId('task'), title: 'Pagamento de entrada registrado', done: Number(project.valorRecebido || 0) > 0 },
  { id: createId('task'), title: 'Evento confirmado na agenda', done: Boolean(project.data) },
  { id: createId('task'), title: 'Equipamentos definidos', done: Boolean(project.equipamentos?.length) },
  { id: createId('task'), title: 'Arquivos entregues', done: project.status === 'entregue' || project.status === 'finalizado' },
];

const calculateProjectFinance = (project, transactions = []) => {
  const receitas = project.receitas || project.pagamentos || [];
  const despesas = transactions.filter((item) => item.projectId === project.id && (item.tipoGeral === 'Saida' || item.tipo === 'fixa' || item.tipo === 'variavel'));
  const valorContratado = Number(project.valorContratado || 0);
  const valorRecebido = receitas.reduce((sum, item) => sum + parseMoney(item.valor), 0);
  const totalDespesas = despesas.reduce((sum, item) => sum + parseMoney(item.valor), 0);
  const lucro = valorRecebido - totalDespesas;

  return {
    receitas,
    parcelas: project.parcelas || [],
    despesas,
    custos: totalDespesas,
    lucro,
    margem: valorRecebido > 0 ? (lucro / valorRecebido) * 100 : 0,
    fluxoCaixa: valorRecebido - totalDespesas,
    valorContratado,
    valorRecebido,
    saldoRestante: Math.max(0, valorContratado - valorRecebido),
  };
};

const buildTimeline = (project, client, transactions = []) => {
  const entries = [
    ...(project.timeline || []),
    ...(project.historico || []).map((item) => ({ date: item.data, title: item.acao })),
    ...(project.receitas || project.pagamentos || []).map((payment) => ({ date: payment.data, title: `Pagamento recebido: ${formatMoney(parseMoney(payment.valor))}` })),
    ...transactions.filter((item) => item.projectId === project.id).map((item) => ({ date: item.data || item.dataVencimento, title: item.descricao || item.nome || 'Lancamento financeiro' })),
  ];

  return entries
    .filter((item) => item.date || item.title)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .map((item, index) => ({ id: item.id || `${project.id}-timeline-${index}`, date: item.date || project.createdAt || client?.createdAt, title: item.title || item.acao || 'Atualizacao' }));
};

const clientMatchesLead = (client, lead) => {
  const leadPhone = normalize(lead.whatsapp || lead.telefone);
  const clientPhone = normalize(client.whatsapp || client.telefone);
  if (leadPhone && clientPhone && leadPhone === clientPhone) return true;
  if (lead.email && client.email && lead.email.toLowerCase() === client.email.toLowerCase()) return true;
  return normalizeName(client.nome) === normalizeName(lead.nome);
};

export const normalizeClient = (client = {}) => ({
  id: client.id || createId('client'),
  nome: client.nome || client.name || 'Cliente',
  foto: client.foto || client.avatar || '',
  email: client.email || '',
  telefone: client.telefone || client.whatsapp || '',
  whatsapp: client.whatsapp || client.telefone || '',
  instagram: client.instagram || '',
  cidade: client.cidade || '',
  origem: client.origem || '',
  clienteDesde: client.clienteDesde || client.createdAt || new Date().toISOString(),
  observacoes: client.observacoes || '',
  status: client.status || 'ativo',
  createdAt: client.createdAt || new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const buildProjectFromClient = (client = {}) => {
  const valorContratado = parseMoney(client.valorTotal || client.valorOrcamento || client.valorContratado);
  const pagamentos = client.pagamentos || client.receitas || [];
  const valorRecebido = pagamentos.reduce((sum, item) => sum + parseMoney(item.valor), 0);
  const id = client.projectId || createId('project');

  return {
    id,
    uuid: id,
    legacyClientId: client.id,
    clientId: client.id,
    clienteId: client.id,
    clienteNome: client.nome || 'Cliente',
    cliente: normalizeClient(client),
    tipoServico: client.tipo || client.tipoServico || client.tipoTrabalho || 'Casamento',
    categoria: client.categoria || client.tipo || client.tipoServico || 'Evento',
    status: projectStatusFromClient(client),
    valorContratado,
    valorRecebido,
    saldoRestante: Math.max(0, valorContratado - valorRecebido),
    data: client.dataTrabalho || client.dataEvento || '',
    horario: client.horario || '',
    local: client.local || client.cidade || '',
    equipe: client.equipe || [],
    equipamentos: client.equipamentos || client.equipmentIds || [],
    checklist: client.checklist || [],
    financeiro: {},
    agenda: { data: client.dataTrabalho || client.dataEvento || '', horario: client.horario || '', local: client.local || client.cidade || '' },
    arquivos: client.arquivos || [],
    questionario: client.questionario || {},
    contrato: client.contrato || {},
    observacoes: client.observacoes || '',
    receitas: pagamentos,
    parcelas: client.parcelas || [],
    pagamentos,
    timeline: client.timeline || [{ date: client.createdAt || new Date().toISOString(), title: 'Projeto criado a partir do cliente' }],
    createdAt: client.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

export const buildProjectFromLead = (lead = {}, client = {}) => {
  const valorContratado = parseMoney(lead.valorOrcamento || lead.valorTotal || lead.valorContratado);
  const id = createId('project');

  return {
    id,
    uuid: id,
    leadId: lead.id,
    clientId: client.id,
    clienteId: client.id,
    clienteNome: client.nome || lead.nome || 'Cliente',
    cliente: normalizeClient({ ...client, ...lead, id: client.id }),
    tipoServico: lead.tipoServico || lead.tipo || 'Casamento',
    categoria: lead.categoria || lead.tipoServico || 'Evento',
    status: 'contrato_fechado',
    valorContratado,
    valorRecebido: 0,
    saldoRestante: valorContratado,
    data: lead.dataEvento || '',
    horario: lead.horario || '',
    local: lead.local || lead.cidade || '',
    equipe: [],
    equipamentos: [],
    checklist: [],
    financeiro: {},
    agenda: { data: lead.dataEvento || '', horario: lead.horario || '', local: lead.local || lead.cidade || '' },
    arquivos: [],
    questionario: {},
    contrato: { status: 'pendente' },
    observacoes: lead.observacoes || '',
    receitas: [],
    parcelas: [],
    pagamentos: [],
    timeline: [
      { date: lead.createdAt || new Date().toISOString(), title: 'Lead criado no CRM' },
      { date: new Date().toISOString(), title: 'Lead aprovado e projeto criado automaticamente' },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

const enrichProject = (project, clients, transactions, equipment, checklists, contracts, questionnaires, files) => {
  const client = clients.find((item) => item.id === project.clientId || item.id === project.clienteId) || project.cliente || {};
  const financeiro = calculateProjectFinance(project, transactions);
  const checklist = checklists[project.id] || project.checklist || defaultChecklist({ ...project, ...financeiro });
  const equipamentos = (project.equipamentos || project.equipmentIds || []).map((id) => equipment.find((item) => item.id === id || String(item.id) === String(id))).filter(Boolean);

  return {
    ...project,
    cliente: normalizeClient(client),
    clienteNome: client.nome || project.clienteNome,
    valorContratado: financeiro.valorContratado,
    valorRecebido: financeiro.valorRecebido,
    saldoRestante: financeiro.saldoRestante,
    financeiro,
    checklist,
    contrato: contracts[project.id] || project.contrato || {},
    questionario: questionnaires[project.id] || project.questionario || {},
    arquivos: files[project.id] || project.arquivos || [],
    equipamentosDetalhados: equipamentos,
    timelineCompleta: buildTimeline(project, client, transactions),
  };
};

export const ensureIntegratedData = () => {
  const clients = safeParse(INTEGRATION_KEYS.clients, []).map(normalizeClient);
  const storedProjects = safeParse(INTEGRATION_KEYS.projects, []);
  const projects = [...storedProjects];
  let changed = false;

  clients.forEach((client) => {
    const exists = projects.some((project) => project.legacyClientId === client.id || project.clientId === client.id || project.clienteId === client.id);
    const hasProjectData = client.tipo || client.tipoServico || client.dataTrabalho || client.dataEvento || parseMoney(client.valorTotal) > 0;
    if (!exists && hasProjectData) {
      projects.push(buildProjectFromClient(client));
      changed = true;
    }
  });

  const syncedProjects = projects.map((project) => {
    const client = clients.find((item) => item.id === project.clientId || item.id === project.clienteId || item.id === project.legacyClientId);
    if (!client) return project;
    const payments = client.pagamentos || project.pagamentos || [];
    const valorContratado = parseMoney(client.valorTotal || project.valorContratado);
    const valorRecebido = payments.reduce((sum, item) => sum + parseMoney(item.valor), 0);
    return {
      ...project,
      clientId: client.id,
      clienteId: client.id,
      clienteNome: client.nome,
      cliente: normalizeClient(client),
      receitas: payments,
      pagamentos: payments,
      valorContratado,
      valorRecebido,
      saldoRestante: Math.max(0, valorContratado - valorRecebido),
      data: client.dataTrabalho || client.dataEvento || project.data,
      local: client.local || client.cidade || project.local,
      tipoServico: client.tipo || client.tipoServico || project.tipoServico,
      categoria: client.categoria || client.tipo || client.tipoServico || project.categoria,
      status: client.statusTrabalho || project.status,
    };
  });

  if (changed || JSON.stringify(projects) !== JSON.stringify(syncedProjects)) save(INTEGRATION_KEYS.projects, syncedProjects);
  save(INTEGRATION_KEYS.clients, clients);
  return syncedProjects;
};

export const getStudioData = () => {
  const projects = ensureIntegratedData();
  const clients = safeParse(INTEGRATION_KEYS.clients, []).map(normalizeClient);
  const leads = safeParse(INTEGRATION_KEYS.leads, []);
  const transactions = safeParse(INTEGRATION_KEYS.finances, []);
  const equipment = safeParse(INTEGRATION_KEYS.equipment, []);
  const checklists = safeParse(INTEGRATION_KEYS.checklists, {});
  const contracts = safeParse(INTEGRATION_KEYS.contracts, {});
  const questionnaires = safeParse(INTEGRATION_KEYS.questionnaires, {});
  const files = safeParse(INTEGRATION_KEYS.files, {});
  const enrichedProjects = projects.map((project) => enrichProject(project, clients, transactions, equipment, checklists, contracts, questionnaires, files));

  return { leads, clients, projects: enrichedProjects, transactions, equipment, checklists, contracts, questionnaires, files };
};

export const writeProjects = (projects) => {
  save(INTEGRATION_KEYS.projects, projects);
  window.dispatchEvent(new Event('storage'));
};

export const createOrUpdateClientFromLead = (lead) => {
  const clients = safeParse(INTEGRATION_KEYS.clients, []).map(normalizeClient);
  const existing = clients.find((client) => clientMatchesLead(client, lead));
  const merged = normalizeClient({
    ...(existing || {}),
    nome: existing?.nome || lead.nome,
    email: existing?.email || lead.email || '',
    telefone: existing?.telefone || lead.telefone || lead.whatsapp || '',
    whatsapp: existing?.whatsapp || lead.whatsapp || lead.telefone || '',
    cidade: existing?.cidade || lead.cidade || '',
    origem: existing?.origem || lead.origem || '',
    observacoes: existing?.observacoes || lead.observacoes || '',
    id: existing?.id || createId('client'),
    clienteDesde: existing?.clienteDesde || new Date().toISOString(),
  });

  const nextClients = existing ? clients.map((client) => (client.id === existing.id ? merged : client)) : [merged, ...clients];
  save(INTEGRATION_KEYS.clients, nextClients);
  return merged;
};

export const approveLeadToProject = (lead) => {
  const client = createOrUpdateClientFromLead(lead);
  const projects = safeParse(INTEGRATION_KEYS.projects, []);
  const existing = projects.find((project) => project.leadId === lead.id);
  const project = existing || buildProjectFromLead(lead, client);
  const nextProjects = existing ? projects.map((item) => (item.id === existing.id ? { ...item, ...project, clientId: client.id, clienteId: client.id, cliente: client } : item)) : [project, ...projects];

  save(INTEGRATION_KEYS.projects, nextProjects);

  const checklists = safeParse(INTEGRATION_KEYS.checklists, {});
  if (!checklists[project.id]) {
    checklists[project.id] = defaultChecklist(project);
    save(INTEGRATION_KEYS.checklists, checklists);
  }

  const agendaEvents = safeParse(INTEGRATION_KEYS.agendaEvents, []);
  const agendaId = `project-${project.id}`;
  const agendaEvent = {
    id: agendaId,
    projectId: project.id,
    clientId: client.id,
    title: project.tipoServico,
    client: client.nome,
    time: project.horario || 'Horario a definir',
    start: project.data ? new Date(`${project.data}T14:00:00`).toISOString() : new Date().toISOString(),
    end: project.data ? new Date(`${project.data}T16:00:00`).toISOString() : new Date().toISOString(),
    tipo: project.categoria,
    status: 'Confirmado',
    isProjectIntegration: true,
  };
  save(INTEGRATION_KEYS.agendaEvents, [agendaEvent, ...agendaEvents.filter((event) => event.id !== agendaId)]);

  const transactions = safeParse(INTEGRATION_KEYS.finances, []);
  const financialSeedId = `project-finance-${project.id}`;
  if (!transactions.some((item) => item.id === financialSeedId)) {
    save(INTEGRATION_KEYS.finances, [
      {
        id: financialSeedId,
        projectId: project.id,
        clientId: client.id,
        descricao: `Projeto criado - ${client.nome}`,
        valor: 0,
        tipo: 'projeto',
        tipoGeral: 'Projeto',
        data: dateOnly(new Date()),
        status: 'Aberto',
      },
      ...transactions,
    ]);
  }

  window.dispatchEvent(new Event('storage'));
  return project;
};

export const distributeProjectIncome = (projectId, paymentValue) => {
  const value = parseMoney(paymentValue);
  if (value <= 0) return null;
  const config = safeParse(INTEGRATION_KEYS.config, { salario: 35, empresa: 45, reserva: 20 });
  const balances = safeParse(INTEGRATION_KEYS.balances, { salario: 0, empresa: 0, reserva: 0 });
  const total = Number(config.salario || 0) + Number(config.empresa || 0) + Number(config.reserva || 0) || 100;
  const distribution = {
    salario: value * (Number(config.salario || 0) / total),
    empresa: value * (Number(config.empresa || 0) / total),
    reserva: value * (Number(config.reserva || 0) / total),
  };
  const nextBalances = {
    salario: Number(balances.salario || 0) + distribution.salario,
    empresa: Number(balances.empresa || 0) + distribution.empresa,
    reserva: Number(balances.reserva || 0) + distribution.reserva,
  };
  save(INTEGRATION_KEYS.balances, nextBalances);

  const transactions = safeParse(INTEGRATION_KEYS.finances, []);
  save(INTEGRATION_KEYS.finances, [
    ...transactions,
    {
      id: createId('distribution'),
      projectId,
      descricao: 'Regra dos 3 aplicada automaticamente',
      valor: value,
      tipo: 'distribuicao',
      tipoGeral: 'Movimentacao Interna',
      detalhes: distribution,
      data: dateOnly(new Date()),
    },
  ]);
  window.dispatchEvent(new Event('storage'));
  return { distribution, balances: nextBalances };
};
