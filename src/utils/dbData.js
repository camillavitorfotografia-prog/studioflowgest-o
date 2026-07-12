import { isSupabaseConfigured, supabase } from './supabase';
import { parseCurrency } from './formatters';
import { normalizeLeadStatus } from '../data/crm';
import { isConfirmedPayment } from './financeEngine';

const today = () => new Date().toISOString().slice(0, 10);
const PROFILE_TABLE = 'perfil';
const PROFILE_ID = 'studio-profile';

export const assertSupabaseConfigured = () => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase nao configurado: atualize VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.');
  }
};

export const isMissingRelationError = (error, table) => {
  const message = String(error?.message || '').toLowerCase();
  const normalizedTable = String(table || '').toLowerCase();
  return error?.code === 'PGRST205'
    || (message.includes('could not find the table') && (!normalizedTable || message.includes(normalizedTable)));
};

export const emitDbUpdate = () => {
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new Event('sf_storage_update'));
};

export const normalizePaymentValue = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  return parseCurrency(value);
};

export const readPayments = (project = {}) => {
  const sources = [
    project.pagamentos,
    project.historico_pagamentos,
    project.historicoPagamentos,
    project.receitas,
    project.financeiro?.receitas,
  ].filter(Array.isArray);

  const uniquePayments = new Map();
  sources.flat().forEach((payment) => {
    if (!payment || typeof payment !== 'object') return;
    const key = payment.id || [
      payment.client_id || payment.clientId || '',
      payment.data || '',
      normalizePaymentValue(payment.valor),
      payment.status || '',
    ].join('|');
    if (!uniquePayments.has(key)) uniquePayments.set(key, payment);
  });

  return [...uniquePayments.values()];
};

export const calculateProjectAmounts = (project = {}) => {
  const total = Number(project.valor_contratado ?? project.valorContratado ?? project.valorTotal ?? 0);
  const payments = readPayments(project);
  const paymentSummary = calculatePaymentsSummary(payments, total);
  const paid = payments.length
    ? paymentSummary.valorRecebido
    : Number(project.valor_recebido ?? project.valorRecebido ?? 0);
  const remaining = payments.length
    ? paymentSummary.valorRestante
    : Math.max(0, Number(project.saldo_restante ?? project.saldoRestante ?? total - paid));
  return { total, paid, remaining, payments };
};

export const calculatePaymentsSummary = (payments = [], total = 0) => {
  const valorTotal = normalizePaymentValue(total);
  const valorRecebido = payments.reduce((sum, payment) => {
    return isConfirmedPayment(payment) ? sum + normalizePaymentValue(payment.valor) : sum;
  }, 0);
  const valorRestante = Math.max(0, valorTotal - valorRecebido);
  return { valorTotal, valorRecebido, valorRestante };
};

export const mapLeadFromDb = (lead = {}) => ({
  id: lead.id,
  nome: lead.nome || '',
  email: lead.email || '',
  nomeCasal: lead.nome_casal || lead.nomeCasal || '',
  tipoServico: lead.tipo_servico || lead.servico || lead.tipoServico || 'Casamento',
  status: normalizeLeadStatus(lead.status ?? lead.pipeline_status ?? lead.lead_status ?? lead.stage ?? lead.etapa),
  valorOrcamento: lead.valor_orcamento !== null && lead.valor_orcamento !== undefined ? String(lead.valor_orcamento) : (lead.valorOrcamento || '0'),
  dataEvento: lead.data_evento || lead.dataEvento || '',
  dataOrcamento: lead.data_orcamento || lead.dataOrcamento || '',
  origem: lead.origem || 'Instagram',
  telefone: lead.telefone || '',
  whatsapp: lead.whatsapp || lead.telefone || '',
  cidade: lead.cidade || '',
  observacoes: lead.observacoes || '',
  historico: lead.historico || [],
  createdAt: lead.created_at || lead.createdAt,
  updatedAt: lead.updated_at || lead.updatedAt,
});

export const mapClientFromDb = (client = {}) => ({
  id: client.id,
  nome: client.nome || client.name || 'Cliente',
  email: client.email || '',
  telefone: client.telefone || client.whatsapp || '',
  whatsapp: client.whatsapp || client.telefone || '',
  instagram: client.instagram || '',
  cidade: client.cidade || '',
  origem: client.origem || '',
  observacoes: client.observacoes || '',
  status: client.status || 'ativo',
  clienteDesde: client.cliente_desde || client.clienteDesde || client.created_at || client.createdAt || new Date().toISOString(),
  createdAt: client.created_at || client.createdAt || new Date().toISOString(),
  updatedAt: client.updated_at || client.updatedAt || new Date().toISOString(),
});

