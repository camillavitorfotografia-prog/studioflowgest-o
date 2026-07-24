import { createId, readStorage, STORAGE_KEYS, writeStorage } from './storage';
import { isSupabaseConfigured, supabase } from './supabase';

export const DEFAULT_EXTRA_PHOTO_TIERS = [
  { min: 1, max: 10, unitPrice: 20 },
  { min: 11, max: 49, unitPrice: 15 },
  { min: 50, max: null, unitPrice: 10 },
];

export const createPhotoParticipant = (overrides = {}) => ({
  id: createId('photo-participant'),
  clientId: '',
  name: '',
  includedPhotos: 10,
  selectedPhotos: 10,
  manualUnitPrice: '',
  paymentStatus: 'Pendente',
  paymentDate: '',
  paymentMethod: 'Pix',
  notes: '',
  ...overrides,
});

export const getSuggestedExtraPhotoPrice = (quantity, tiers = DEFAULT_EXTRA_PHOTO_TIERS) => {
  const count = Math.max(0, Number(quantity || 0));
  if (!count) return 0;
  const tier = tiers.find((item) => count >= Number(item.min || 0)
    && (item.max === null || item.max === '' || count <= Number(item.max)));
  return Number(tier?.unitPrice || 0);
};

export const calculatePhotoParticipant = (participant = {}, tiers = DEFAULT_EXTRA_PHOTO_TIERS) => {
  const includedPhotos = Math.max(0, Number(participant.includedPhotos || 0));
  const selectedPhotos = Math.max(0, Number(participant.selectedPhotos || 0));
  const extraPhotos = Math.max(0, selectedPhotos - includedPhotos);
  const suggestedUnitPrice = getSuggestedExtraPhotoPrice(extraPhotos, tiers);
  const manual = Number(participant.manualUnitPrice);
  const unitPrice = participant.manualUnitPrice !== '' && Number.isFinite(manual)
    ? Math.max(0, manual)
    : suggestedUnitPrice;
  const total = extraPhotos * unitPrice;

  return {
    ...participant,
    includedPhotos,
    selectedPhotos,
    extraPhotos,
    suggestedUnitPrice,
    unitPrice,
    total,
  };
};

const normalizePaymentStatus = (value = '') => String(value || '')
  .trim()
  .toLocaleLowerCase('pt-BR')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const isPaidStatus = (value) => ['pago', 'paga', 'quitado', 'quitada', 'recebido', 'recebida'].includes(
  normalizePaymentStatus(value),
);

export const normalizePhotoSelection = (selection = {}) => {
  const tiers = Array.isArray(selection.tiers) && selection.tiers.length
    ? selection.tiers
    : DEFAULT_EXTRA_PHOTO_TIERS;
  const participants = Array.isArray(selection.participants)
    ? selection.participants.map((item) => calculatePhotoParticipant(item, tiers))
    : [];

  return {
    deliveryType: selection.deliveryType || 'all',
    defaultIncludedPhotos: Math.max(0, Number(selection.defaultIncludedPhotos ?? 10)),
    allowExtraSales: selection.allowExtraSales !== false,
    pricingMode: selection.pricingMode || 'single_tier',
    tiers,
    participants,
  };
};

export const summarizeExtraPhotos = (selection = {}) => {
  const normalized = normalizePhotoSelection(selection);
  return normalized.participants.reduce((summary, participant) => {
    summary.extraPhotos += participant.extraPhotos;
    summary.total += participant.total;
    if (isPaidStatus(participant.paymentStatus)) summary.received += participant.total;
    else summary.pending += participant.total;
    return summary;
  }, { extraPhotos: 0, total: 0, received: 0, pending: 0 });
};


export const preparePhotoSelectionForSave = (selection = {}, savedAt = new Date().toISOString()) => {
  const normalized = normalizePhotoSelection(selection);
  const savedDate = String(savedAt || new Date().toISOString()).slice(0, 10);

  return {
    ...normalized,
    updatedAt: savedAt,
    participants: normalized.participants.map((participant) => ({
      ...participant,
      paymentDate: isPaidStatus(participant.paymentStatus)
        ? (participant.paymentDate || savedDate)
        : participant.paymentDate || '',
      updatedAt: savedAt,
    })),
  };
};

