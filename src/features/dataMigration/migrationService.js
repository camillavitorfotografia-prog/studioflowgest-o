import * as XLSX from 'xlsx';
import { getDbStudioData, emitDbUpdate } from '../../utils/dbData';
import { isSupabaseConfigured, supabase } from '../../utils/supabase';


const normalizeText = (value = '') => String(value)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const money = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value || '').replace(/\s/g, '').replace(/R\$/gi, '');
  if (!text) return 0;
  if (text.includes(',') && text.includes('.')) {
    const decimalIsComma = text.lastIndexOf(',') > text.lastIndexOf('.');
    return Number(decimalIsComma ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')) || 0;
  }
  if (text.includes(',')) return Number(text.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(text.replace(/,/g, '')) || 0;
};

const toIsoDate = (value) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const parts = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (parts) {
    const first = Number(parts[1]);
    const second = Number(parts[2]);
    const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
    const month = second > 12 ? first : second;
    const day = second > 12 ? second : first;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

const categoryForEquipment = (name, category = '') => {
  const text = normalizeText(`${name} ${category}`);
  if (/camera|sony a7|nikon d|zve|zv e/.test(text)) return 'Câmera';
  if (/lente|mm|viltrox|tamron|sigma/.test(text)) return 'Lente';
  if (/led|flash|ilumin|rebatedor|softbox|bastao/.test(text)) return 'Iluminação';
  if (/microfone|audio|gravador|radio/.test(text)) return 'Áudio';
  if (/gimbal|estabilizador|tripe/.test(text)) return 'Estabilização';
  if (/computador|notebook|monitor|ipad|pc/.test(text)) return 'Computador';
  if (/hd|ssd|cartao|memoria|icloud/.test(text)) return 'Armazenamento';
  return 'Acessório';
};

const equipmentFingerprint = (item) => normalizeText([
  item.nome, item.marca, item.modelo, item.numeroSerie,
].filter(Boolean).join(' '));

const expenseFingerprint = (item) => normalizeText([
  item.descricao, item.categoria, Number(item.valor || 0).toFixed(2), item.tipo,
].join('|'));

const projectFingerprint = (item) => normalizeText([
  item.clientName, item.tipoServico, item.dataEvento, Number(item.valorContratado || 0).toFixed(2),
].join('|'));

const candidate = (type, data, source) => ({
  id: crypto.randomUUID(), type, selected: true, status: 'new', source, ...data,
});

const parseCamillaWorkbook = (wb, source) => {
  const output = [];
  const sheet = wb.Sheets['INVESTIMENTOS E DESPESAS'];
  if (!sheet) return output;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  rows.slice(4).forEach((row, index) => {
    const nome = String(row[2] || '').trim();
    const tipo = normalizeText(row[3]);
    const categoria = String(row[4] || '').trim();
    const valor = money(row[7]);
    if (!nome || valor <= 0) return;
    if (tipo.includes('investimento')) {
      output.push(candidate('equipment', {
        nome, categoria: categoryForEquipment(nome, categoria), valorCompra: valor,
        dataCompra: toIsoDate(row[5]), observacoes: categoria ? `Categoria original: ${categoria}` : '',
        origem: 'importacao_planilha', row: index + 5,
      }, source));
    } else if (tipo.includes('despesa')) {
      output.push(candidate('expense', {
        descricao: nome, categoria: categoria || nome, valor, tipo: 'fixa',
        tipoGeral: 'Saida', financialStatus: 'Pendente', recorrente: true, row: index + 5,
      }, source));
    }
  });
  return output;
};

const parsePricingWorkbook = (wb, source) => {
  const output = [];
  const sheet = wb.Sheets.Planilha1 || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  rows.slice(7).forEach((row, index) => {
    const equipName = String(row[0] || '').trim();
    const equipValue = money(row[2]);
    if (equipName && equipValue > 0 && !/total|hora de trabalho/i.test(equipName)) {
      output.push(candidate('equipment', {
        nome: equipName, categoria: categoryForEquipment(equipName), valorCompra: equipValue,
        dataCompra: '', origem: 'importacao_planilha', row: index + 8,
      }, source));
    }
    const expenseName = String(row[6] || '').trim();
    const expenseValue = money(row[8]);
    if (expenseName && expenseValue > 0 && !/total|hora de trabalho/i.test(expenseName)) {
      output.push(candidate('expense', {
        descricao: expenseName, categoria: expenseName, valor: expenseValue,
        tipo: 'fixa', tipoGeral: 'Saida', financialStatus: 'Pendente', recorrente: true, row: index + 8,
      }, source));
    }
  });
  return output;
};

const parseXPriceWorkbook = (wb, source) => {
  const output = [];
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  rows.slice(127, 155).forEach((row, index) => {
    const nome = String(row[0] || '').trim();
    const qty = Math.max(1, Number(row[1]) || 1);
    const valor = money(row[2]);
    if (!nome || valor <= 0 || /tabela|total|custo/i.test(nome)) return;
    for (let n = 0; n < qty; n += 1) {
      output.push(candidate('equipment', {
        nome: qty > 1 ? `${nome} (${n + 1}/${qty})` : nome,
        categoria: categoryForEquipment(nome), valorCompra: valor / qty,
        dataCompra: '', origem: 'importacao_planilha', row: index + 128,
      }, source));
    }
  });
  return output;
};

const asArray = (value) => Array.isArray(value) ? value : [];

const findFotoGestionPayload = (root) => {
  const queue = [root];
  const visited = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);

    const clients = current.clients || current.clientes;
    const equipment = current.equipment || current.equipamentos;
    const fixedExpenses = current.fixedExpenses || current.despesasFixas || current.fixed_expenses;
    const variableExpenses = current.variableExpenses || current.despesasVariaveis || current.variable_expenses;

    if ([clients, equipment, fixedExpenses, variableExpenses].some(Array.isArray)) {
      return {
        ...current,
        clients: asArray(clients),
        equipment: asArray(equipment),
        fixedExpenses: asArray(fixedExpenses),
        variableExpenses: asArray(variableExpenses),
      };
    }

    Object.values(current).forEach((value) => {
      if (value && typeof value === 'object') queue.push(value);
    });
  }

  return null;
};