export const mapTransactionFromDb = (transaction = {}) => ({
  ...transaction,
  id: transaction.id,
  projectId: transaction.project_id || transaction.projectId || transaction.projeto_id || '',
  clientId: transaction.client_id || transaction.clientId || transaction.cliente_id || '',
  descricao: transaction.descricao || transaction.nome || '',
  nome: transaction.nome || transaction.descricao || '',
  valor: transaction.valor || 0,
  tipo: transaction.tipo || '',
  tipoGeral: transaction.tipo_geral || transaction.tipoGeral || transaction.tipo || '',
  data: transaction.data || transaction.data_vencimento || transaction.dataVencimento || '',
  dataVencimento: transaction.data_vencimento || transaction.dataVencimento || transaction.data || '',
  status: transaction.status || '',
  categoria: transaction.categoria || '',
  fornecedor: transaction.fornecedor || '',
  eventoRelacionado: transaction.evento_relacionado || transaction.eventoRelacionado || '',
  formaPagamento: transaction.forma_pagamento || transaction.formaPagamento || '',
  contaOrigem: transaction.conta_origem || transaction.contaOrigem || 'empresa',
  detalhes: transaction.detalhes || {},
  recurrenceId: transaction.recurrence_id || transaction.recurrenceId || '',
  recurrenceIndex: transaction.recurrence_index ?? transaction.recurrenceIndex ?? null,
  recorrente: Boolean(transaction.recorrente),
});

export const mapProjectFromDb = (project = {}, clients = [], transactions = []) => {
  const clientId = project.cliente_id || project.client_id || project.clientId || project.clienteId || project.legacyClientId;
  const client = clients.find((item) => item.id === clientId) || mapClientFromDb(project.cliente || {});
  const payments = readPayments(project);
  const expenses = transactions.filter((item) => item.projectId === project.id && (item.tipoGeral === 'Saida' || item.tipo === 'fixa' || item.tipo === 'variavel'));
  const total = Number(project.valor_contratado ?? project.valorContratado ?? 0);
  const paymentSummary = calculatePaymentsSummary(payments, total);
  const paid = payments.length
    ? paymentSummary.valorRecebido
    : Number(project.valor_recebido ?? project.valorRecebido ?? 0);
  const remaining = payments.length
    ? paymentSummary.valorRestante
    : Number(project.saldo_restante ?? project.saldoRestante ?? Math.max(0, total - paid));
  const costs = expenses.reduce((sum, item) => sum + normalizePaymentValue(item.valor), 0);

  return {
    ...project,
    id: project.id,
    leadId: project.lead_id || project.leadId || '',
    clientId,
    clienteId: clientId,
    clienteNome: project.cliente_nome || project.clienteNome || client.nome || '',
    cliente: client,
    tipoServico: project.tipo_servico || project.servico || project.tipoServico || project.tipoTrabalho || 'Evento',
    categoria: project.categoria || project.tipo_servico || project.servico || project.tipoServico || 'Evento',
    status: project.status || project.financeiro?.workflowStatus || project.financeiro?.statusProjeto || 'contrato_fechado',
    calendarSync: project.calendario_sync || project.calendarSync || project.financeiro?.calendarSync || {},
    valorContratado: total,
    valorRecebido: paid,
    saldoRestante: remaining,
    data: project.data || project.data_trabalho || project.dataTrabalho || '',
    horario: project.horario || project.financeiro?.horario || '',
    local: project.local || project.financeiro?.local || client.cidade || '',
    receitas: payments,
    pagamentos: payments,
    historicoPagamentos: payments,
    financeiro: {
      ...(project.financeiro && typeof project.financeiro === 'object' ? project.financeiro : {}),
      receitas: payments,
      despesas: expenses,
      custos: costs,
      lucro: paid - costs,
      margem: paid > 0 ? ((paid - costs) / paid) * 100 : 0,
      valorContratado: total,
      valorRecebido: paid,
      saldoRestante: remaining,
    },
    agenda: { data: project.data || '', horario: project.horario || '', local: project.local || client.cidade || '' },
    checklist: project.checklist || project.financeiro?.checklist || [],
    equipamentos: project.equipamentos || [],
    equipamentosDetalhados: [],
    timelineCompleta: project.timeline || project.historico || [],
    createdAt: project.created_at || project.createdAt || new Date().toISOString(),
    updatedAt: project.updated_at || project.updatedAt || new Date().toISOString(),
  };
};

