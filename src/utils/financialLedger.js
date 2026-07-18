import { isConfirmedPayment, deriveFinancialStatus, isInternalTransfer } from './financeEngine';
import { normalizePaymentValue, readPayments } from './dbData';

const normalize = (value = '') => String(value)
  .trim()
  .toLocaleLowerCase('pt-BR')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export const parseLedgerDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const normalized = br ? `${br[3]}-${br[2]}-${br[1]}` : text.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const paymentDate = (item = {}) => (
  item.dataRecebimento
  || item.data_recebimento
  || item.dataPagamento
  || item.data_pagamento
  || item.data
  || item.date
  || ''
);

const transactionDate = (item = {}) => (
  item.dataPagamento
  || item.data_pagamento
  || item.dataRecebimento
  || item.data_recebimento
  || item.data
  || item.dataVencimento
  || item.data_vencimento
  || ''
);

const projectName = (project = {}) => (
  project.clienteNome
  || project.clienteNomeImportado
  || project.cliente_nome_importado
  || project.cliente?.nome
  || 'Cliente sem cadastro'
);

const projectService = (project = {}) => (
  project.tipoServico || project.tipo_servico || project.categoria || 'Não informado'
);

const normalizePaymentId = (value) => String(value || '')
  .trim()
  .replace(/^migration-payment-/, '')
  .replace(/^import-payment-/, '')
  .replace(/^payment-/, '')
  .replace(/^receita-/, '');

const sourcePaymentId = (item = {}) => normalizePaymentId(
  item.detalhes?.externalPaymentId
  || item.details?.externalPaymentId
  || item.detalhes?.paymentId
  || item.details?.paymentId
  || item.externalPaymentId
  || item.paymentId
  || item.pagamentoId
  || item.id,
);

const receiptSemanticKey = (row = {}) => {
  const projectId = String(row.projectId || '').trim();
  const identity = projectId
    ? `project:${projectId}`
    : `client:${normalize(row.clientName)}|${normalize(row.description)}`;

  // A mesma entrada costuma existir no Financeiro e também dentro do trabalho.
  // Forma de pagamento e grafia do cliente não podem impedir a conciliação.
  return [
    identity,
    String(row.date || '').slice(0, 10),
    Number(row.amount || 0).toFixed(2),
  ].join('|');
};

const receiptSourceKey = (row = {}) => (
  row.sourceId ? `${row.source}:${row.sourceId}` : ''
);

const resolveAccount = (item = {}) => {
  const raw = item.contaDestino
    || item.conta_destino
    || item.contaOrigem
    || item.conta_origem
    || item.detalhes?.destino
    || item.details?.destino
    || '';
  return String(raw || '').trim();
};

export const classifyAccount = (value) => {
  const account = normalize(value);
  if (!account) return 'nao_informada';
  if (account.includes('empresa') || account.includes('cnpj') || account === 'pj') return 'empresa';
  if (account.includes('pessoal') || account.includes('cpf') || account === 'pf') return 'pessoal';
  return 'nao_informada';
};

const isConfiguration = (transaction = {}) => {
  const type = normalize(transaction.tipo);
  const general = normalize(transaction.tipoGeral || transaction.tipo_geral);
  return ['distribuicao_pagamento', 'configuracao_distribuicao', 'configuracao_recorrencia', 'transferencia_interna'].includes(type)
    || general === 'configuracao'
    || isInternalTransfer(transaction);
};

const isIncome = (transaction = {}) => {
  if (isConfiguration(transaction)) return false;
  const type = normalize(transaction.tipo);
  const general = normalize(transaction.tipoGeral || transaction.tipo_geral);
  const amount = normalizePaymentValue(transaction.valor ?? transaction.amount);
  return amount > 0
    && (general === 'entrada' || type === 'entrada' || type.startsWith('receita') || type === 'avulsa')
    && isConfirmedPayment({ ...transaction, valor: amount });
};


const isNonOperationalIncome = (transaction = {}) => {
  const nature = normalize(transaction.naturezaFinanceira || transaction.natureza_financeira || '');
  const category = normalize(transaction.categoria || '');
  return nature === 'nao_operacional'
    || ['aporte pessoal da titular','aporte do titular','venda de patrimonio','reembolso','emprestimo recebido','outras entradas nao operacionais','entrada nao operacional'].includes(category);
};

const isExpense = (transaction = {}) => {
  if (isConfiguration(transaction)) return false;
  const type = normalize(transaction.tipo);
  const general = normalize(transaction.tipoGeral || transaction.tipo_geral);
  return normalizePaymentValue(transaction.valor) > 0
    && (general === 'saida' || ['fixa', 'variavel', 'despesa'].includes(type));
};

