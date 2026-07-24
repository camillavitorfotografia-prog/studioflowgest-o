import { isSupabaseConfigured, supabase } from './supabase';
import { parseCurrency } from './formatters';
import { normalizeLeadStatus } from '../data/crm';
import { isConfirmedPayment } from './financeEngine';
import { normalizeProductionStatus } from './projectEngine.js';

const today = () => new Date().toISOString().slice(0, 10);
const PROFILE_TABLE = 'perfil';
const PROFILE_ID = 'studio-profile';
const EQUIPMENT_DELETION_KEY = 'cv_studio_equipamentos_excluidos';

const readEquipmentTombstones = () => {
  try {
    const value = JSON.parse(localStorage.getItem(EQUIPMENT_DELETION_KEY) || '[]');
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
};

const writeEquipmentTombstones = (ids) => {
  localStorage.setItem(EQUIPMENT_DELETION_KEY, JSON.stringify([...ids]));
};

// Compatibilidade com o módulo Financeiro: impede que uma despesa recrie um
// equipamento que já foi explicitamente excluído.
export const isEquipmentMarkedDeleted = (equipmentOrId) => {
  const equipment = equipmentOrId && typeof equipmentOrId === 'object'
    ? equipmentOrId
    : { id: equipmentOrId };

  const tombstones = readEquipmentTombstones();
  const candidates = [
    equipment.id,
    equipment.financeExpenseId,
    equipment.origemFinanceiraId,
    equipment.finance_expense_id,
    equipment.origem_financeira_id,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  return candidates.some((value) => (
    tombstones.has(value)
    || tombstones.has(`id:${value}`)
    || tombstones.has(`finance:${value}`)
  ));
};

export const assertSupabaseConfigured = () => {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase nao configurado: atualize VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.',
    );
  }
};

export const isMissingRelationError = (error, table) => {
  const message = String(error?.message || '').toLowerCase();
  const normalizedTable = String(table || '').toLowerCase();

  return error?.code === 'PGRST205'
    || (
      message.includes('could not find the table')
      && (
        !normalizedTable
        || message.includes(normalizedTable)
      )
    );
};

export const emitDbUpdate = (detail = {}) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('sf_storage_update', { detail }));

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel('studioflow-db-updates');
    channel.postMessage({
      type: 'studioflow-db-update',
      at: Date.now(),
      detail,
    });
    channel.close();
  }
};

export const normalizePaymentValue = (value) => {
  if (!value) return 0;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

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

    if (!uniquePayments.has(key)) {
      uniquePayments.set(key, payment);
    }
  });

  return [...uniquePayments.values()];
};

export const calculateProjectAmounts = (project = {}) => {
  const total = Number(
    project.valor_contratado
      ?? project.valorContratado
      ?? project.valorTotal
      ?? 0,
  );

  const payments = readPayments(project);
  const paymentSummary = calculatePaymentsSummary(payments, total);

  const explicitPaid = Number(
    project.valor_recebido
      ?? project.valorRecebido
      ?? project.financeiro?.valorRecebido
      ?? 0,
  );
  const paid = Math.max(paymentSummary.valorRecebido, explicitPaid);
  const remaining = Math.max(0, total - paid);

  return {
    total,
    paid,
    remaining,
    payments,
  };
};

export const calculatePaymentsSummary = (payments = [], total = 0) => {
  const valorTotal = normalizePaymentValue(total);

  const valorRecebido = payments.reduce((sum, payment) => {
    return isConfirmedPayment(payment)
      ? sum + normalizePaymentValue(payment.valor)
      : sum;
  }, 0);

  const valorRestante = Math.max(0, valorTotal - valorRecebido);

  return {
    valorTotal,
    valorRecebido,
    valorRestante,
  };
};

const getLatestCommercialSnapshot = (lead = {}) => {
  const history = Array.isArray(lead.historico)
    ? lead.historico
    : [];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const snapshot = history[index]?.dadosComerciais
      || history[index]?.dados_comerciais;

    if (
      snapshot
      && typeof snapshot === 'object'
      && !Array.isArray(snapshot)
    ) {
      return snapshot;
    }
  }

  return {};
};