export const getProjectPhotoSelection = (project = {}) => normalizePhotoSelection(
  project.photoSelection
  || project.selecaoFotos
  || project.financeiro?.photoSelection
  || project.financeiro?.projectData?.photoSelection
  || {},
);

export const getProjectExtraPhotosSummary = (project = {}) => (
  summarizeExtraPhotos(getProjectPhotoSelection(project))
);

export const buildExtraPhotoFinancialRows = (projects = []) => projects.flatMap((project) => {
  const selection = getProjectPhotoSelection(project);
  if (selection.deliveryType !== 'limited' || selection.allowExtraSales === false) return [];

  return selection.participants
    .filter((participant) => Number(participant.total || 0) > 0)
    .map((participant) => {
      const status = String(participant.paymentStatus || 'Pendente').trim().toLocaleLowerCase('pt-BR');
      return {
        id: `extra-photo-${project.id || 'project'}-${participant.id || participant.name || 'participant'}`,
        sourceId: participant.id || '',
        projectId: project.id || '',
        clientId: participant.clientId || project.clientId || project.clienteId || '',
        project,
        clientName: participant.name || project.clienteNome || project.cliente?.nome || 'Cliente sem nome',
        service: project.tipoServico || project.tipo_servico || project.categoria || 'Venda de fotos extras',
        date: participant.paymentDate
          || participant.updatedAt
          || selection.updatedAt
          || project.financeiro?.updatedAt
          || project.updatedAt
          || project.updated_at
          || '',
        amount: Number(participant.total || 0),
        method: participant.paymentMethod || 'Não informado',
        account: participant.paymentAccount || '',
        description: `Fotos extras — ${participant.name || project.clienteNome || project.cliente?.nome || 'Cliente'}`,
        category: 'Venda de fotos extras',
        extraPhotos: Number(participant.extraPhotos || 0),
        unitPrice: Number(participant.unitPrice || 0),
        status,
        isPaid: isPaidStatus(status),
        isCancelled: ['cancelado', 'cancelada'].includes(status),
        source: 'fotos_extras',
      };
    })
    .filter((row) => !row.isCancelled);
});



const extractMissingColumn = (error) => {
  const message = String(error?.message || error || '');
  const match = message.match(/Could not find the ['"]([^'"]+)['"] column/i);
  return match?.[1] || '';
};

const upsertFinanceRowsCompat = async (rows = []) => {
  if (!rows.length) return;
  let payload = rows.map((row) => ({ ...row }));
  const removedColumns = new Set();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await supabase.from('financas').upsert(payload, { onConflict: 'id' });
    if (!error) return;

    const missingColumn = extractMissingColumn(error);
    if (!missingColumn || removedColumns.has(missingColumn)) throw error;

    removedColumns.add(missingColumn);
    payload = payload.map((row) => {
      const next = { ...row };
      delete next[missingColumn];
      return next;
    });
  }

  throw new Error('Não foi possível compatibilizar o lançamento financeiro com o schema atual.');
};

const extraPhotoTransactionId = (projectId, participantId) => (
  `extra-photo-${String(projectId || 'project')}-${String(participantId || 'participant')}`
);

