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

const receiptKey = (row) => {
  if (row.sourceId) return `payment:${row.sourceId}`;
  return [
    String(row.projectId || ''),
    String(row.date || '').slice(0, 10),
    Number(row.amount || 0).toFixed(2),
    normalize(row.method),
    normalize(row.clientName),
  ].join('|');
};

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
  const undatedReceipts = [];
  const reconciliation = [];

  const addReceipt = (row, priority) => {
    const key = receiptKey(row);
    const current = receipts.get(key);
    if (!current || priority > current.priority) receipts.set(key, { ...row, priority, key });
  };

  transactions.filter(isIncome).forEach((transaction) => {
    const projectId = transaction.projectId || transaction.project_id || '';
    const project = projectById.get(String(projectId));
    const account = resolveAccount(transaction);
    const row = {
      sourceId: sourcePaymentId(transaction),
      id: transaction.id,
      projectId,
      project,
      clientName: project ? projectName(project) : (transaction.detalhes?.clienteNome || transaction.nome || transaction.descricao || 'Receita sem cliente'),
      service: project ? projectService(project) : (transaction.categoria || 'Receita'),
      date: transactionDate(transaction),
      amount: normalizePaymentValue(transaction.valor),
      method: transaction.formaPagamento || transaction.forma_pagamento || 'Não informado',
      account,
      accountType: classifyAccount(account),
      description: transaction.descricao || transaction.nome || 'Recebimento',
      source: 'financeiro',
    };
    if (parseLedgerDate(row.date)) addReceipt(row, 30);
    else undatedReceipts.push(row);
  });

  projects.forEach((project) => {
    const payments = readPayments(project);
    let detailedTotal = 0;
    payments.forEach((payment) => {
      const amount = normalizePaymentValue(payment.valor ?? payment.amount);
      if (!isConfirmedPayment({ ...payment, valor: amount })) return;
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
        source: 'projeto',
      };
      if (parseLedgerDate(row.date)) addReceipt(row, 20);
      else undatedReceipts.push(row);
    });

    const explicitPaid = normalizePaymentValue(project.valorRecebido ?? project.valor_recebido ?? project.financeiro?.valorRecebido ?? 0);
    const difference = Math.max(0, explicitPaid - detailedTotal);
    if (difference > 0.009) {
      reconciliation.push({
        projectId: project.id,
        clientName: projectName(project),
        amount: difference,
        reason: 'Valor recebido consolidado sem pagamento individual correspondente',
      });
    }
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
    const key = transaction.id || [row.projectId, row.date, row.amount.toFixed(2), normalize(row.description)].join('|');
    if (expenseKeys.has(key)) return;
    expenseKeys.add(key);
    if (deriveFinancialStatus(transaction) !== 'paga') {
      pendingExpenses.push(row);
    } else if (parseLedgerDate(row.date)) {
      expenses.push(row);
    } else {
      undatedExpenses.push(row);
    }
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
  };
};