export const mapLeadFromDb = (lead = {}) => {
  const commercialSnapshot = getLatestCommercialSnapshot(lead);

  return ({
    id: lead.id,
    nome: lead.nome || '',
    email: lead.email || '',
    nomeCasal: lead.nome_casal || lead.nomeCasal || '',

    tipoServico:
      lead.tipo_servico
      || lead.servico
      || lead.tipoServico
      || 'Casamento',

    status: normalizeLeadStatus(
      lead.status
        ?? lead.pipeline_status
        ?? lead.lead_status
        ?? lead.stage
        ?? lead.etapa,
    ),

    valorOrcamento:
      lead.valor_orcamento !== null
      && lead.valor_orcamento !== undefined
        ? String(lead.valor_orcamento)
        : (lead.valorOrcamento || '0'),

    dataEvento:
      lead.data_evento
      || lead.dataEvento
      || '',

    dataOrcamento:
      lead.data_orcamento
      || lead.dataOrcamento
      || '',

    origem:
      lead.origem
      || 'Instagram',

    indicacao:
      lead.indicacao
      || commercialSnapshot.indicacao
      || '',

    indicacaoClienteId:
      lead.indicacao_cliente_id
      || lead.indicacaoClienteId
      || commercialSnapshot.indicacaoClienteId
      || '',

    campanha:
      lead.campanha
      || commercialSnapshot.campanha
      || '',

    dataPrimeiroContato:
      lead.data_primeiro_contato
      || lead.dataPrimeiroContato
      || commercialSnapshot.dataPrimeiroContato
      || '',

    dataUltimoContato:
      lead.data_ultimo_contato
      || lead.dataUltimoContato
      || commercialSnapshot.dataUltimoContato
      || '',

    dataProximoFollowup:
      lead.data_proximo_followup
      || lead.dataProximoFollowup
      || lead.data_proximo_retorno
      || commercialSnapshot.dataProximoFollowup
      || '',

    motivoPerda:
      lead.motivo_perda
      || lead.motivoPerda
      || commercialSnapshot.motivoPerda
      || '',

    motivoCancelamento:
      lead.motivo_cancelamento
      || lead.motivoCancelamento
      || commercialSnapshot.motivoCancelamento
      || '',

    prioridade:
      lead.prioridade
      || commercialSnapshot.prioridade
      || 'media',

    temperatura:
      lead.temperatura
      || commercialSnapshot.temperatura
      || 'morno',

    probabilidadeFechamento: Math.max(
      0,
      Math.min(
        100,
        Number(
          lead.probabilidade_fechamento
          ?? lead.probabilidadeFechamento
          ?? commercialSnapshot.probabilidadeFechamento
          ?? 50,
        ),
      ),
    ),

    anexos: Array.isArray(lead.anexos)
      ? lead.anexos
      : (
        Array.isArray(commercialSnapshot.anexos)
          ? commercialSnapshot.anexos
          : []
      ),

    telefone:
      lead.telefone
      || '',

    whatsapp:
      lead.whatsapp
      || lead.telefone
      || '',

    cidade:
      lead.cidade
      || '',

    observacoes:
      lead.observacoes
      || '',

    historico:
      Array.isArray(lead.historico)
        ? lead.historico
        : [],

    createdAt:
      lead.created_at
      || lead.createdAt,

    updatedAt:
      lead.updated_at
      || lead.updatedAt,

    // Preserve lifecycle fields so a trashed lead remains trashed after reload.
    deletedAt:
      lead.deleted_at
      || lead.deletedAt
      || lead.excluido_em
      || lead.excluidoEm
      || null,

    deleted_at:
      lead.deleted_at
      || lead.deletedAt
      || lead.excluido_em
      || lead.excluidoEm
      || null,

    naLixeira: Boolean(
      lead.na_lixeira
      ?? lead.naLixeira
      ?? lead.deleted_at
      ?? lead.deletedAt
      ?? lead.excluido_em
      ?? lead.excluidoEm
    ),

    na_lixeira: Boolean(
      lead.na_lixeira
      ?? lead.naLixeira
      ?? lead.deleted_at
      ?? lead.deletedAt
      ?? lead.excluido_em
      ?? lead.excluidoEm
    ),
  });
};

export const mapClientFromDb = (client = {}) => ({
  id: client.id,
  nome: client.nome || client.name || 'Cliente',
  email: client.email || '',
  telefone: client.telefone || client.whatsapp || '',
  whatsapp: client.whatsapp || client.telefone || '',
  instagram: client.instagram || '',
  cpfCnpj: client.cpf_cnpj || client.cpfCnpj || '',
  endereco: client.endereco || '',
  cidade: client.cidade || '',
  dataNascimento: client.data_nascimento || client.dataNascimento || '',
  origem: client.origem || '',
  indicacao: client.indicacao || '',
  indicacaoClienteId: client.indicacao_cliente_id || client.indicacaoClienteId || '',
  observacoes: client.observacoes || '',
  datasImportantes: Array.isArray(client.datas_importantes)
    ? client.datas_importantes
    : (Array.isArray(client.datasImportantes) ? client.datasImportantes : []),
  historicoContatos: Array.isArray(client.historico_contatos)
    ? client.historico_contatos
    : (Array.isArray(client.historicoContatos) ? client.historicoContatos : []),
  dataPrimeiroContato: client.data_primeiro_contato || client.dataPrimeiroContato || '',
  dataUltimoContato: client.data_ultimo_contato || client.dataUltimoContato || '',
  dataProximoRetorno: client.data_proximo_retorno || client.dataProximoRetorno || '',
  statusComercial: client.status_comercial || client.statusComercial || 'novo',
  status: client.status || 'ativo',
  clienteDesde:
    client.cliente_desde
    || client.clienteDesde
    || client.created_at
    || client.createdAt
    || new Date().toISOString(),
  createdAt: client.created_at || client.createdAt || new Date().toISOString(),
  updatedAt: client.updated_at || client.updatedAt || new Date().toISOString(),
  created_at: client.created_at || client.createdAt,
  updated_at: client.updated_at || client.updatedAt,
});


export const mapEquipmentFromDb = (item = {}) => ({
  ...item,
  id: item.id,
  nome: item.nome || item.name || '',
  categoria: item.categoria || 'Outro',
  marca: item.marca || '',
  modelo: item.modelo || '',
  numeroSerie: item.numero_serie || item.numeroSerie || '',
  fornecedor: item.fornecedor || '',
  status: item.status || 'Ativo',
  valor: Number(item.valor ?? item.valor_compra ?? item.valorCompra ?? 0),
  valorCompra: Number(item.valor_compra ?? item.valorCompra ?? item.valor ?? 0),
  dataCompra: item.data_compra || item.dataCompra || '',
  garantiaAte: item.garantia_ate || item.garantiaAte || '',
  proximaRevisao: item.proxima_revisao || item.proximaRevisao || '',
  vidaUtilAnos: Number(item.vida_util_anos ?? item.vidaUtilAnos ?? 5),
  valorResidual: Number(item.valor_residual ?? item.valorResidual ?? 0),
  metodoDepreciacao: item.metodo_depreciacao || item.metodoDepreciacao || 'linear',
  observacoes: item.observacoes || '',
  manutencoes: Array.isArray(item.manutencoes) ? item.manutencoes : [],
  origem: item.origem || 'manual',
  criadoEm: item.created_at || item.criadoEm,
  atualizadoEm: item.updated_at || item.atualizadoEm,
});