const selectAll = async (table, orderColumn = 'created_at') => {
  try {
    assertSupabaseConfigured();
    let query = supabase.from(table).select('*');
    if (orderColumn) query = query.order(orderColumn, { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error(`Erro ao carregar ${table}:`, error.message);
    return [];
  }
};

const getUnknownColumn = (error) => {
  const message = error?.message || '';
  return (
    message.match(/'([^']+)' column/)?.[1] ||
    message.match(/column "([^"]+)"/)?.[1] ||
    message.match(/Could not find the '([^']+)' column/)?.[1] ||
    null
  );
};

export const saveRow = async ({ table, payload, id, match = 'id', onConflict = 'id', returning = '*' }) => {
  assertSupabaseConfigured();

  let body = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const request = id
      ? supabase.from(table).update(body).eq(match, id).select(returning).single()
      : supabase.from(table).insert([body]).select(returning).single();

    const { data, error } = await request;
    if (!error) return data;

    const unknownColumn = getUnknownColumn(error);
    if (!unknownColumn || !(unknownColumn in body)) throw error;
    body = { ...body };
    delete body[unknownColumn];
  }

  const request = id
    ? supabase.from(table).update(body).eq(match, id).select(returning).single()
    : supabase.from(table).upsert([body], { onConflict }).select(returning).single();
  const { data, error } = await request;
  if (error) throw error;
  return data;
};

const LEAD_STATUS_COLUMNS = ['status', 'pipeline_status', 'lead_status', 'stage', 'etapa'];

export const saveLeadRow = async ({ id, payload }) => {
  assertSupabaseConfigured();

  const rawStatus = LEAD_STATUS_COLUMNS
    .map((column) => payload[column])
    .find((value) => value !== undefined);

  if (rawStatus === undefined) {
    return saveRow({ table: 'leads', id, payload });
  }

  const normalizedStatus = normalizeLeadStatus(rawStatus);
  const basePayload = { ...payload };
  LEAD_STATUS_COLUMNS.forEach((column) => delete basePayload[column]);
  let lastError = null;

  for (const statusColumn of LEAD_STATUS_COLUMNS) {
    let body = { ...basePayload, [statusColumn]: normalizedStatus };

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const request = id
        ? supabase.from('leads').update(body).eq('id', id).select('*').single()
        : supabase.from('leads').insert([body]).select('*').single();
      const { data, error } = await request;

      if (!error) return data;

      lastError = error;
      const unknownColumn = getUnknownColumn(error);
      if (unknownColumn === statusColumn) break;
      if (!unknownColumn || !(unknownColumn in body)) throw error;

      body = { ...body };
      delete body[unknownColumn];
    }
  }

  throw lastError || new Error('Nao foi possivel persistir o status do lead.');
};

export const upsertRow = async ({ table, payload, onConflict = 'id', returning = '*' }) => {
  assertSupabaseConfigured();

  let body = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await supabase.from(table).upsert([body], { onConflict }).select(returning).single();
    if (!error) return data;

    const unknownColumn = getUnknownColumn(error);
    if (!unknownColumn || !(unknownColumn in body)) throw error;
    body = { ...body };
    delete body[unknownColumn];
  }

  const { data, error } = await supabase.from(table).upsert([body], { onConflict }).select(returning).single();
  if (error) throw error;
  return data;
};

const saveMirrors = ({ leads, clients, projects, transactions, equipment }) => {
  localStorage.setItem('cv_crm_leads', JSON.stringify(leads));
  localStorage.setItem('cv_studio_clients', JSON.stringify(clients));
  localStorage.setItem('cv_studio_projects', JSON.stringify(projects));
  localStorage.setItem('cv_studio_financas', JSON.stringify(transactions));
  localStorage.setItem('cv_studio_equipamentos', JSON.stringify(equipment));
};