export const buildExtraPhotoTransactions = ({ project = {}, selection, clientId = '', clientName = '' } = {}) => {
  const normalized = normalizePhotoSelection(selection || getProjectPhotoSelection(project));
  if (normalized.deliveryType !== 'limited' || normalized.allowExtraSales === false) return [];

  const projectId = project.id || '';
  const fallbackDate = normalized.updatedAt
    || project.updatedAt
    || project.updated_at
    || new Date().toISOString();

  return normalized.participants
    .map((participant) => calculatePhotoParticipant(participant, normalized.tiers))
    .filter((participant) => participant.total > 0)
    .filter((participant) => !['cancelado', 'cancelada'].includes(normalizePaymentStatus(participant.paymentStatus)))
    .map((participant) => {
      const paid = isPaidStatus(participant.paymentStatus);
      const effectiveDate = paid
        ? (participant.paymentDate || participant.updatedAt || fallbackDate)
        : (participant.paymentDate || project.dataEvento || project.data || fallbackDate);
      const id = extraPhotoTransactionId(projectId, participant.id || participant.name);
      const resolvedClientId = participant.clientId || clientId || project.clientId || project.clienteId || project.cliente_id || '';
      const resolvedClientName = participant.name || clientName || project.clienteNome || project.cliente?.nome || 'Cliente';

      return {
        id,
        projectId,
        clientId: resolvedClientId,
        descricao: `Fotos extras — ${resolvedClientName}`,
        categoria: 'Venda de fotos extras',
        naturezaFinanceira: 'operacional',
        valor: Number(participant.total || 0),
        vencimento: String(effectiveDate || '').slice(0, 10),
        dataPagamento: paid ? String(effectiveDate || '').slice(0, 10) : '',
        dataRecebimento: paid ? String(effectiveDate || '').slice(0, 10) : '',
        status: paid ? 'recebida' : 'prevista',
        formaPagamento: participant.paymentMethod || 'Pix',
        contaOrigem: participant.paymentAccount || 'empresa',
        tipo: 'receita_fotos_extras',
        tipoGeral: 'Entrada',
        observacoes: participant.notes || '',
        atualizadoEm: new Date().toISOString(),
        detalhes: {
          source: 'fotos_extras',
          participantId: participant.id || '',
          extraPhotos: Number(participant.extraPhotos || 0),
          unitPrice: Number(participant.unitPrice || 0),
          paymentStatus: participant.paymentStatus || 'Pendente',
        },
      };
    });
};

export const syncExtraPhotoTransactions = async ({ project = {}, selection, clientId = '', clientName = '' } = {}) => {
  if (!project?.id) return [];

  const rows = buildExtraPhotoTransactions({ project, selection, clientId, clientName });
  const prefix = `extra-photo-${String(project.id)}-`;
  const current = readStorage(STORAGE_KEYS.finances, []);
  const currentList = Array.isArray(current) ? current : [];
  const rowIds = new Set(rows.map((row) => String(row.id)));
  const nextLocal = [
    ...currentList.filter((row) => !String(row?.id || '').startsWith(prefix)),
    ...rows,
  ];
  writeStorage(STORAGE_KEYS.finances, nextLocal);

  if (isSupabaseConfigured) {
    const dbRows = rows.map((row) => ({
      id: String(row.id),
      project_id: row.projectId || null,
      descricao: row.descricao,
      nome: row.descricao,
      categoria: row.categoria,
      natureza_financeira: row.naturezaFinanceira,
      valor: row.valor,
      data: row.vencimento || null,
      data_vencimento: row.vencimento || null,
      data_pagamento: row.dataPagamento || null,
      tipo: row.tipo,
      tipo_geral: row.tipoGeral,
      status: row.status,
      forma_pagamento: row.formaPagamento,
      conta_origem: row.contaOrigem,
      observacoes: row.observacoes,
      detalhes: row.detalhes,
      updated_at: row.atualizadoEm,
    }));

    if (dbRows.length) {
      await upsertFinanceRowsCompat(dbRows);
    }

    const { data: existingRows, error: listError } = await supabase
      .from('financas')
      .select('id')
      .eq('project_id', String(project.id))
      .eq('tipo', 'receita_fotos_extras');
    if (listError) throw listError;

    const staleIds = (existingRows || [])
      .map((row) => String(row.id || ''))
      .filter((id) => id && !rowIds.has(id));
    if (staleIds.length) {
      const { error: deleteError } = await supabase
        .from('financas')
        .delete()
        .in('id', staleIds);
      if (deleteError) throw deleteError;
    }
  }

  return rows;
};