export const mapTransactionFromDb = (transaction = {}) => ({
  ...transaction,
  id: transaction.id,
  projectId:
    transaction.project_id
    || transaction.projectId
    || transaction.projeto_id
    || '',
  clientId:
    transaction.client_id
    || transaction.clientId
    || transaction.cliente_id
    || '',
  descricao: transaction.descricao || transaction.nome || '',
  nome: transaction.nome || transaction.descricao || '',
  valor: transaction.valor || 0,
  tipo: transaction.tipo || '',
  tipoGeral:
    transaction.tipo_geral
    || transaction.tipoGeral
    || transaction.tipo
    || '',
  data:
    transaction.data
    || transaction.data_vencimento
    || transaction.dataVencimento
    || '',
  dataVencimento:
    transaction.data_vencimento
    || transaction.dataVencimento
    || transaction.data
    || '',
  vencimento:
    transaction.data_vencimento
    || transaction.vencimento
    || transaction.dataVencimento
    || transaction.data
    || '',
  dataPagamento:
    transaction.data_pagamento
    || transaction.dataPagamento
    || '',
  data_pagamento:
    transaction.data_pagamento
    || transaction.dataPagamento
    || '',
  dataRecebimento:
    transaction.data_recebimento
    || transaction.dataRecebimento
    || ((String(transaction.tipo_geral || transaction.tipoGeral || '').toLowerCase() === 'entrada'
      || ['receita_avulsa', 'receita_contrato', 'avulsa'].includes(transaction.tipo))
      ? (transaction.data_pagamento || transaction.dataPagamento || '')
      : ''),
  status: transaction.status || '',
  categoria: transaction.categoria || '',
  fornecedor: transaction.fornecedor || '',
  eventoRelacionado:
    transaction.evento_relacionado
    || transaction.eventoRelacionado
    || '',
  formaPagamento:
    transaction.forma_pagamento
    || transaction.formaPagamento
    || '',
  contaOrigem:
    transaction.conta_origem
    || transaction.contaOrigem
    || 'empresa',
  detalhes: transaction.detalhes || {},
  ...(transaction.detalhes && typeof transaction.detalhes === 'object' ? transaction.detalhes : {}),
  recurrenceId:
    transaction.recurrence_id
    || transaction.recurrenceId
    || transaction.recorrenciaId
    || '',
  recorrenciaId:
    transaction.recurrence_id
    || transaction.recurrenceId
    || transaction.recorrenciaId
    || '',
  competencia:
    transaction.competencia
    || transaction.detalhes?.competencia
    || transaction.details?.competencia
    || String(
      transaction.data_vencimento
      || transaction.dataVencimento
      || transaction.data
      || '',
    ).slice(0, 7),
  recurrenceIndex:
    transaction.recurrence_index
    ?? transaction.recurrenceIndex
    ?? null,
  recorrente: Boolean(transaction.recorrente),
});export const mapProjectFromDb = (
  project = {},
  clients = [],
  transactions = [],
) => {
  const financeiroBase = (
    project.financeiro
    && typeof project.financeiro === 'object'
      ? project.financeiro
      : {}
  );

  const projectData = (
    financeiroBase.projectData
    && typeof financeiroBase.projectData === 'object'
      ? financeiroBase.projectData
      : {}
  );

  const clientId =
    project.cliente_id
    || project.client_id
    || project.clientId
    || project.clienteId
    || project.legacyClientId
    || projectData.clienteId
    || '';

  const client = clients.find(
    (item) => String(item.id) === String(clientId),
  ) || mapClientFromDb(project.cliente || {});

  const payments = readPayments(project);

  const expenses = transactions.filter((item) => (
    String(item.projectId || '') === String(project.id || '')
    && (
      item.tipoGeral === 'Saida'
      || item.tipo === 'fixa'
      || item.tipo === 'variavel'
    )
  ));

  const total = Number(
    project.valor_contratado
    ?? project.valorContratado
    ?? financeiroBase.valorContratado
    ?? projectData.valorContratado
    ?? 0,
  );

  const paymentSummary = calculatePaymentsSummary(
    payments,
    total,
  );

  const explicitPaid = Number(
    project.valor_recebido
      ?? project.valorRecebido
      ?? financeiroBase.valorRecebido
      ?? 0,
  );
  const paid = Math.max(paymentSummary.valorRecebido, explicitPaid);
  const remaining = Math.max(0, total - paid);

  const costs = expenses.reduce(
    (sum, item) => (
      sum + normalizePaymentValue(item.valor)
    ),
    0,
  );

  const data =
    project.data
    || project.data_trabalho
    || project.dataTrabalho
    || projectData.data
    || '';

  const horario =
    project.horario
    || projectData.horario
    || financeiroBase.horario
    || '';

  const local =
    project.local
    || projectData.local
    || financeiroBase.local
    || client.cidade
    || '';

  const operationalStatus = normalizeProductionStatus(
    project.status_producao
    || project.statusProducao
    || financeiroBase.statusProducao
    || project.status
    || financeiroBase.workflowStatus
    || financeiroBase.statusProjeto
    || 'novo',
  );

  return {
    ...project,
    ...projectData,
    id: project.id,
    leadId:
      project.lead_id
      || project.leadId
      || financeiroBase.crmLeadId
      || '',
    clientId,
    clienteId: clientId,
    clienteNome:
      project.cliente_nome
      || project.clienteNome
      || project.cliente_nome_importado
      || project.clienteNomeImportado
      || projectData.clienteNome
      || projectData.clienteNomeImportado
      || financeiroBase.clienteNomeImportado
      || client.nome
      || '',
    cliente: client,
    titulo:
      project.titulo
      || projectData.titulo
      || '',
    tipoServico:
      project.tipo_servico
      || project.servico
      || project.tipoServico
      || project.tipoTrabalho
      || projectData.tipoServico
      || 'Evento',
    categoria:
      project.categoria
      || projectData.categoria
      || project.tipo_servico
      || project.servico
      || project.tipoServico
      || 'Evento',
    descricao:
      project.descricao
      || projectData.descricao
      || '',
    observacoes:
      project.observacoes
      || projectData.observacoes
      || '',
    status: operationalStatus,
    statusProducao: operationalStatus,
    statusComercial:
      project.statusComercial
      || project.status_comercial
      || projectData.statusComercial
      || 'novo_contato',
    prioridade:
      project.prioridade
      || projectData.prioridade
      || 'normal',
    calendarSync:
      project.calendario_sync
      || project.calendarSync
      || financeiroBase.calendarSync
      || {},
    valorContratado: total,
    valorRecebido: paid,
    saldoRestante: remaining,
    data,
    dataEvento: data,
    horario,
    horaInicio: horario,
    horaFim:
      project.horaFim
      || projectData.horaFim
      || '',
    local,
    cidade:
      project.cidade
      || projectData.cidade
      || client.cidade
      || '',
    estado:
      project.estado
      || projectData.estado
      || '',
    endereco:
      project.endereco
      || projectData.endereco
      || '',
    prazoEntregaDias: Number(
      project.prazoEntregaDias
      ?? projectData.prazoEntregaDias
      ?? 0,
    ),
    dataPrevistaEntrega:
      project.dataPrevistaEntrega
      || projectData.dataPrevistaEntrega
      || '',
    dataRealEntrega:
      project.dataRealEntrega
      || projectData.dataRealEntrega
      || '',
    custoEstimado: Number(
      project.custoEstimado
      ?? projectData.custoEstimado
      ?? 0,
    ),
    custoReal: Number(
      project.custoReal
      ?? projectData.custoReal
      ?? 0,
    ),
    arquivado: Boolean(
      project.arquivado
      ?? projectData.arquivado
      ?? false,
    ),
    receitas: payments,
    pagamentos: payments,
    historicoPagamentos: payments,
    financeiro: {
      ...financeiroBase,
      projectData,
      receitas: payments,
      despesas: expenses,
      custos: costs,
      lucro: paid - costs,
      margem: paid > 0
        ? ((paid - costs) / paid) * 100
        : 0,
      valorContratado: total,
      valorRecebido: paid,
      saldoRestante: remaining,
    },
    agenda: {
      data,
      horario,
      local,
    },
    checklist:
      project.checklist
      || financeiroBase.checklist
      || [],
    equipamentos: project.equipamentos || [],
    equipamentosDetalhados: [],
    timelineCompleta:
      project.timeline
      || project.historico
      || financeiroBase.timeline
      || [],
    createdAt:
      project.created_at
      || project.createdAt
      || new Date().toISOString(),
    updatedAt:
      project.updated_at
      || project.updatedAt
      || financeiroBase.updatedAt
      || new Date().toISOString(),
  };
};

