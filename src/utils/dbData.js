import { isSupabaseConfigured, supabase } from './supabase';
import { parseCurrency } from './formatters';

const today = () => new Date().toISOString().slice(0, 10);
const PROFILE_TABLE = 'perfil';
const PROFILE_ID = 'studio-profile';

export const assertSupabaseConfigured = () => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase nao configurado: atualize VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.');
  }
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
  const payments = project.pagamentos || project.historico_pagamentos || project.historicoPagamentos || project.receitas || project.financeiro?.receitas || [];
  return Array.isArray(payments) ? payments : [];
};

export const calculateProjectAmounts = (project = {}) => {
  const total = Number(project.valor_contratado ?? project.valorContratado ?? project.valorTotal ?? 0);
  const payments = readPayments(project);
  const paid = Number(project.valor_recebido ?? project.valorRecebido ?? payments.reduce((sum, payment) => sum + normalizePaymentValue(payment.valor), 0));
  const remaining = Math.max(0, Number(project.saldo_restante ?? project.saldoRestante ?? total - paid));
  return { total, paid, remaining, payments };
};

export const calculatePaymentsSummary = (payments = [], total = 0) => {
  const valorTotal = normalizePaymentValue(total);
  const valorRecebido = payments.reduce((sum, payment) => sum + normalizePaymentValue(payment.valor), 0);
  const valorRestante = Math.max(0, valorTotal - valorRecebido);
  return { valorTotal, valorRecebido, valorRestante };
};

export const mapLeadFromDb = (lead = {}) => ({
  id: lead.id,
  nome: lead.nome || '',
  email: lead.email || '',
  nomeCasal: lead.nome_casal || lead.nomeCasal || '',
  tipoServico: lead.tipo_servico || lead.servico || lead.tipoServico || 'Casamento',
  status: lead.status || 'novo_lead',
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
});

export const mapProjectFromDb = (project = {}, clients = [], transactions = []) => {
  const clientId = project.cliente_id || project.client_id || project.clientId || project.clienteId || project.legacyClientId;
  const client = clients.find((item) => item.id === clientId) || mapClientFromDb(project.cliente || {});
  const payments = readPayments(project);
  const expenses = transactions.filter((item) => item.projectId === project.id && (item.tipoGeral === 'Saida' || item.tipo === 'fixa' || item.tipo === 'variavel'));
  const total = Number(project.valor_contratado ?? project.valorContratado ?? 0);
  const paid = Number(project.valor_recebido ?? project.valorRecebido ?? payments.reduce((sum, payment) => sum + normalizePaymentValue(payment.valor), 0));
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
    status: project.status || 'contrato_fechado',
    valorContratado: total,
    valorRecebido: paid,
    saldoRestante: Number(project.saldo_restante ?? project.saldoRestante ?? Math.max(0, total - paid)),
    data: project.data || project.data_trabalho || project.dataTrabalho || '',
    horario: project.horario || '',
    local: project.local || client.cidade || '',
    receitas: payments,
    pagamentos: payments,
    historicoPagamentos: payments,
    financeiro: {
      receitas: payments,
      despesas: expenses,
      custos: costs,
      lucro: paid - costs,
      margem: paid > 0 ? ((paid - costs) / paid) * 100 : 0,
      valorContratado: total,
      valorRecebido: paid,
      saldoRestante: Number(project.saldo_restante ?? project.saldoRestante ?? Math.max(0, total - paid)),
    },
    agenda: { data: project.data || '', horario: project.horario || '', local: project.local || client.cidade || '' },
    checklist: project.checklist || [],
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

export const upsertAgendaEvent = async (project, client) => {
  const eventPayload = {
    id: project.id,
    project_id: project.id,
    cliente_id: client.id,
    titulo: project.tipo_servico || project.tipoServico || 'Projeto',
    cliente_nome: client.nome || project.cliente_nome || '',
    data: project.data || null,
    horario: project.horario || null,
    status: 'Confirmado',
    updated_at: new Date().toISOString(),
  };

  try {
    assertSupabaseConfigured();
    await supabase.from('agenda_eventos').upsert([eventPayload], { onConflict: 'id' });
  } catch (error) {
    console.error('Erro ao sincronizar agenda:', error.message);
  }
};

export const deleteAgendaEvent = async (projectId) => {
  try {
    assertSupabaseConfigured();
    await supabase.from('agenda_eventos').delete().eq('project_id', projectId);
  } catch (error) {
    console.error('Erro ao excluir evento da agenda:', error.message);
  }
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
  const cleanPhone = (mappedLead.telefone || mappedLead.whatsapp || '').replace(/\D/g, '');
  const existingQuery = cleanPhone
    ? `telefone.ilike.%${cleanPhone}%,whatsapp.ilike.%${cleanPhone}%`
    : `email.eq.${mappedLead.email || 'sem-email'}`;

  const { data: existingClients } = await supabase.from('clientes').select('*').or(existingQuery).limit(1);
  const existingClient = existingClients?.[0];
  const clientPayload = {
    nome: mappedLead.nome || 'Cliente sem nome',
    email: mappedLead.email || '',
    telefone: mappedLead.telefone || '',
    whatsapp: mappedLead.whatsapp || mappedLead.telefone || '',
    cidade: mappedLead.cidade || '',
    origem: mappedLead.origem || '',
    observacoes: mappedLead.observacoes || '',
    updated_at: now,
  };

  const client = await saveRow({
    table: 'clientes',
    id: existingClient?.id,
    payload: existingClient ? clientPayload : { ...clientPayload, created_at: now },
  });
  const total = parseCurrency(mappedLead.valorOrcamento);
  const projectPayload = {
    id: mappedLead.id,
    cliente_id: client.id,
    cliente_nome: client.nome,
    tipo_servico: mappedLead.tipoServico || 'Casamento',
    servico: mappedLead.tipoServico || 'Casamento',
    data: mappedLead.dataEvento || null,
    valor_contratado: total,
    valor_recebido: 0,
    saldo_restante: total,
    pagamentos: [],
    status: 'contrato_fechado',
    lead_id: mappedLead.id,
    updated_at: now,
  };

  const { data: existingProjects } = await supabase.from('projetos').select('id').eq('lead_id', mappedLead.id).limit(1);
  const project = await saveRow({
    table: 'projetos',
    id: existingProjects?.[0]?.id,
    payload: existingProjects?.[0] ? projectPayload : { ...projectPayload, created_at: now },
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
