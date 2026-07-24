import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CreditCard,
  Edit2,
  PackagePlus,
  Plus,
  Search,
  Tag,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react';
import Modal from '../../components/Modal';
import VariableExpenses from './VariableExpenses';
import { getDbStudioData, isEquipmentMarkedDeleted, subscribeDbUpdates } from '../../utils/dbData';
import { isSupabaseConfigured, supabase } from '../../utils/supabase';
import {
  dateToInput,
  formatDateBR,
  inputToDate,
  maskCurrency,
  maskDate,
} from '../../utils/masks';
import { readStorage, writeStorage, STORAGE_KEYS } from '../../utils/storage';
import {
  FIXED_EXPENSE_CATEGORIES,
  VARIABLE_EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  formatCurrency,
  getTransactionDate,
  deriveFinancialStatus,
  generateRecurrentExpenses,
  getConsolidatedFinances,
  hasEquipmentKeyword,
  appendFinancialAudit,
  getTransactionCompetence,
  parseCurrency,
} from '../../utils/financeEngine';

const emptyForm = {
  id: null,
  nome: '',
  descricao: '',
  categoria: '',
  valor: '',
  data: '',
  dataVencimento: '',
  diaVencimento: '',
  frequencia: 'sem_recorrencia',
  formaPagamento: 'Pix',
  status: 'Pendente',
  observacoes: '',
  fornecedor: '',
  eventoRelacionado: '',
  contaOrigem: 'empresa',
  projectId: '',
  tipo: 'fixa',
  recorrenciaId: '',
  ativo: true,
};

const inputStyle = {
  width: '100%',
  background: 'var(--bg-main)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-main)',
  padding: '12px',
  borderRadius: '8px',
  fontSize: '0.9rem',
  outline: 'none',
};

const labelStyle = {
  color: 'var(--text-secondary)',
  fontSize: '0.75rem',
  marginBottom: '6px',
  display: 'block',
  fontWeight: '600',
};

const clampDueDay = (year, monthIndex, day) => {
  const lastDayOfMonth = new Date(
    year,
    monthIndex + 1,
    0,
  ).getDate();

  return Math.min(
    Math.max(1, Number(day) || 1),
    lastDayOfMonth,
  );
};

const buildDueDateForMonth = (
  monthReference,
  day,
) => {
  const candidate = monthReference
    ? new Date(`${monthReference}T12:00:00`)
    : null;
  const reference = candidate && !Number.isNaN(candidate.getTime())
    ? candidate
    : new Date();

  const year = reference.getFullYear();
  const monthIndex = reference.getMonth();
  const validDay = clampDueDay(
    year,
    monthIndex,
    day,
  );

  return [
    year,
    String(monthIndex + 1).padStart(2, '0'),
    String(validDay).padStart(2, '0'),
  ].join('-');
};

const replaceDueDay = (
  currentDate,
  day,
) => {
  const monthReference = /^\d{4}-\d{2}-\d{2}$/.test(
    String(currentDate || ''),
  )
    ? `${String(currentDate).slice(0, 7)}-01`
    : null;

  return buildDueDateForMonth(
    monthReference,
    day,
  );
};