const unavailableTables = new Set();

/*
 * Estas tabelas ainda não existem no Supabase deste projeto.
 * Enquanto não forem criadas, o StudioFlow usa somente o
 * armazenamento local e não realiza requisições que gerariam 404.
 */
const LOCAL_ONLY_TABLES = new Set([
  'leads',
]);

const readLocalArray = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const TABLE_FALLBACKS = {
  leads: () => readLocalArray('cv_crm_leads'),
  equipamentos: () => readLocalArray('cv_studio_equipamentos'),
};

const selectAll = async (table, orderColumn = 'created_at') => {
  const fallback = TABLE_FALLBACKS[table];

  if (
    LOCAL_ONLY_TABLES.has(table)
    || unavailableTables.has(table)
  ) {
    return fallback ? fallback() : [];
  }

  try {
    assertSupabaseConfigured();

    let query = supabase.from(table).select('*');

    if (orderColumn) {
      query = query.order(orderColumn, {
        ascending: false,
      });
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  } catch (error) {
    if (isMissingRelationError(error, table)) {
      unavailableTables.add(table);
      return fallback ? fallback() : [];
    }

    console.error(`Erro ao carregar ${table}:`, error.message);
    return fallback ? fallback() : [];
  }
};

const getUnknownColumn = (error) => {
  const message = error?.message || '';

  return (
    message.match(/'([^']+)' column/)?.[1]
    || message.match(/column "([^"]+)"/)?.[1]
    || message.match(/Could not find the '([^']+)' column/)?.[1]
    || null
  );
};