const parseFotoGestion = (rawPayload, source) => {
  const payload = findFotoGestionPayload(rawPayload);
  if (!payload) return [];
  const output = [];
  asArray(payload.equipment).forEach((item) => output.push(candidate('equipment', {
    nome: item.name, categoria: item.category || categoryForEquipment(item.name),
    valorCompra: Number(item.value || 0), dataCompra: item.purchaseDate || '',
    origem: 'fotogestion', externalId: item.id,
  }, source)));
  asArray(payload.fixedExpenses).forEach((item) => output.push(candidate('expense', {
    descricao: item.customName || item.category, categoria: item.category,
    valor: Number(item.amount || 0), tipo: 'fixa', tipoGeral: 'Saida', status: 'Pendente',
    recorrente: true, diaVencimento: item.dayOfMonth, externalId: item.id,
  }, source)));
  asArray(payload.variableExpenses).forEach((item) => output.push(candidate('expense', {
    descricao: item.customName || item.category || item.description, categoria: item.category || 'Outras',
    valor: Number(item.amount || 0), tipo: 'variavel', tipoGeral: 'Saida', financialStatus: item.status || 'Pendente',
    recorrente: false, data: item.date || '', externalId: item.id,
  }, source)));
  asArray(payload.clients).forEach((item) => {
    output.push(candidate('project', {
      clientName: item.name, tipoServico: item.eventType || 'Fotografia', dataEvento: toIsoDate(item.eventDate),
      valorContratado: Number(item.contractValue || 0), payments: item.payments || [], externalId: item.id,
    }, source));
  });
  return output;
};

export const parseMigrationFile = async (file) => {
  const source = file.name;
  if (/\.json$/i.test(source)) {
    const raw = (await file.text()).replace(/^\uFEFF/, '').trim();
    const parsed = JSON.parse(raw);
    const result = parseFotoGestion(parsed, source);
    if (!result.length) {
      throw new Error('O backup JSON foi aberto, mas não contém clientes, equipamentos ou despesas reconhecíveis.');
    }
    return result;
  }
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  if (wb.Sheets['INVESTIMENTOS E DESPESAS']) return parseCamillaWorkbook(wb, source);
  if (wb.Sheets.Planilha1) return parsePricingWorkbook(wb, source);
  return parseXPriceWorkbook(wb, source);
};