export const getDbStudioData = async () => {
  const [rawLeads, rawClients, rawTransactions, equipment] = await Promise.all([
    selectAll('leads'),
    selectAll('clientes'),
    selectAll('financas'),
    selectAll('equipamentos'),
  ]);
  const rawProjects = await selectAll('projetos');

  const leads = rawLeads.map(mapLeadFromDb);
  const clients = rawClients.map(mapClientFromDb);
  const transactions = rawTransactions.map(mapTransactionFromDb);
  const projects = rawProjects.map((project) => mapProjectFromDb(project, clients, transactions));

  saveMirrors({ leads, clients, projects, transactions, equipment });
  return { leads, clients, projects, transactions, equipment, checklists: {}, contracts: {}, questionnaires: {}, files: {} };
};

export const subscribeDbUpdates = (callback) => {
  const channel = supabase
    .channel(`studioflow-db-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projetos' }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'financas' }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'equipamentos' }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: PROFILE_TABLE }, callback)
    .subscribe();

  return () => supabase.removeChannel(channel);
};

export const updateProjectSchedule = async ({ projectId, data, horario, local }) => {
  assertSupabaseConfigured();
  const { data: currentProject, error: lookupError } = await supabase
    .from('projetos')
    .select('id, data, financeiro')
    .eq('id', projectId)
    .single();
  if (lookupError) throw lookupError;

  const financeiro = {
    ...(currentProject.financeiro && typeof currentProject.financeiro === 'object' ? currentProject.financeiro : {}),
    horario: horario || '',
    local: local || '',
    agendaSincronizada: Boolean(data && horario && local),
    agendaAtualizadaEm: new Date().toISOString(),
  };
  const { data: updatedProject, error } = await supabase
    .from('projetos')
    .update({ data: data || null, financeiro })
    .eq('id', projectId)
    .select('*')
    .single();
  if (error) throw error;
  emitDbUpdate();
  return updatedProject;
};

export const upsertAgendaEvent = async (project) => updateProjectSchedule({
  projectId: project.id,
  data: project.data || null,
  horario: project.horario || project.financeiro?.horario || '',
  local: project.local || project.financeiro?.local || '',
});

export const deleteAgendaEvent = async () => {
  // A Agenda e derivada diretamente de projetos; excluir o projeto remove o evento.
};

export const createFinanceSeed = async (project, client) => {
  const id = `project-finance-${project.id}`;
  const payload = {
    id,
    project_id: project.id,
    cliente_id: client.id,
    descricao: `Projeto criado - ${client.nome}`,
    valor: 0,
    tipo: 'projeto',
    tipo_geral: 'Projeto',
    data: today(),
    status: 'Aberto',
    updated_at: new Date().toISOString(),
  };

  try {
    assertSupabaseConfigured();
    await supabase.from('financas').upsert([payload], { onConflict: 'id' });
  } catch (error) {
    console.error('Erro ao criar financeiro do projeto:', error.message);
  }
};

export const recalculateProjectFinance = async (projectId) => {
  assertSupabaseConfigured();
  const { data: project, error } = await supabase.from('projetos').select('*').eq('id', projectId).single();
  if (error || !project) return null;

  const payments = readPayments(project).map((payment) => ({ ...payment, valor: normalizePaymentValue(payment.valor) }));
  const paid = payments.reduce((sum, payment) => sum + normalizePaymentValue(payment.valor), 0);
  const total = Number(project.valor_contratado ?? project.valorContratado ?? 0);
  const remaining = Math.max(0, total - paid);

  const { data, error: updateError } = await supabase
    .from('projetos')
    .update({ valor_recebido: paid, saldo_restante: remaining, pagamentos: payments, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .select()
    .single();

  if (updateError) throw updateError;
  emitDbUpdate();
  return data;
};

export const convertLeadToClientProject = async (lead) => {
  assertSupabaseConfigured();
  const now = new Date().toISOString();
  const mappedLead = mapLeadFromDb(lead);
  const cleanPhone = (mappedLead.whatsapp || mappedLead.telefone || '').replace(/\D/g, '');
  const cleanEmail = String(mappedLead.email || '').trim().toLowerCase();
  const cleanName = String(mappedLead.nome || '').trim().toLowerCase();
  const { data: clientCandidates, error: clientLookupError } = await supabase.from('clientes').select('*');
  if (clientLookupError) throw clientLookupError;
  const existingClient = (clientCandidates || []).find((client) => {
    const candidatePhone = String(client.whatsapp || client.telefone || '').replace(/\D/g, '');
    const candidateEmail = String(client.email || '').trim().toLowerCase();
    const candidateName = String(client.nome || '').trim().toLowerCase();
    if (cleanPhone && candidatePhone === cleanPhone) return true;
    if (cleanEmail && candidateEmail === cleanEmail) return true;
    return Boolean(cleanName && candidateName === cleanName);
  });
  const total = parseCurrency(mappedLead.valorOrcamento);
  const preserveText = (value, fallback = '') => String(value || '').trim() ? value : fallback;
  const clientPayload = {
    nome: preserveText(mappedLead.nome, existingClient?.nome || 'Cliente sem nome'),
    email: preserveText(mappedLead.email, existingClient?.email),
    telefone: preserveText(mappedLead.telefone, existingClient?.telefone || existingClient?.whatsapp),
    whatsapp: preserveText(mappedLead.whatsapp || mappedLead.telefone, existingClient?.whatsapp || existingClient?.telefone),
    instagram: existingClient?.instagram || '',
    cidade: preserveText(mappedLead.cidade, existingClient?.cidade),
    cliente_desde: existingClient?.cliente_desde || now,
  };

  const client = await saveRow({
    table: 'clientes',
    id: existingClient?.id,
    payload: existingClient ? clientPayload : { ...clientPayload, created_at: now },
  });
  const { data: projectCandidates, error: projectLookupError } = await supabase
    .from('projetos')
    .select('*');
  if (projectLookupError) throw projectLookupError;
  const normalizedService = String(mappedLead.tipoServico || '').trim().toLowerCase();
  const normalizedEventDate = String(mappedLead.dataEvento || '').slice(0, 10);
  const existingProject = (projectCandidates || []).find((project) => {
    const linkedLeadId = project.lead_id
      || project.leadId
      || project.crm_lead_id
      || project.financeiro?.crmLeadId
      || project.financeiro?.crm_lead_id;
    if (mappedLead.id && String(linkedLeadId || '') === String(mappedLead.id)) return true;

    const projectClientId = project.cliente_id || project.client_id;
    if (String(projectClientId || '') !== String(client.id)) return false;

    const projectService = String(project.tipo_servico || project.servico || '').trim().toLowerCase();
    const projectDate = String(project.data || project.data_trabalho || '').slice(0, 10);
    const projectTotal = Number(project.valor_contratado || 0);
    return Boolean(
      normalizedService
      && normalizedEventDate
      && projectService === normalizedService
      && projectDate === normalizedEventDate
      && projectTotal === total
    );
  });
  const currentFinance = existingProject?.financeiro && typeof existingProject.financeiro === 'object'
    ? existingProject.financeiro
    : {};
  const projectPayload = {
    lead_id: mappedLead.id,
    cliente_id: client.id,
    tipo_servico: mappedLead.tipoServico || 'Casamento',
    data: mappedLead.dataEvento || null,
    valor_contratado: total,
    valor_recebido: 0,
    financeiro: {
      ...currentFinance,
      crmLeadId: mappedLead.id,
      receitas: readPayments(existingProject || {}),
      valorContratado: total,
      valorRecebido: Number(existingProject?.valor_recebido || 0),
      saldoRestante: Math.max(0, total - Number(existingProject?.valor_recebido || 0)),
      statusFinanceiro: currentFinance.statusFinanceiro || 'Pendente',
      updatedAt: now,
    },
  };

  const project = await saveRow({
    table: 'projetos',
    id: existingProject?.id,
    payload: existingProject ? projectPayload : { ...projectPayload, created_at: now },
  });

  await createFinanceSeed(project, client);
  await upsertAgendaEvent(project, client);
  emitDbUpdate();
  return { client, project };
};

export const loadProfileFromDb = async () => {
  assertSupabaseConfigured();
  const { data, error } = await supabase.from(PROFILE_TABLE).select('*').eq('id', PROFILE_ID).maybeSingle();
  if (error) throw error;
  return data?.dados || data?.data || data?.perfil || data?.profile || null;
};

export const saveProfileToDb = async (profile) => {
  const now = new Date().toISOString();
  const candidates = [
    { id: PROFILE_ID, dados: profile, updated_at: now },
    { id: PROFILE_ID, perfil: profile, updated_at: now },
    { id: PROFILE_ID, profile, updated_at: now },
  ];

  let lastError = null;
  for (const payload of candidates) {
    try {
      const saved = await upsertRow({ table: PROFILE_TABLE, payload });
      return saved?.dados || saved?.perfil || saved?.profile || profile;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};