export const saveRow = async ({
  table,
  payload,
  id,
  match = 'id',
  onConflict = 'id',
  returning = '*',
}) => {
  assertSupabaseConfigured();

  let body = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const request = id
      ? supabase
        .from(table)
        .update(body)
        .eq(match, id)
        .select(returning)
        .single()
      : supabase
        .from(table)
        .insert([body])
        .select(returning)
        .single();

    const { data, error } = await request;

    if (!error) return data;

    const unknownColumn = getUnknownColumn(error);

    if (!unknownColumn || !(unknownColumn in body)) {
      throw error;
    }

    body = {
      ...body,
    };

    delete body[unknownColumn];
  }

  const request = id
    ? supabase
      .from(table)
      .update(body)
      .eq(match, id)
      .select(returning)
      .single()
    : supabase
      .from(table)
      .upsert([body], { onConflict })
      .select(returning)
      .single();

  const { data, error } = await request;

  if (error) throw error;

  return data;
};

const LEAD_STATUS_COLUMNS = [
  'status',
  'pipeline_status',
  'lead_status',
  'stage',
  'etapa',
];

export const saveLeadRow = async ({ id, payload }) => {
  assertSupabaseConfigured();

  const rawStatus = LEAD_STATUS_COLUMNS
    .map((column) => payload[column])
    .find((value) => value !== undefined);

  if (rawStatus === undefined) {
    return saveRow({
      table: 'leads',
      id,
      payload,
    });
  }

  const normalizedStatus = normalizeLeadStatus(rawStatus);
  const basePayload = {
    ...payload,
  };

  LEAD_STATUS_COLUMNS.forEach((column) => {
    delete basePayload[column];
  });

  let lastError = null;

  for (const statusColumn of LEAD_STATUS_COLUMNS) {
    let body = {
      ...basePayload,
      [statusColumn]: normalizedStatus,
    };

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const request = id
        ? supabase
          .from('leads')
          .update(body)
          .eq('id', id)
          .select('*')
          .single()
        : supabase
          .from('leads')
          .insert([body])
          .select('*')
          .single();

      const { data, error } = await request;

      if (!error) return data;

      lastError = error;

      const unknownColumn = getUnknownColumn(error);

      if (unknownColumn === statusColumn) break;

      if (!unknownColumn || !(unknownColumn in body)) {
        throw error;
      }

      body = {
        ...body,
      };

      delete body[unknownColumn];
    }
  }

  throw lastError
    || new Error('Nao foi possivel persistir o status do lead.');
};

export const upsertRow = async ({
  table,
  payload,
  onConflict = 'id',
  returning = '*',
}) => {
  assertSupabaseConfigured();

  let body = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await supabase
      .from(table)
      .upsert([body], { onConflict })
      .select(returning)
      .single();

    if (!error) return data;

    const unknownColumn = getUnknownColumn(error);

    if (!unknownColumn || !(unknownColumn in body)) {
      throw error;
    }

    body = {
      ...body,
    };

    delete body[unknownColumn];
  }

  const { data, error } = await supabase
    .from(table)
    .upsert([body], { onConflict })
    .select(returning)
    .single();

  if (error) throw error;

  return data;
};