function DateInput({
  value,
  onChange,
  style,
  placeholder = 'dd/mm/aaaa',
}) {
  const [displayValue, setDisplayValue] = useState(
    dateToInput(value),
  );

  useEffect(() => {
    setDisplayValue(dateToInput(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={10}
      value={displayValue}
      placeholder={placeholder}
      onChange={(event) => {
        const masked = maskDate(event.target.value);
        setDisplayValue(masked);

        if (!masked) {
          onChange('');
          return;
        }

        const isoDate = inputToDate(masked);

        if (isoDate) {
          onChange(isoDate);
        }
      }}
      onBlur={() => {
        if (displayValue && !inputToDate(displayValue)) {
          setDisplayValue(dateToInput(value));
        }
      }}
      style={{
        ...inputStyle,
        ...style,
      }}
    />
  );
}

export default function Despesas({ area = 'fixa' }) {
  if (area === 'variavel') return <VariableExpenses />;
  const [transacoes, setTransacoes] = useState([]);
  const [recorrencias, setRecorrencias] = useState([]);
  const [saldos, setSaldos] = useState({ salario: 0, empresa: 0, reserva: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [studio, setStudio] = useState({ projects: [], clients: [] });
  const [formData, setFormData] = useState({ ...emptyForm, tipo: area, projectId: '' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('todos');

  const loadLocalData = () => {
    const rawTransactions = readStorage(STORAGE_KEYS.finances, []);
    const storedRecurrences = readStorage(STORAGE_KEYS.recurrences, []);
    const databaseRecurrences = rawTransactions
      .filter((item) => item.tipo === 'configuracao_recorrencia')
      .map((item) => item.detalhes || item.details || {})
      .filter((item) => item && item.id);

    const recurrenceById = new Map();
    [...storedRecurrences, ...databaseRecurrences].forEach((item) => {
      if (!item?.id) return;
      const current = recurrenceById.get(String(item.id));
      const currentUpdated = String(current?.atualizadoEm || current?.updated_at || current?.criadoEm || '');
      const incomingUpdated = String(item.atualizadoEm || item.updated_at || item.criadoEm || '');
      if (!current || incomingUpdated >= currentUpdated) recurrenceById.set(String(item.id), item);
    });

    // Evita configurações criadas repetidamente por cliques/salvamentos duplicados.
    // Mantém a versão mais recente de cada regra operacional equivalente.
    const recurrenceBySignature = new Map();
    [...recurrenceById.values()]
      .sort((a, b) => String(b.atualizadoEm || b.criadoEm || '').localeCompare(String(a.atualizadoEm || a.criadoEm || '')))
      .forEach((item) => {
        const signature = [
          String(item.descricao || '').trim().toLowerCase(),
          String(item.categoria || '').trim().toLowerCase(),
          Number(item.valor || 0).toFixed(2),
          Number(item.diaVencimento || 1),
          String(item.frequencia || 'mensal'),
          String(item.contaOrigem || 'empresa'),
        ].join('|');
        if (!recurrenceBySignature.has(signature)) recurrenceBySignature.set(signature, item);
      });

    const rawRecurrences = [...recurrenceBySignature.values()];
    writeStorage(STORAGE_KEYS.recurrences, rawRecurrences);
    const projects = readStorage(STORAGE_KEYS.projects, []);
    const clients = readStorage(STORAGE_KEYS.clients, []);
    const contracts = readStorage(STORAGE_KEYS.contracts, []);

    // Geração idempotente de competências recorrentes
    const newRecurrents = generateRecurrentExpenses(
      rawRecurrences,
      rawTransactions.filter((item) => item.tipo !== 'configuracao_recorrencia'),
      new Date(),
    );
    const operationalTransactions = rawTransactions.filter((item) => item.tipo !== 'configuracao_recorrencia');
    let currentTransactions = operationalTransactions;
    if (newRecurrents.length > 0) {
      currentTransactions = [...operationalTransactions, ...newRecurrents];
      writeStorage(STORAGE_KEYS.finances, currentTransactions);
      
      if (isSupabaseConfigured) {
        try {
          const toDbPayload = (expense) => ({
            id: String(expense.id),
            project_id: expense.trabalhoId || expense.projectId || null,
            descricao: expense.descricao,
            nome: expense.descricao,
            categoria: expense.categoria,
            valor: expense.valor,
            data: expense.vencimento,
            data_vencimento: expense.vencimento,
            tipo: expense.tipo,
            tipo_geral: expense.tipoGeral,
            status: expense.status,
            forma_pagamento: expense.formaPagamento,
            conta_origem: expense.contaOrigem,
            fornecedor: expense.fornecedor,
            observacoes: expense.observacoes,
            recurrence_id: expense.recorrenciaId || null,
            recorrente: true,
            updated_at: new Date().toISOString(),
          });
          void supabase.from('financas').upsert(newRecurrents.map(toDbPayload));
        } catch (e) {
          console.error('Erro ao sincronizar recorrências no Supabase:', e);
        }
      }
    }

    setTransacoes(currentTransactions);
    setRecorrencias(rawRecurrences);
    setStudio({ projects, clients });

    // Calcular saldos locais reais
    const consolidated = getConsolidatedFinances({ contracts, transactions: currentTransactions, clients });
    const localSaldos = { salario: 0, empresa: 0, reserva: 0 };
    
    // Entradas reais (recebidas)
    consolidated.todasReceitas.forEach((r) => {
      const statusDerivado = deriveFinancialStatus(r);
      if (statusDerivado === 'recebida') {
        const dest = r.contaOrigem || 'empresa';
        if (dest in localSaldos) localSaldos[dest] += r.valor || 0;
      }
    });

    // Saídas reais (pagas)
    consolidated.despesas.forEach((d) => {
      const statusDerivado = deriveFinancialStatus(d);
      if (statusDerivado === 'paga') {
        const origin = d.contaOrigem || 'empresa';
        if (origin in localSaldos) localSaldos[origin] -= d.valor || 0;
      }
    });

    setSaldos({
      salario: Math.round(localSaldos.salario * 100) / 100,
      empresa: Math.round(localSaldos.empresa * 100) / 100,
      reserva: Math.round(localSaldos.reserva * 100) / 100,
    });
  };

  useEffect(() => {
    loadLocalData();
    const unsubscribe = subscribeDbUpdates(loadLocalData);
    window.addEventListener('focus', loadLocalData);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', loadLocalData);
    };
  }, []);

  const despesas = useMemo(() => {
    const operational = transacoes
      .filter((item) => item.tipoGeral === 'Saida' && item.tipo === area)
      .map((item) => ({
        ...item,
        statusDerivado: deriveFinancialStatus(item),
      }));

    if (area !== 'fixa') return operational;

    // Despesas fixas representam regras mensais. A lista principal mostra
    // uma única linha por recorrência, e não uma linha para cada competência
    // futura gerada internamente.
    return recorrencias
      .filter((recurrence) => recurrence?.ativo !== false)
      .map((recurrence) => {
        const items = operational
          .filter((item) => String(item.recorrenciaId || item.recurrenceId || '') === String(recurrence.id))
          .sort((a, b) => String(a.vencimento || '').localeCompare(String(b.vencimento || '')));
        const currentMonth = new Date().toISOString().slice(0, 7);
        const representative = items.find((item) => (
          String(item.vencimento || '').slice(0, 7) === currentMonth
          && item.statusDerivado !== 'cancelada'
        )) || items.find((item) => (
          String(item.vencimento || '').slice(0, 7) >= currentMonth
          && item.statusDerivado !== 'paga'
          && item.statusDerivado !== 'cancelada'
        )) || items.at(-1) || {};

        const dueDate = representative.vencimento
          || buildDueDateForMonth(`${currentMonth}-01`, Number(recurrence.diaVencimento || 1));

        return {
          ...representative,
          id: representative.id || `recurrence-summary-${recurrence.id}`,
          recorrenciaId: recurrence.id,
          descricao: recurrence.descricao,
          categoria: recurrence.categoria || 'Geral',
          valor: Number(recurrence.valor || representative.valor || 0),
          formaPagamento: recurrence.formaPagamento || representative.formaPagamento,
          contaOrigem: recurrence.contaOrigem || representative.contaOrigem,
          fornecedor: recurrence.fornecedor || representative.fornecedor,
          observacoes: recurrence.observacoes || representative.observacoes,
          vencimento: dueDate,
          statusDerivado: representative.statusDerivado || 'pendente',
          isRecurrenceSummary: true,
        };
      });
  }, [area, recorrencias, transacoes]);

  const filteredDespesas = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentYear = new Date().toISOString().slice(0, 4);

    return despesas
      .filter((item) => {
        if (
          statusFilter
          && item.statusDerivado !== statusFilter
        ) {
          return false;
        }

        if (
          categoryFilter
          && item.categoria !== categoryFilter
        ) {
          return false;
        }

        const date = item.vencimento || '';

        if (
          periodFilter === 'mes'
          && date.slice(0, 7) !== currentMonth
        ) {
          return false;
        }

        if (
          periodFilter === 'ano'
          && date.slice(0, 4) !== currentYear
        ) {
          return false;
        }

        if (
          normalizedSearch
          && ![
            item.descricao,
            item.categoria,
            item.fornecedor,
            item.formaPagamento,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(normalizedSearch)
        ) {
          return false;
        }

        return true;
      })
      .sort((first, second) => (
        String(second.vencimento || '').localeCompare(
          String(first.vencimento || ''),
        )
      ));
  }, [
    categoryFilter,
    despesas,
    periodFilter,
    search,
    statusFilter,
  ]);

  const vencimentos = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const alertLimit = new Date();
    alertLimit.setDate(alertLimit.getDate() + 7);
    const alertLimitStr = alertLimit.toISOString().slice(0, 10);

    return despesas
      .filter((item) => item.statusDerivado === 'vencida' || (item.statusDerivado === 'pendente' && item.vencimento <= alertLimitStr))
      .sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento))
      .slice(0, 5);
  }, [despesas]);

  const reports = useMemo(() => {
    const expenses = despesas.filter((d) => d.statusDerivado !== 'cancelada');
    const byCategory = {};
    const byMonth = {};
    const bySupplier = {};
    const byEvent = {};

    expenses.forEach((item) => {
      const cat = item.categoria || 'Outras';
      byCategory[cat] = (byCategory[cat] || 0) + (item.valor || 0);

      const month = item.vencimento ? item.vencimento.slice(0, 7) : 'Sem data';
      byMonth[month] = (byMonth[month] || 0) + (item.valor || 0);

      const supplier = item.fornecedor || 'Não informado';
      bySupplier[supplier] = (bySupplier[supplier] || 0) + (item.valor || 0);

      if (area === 'variavel' && item.trabalhoId) {
        const proj = studio.projects.find((p) => String(p.id) === String(item.trabalhoId));
        const projName = proj ? `${proj.clienteNome} - ${proj.tipoServico}` : 'Projeto removido';
        byEvent[projName] = (byEvent[projName] || 0) + (item.valor || 0);
      }
    });

    return { byCategory, byMonth, bySupplier, byEvent };
  }, [area, despesas, studio.projects]);

  const totalMensalFixo = useMemo(() => (
    recorrencias
      .filter((item) => item?.ativo !== false)
      .reduce((sum, item) => sum + Number(item.valor || 0), 0)
  ), [recorrencias]);

  const totalAtual = despesas.filter((d) => d.statusDerivado !== 'cancelada').reduce((sum, item) => sum + (item.valor || 0), 0);

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({
      ...emptyForm,
      tipo: area,
      status: 'Pendente',
      frequencia:
        area === 'fixa'
          ? 'mensal'
          : 'sem_recorrencia',
      projectId:
        area === 'variavel'
          ? studio.projects[0]?.id || ''
          : '',
      formaPagamento: 'Pix',
      contaOrigem: 'empresa',
    });
    setModalOpen(true);
  };

  const openEditModal = (expense) => {
    setEditingId(expense.id);
    const valueStr = String(Math.round((expense.valor || 0) * 100));
    setFormData({
      ...emptyForm,
      ...expense,
      nome: expense.descricao || expense.nome || '',
      descricao: expense.descricao || expense.nome || '',
      valor: maskCurrency(valueStr),
      data: expense.vencimento || '',
      dataVencimento: expense.vencimento || '',
      diaVencimento: String(
        expense.diaVencimento
        || (
          expense.vencimento
            ? Number(String(expense.vencimento).slice(8, 10))
            : ''
        )
        || '',
      ),
      projectId:
        area === 'variavel'
          ? expense.trabalhoId || expense.projectId || ''
          : '',
      frequencia:
        area === 'fixa'
          ? (
            expense.frequencia
            || (
              expense.recorrenciaId
                ? 'mensal'
                : 'sem_recorrencia'
            )
          )
          : 'sem_recorrencia',
    });
    setModalOpen(true);
  };

  const maybeCreateEquipment = (expense) => {
    if (
      expense.tipo !== 'variavel'
      || !(
        expense.categoria === 'Equipamentos'
        || hasEquipmentKeyword(expense)
      )
    ) {
      return;
    }

    const equipment = readStorage(STORAGE_KEYS.equipment, []);
    const existingIndex = equipment.findIndex((item) => (
      String(
        item.financeExpenseId
        || item.origemFinanceiraId
        || '',
      ) === String(expense.id)
    ));

    const existingEquipment = existingIndex >= 0
      ? equipment[existingIndex]
      : {};

    const candidateId = existingEquipment.id || `equipamento-financeiro-${expense.id}`;
    if (isEquipmentMarkedDeleted({
      id: candidateId,
      financeExpenseId: expense.id,
      origemFinanceiraId: expense.id,
    })) {
      return;
    }

    const equipmentRecord = {
      ...existingEquipment,
      id: candidateId,
      nome:
        expense.descricao
        || existingEquipment.nome
        || 'Equipamento',
      categoria:
        existingEquipment.categoria
        || 'Equipamentos',
      valor:
        Number(expense.valor || 0),
      valorCompra:
        Number(expense.valor || 0),
      dataCompra:
        expense.vencimento
        || existingEquipment.dataCompra
        || '',
      fornecedor:
        expense.fornecedor
        || existingEquipment.fornecedor
        || '',
      observacoes:
        expense.observacoes
        || existingEquipment.observacoes
        || '',
      status:
        existingEquipment.status
        || 'Ativo',
      vidaUtilMeses: Number(
        existingEquipment.vidaUtilMeses
        ?? 60,
      ),
      vidaUtilAnos: Number(
        existingEquipment.vidaUtilAnos
        ?? 5,
      ),
      financeExpenseId: expense.id,
      origemFinanceiraId: expense.id,
      origem: 'financeiro',
      criadoEm:
        existingEquipment.criadoEm
        || new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };

    const nextEquipment = existingIndex >= 0
      ? equipment.map((item, index) => (
        index === existingIndex
          ? equipmentRecord
          : item
      ))
      : [equipmentRecord, ...equipment];

    writeStorage(
      STORAGE_KEYS.equipment,
      nextEquipment,
    );
  };

  const saveExpense = async () => {
    const value = parseCurrency(formData.valor);
    const description = area === 'fixa' ? formData.nome : formData.descricao;

    if (!description || String(description).trim() === '') {
      alert('Descrição obrigatória.');
      return;
    }
    if (value <= 0) {
      alert('Informe um valor maior que zero.');
      return;
    }
    
    const fixedDueDay = Number(
      formData.diaVencimento,
    );

    if (
      area === 'fixa'
      && (
        !Number.isInteger(fixedDueDay)
        || fixedDueDay < 1
        || fixedDueDay > 31
      )
    ) {
      alert('Informe um dia de vencimento entre 1 e 31.');
      return;
    }

    const existingFixedDate = String(
      formData.dataVencimento
      || formData.data
      || formData.vencimento
      || '',
    );
    const fixedMonthReference = /^\d{4}-\d{2}-\d{2}$/.test(existingFixedDate)
      ? `${existingFixedDate.slice(0, 7)}-01`
      : null;

    // Despesas fixas armazenam a regra mensal pelo dia do vencimento.
    // A data ISO é apenas uma competência calculada internamente para
    // relatórios, status e sincronização, nunca uma entrada obrigatória.
    const venc = area === 'fixa'
      ? buildDueDateForMonth(fixedMonthReference, fixedDueDay)
      : String(formData.data || formData.dataVencimento || '');

    if (area !== 'fixa' && (!venc || !/^\d{4}-\d{2}-\d{2}$/.test(venc))) {
      alert('Vencimento válido obrigatório.');
      return;
    }

    const competence = venc.slice(0, 7);

    // Se houver recorrência (despesas fixas)
    if (area === 'fixa') {
      const targetDay = fixedDueDay;
      const existingRecurrences = readStorage(STORAGE_KEYS.recurrences, []);
      const equivalentRecurrence = !formData.recorrenciaId
        ? existingRecurrences.find((item) => (
          item.ativo !== false
          && String(item.descricao || '').trim().toLowerCase() === String(description || '').trim().toLowerCase()
          && String(item.categoria || '').trim().toLowerCase() === String(formData.categoria || 'Aluguel').trim().toLowerCase()
          && Number(item.valor || 0) === Number(value || 0)
          && Number(item.diaVencimento || 1) === Number(targetDay)
          && String(item.contaOrigem || 'empresa') === String(formData.contaOrigem || 'empresa')
        ))
        : null;
      const recurrenceId = formData.recorrenciaId || equivalentRecurrence?.id || `recorrencia-${Date.now()}`;
      const baseRecurrence = {
        ...(equivalentRecurrence || {}),
        id: recurrenceId,
        descricao: description,
        categoria: formData.categoria || 'Aluguel',
        valor: value,
        frequencia: 'mensal',
        diaVencimento: targetDay,
        fornecedor: formData.fornecedor || '',
        formaPagamento: formData.formaPagamento || 'Pix',
        observacoes: formData.observacoes || '',
        ativo: !['cancelada', 'cancelado', 'inativo'].includes(
          String(formData.status || '').trim().toLowerCase(),
        ),
        contaOrigem: formData.contaOrigem || 'empresa',
        criadoEm: formData.criadoEm || new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      const recurrences = existingRecurrences;
      let nextRecurrences;
      if (formData.recorrenciaId || equivalentRecurrence) {
        const recurrenceExists = recurrences.some((r) => r.id === baseRecurrence.id);
        nextRecurrences = recurrenceExists
          ? recurrences.map((r) => r.id === baseRecurrence.id ? baseRecurrence : r)
          : [baseRecurrence, ...recurrences];

        // Atualizar todas as competências não pagas da recorrência. Ao reativar
        // uma conta cancelada, a competência editada volta para Pendente e as
        // futuras canceladas também são reabertas sem alterar itens já pagos.
        const transactions = readStorage(STORAGE_KEYS.finances, []);
        const normalizedRequestedStatus = String(formData.status || 'Pendente').trim().toLowerCase();
        const requestedStatus = normalizedRequestedStatus === 'pago' || normalizedRequestedStatus === 'paga'
          ? 'Pago'
          : normalizedRequestedStatus === 'cancelada' || normalizedRequestedStatus === 'cancelado'
            ? 'Cancelada'
            : 'Pendente';
        const nextTransactions = transactions.map((t) => {
          const belongsToRecurrence = t.recorrenciaId === baseRecurrence.id;
          const paid = ['pago', 'paga', 'recebida'].includes(String(t.status || '').trim().toLowerCase());
          if (belongsToRecurrence && !paid) {
            const nextDueDate = replaceDueDay(
              t.vencimento || t.dataVencimento || t.data || venc,
              baseRecurrence.diaVencimento,
            );
            const isEditedCompetence = String(t.id) === String(editingId);
            const wasCancelled = ['cancelada', 'cancelado'].includes(String(t.status || '').trim().toLowerCase());
            return {
              ...t,
              descricao: baseRecurrence.descricao,
              categoria: baseRecurrence.categoria,
              valor: baseRecurrence.valor,
              formaPagamento: baseRecurrence.formaPagamento,
              fornecedor: baseRecurrence.fornecedor,
              observacoes: baseRecurrence.observacoes,
              contaOrigem: baseRecurrence.contaOrigem,
              status: isEditedCompetence
                ? requestedStatus
                : (baseRecurrence.ativo && wasCancelled ? 'Pendente' : t.status),
              vencimento: nextDueDate,
              data: nextDueDate,
              dataVencimento: nextDueDate,
              competencia: nextDueDate.slice(0, 7),
              atualizadoEm: new Date().toISOString(),
            };
          }
          return t;
        });
        writeStorage(STORAGE_KEYS.finances, nextTransactions);
        
        if (isSupabaseConfigured) {
          try {
            const notPaid = nextTransactions.filter((t) => t.recorrenciaId === baseRecurrence.id && t.status !== 'Pago' && t.status !== 'paga');
            for (const item of notPaid) {
              await supabase.from('financas').update({
                descricao: item.descricao,
                categoria: item.categoria,
                valor: item.valor,
                forma_pagamento: item.formaPagamento,
                conta_origem: item.contaOrigem,
                fornecedor: item.fornecedor,
                observacoes: item.observacoes,
                data: item.vencimento,
                data_vencimento: item.vencimento,
                updated_at: new Date().toISOString(),
              }).eq('id', String(item.id));
            }
          } catch (e) {
            console.error('Erro de sincronização Supabase:', e);
          }
        }
      } else {
        nextRecurrences = [baseRecurrence, ...recurrences];
      }

      writeStorage(STORAGE_KEYS.recurrences, nextRecurrences);
      
      if (isSupabaseConfigured) {
        try {
          await supabase.from('financas').upsert([{
            id: `recurrence-row-${baseRecurrence.id}`,
            descricao: baseRecurrence.descricao,
            tipo: 'configuracao_recorrencia',
            tipo_geral: 'Configuracao',
            status: baseRecurrence.ativo ? 'Ativo' : 'Inativo',
            valor: baseRecurrence.valor,
            data: venc,
            detalhes: baseRecurrence,
            updated_at: new Date().toISOString(),
          }], { onConflict: 'id' });
        } catch (e) {
          console.error(e);
        }
      }

      // Disparar geração automática
      const transactions = readStorage(STORAGE_KEYS.finances, []);
      const newRecs = generateRecurrentExpenses(nextRecurrences, transactions, new Date());
      if (newRecs.length > 0) {
        const nextTransactions = [...transactions, ...newRecs];
        writeStorage(STORAGE_KEYS.finances, nextTransactions);
        if (isSupabaseConfigured) {
          try {
            const toDbPayload = (expense) => ({
              id: String(expense.id),
              project_id: expense.trabalhoId || null,
              descricao: expense.descricao,
              nome: expense.descricao,
              categoria: expense.categoria,
              valor: expense.valor,
              data: expense.vencimento,
              data_vencimento: expense.vencimento,
              tipo: expense.tipo,
              tipo_geral: expense.tipoGeral,
              status: expense.status,
              forma_pagamento: expense.formaPagamento,
              conta_origem: expense.contaOrigem,
              fornecedor: expense.fornecedor,
              observacoes: expense.observacoes,
              recurrence_id: expense.recorrenciaId || null,
              recorrente: true,
              updated_at: new Date().toISOString(),
            });
            await supabase.from('financas').upsert(newRecs.map(toDbPayload));
          } catch (e) {
            console.error(e);
          }
        }
      }

      appendFinancialAudit({
        action: formData.recorrenciaId
          ? 'recurrence_updated'
          : 'recurrence_created',
        entity: 'recurrence',
        entityId: baseRecurrence.id,
        before: formData.recorrenciaId
          ? recurrences.find((item) => item.id === baseRecurrence.id) || null
          : null,
        after: baseRecurrence,
        details: {
          generatedItems: newRecs.length,
          competence,
        },
      });

    } else {
      // Lançamento avulso
      const baseExpense = {
        id: editingId || `despesa-${Date.now()}`,
        recorrenciaId: '',
        competencia: competence,
        descricao: description,
        categoria: formData.categoria || 'Outras',
        valor: value,
        vencimento: venc,
        dataPagamento: formData.status === 'Pago' || formData.status === 'paga' ? formData.dataPagamento || venc : '',
        status: formData.status || 'Pendente',
        tipo: area,
        tipoGeral: 'Saida',
        contaOrigem: formData.contaOrigem || 'empresa',
        formaPagamento: formData.formaPagamento || 'Pix',
        fornecedor: formData.fornecedor || '',
        observacoes: formData.observacoes || '',
        trabalhoId:
          area === 'variavel'
            ? formData.projectId || ''
            : '',
        criadoEm: formData.criadoEm || new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      const transactions = readStorage(STORAGE_KEYS.finances, []);
      let nextTransactions;
      if (editingId) {
        nextTransactions = transactions.map((t) => String(t.id) === String(editingId) ? baseExpense : t);
      } else {
        nextTransactions = [baseExpense, ...transactions];
      }

      writeStorage(STORAGE_KEYS.finances, nextTransactions);
      
      if (isSupabaseConfigured) {
        try {
          const toDbPayload = (expense) => ({
            id: String(expense.id),
            project_id: expense.trabalhoId || null,
            descricao: expense.descricao,
            nome: expense.descricao,
            categoria: expense.categoria,
            valor: expense.valor,
            data: expense.vencimento,
            data_vencimento: expense.vencimento,
            tipo: expense.tipo,
            tipo_geral: expense.tipoGeral,
            status: expense.status,
            forma_pagamento: expense.formaPagamento,
            conta_origem: expense.contaOrigem,
            fornecedor: expense.fornecedor,
            observacoes: expense.observacoes,
            recurrence_id: null,
            recorrente: false,
            updated_at: new Date().toISOString(),
          });
          await supabase.from('financas').upsert([toDbPayload(baseExpense)]);
        } catch (e) {
          console.error(e);
        }
      }
      maybeCreateEquipment(baseExpense);

      appendFinancialAudit({
        action: editingId ? 'expense_updated' : 'expense_created',
        entity: 'expense',
        entityId: baseExpense.id,
        before: editingId
          ? transactions.find((item) => String(item.id) === String(editingId)) || null
          : null,
        after: baseExpense,
        details: {
          competence: getTransactionCompetence(baseExpense),
          area,
        },
      });
    }

    setModalOpen(false);
    loadLocalData();
  };

  const removeExpense = async (expense) => {
    if (expense.statusDerivado === 'paga') {
      alert('Despesas pagas devem ser revertidas ou canceladas antes da exclusão.');
      return;
    }

    const recurrenceId = expense.recorrenciaId || expense.recurrenceId || '';

    if (area === 'fixa' && recurrenceId) {
      const confirmed = window.confirm(
        'Excluir esta despesa fixa?\n\n'
        + 'A recorrência e os lançamentos futuros não pagos serão removidos. '
        + 'Pagamentos já registrados permanecerão no histórico.',
      );
      if (!confirmed) return;

      const transactions = readStorage(STORAGE_KEYS.finances, []);
      const removedItems = transactions.filter((item) => (
        String(item.recorrenciaId || item.recurrenceId || '') === String(recurrenceId)
        && deriveFinancialStatus(item) !== 'paga'
      ));
      const nextTransactions = transactions.filter((item) => !removedItems.some((removed) => String(removed.id) === String(item.id)));
      writeStorage(STORAGE_KEYS.finances, nextTransactions);

      const currentRecurrences = readStorage(STORAGE_KEYS.recurrences, []);
      const nextRecurrences = currentRecurrences.filter((item) => String(item.id) !== String(recurrenceId));
      writeStorage(STORAGE_KEYS.recurrences, nextRecurrences);

      if (isSupabaseConfigured) {
        try {
          const ids = removedItems.map((item) => String(item.id));
          if (ids.length > 0) {
            const { error: rowsError } = await supabase.from('financas').delete().in('id', ids);
            if (rowsError) throw rowsError;
          }
          const { error: ruleError } = await supabase
            .from('financas')
            .delete()
            .eq('id', `recurrence-row-${recurrenceId}`);
          if (ruleError) throw ruleError;
        } catch (error) {
          console.error(error);
          alert(`Não foi possível excluir a despesa fixa: ${error.message || error}`);
          loadLocalData();
          return;
        }
      }

      appendFinancialAudit({
        action: 'recurrence_deleted',
        entity: 'recurrence',
        entityId: recurrenceId,
        before: { recurrenceId, transactions: removedItems },
        after: null,
        details: { removedCount: removedItems.length },
      });

      loadLocalData();
      return;
    }

    const confirmed = window.confirm('Deseja excluir permanentemente este lançamento?');
    if (!confirmed) return;

    const transactions = readStorage(STORAGE_KEYS.finances, []);
    const removedItems = transactions.filter((item) => String(item.id) === String(expense.id));
    const nextTransactions = transactions.filter((item) => String(item.id) !== String(expense.id));
    writeStorage(STORAGE_KEYS.finances, nextTransactions);

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.from('financas').delete().eq('id', String(expense.id));
        if (error) throw error;
      } catch (error) {
        console.error(error);
        alert(`Não foi possível excluir o lançamento: ${error.message || error}`);
        loadLocalData();
        return;
      }
    }

    appendFinancialAudit({
      action: 'expense_deleted',
      entity: 'expense',
      entityId: expense.id,
      before: removedItems,
      after: null,
    });

    loadLocalData();
  };

  const markAsPaid = async (expense) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const transactions = readStorage(STORAGE_KEYS.finances, []);
    const nextTransactions = transactions.map((t) => {
      if (String(t.id) === String(expense.id)) {
        return {
          ...t,
          status: 'Pago',
          dataPagamento: todayStr,
          atualizadoEm: new Date().toISOString(),
        };
      }
      return t;
    });
    writeStorage(STORAGE_KEYS.finances, nextTransactions);

    appendFinancialAudit({
      action: 'expense_paid',
      entity: 'expense',
      entityId: expense.id,
      before: expense,
      after: nextTransactions.find((item) => String(item.id) === String(expense.id)) || null,
    });

    if (isSupabaseConfigured) {
      try {
        await supabase.from('financas').update({
          status: 'Pago',
          data_pagamento: todayStr,
          updated_at: new Date().toISOString(),
        }).eq('id', String(expense.id));
      } catch (e) {
        console.error(e);
      }
    }

    loadLocalData();
  };

  const reversePayment = async (expense) => {
    const transactions = readStorage(STORAGE_KEYS.finances, []);
    const nextTransactions = transactions.map((t) => {
      if (String(t.id) === String(expense.id)) {
        return {
          ...t,
          status: 'Pendente',
          dataPagamento: '',
          atualizadoEm: new Date().toISOString(),
        };
      }
      return t;
    });
    writeStorage(STORAGE_KEYS.finances, nextTransactions);

    appendFinancialAudit({
      action: 'expense_payment_reversed',
      entity: 'expense',
      entityId: expense.id,
      before: expense,
      after: nextTransactions.find((item) => String(item.id) === String(expense.id)) || null,
    });

    if (isSupabaseConfigured) {
      try {
        await supabase.from('financas').update({
          status: 'Pendente',
          data_pagamento: null,
          updated_at: new Date().toISOString(),
        }).eq('id', String(expense.id));
      } catch (e) {
        console.error(e);
      }
    }

    loadLocalData();
  };

  const cancelExpense = async (expense) => {
    const transactions = readStorage(STORAGE_KEYS.finances, []);
    const nextTransactions = transactions.map((t) => {
      if (String(t.id) === String(expense.id)) {
        return {
          ...t,
          status: 'cancelada',
          atualizadoEm: new Date().toISOString(),
        };
      }
      return t;
    });
    writeStorage(STORAGE_KEYS.finances, nextTransactions);

    appendFinancialAudit({
      action: 'expense_cancelled',
      entity: 'expense',
      entityId: expense.id,
      before: expense,
      after: nextTransactions.find((item) => String(item.id) === String(expense.id)) || null,
    });

    if (isSupabaseConfigured) {
      try {
        await supabase.from('financas').update({
          status: 'cancelada',
          updated_at: new Date().toISOString(),
        }).eq('id', String(expense.id));
      } catch (e) {
        console.error(e);
      }
    }

    loadLocalData();
  };

  const categories = area === 'fixa' ? FIXED_EXPENSE_CATEGORIES : VARIABLE_EXPENSE_CATEGORIES;
  const title = area === 'fixa' ? 'Despesas Fixas' : 'Despesas Variáveis';

  return (
    <div
      className="sf-finance-section"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>{title}</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '6px' }}>
            {area === 'fixa'
              ? 'Controle recorrências, vencimentos e custo estrutural da empresa.'
              : 'Registre gastos pontuais por evento, categoria, fornecedor e equipamento.'}
          </p>
        </div>
        <button className="sf-primary-button" onClick={openCreateModal}>
          <Plus size={18} /> Novo lançamento
        </button>
      </div>

      {area === 'fixa' && vencimentos.length > 0 && (
        <div className="sf-alert warning">
          <AlertTriangle size={22} />
          <span>
            Próximos vencimentos: {vencimentos.map((item) => `${item.descricao} (${formatDateBR(item.vencimento)})`).join(', ')}
          </span>
        </div>
      )}

      <div className="sf-metric-grid">
        <Metric label={area === 'fixa' ? 'Total mensal previsto' : 'Total lançado'} value={area === 'fixa' ? totalMensalFixo : totalAtual} />
        <Metric label={area === 'fixa' ? 'Custo anual previsto' : 'Categorias usadas'} value={area === 'fixa' ? totalMensalFixo * 12 : Object.keys(reports.byCategory).length} isNumber={area !== 'fixa'} />
        <Metric label="Lançamentos" value={despesas.length} isNumber />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(220px, 1.5fr) repeat(3, minmax(140px, .8fr)) auto',
          gap: '9px',
          alignItems: 'center',
        }}
      >
        <label
          style={{
            minHeight: '42px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 10px',
            background: 'var(--bg-card, #111)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
          }}
        >
          <Search
            size={16}
            color="var(--text-secondary)"
          />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar descrição, fornecedor..."
            style={{
              width: '100%',
              minWidth: 0,
              background: 'transparent',
              color: 'var(--text-main)',
              border: 0,
              outline: 0,
            }}
          />
        </label>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          style={inputStyle}
        >
          <option value="">Todos os status</option>
          <option value="pendente">Pendentes</option>
          <option value="vencida">Vencidas</option>
          <option value="paga">Pagas</option>
          <option value="cancelada">Canceladas</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          style={inputStyle}
        >
          <option value="">Todas as categorias</option>

          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <select
          value={periodFilter}
          onChange={(event) => setPeriodFilter(event.target.value)}
          style={inputStyle}
        >
          <option value="todos">Todo o período</option>
          <option value="mes">Este mês</option>
          <option value="ano">Este ano</option>
        </select>

        {(search
          || statusFilter
          || categoryFilter
          || periodFilter !== 'todos') && (
          <button
            type="button"
            className="sf-secondary-button"
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setCategoryFilter('');
              setPeriodFilter('todos');
            }}
          >
            Limpar
          </button>
        )}
      </div>

      {area === 'variavel' && (
        <div className="sf-alert warning">
          <PackagePlus size={20} />

          <span>
            Compras na categoria “Equipamentos” são enviadas automaticamente para o módulo de equipamentos com depreciação inicial de 60 meses.
          </span>
        </div>
      )}

      <div className="sf-table-card">
        <table className="sf-table">
          <thead>
            <tr>
              <th>Descrição / Categoria</th>
              <th>Vencimento</th>
              <th>Pagamento</th>
              <th>Status</th>
              <th>Valor</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredDespesas.map((expense) => (
              <tr key={expense.id}>
                <td>
                  <strong>{expense.descricao}</strong>
                  <small>
                    <Tag size={12} /> {expense.categoria || 'Geral'}
                    {expense.trabalhoId ? ` | Vinculada ao Trabalho` : ''}
                    {expense.fornecedor ? ` | ${expense.fornecedor}` : ''}
                  </small>
                </td>
                <td>{formatDateBR(expense.vencimento) || '-'}</td>
                <td>
                  <span className="sf-pill">
                    <CreditCard size={12} /> {expense.formaPagamento || expense.contaOrigem || '-'}
                  </span>
                </td>
                <td>
                  <span className={`sf-status ${expense.statusDerivado.toLowerCase()}`}>
                    {expense.statusDerivado}
                  </span>
                </td>
                <td className="negative">-{formatCurrency(expense.valor)}</td>
                <td>
                  <div className="sf-actions">
                    {expense.statusDerivado !== 'paga' && expense.statusDerivado !== 'cancelada' && (
                      <button title="Marcar como paga" onClick={() => markAsPaid(expense)}>
                        <PackagePlus size={17} />
                      </button>
                    )}
                    {expense.statusDerivado === 'paga' && (
                      <button title="Reverter pagamento" onClick={() => reversePayment(expense)}>
                        <Undo2 size={17} style={{ color: 'var(--color-highlight)' }} />
                      </button>
                    )}
                    {expense.statusDerivado !== 'cancelada' && expense.statusDerivado !== 'paga' && (
                      <button title="Cancelar despesa" onClick={() => cancelExpense(expense)}>
                        <XCircle size={17} style={{ color: 'var(--color-warning)' }} />
                      </button>
                    )}
                    <button title="Editar" onClick={() => openEditModal(expense)}>
                      <Edit2 size={17} />
                    </button>
                    <button title="Excluir" onClick={() => removeExpense(expense)}>
                      <Trash2 size={17} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredDespesas.length === 0 && (
              <tr>
                <td colSpan="6" className="empty">
                  Nenhuma despesa cadastrada nesta área.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="sf-report-grid">
        <Report title="Total por categoria" data={reports.byCategory} />
        <Report title="Total por mês" data={reports.byMonth} />
        {area === 'variavel' && <Report title="Total por evento" data={reports.byEvent} />}
        <Report title="Total por fornecedor" data={reports.bySupplier} />
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={`${editingId ? 'Editar' : 'Novo'} ${title}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <label style={{ ...labelStyle, color: 'var(--text-main)' }}>De qual saldo deseja retirar?</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {['empresa', 'salario', 'reserva'].map((account) => (
                <button
                  key={account}
                  type="button"
                  onClick={() => setFormData({ ...formData, contaOrigem: account })}
                  className={formData.contaOrigem === account ? 'sf-account active' : 'sf-account'}
                >
                  <strong>{account}</strong>
                  <span>{formatCurrency(saldos[account] || 0)}</span>
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '12px',
            }}
          >
            <Field label={area === 'fixa' ? 'Nome' : 'Descrição'}>
              <input
                style={inputStyle}
                value={area === 'fixa' ? formData.nome : formData.descricao}
                onChange={(event) =>
                  setFormData(
                    area === 'fixa'
                      ? { ...formData, nome: event.target.value, descricao: event.target.value }
                      : { ...formData, descricao: event.target.value, nome: event.target.value },
                  )
                }
              />
            </Field>
            <Field label="Valor">
              <input
                style={{ ...inputStyle, color: 'var(--color-danger)', fontWeight: 700 }}
                value={formData.valor}
                onChange={(event) => setFormData({ ...formData, valor: maskCurrency(event.target.value) })}
                placeholder="R$ 0,00"
              />
            </Field>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '12px',
            }}
          >
            <Field label="Categoria">
              <select style={inputStyle} value={formData.categoria} onChange={(event) => setFormData({ ...formData, categoria: event.target.value })}>
                <option value="">Selecione...</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>
            {area === 'fixa' ? (
              <Field label="Dia do vencimento">
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="31"
                  style={inputStyle}
                  value={formData.diaVencimento}
                  onChange={(event) => {
                    const rawValue = event.target.value;
                    const numericValue = rawValue
                      ? Math.min(
                        31,
                        Math.max(
                          1,
                          Number(rawValue) || 1,
                        ),
                      )
                      : '';

                    setFormData({
                      ...formData,
                      diaVencimento: numericValue,
                    });
                  }}
                  placeholder="Ex.: 5"
                />
              </Field>
            ) : (
              <Field label="Data de vencimento">
                <DateInput
                  value={formData.data}
                  onChange={(value) => {
                    setFormData({
                      ...formData,
                      data: value,
                      dataVencimento: value,
                    });
                  }}
                />
              </Field>
            )}
          </div>

          {area === 'fixa' && (
            <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '12px',
            }}
          >
              <Field label="Frequência / Recorrência">
                <div
                  style={{
                    ...inputStyle,
                    opacity: 0.8,
                    cursor: 'default',
                  }}
                >
                  Mensal, no mesmo dia
                </div>
              </Field>
              <Field label="Status">
                <select style={inputStyle} value={formData.status} onChange={(event) => setFormData({ ...formData, status: event.target.value })}>
                  <option value="Pago">Pago</option>
                  <option value="Pendente">Pendente</option>
                </select>
              </Field>
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '12px',
            }}
          >
            <Field label="Forma de pagamento">
              <select style={inputStyle} value={formData.formaPagamento} onChange={(event) => setFormData({ ...formData, formaPagamento: event.target.value })}>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </Field>
            {area === 'variavel' && (
              <Field label="Trabalho vinculado">
                <select
                  style={inputStyle}
                  value={formData.projectId}
                  onChange={(event) => setFormData({
                    ...formData,
                    projectId: event.target.value,
                  })}
                >
                  <option value="">Nenhum trabalho</option>
                  {studio.projects.map((project) => (
                    <option
                      key={project.id}
                      value={project.id}
                    >
                      {project.clienteNome} - {project.tipoServico}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Fornecedor (opcional)">
              <input
                style={inputStyle}
                value={formData.fornecedor}
                onChange={(event) => setFormData({
                  ...formData,
                  fornecedor: event.target.value,
                })}
              />
            </Field>
          </div>

          <Field label="Observações">
            <textarea
              style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
              value={formData.observacoes}
              onChange={(event) => setFormData({ ...formData, observacoes: event.target.value })}
            />
          </Field>

          <button className="sf-primary-button wide" onClick={saveExpense}>
            Salvar lançamento
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Metric({ label, value, isNumber = false }) {
  return (
    <div className="sf-card">
      <span>{label}</span>
      <strong>{isNumber ? value : formatCurrency(value)}</strong>
    </div>
  );
}

function Report({ title, data }) {
  const entries = Object.entries(data).filter(([, value]) => value > 0).slice(0, 6);
  return (
    <div className="sf-card report">
      <h3>{title}</h3>
      {entries.length === 0 && <p>Nenhum dado para exibir.</p>}
      {entries.map(([label, value]) => (
        <div key={label} className="report-row">
          <span>{label}</span>
          <strong>{formatCurrency(value)}</strong>
        </div>
      ))}
    </div>
  );
}