export const analyzeCandidates = async (candidates) => {
  const safeSelect = async (table) => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.warn(`Não foi possível consultar ${table} durante a análise:`, error.message);
      return [];
    }
    return data || [];
  };

  const [existingEquipment, existingExpenses, existingProjects, clients] = await Promise.all([
    safeSelect('equipamentos'),
    safeSelect('financas'),
    safeSelect('projetos'),
    safeSelect('clientes'),
  ]);

  const clientNameById = new Map(clients.map((client) => [client.id, client.nome || '']));
  const seen = new Map();

  return candidates.map((item) => {
    const fingerprint = item.type === 'equipment' ? equipmentFingerprint(item)
      : item.type === 'expense' ? expenseFingerprint(item) : projectFingerprint(item);
    const duplicateInBatch = seen.has(`${item.type}:${fingerprint}`);
    if (!duplicateInBatch) seen.set(`${item.type}:${fingerprint}`, item.id);

    let existing = null;
    if (item.type === 'equipment') existing = existingEquipment.find((x) => equipmentFingerprint({
      nome: x.nome || x.name, marca: x.marca, modelo: x.modelo, numeroSerie: x.numeroSerie || x.numero_serie,
    }) === fingerprint);
    if (item.type === 'expense') existing = existingExpenses.find((x) => expenseFingerprint({
      descricao: x.descricao || x.nome, categoria: x.categoria, valor: x.valor, tipo: x.tipo,
    }) === fingerprint);
    if (item.type === 'project') existing = existingProjects.find((x) => projectFingerprint({
      clientName: clientNameById.get(x.cliente_id) || x.cliente_nome_importado || x.clienteNome || x.clientName,
      tipoServico: x.tipoServico || x.tipo_servico,
      dataEvento: x.dataEvento || x.data,
      valorContratado: x.valorContratado || x.valor_contratado,
    }) === fingerprint);

    const matchedClient = item.type === 'project'
      ? clients.find((client) => normalizeText(client.nome) === normalizeText(item.clientName))
      : null;
    const needsClient = item.type === 'project' && !existing && !duplicateInBatch && !matchedClient;

    return {
      ...item,
      fingerprint,
      status: existing ? 'existing' : duplicateInBatch ? 'duplicate' : 'new',
      selected: !existing && !duplicateInBatch,
      existingId: existing?.id || null,
      clientId: matchedClient?.id || null,
      needsClientLink: needsClient,
      clientOptions: item.type === 'project'
        ? clients.map((client) => ({ id: client.id, nome: client.nome }))
        : undefined,
    };
  });
};

const equipmentDbPayload = (item, batchId) => ({
  id: item.existingId || `equipamento-${crypto.randomUUID()}`,
  nome: item.nome, categoria: item.categoria || 'Outro', marca: item.marca || null,
  modelo: item.modelo || null, numero_serie: item.numeroSerie || null, fornecedor: item.fornecedor || null,
  status: item.statusEquipamento || 'Ativo', valor: Number(item.valorCompra || 0), valor_compra: Number(item.valorCompra || 0),
  data_compra: item.dataCompra || null, vida_util_anos: Number(item.vidaUtilAnos || 5),
  valor_residual: Number(item.valorResidual || 0), metodo_depreciacao: 'linear',
  observacoes: item.observacoes || null, origem: item.origem || 'importacao', import_batch_id: batchId,
  fingerprint: item.fingerprint, updated_at: new Date().toISOString(),
});