export const syncEquipmentList = async (items = []) => {
  const tombstones = readEquipmentTombstones();
  const list = (Array.isArray(items) ? items : []).filter((item) => (
    !tombstones.has(String(item?.id || ''))
  ));

  // Registros explicitamente excluídos nunca devem ser reativados por uma
  // cópia antiga do estado, por outro evento de sincronização ou por um espelho
  // desatualizado do localStorage. A remoção do tombstone só deve acontecer em
  // uma futura ação explícita de restauração, que o módulo ainda não oferece.
  localStorage.setItem('cv_studio_equipamentos', JSON.stringify(list));
  if (!isSupabaseConfigured || unavailableTables.has('equipamentos')) return list;

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const userId = authData?.user?.id;
  if (!userId) {
    throw new Error('Sessão do usuário não encontrada. Entre novamente para sincronizar os equipamentos.');
  }

  const payload = list.map((item) => ({
    user_id: userId,
    id: String(item.id || `equipamento-${crypto.randomUUID()}`),
    nome: item.nome || item.name || 'Equipamento',
    categoria: item.categoria || 'Outro',
    marca: item.marca || null,
    modelo: item.modelo || null,
    numero_serie: item.numeroSerie || item.numero_serie || null,
    fornecedor: item.fornecedor || null,
    status: item.status || 'Ativo',
    valor: Number(item.valor ?? item.valorCompra ?? 0),
    valor_compra: Number(item.valorCompra ?? item.valor ?? 0),
    data_compra: item.dataCompra || null,
    garantia_ate: item.garantiaAte || null,
    proxima_revisao: item.proximaRevisao || null,
    vida_util_anos: Number(item.vidaUtilAnos || 5),
    valor_residual: Number(item.valorResidual || 0),
    metodo_depreciacao: item.metodoDepreciacao || 'linear',
    observacoes: item.observacoes || null,
    manutencoes: Array.isArray(item.manutencoes) ? item.manutencoes : [],
    origem: item.origem || 'manual',
    comprador: item.destinatarioSaida || item.comprador || null,
    data_venda: item.dataSaida || item.dataVenda || null,
    valor_venda: Number(item.valorAtribuidoSaida ?? item.valorVenda ?? 0),
    forma_recebimento: item.formaSaida || item.formaRecebimento || null,
    observacoes_venda: item.observacoesSaida || item.observacoesVenda || null,
    valor_contabil_venda: Number(item.valorContabilVenda || 0),
    resultado_patrimonial_venda: Number(item.resultadoPatrimonialVenda || 0),
    depreciacao_encerrada_em: item.depreciacaoEncerradaEm || null,
    historico: Array.isArray(item.historico) ? item.historico : [],
    tipo_saida: item.tipoSaida || null,
    referencia_negociacao: item.referenciaNegociacao || null,
    servico_recebido: item.servicoRecebido || null,
    fornecedor_servico: item.fornecedorServico || null,
    valor_total_servico: Number(item.valorTotalServico || 0),
    complemento_dinheiro: Number(item.complementoDinheiro || 0),
    conta_complemento: item.contaComplemento || null,
    finance_exit_id: item.financeExitId || null,
    origem_recursos_tipo: item.origemRecursosTipo || null,
    origem_recursos: item.origemRecursos || null,
    entrada_origem_id: item.entradaOrigemId || null,
    composicao_recursos: Array.isArray(item.composicaoRecursos) ? item.composicaoRecursos : [],
    updated_at: new Date().toISOString(),
  }));

  if (payload.length) {
    // O projeto pode ser aberto antes de a migration mais recente ser aplicada.
    // Nessa situação o PostgREST rejeita todo o upsert por causa de uma coluna
    // nova. Removemos somente a coluna desconhecida e repetimos a operação,
    // preservando a sincronização dos campos já existentes no Supabase.
    let compatiblePayload = payload.map((item) => ({ ...item }));
    const removedColumns = [];
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const { error } = await supabase.from('equipamentos').upsert(compatiblePayload, { onConflict: 'id' });
      if (!error) break;

      const message = String(error.message || error.details || '');
      const match = message.match(/(?:column|campo) ['"]?([a-zA-Z0-9_]+)['"]?/i)
        || message.match(/Could not find the ['"]([^'"]+)['"] column/i);
      const missingColumn = match?.[1];
      if (!missingColumn || !compatiblePayload.some((item) => Object.prototype.hasOwnProperty.call(item, missingColumn))) {
        throw error;
      }

      removedColumns.push(missingColumn);
      compatiblePayload = compatiblePayload.map((item) => {
        const next = { ...item };
        delete next[missingColumn];
        return next;
      });
    }

    if (removedColumns.length) {
      console.warn('Equipamentos sincronizados em modo compatível. Aplique as migrations para habilitar todos os campos:', removedColumns);
    }
  }

  // Sincroniza apenas os registros informados. Não remove os demais equipamentos
  // do Supabase, pois a lista local pode ser parcial (por exemplo, após filtros,
  // migrações ou acesso em outro dispositivo). A exclusão é sempre explícita.
  return list;
};

export const deleteEquipmentRow = async (equipmentId) => {
  const id = String(equipmentId || '').trim();
  if (!id) return { deleted: false, reason: 'invalid-id' };

  // O tombstone é gravado antes da chamada remota para impedir que qualquer
  // atualização concorrente recoloque o item na interface enquanto a exclusão
  // ainda está em andamento.
  const tombstones = readEquipmentTombstones();
  tombstones.add(id);
  writeEquipmentTombstones(tombstones);

  const local = (() => {
    try { return JSON.parse(localStorage.getItem('cv_studio_equipamentos') || '[]'); } catch { return []; }
  })();
  const next = Array.isArray(local)
    ? local.filter((item) => String(item?.id) !== id)
    : [];
  safeMirrorWrite('cv_studio_equipamentos', next);

  if (isSupabaseConfigured && !unavailableTables.has('equipamentos')) {
    // A política RLS do Supabase já limita os registros que o usuário pode
    // excluir. O filtro adicional por user_id fazia registros antigos afetarem
    // zero linhas sem que o PostgREST retornasse erro.
    const { data: deletedRows, error } = await supabase
      .from('equipamentos')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;

    // Só considere a operação concluída quando a linha realmente não existir.
    if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
      const verification = await supabase
        .from('equipamentos')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (verification.error) throw verification.error;
      if (verification.data) {
        throw new Error(
          'O Supabase não autorizou a exclusão deste equipamento. '
          + 'Verifique a política RLS da tabela equipamentos.',
        );
      }
    }
  }

  emitDbUpdate({ entity: 'equipamentos', action: 'delete', id });
  return { deleted: true, id };
};

const safeMirrorWrite = (key, value, { maxBytes = 700_000 } = {}) => {
  if (typeof window === 'undefined') return false;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > maxBytes) {
      localStorage.removeItem(key);
      return false;
    }
    localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    if (error?.name === 'QuotaExceededError') {
      try { localStorage.removeItem(key); } catch { /* noop */ }
      return false;
    }
    console.warn(`Não foi possível atualizar o espelho local: ${key}`, error);
    return false;
  }
};

const saveMirrors = ({ leads, clients, projects, transactions, equipment }) => {
  if (!unavailableTables.has('leads')) safeMirrorWrite('cv_crm_leads', leads);
  safeMirrorWrite('cv_studio_clients', clients);
  // Projetos podem exceder facilmente o limite do localStorage.
  // O Supabase é a fonte oficial e nenhum espelho completo é gravado aqui.
  try { localStorage.removeItem('cv_studio_projects'); } catch { /* noop */ }
  // O Supabase é a fonte oficial do Financeiro. Evita estourar o limite de 5 MB do localStorage.
  safeMirrorWrite('cv_studio_financas', transactions, { maxBytes: 350_000 });
  if (!unavailableTables.has('equipamentos')) safeMirrorWrite('cv_studio_equipamentos', equipment);
};