export const buildFinancialLedger = ({ projects = [], transactions = [] } = {}) => {
  const projectById = new Map(projects.map((project) => [String(project.id), project]));
  const receipts = new Map();
  const receiptSources = new Map();
  const undatedReceipts = [];
  const reconciliation = [];
  const ignoredFinanceContractReceipts = [];
  const nonOperationalEntries = [];

  const addReceipt = (row, priority) => {
    const semanticKey = receiptSemanticKey(row);
    const sourceKey = receiptSourceKey(row);

    if (sourceKey && receiptSources.has(sourceKey)) {
      const existingKey = receiptSources.get(sourceKey);
      const current = receipts.get(existingKey);
      if (!current || priority > current.priority) {
        receipts.set(existingKey, { ...row, priority, key: existingKey });
      }
      return;
    }

    const current = receipts.get(semanticKey);
    if (!current || priority > current.priority) {
      receipts.set(semanticKey, { ...row, priority, key: semanticKey });
    }
    if (sourceKey) receiptSources.set(sourceKey, semanticKey);
  };

  // FONTE OFICIAL DOS CONTRATOS: parcelas cadastradas no cliente/trabalho.
  // O Financeiro não pode criar uma segunda receita para o mesmo pagamento.
  projects.forEach((project) => {
    const payments = readPayments(project);
    let detailedTotal = 0;

    payments.forEach((payment) => {
      const amount = normalizePaymentValue(payment.valor ?? payment.amount);
      if (!isConfirmedPayment({ ...payment, valor: amount }) || amount <= 0) return;
      detailedTotal += amount;
      const account = resolveAccount(payment);
      const row = {
        sourceId: sourcePaymentId(payment),
        id: payment.id,
        projectId: project.id,
        project,
        clientName: projectName(project),
        service: projectService(project),
        date: paymentDate(payment),
        amount,
        method: payment.formaPagamento || payment.forma_pagamento || payment.method || 'Não informado',
        account,
        accountType: classifyAccount(account),
        description: `Pagamento — ${projectName(project)}`,
        source: 'cliente',
      };
      if (parseLedgerDate(row.date)) addReceipt(row, 100);
      else undatedReceipts.push(row);
    });

    const explicitPaid = normalizePaymentValue(
      project.valorRecebido
      ?? project.valor_recebido
      ?? project.financeiro?.valorRecebido
      ?? 0,
    );
    const difference = Math.max(0, explicitPaid - detailedTotal);
    if (difference > 0.009) {
      reconciliation.push({
        projectId: project.id,
        clientName: projectName(project),
        amount: difference,
        reason: 'Valor recebido acumulado sem parcela individual com data. Não entrou no faturamento anual.',
      });
    }
  });

  // O Financeiro complementa somente receitas avulsas sem vínculo contratual.
  // Qualquer lançamento ligado a projeto/cliente/parcela é espelho operacional e
  // fica fora do faturamento para não duplicar o que já foi lançado em Clientes.
  transactions.filter(isIncome).forEach((transaction) => {
    if (isNonOperationalIncome(transaction)) {
      nonOperationalEntries.push({
        id: transaction.id,
        date: transactionDate(transaction),
        amount: normalizePaymentValue(transaction.valor),
        description: transaction.descricao || transaction.nome || 'Entrada não operacional',
        category: transaction.categoria || 'Outras entradas não operacionais',
        account: resolveAccount(transaction),
        source: 'nao_operacional',
      });
      return;
    }
    const projectId = transaction.projectId || transaction.project_id || '';
    const clientId = transaction.clientId || transaction.client_id || transaction.cliente_id || '';
    const externalPaymentId = transaction.detalhes?.externalPaymentId
      || transaction.details?.externalPaymentId
      || transaction.detalhes?.paymentId
      || transaction.details?.paymentId
      || transaction.paymentId
      || transaction.pagamentoId
      || '';
    const linkedToContract = Boolean(String(projectId).trim() || String(clientId).trim() || String(externalPaymentId).trim());

    if (linkedToContract) {
      ignoredFinanceContractReceipts.push(transaction);
      return;
    }

    const project = projectById.get(String(projectId));
    const account = resolveAccount(transaction);
    const row = {
      sourceId: sourcePaymentId(transaction),
      id: transaction.id,
      projectId: '',
      project: null,
      clientName: transaction.detalhes?.clienteNome || transaction.nome || transaction.descricao || 'Receita avulsa',
      service: transaction.categoria || 'Receita avulsa',
      date: transactionDate(transaction),
      amount: normalizePaymentValue(transaction.valor),
      method: transaction.formaPagamento || transaction.forma_pagamento || 'Não informado',
      account,
      accountType: classifyAccount(account),
      description: transaction.descricao || transaction.nome || 'Receita avulsa',
      source: 'financeiro_avulso',
    };
    if (parseLedgerDate(row.date)) addReceipt(row, 50);
    else undatedReceipts.push(row);
  });

  const expenses = [];
  const pendingExpenses = [];
  const undatedExpenses = [];
  const expenseKeys = new Set();
  transactions.filter(isExpense).forEach((transaction) => {
    const row = {
      id: transaction.id,
      projectId: transaction.projectId || transaction.project_id || '',
      date: transaction.dataPagamento || transaction.data_pagamento || transactionDate(transaction),
      amount: normalizePaymentValue(transaction.valor),
      description: transaction.descricao || transaction.nome || 'Despesa',
      category: transaction.categoria || transaction.tipo || 'Outras',
      supplier: transaction.fornecedor || '',
      method: transaction.formaPagamento || transaction.forma_pagamento || 'Não informado',
      account: resolveAccount(transaction),
    };
    const semanticKey = [
      row.projectId,
      String(row.date || '').slice(0, 10),
      row.amount.toFixed(2),
      normalize(row.description),
      normalize(row.category),
      normalize(row.supplier),
    ].join('|');
    const idKey = transaction.id ? `id:${transaction.id}` : '';
    if ((idKey && expenseKeys.has(idKey)) || expenseKeys.has(semanticKey)) return;
    if (idKey) expenseKeys.add(idKey);
    expenseKeys.add(semanticKey);
    if (deriveFinancialStatus(transaction) !== 'paga') pendingExpenses.push(row);
    else if (parseLedgerDate(row.date)) expenses.push(row);
    else undatedExpenses.push(row);
  });

  return {
    receipts: [...receipts.values()].map((entry) => {
      const row = { ...entry };
      delete row.priority;
      return row;
    }),
    expenses,
    pendingExpenses,
    undatedReceipts,
    undatedExpenses,
    reconciliation,
    ignoredFinanceContractReceipts,
    nonOperationalEntries,
  };
};