export const executeMigration = async (candidates, sourceNames) => {
  if (!isSupabaseConfigured) throw new Error('O Supabase precisa estar conectado para realizar a importação.');
  const selected = candidates.filter((x) => x.selected && x.status === 'new');
  const { data: batch, error: batchError } = await supabase.from('import_batches').insert({
    source_name: sourceNames.join(', '), source_type: 'migration_center', status: 'processing',
    summary: { total: selected.length },
  }).select('*').single();
  if (batchError) throw batchError;
  const summary = { equipment: 0, expenses: 0, projects: 0, payments: 0, skippedProjects: 0 };
  const equipment = selected.filter((x) => x.type === 'equipment');
  if (equipment.length) {
    const payload = equipment.map((item) => equipmentDbPayload(item, batch.id));
    const { error } = await supabase.from('equipamentos').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
    summary.equipment = payload.length;
  }
  const expenses = selected.filter((x) => x.type === 'expense');
  if (expenses.length) {
    const payload = expenses.map((item) => ({
      id: `import-${crypto.randomUUID()}`, descricao: item.descricao, nome: item.descricao,
      categoria: item.categoria || 'Outras', valor: Number(item.valor || 0),
      data: item.data || null, data_vencimento: item.data || null, tipo: item.tipo || 'variavel',
      tipo_geral: 'Saida', status: item.financialStatus || 'Pendente', forma_pagamento: item.formaPagamento || 'Pix',
      recorrente: item.recorrente === true, observacoes: `Importado de ${item.source}`,
      detalhes: { importBatchId: batch.id, source: item.source, fingerprint: item.fingerprint, dayOfMonth: item.diaVencimento || null },
    }));
    const { error } = await supabase.from('financas').insert(payload);
    if (error) throw error;
    summary.expenses = payload.length;
  }
  const studio = await getDbStudioData();
  const clients = studio.clients || [];
  const projects = selected.filter((x) => x.type === 'project');
  for (const item of projects) {
    const client = item.clientId
      ? clients.find((x) => x.id === item.clientId)
      : clients.find((x) => normalizeText(x.nome) === normalizeText(item.clientName));
    const paymentTotal = (item.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const { data: project, error } = await supabase.from('projetos').insert({
      cliente_id: client?.id || null,
      cliente_nome_importado: client ? null : item.clientName,
      import_batch_id: batch.id,
      external_id: item.externalId || null,
      import_fingerprint: item.fingerprint,
      tipo_servico: item.tipoServico || 'Fotografia', data: item.dataEvento || null,
      valor_contratado: Number(item.valorContratado || 0), valor_recebido: paymentTotal,
      financeiro: { receitas: (item.payments || []).map((p) => ({ id: p.id, valor: Number(p.amount || 0), data: toIsoDate(p.date), formaPagamento: p.method || 'Pix', status: 'recebida' })), clienteNomeImportado: client ? null : item.clientName },
      timeline_completa: [{ id: crypto.randomUUID(), tipo: 'importacao', titulo: 'Trabalho importado', data: new Date().toISOString(), detalhes: { batchId: batch.id, source: item.source, clienteNomeImportado: client ? null : item.clientName } }],
    }).select('*').single();
    if (error) throw error;
    summary.projects += 1;
    const paymentRows = (item.payments || []).map((p) => ({
      id: `payment-${p.id || crypto.randomUUID()}`, project_id: project.id, client_id: client?.id || null,
      descricao: `Pagamento — ${item.clientName}`, nome: `Pagamento — ${item.clientName}`,
      categoria: 'Receita de trabalho', valor: Number(p.amount || 0), data: toIsoDate(p.date),
      data_vencimento: toIsoDate(p.date), data_pagamento: toIsoDate(p.date) ? `${toIsoDate(p.date)}T12:00:00Z` : null,
      tipo: 'receita_projeto', tipo_geral: 'Entrada', status: 'recebida', forma_pagamento: p.method || 'Pix',
      detalhes: { importBatchId: batch.id, source: item.source },
    }));
    if (paymentRows.length) {
      const { error: paymentError } = await supabase.from('financas').upsert(paymentRows, { onConflict: 'id' });
      if (paymentError) throw paymentError;
      summary.payments += paymentRows.length;
    }
  }
  await supabase.from('import_batches').update({ status: 'completed', summary }).eq('id', batch.id);
  await getDbStudioData();
  emitDbUpdate();
  return summary;
};

export const loadImportHistory = async () => {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from('import_batches').select('*').order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  return data || [];
};