export const getDbStudioData = async () => {
  const [
    rawLeads,
    rawClients,
    rawTransactions,
    rawEquipment,
  ] = await Promise.all([
    selectAll('leads'),
    selectAll('clientes'),
    selectAll('financas'),
    selectAll('equipamentos'),
  ]);

  const rawProjects = await selectAll('projetos');

  const leads = rawLeads.map(mapLeadFromDb);
  const clients = rawClients.map(mapClientFromDb);
  const transactions = rawTransactions.map(mapTransactionFromDb);
  const localEquipment = (() => {
    try { return JSON.parse(localStorage.getItem('cv_studio_equipamentos') || '[]'); } catch { return []; }
  })();
  const tombstones = readEquipmentTombstones();
  const remoteEquipment = rawEquipment
    .map(mapEquipmentFromDb)
    .filter((item) => !tombstones.has(String(item.id)));
  const localEquipmentList = (Array.isArray(localEquipment) ? localEquipment : [])
    .filter((item) => !tombstones.has(String(item?.id || '')));

  // O Supabase é a fonte oficial do patrimônio. Antes, registros existentes
  // apenas no localStorage eram mesclados e enviados novamente ao banco durante
  // o carregamento. Isso recriava equipamentos já excluídos. O espelho local só
  // é usado quando o Supabase não está disponível ou a tabela não existe.
  const equipment = (
    isSupabaseConfigured && !unavailableTables.has('equipamentos')
      ? remoteEquipment
      : localEquipmentList
  );

  const projects = rawProjects.map((project) => (
    mapProjectFromDb(
      project,
      clients,
      transactions,
    )
  ));

  saveMirrors({
    leads,
    clients,
    projects,
    transactions,
    equipment,
  });

  return {
    leads,
    clients,
    projects,
    transactions,
    equipment,
    checklists: {},
    contracts: {},
    questionnaires: {},
    files: {},
  };
};

export const subscribeDbUpdates = (callback) => {
  let disposed = false;
  let timer = null;
  let realtimeChannel = null;
  let broadcastChannel = null;

  const schedule = () => {
    if (disposed) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!disposed) callback();
    }, 120);
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') schedule();
  };

  window.addEventListener('sf_storage_update', schedule);
  window.addEventListener('storage', schedule);
  window.addEventListener('focus', schedule);
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', handleVisibility);

  if ('BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('studioflow-db-updates');
    broadcastChannel.addEventListener('message', schedule);
  }

  if (isSupabaseConfigured) {
    realtimeChannel = supabase.channel(
      `studioflow-db-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );

    const tables = [
      'clientes',
      'projetos',
      'financas',
      PROFILE_TABLE,
      'equipamentos',
    ];

    tables.forEach((table) => {
      realtimeChannel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
        },
        schedule,
      );
    });

    realtimeChannel.subscribe();
  }

  return () => {
    disposed = true;
    window.clearTimeout(timer);
    window.removeEventListener('sf_storage_update', schedule);
    window.removeEventListener('storage', schedule);
    window.removeEventListener('focus', schedule);
    window.removeEventListener('pageshow', schedule);
    document.removeEventListener('visibilitychange', handleVisibility);
    broadcastChannel?.close();
    if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
  };
};export const updateProjectSchedule = async ({
  projectId,
  data,
  horario,
  local,
}) => {
  assertSupabaseConfigured();

  const {
    data: currentProject,
    error: lookupError,
  } = await supabase
    .from('projetos')
    .select('id, data, financeiro')
    .eq('id', projectId)
    .single();

  if (lookupError) throw lookupError;

  const financeiro = {
    ...(
      currentProject.financeiro
      && typeof currentProject.financeiro === 'object'
        ? currentProject.financeiro
        : {}
    ),
    horario: horario || '',
    local: local || '',
    agendaSincronizada: Boolean(
      data
      && horario
      && local,
    ),
    agendaAtualizadaEm: new Date().toISOString(),
  };

  const {
    data: updatedProject,
    error,
  } = await supabase
    .from('projetos')
    .update({
      data: data || null,
      financeiro,
    })
    .eq('id', projectId)
    .select('*')
    .single();

  if (error) throw error;

  emitDbUpdate();

  return updatedProject;
};

export const upsertAgendaEvent = async (project) => (
  updateProjectSchedule({
    projectId: project.id,
    data: project.data || null,
    horario:
      project.horario
      || project.financeiro?.horario
      || '',
    local:
      project.local
      || project.financeiro?.local
      || '',
  })
);

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

    await supabase
      .from('financas')
      .upsert([payload], {
        onConflict: 'id',
      });
  } catch (error) {
    console.error(
      'Erro ao criar financeiro do projeto:',
      error.message,
    );
  }
};

export const recalculateProjectFinance = async (projectId) => {
  assertSupabaseConfigured();

  const { data: project, error } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error || !project) return null;

  const payments = readPayments(project).map((payment) => ({
    ...payment,
    valor: normalizePaymentValue(payment.valor),
  }));

  const paid = payments.reduce(
    (sum, payment) => sum + normalizePaymentValue(payment.valor),
    0,
  );

  const total = Number(
    project.valor_contratado
      ?? project.valorContratado
      ?? 0,
  );

  const remaining = Math.max(0, total - paid);

  const {
    data,
    error: updateError,
  } = await supabase
    .from('projetos')
    .update({
      valor_recebido: paid,
      saldo_restante: remaining,
      pagamentos: payments,
      updated_at: new Date().toISOString(),
    })
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

  const cleanPhone = (
    mappedLead.whatsapp
    || mappedLead.telefone
    || ''
  ).replace(/\D/g, '');

  const cleanEmail = String(
    mappedLead.email || '',
  ).trim().toLowerCase();

  const cleanName = String(
    mappedLead.nome || '',
  ).trim().toLowerCase();

  const {
    data: clientCandidates,
    error: clientLookupError,
  } = await supabase
    .from('clientes')
    .select('*');

  if (clientLookupError) throw clientLookupError;

  const existingClient = (clientCandidates || []).find((client) => {
    const candidatePhone = String(
      client.whatsapp
      || client.telefone
      || '',
    ).replace(/\D/g, '');

    const candidateEmail = String(
      client.email || '',
    ).trim().toLowerCase();

    const candidateName = String(
      client.nome || '',
    ).trim().toLowerCase();

    if (
      cleanPhone
      && candidatePhone === cleanPhone
    ) {
      return true;
    }

    if (
      cleanEmail
      && candidateEmail === cleanEmail
    ) {
      return true;
    }

    return Boolean(
      cleanName
      && candidateName === cleanName,
    );
  });

  const total = parseCurrency(mappedLead.valorOrcamento);

  const preserveText = (value, fallback = '') => (
    String(value || '').trim()
      ? value
      : fallback
  );

  const clientPayload = {
    nome: preserveText(
      mappedLead.nome,
      existingClient?.nome || 'Cliente sem nome',
    ),
    email: preserveText(
      mappedLead.email,
      existingClient?.email,
    ),
    telefone: preserveText(
      mappedLead.telefone,
      existingClient?.telefone || existingClient?.whatsapp,
    ),
    whatsapp: preserveText(
      mappedLead.whatsapp || mappedLead.telefone,
      existingClient?.whatsapp || existingClient?.telefone,
    ),
    instagram: existingClient?.instagram || '',
    cidade: preserveText(
      mappedLead.cidade,
      existingClient?.cidade,
    ),
    cliente_desde:
      existingClient?.cliente_desde
      || now,
  };

  const client = await saveRow({
    table: 'clientes',
    id: existingClient?.id,
    payload: existingClient
      ? clientPayload
      : {
        ...clientPayload,
        created_at: now,
      },
  });

  const {
    data: projectCandidates,
    error: projectLookupError,
  } = await supabase
    .from('projetos')
    .select('*');

  if (projectLookupError) throw projectLookupError;

  const normalizedService = String(
    mappedLead.tipoServico || '',
  ).trim().toLowerCase();

  const normalizedEventDate = String(
    mappedLead.dataEvento || '',
  ).slice(0, 10);

  const existingProject = (projectCandidates || []).find((project) => {
    const linkedLeadId =
      project.lead_id
      || project.leadId
      || project.crm_lead_id
      || project.financeiro?.crmLeadId
      || project.financeiro?.crm_lead_id;

    if (
      mappedLead.id
      && String(linkedLeadId || '') === String(mappedLead.id)
    ) {
      return true;
    }

    const projectClientId =
      project.cliente_id
      || project.client_id;

    if (
      String(projectClientId || '')
      !== String(client.id)
    ) {
      return false;
    }

    const projectService = String(
      project.tipo_servico
      || project.servico
      || '',
    ).trim().toLowerCase();

    const projectDate = String(
      project.data
      || project.data_trabalho
      || '',
    ).slice(0, 10);

    const projectTotal = Number(
      project.valor_contratado || 0,
    );

    return Boolean(
      normalizedService
      && normalizedEventDate
      && projectService === normalizedService
      && projectDate === normalizedEventDate
      && projectTotal === total
    );
  });

  const currentFinance =
    existingProject?.financeiro
    && typeof existingProject.financeiro === 'object'
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
      valorRecebido: Number(
        existingProject?.valor_recebido || 0,
      ),
      saldoRestante: Math.max(
        0,
        total - Number(
          existingProject?.valor_recebido || 0,
        ),
      ),
      statusFinanceiro:
        currentFinance.statusFinanceiro
        || 'Pendente',
      updatedAt: now,
    },
  };

  const project = await saveRow({
    table: 'projetos',
    id: existingProject?.id,
    payload: existingProject
      ? projectPayload
      : {
        ...projectPayload,
        created_at: now,
      },
  });

  await createFinanceSeed(project, client);
  await upsertAgendaEvent(project, client);

  emitDbUpdate();

  return {
    client,
    project,
  };
};

export const loadProfileFromDb = async () => {
  assertSupabaseConfigured();

  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .select('*')
    .eq('id', PROFILE_ID)
    .maybeSingle();

  if (error) throw error;

  return (
    data?.dados
    || data?.data
    || data?.perfil
    || data?.profile
    || null
  );
};

export const saveProfileToDb = async (profile) => {
  const now = new Date().toISOString();

  const candidates = [
    {
      id: PROFILE_ID,
      dados: profile,
      updated_at: now,
    },
    {
      id: PROFILE_ID,
      perfil: profile,
      updated_at: now,
    },
    {
      id: PROFILE_ID,
      profile,
      updated_at: now,
    },
  ];

  let lastError = null;

  for (const payload of candidates) {
    try {
      const saved = await upsertRow({
        table: PROFILE_TABLE,
        payload,
      });

      return (
        saved?.dados
        || saved?.perfil
        || saved?.profile
        || profile
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};