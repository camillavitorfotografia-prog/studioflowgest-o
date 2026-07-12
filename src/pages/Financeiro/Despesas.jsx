import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CreditCard,
  Edit2,
  PackagePlus,
  Plus,
  Tag,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react';
import Modal from '../../components/Modal';
import { getDbStudioData, subscribeDbUpdates } from '../../utils/dbData';
import { isSupabaseConfigured, supabase } from '../../utils/supabase';
import { maskCurrency } from '../../utils/masks';
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

export default function Despesas({ area = 'fixa' }) {
  const [transacoes, setTransacoes] = useState([]);
  const [recorrencias, setRecorrencias] = useState([]);
  const [saldos, setSaldos] = useState({ salario: 0, empresa: 0, reserva: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [studio, setStudio] = useState({ projects: [], clients: [] });
  const [formData, setFormData] = useState({ ...emptyForm, tipo: area, projectId: '' });

  const loadLocalData = () => {
    const rawTransactions = readStorage(STORAGE_KEYS.finances, []);
    const rawRecurrences = readStorage(STORAGE_KEYS.recurrences, []);
    const projects = readStorage(STORAGE_KEYS.projects, []);
    const clients = readStorage(STORAGE_KEYS.clients, []);
    const contracts = readStorage(STORAGE_KEYS.contracts, []);

    // Geração idempotente de competências recorrentes
    const newRecurrents = generateRecurrentExpenses(rawRecurrences, rawTransactions, new Date());
    let currentTransactions = rawTransactions;
    if (newRecurrents.length > 0) {
      currentTransactions = [...rawTransactions, ...newRecurrents];
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
    return transacoes
      .filter((item) => item.tipoGeral === 'Saida' && item.tipo === area)
      .map((item) => ({
        ...item,
        statusDerivado: deriveFinancialStatus(item),
      }));
  }, [area, transacoes]);

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

  const totalMensalFixo = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return despesas
      .filter((item) => item.statusDerivado !== 'cancelada' && item.vencimento && item.vencimento.slice(0, 7) === currentMonth)
      .reduce((sum, item) => sum + (item.valor || 0), 0);
  }, [despesas]);

  const totalAtual = despesas.filter((d) => d.statusDerivado !== 'cancelada').reduce((sum, item) => sum + (item.valor || 0), 0);

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({
      ...emptyForm,
      tipo: area,
      status: 'Pendente',
      projectId: studio.projects[0]?.id || '',
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
      projectId: expense.trabalhoId || expense.projectId || '',
      frequencia: expense.recorrenciaId ? 'mensal' : 'sem_recorrencia',
    });
    setModalOpen(true);
  };

  const maybeCreateEquipment = (expense) => {
    if (expense.tipo !== 'variavel' || expense.categoria !== 'Equipamentos') return;
    // Deixa a estrutura preparada, mas não cria o equipamento ou calcula a depreciação ainda, conforme solicitado.
  };

  const saveExpense = async () => {
    const value = parseCurrency(formData.valor);
    const description = area === 'fixa' ? formData.nome : formData.descricao;

    if (!description || String(description).trim() === '') {
      alert('Descrição obrigatória.');
      return;
    }
    if (value <= 0) {
      alert('Valor válido e não negativo obrigatório.');
      return;
    }
    
    const venc = area === 'fixa' ? formData.dataVencimento : formData.data;
    if (!venc || !/^\d{4}-\d{2}-\d{2}$/.test(venc)) {
      alert('Vencimento válido obrigatório.');
      return;
    }

    const competence = venc.slice(0, 7);

    // Se houver recorrência (despesas fixas)
    if (area === 'fixa' && formData.frequencia !== 'sem_recorrencia') {
      const targetDay = Number(venc.split('-')[2]) || 1;
      const baseRecurrence = {
        id: formData.recorrenciaId || `recorrencia-${Date.now()}`,
        descricao: description,
        categoria: formData.categoria || 'Aluguel',
        valor: value,
        frequencia: formData.frequencia,
        diaVencimento: targetDay,
        fornecedor: formData.fornecedor || '',
        formaPagamento: formData.formaPagamento || 'Pix',
        observacoes: formData.observacoes || '',
        ativo: formData.ativo !== false,
        contaOrigem: formData.contaOrigem || 'empresa',
        criadoEm: formData.criadoEm || new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };

      const recurrences = readStorage(STORAGE_KEYS.recurrences, []);
      let nextRecurrences;
      if (formData.recorrenciaId) {
        nextRecurrences = recurrences.map((r) => r.id === baseRecurrence.id ? baseRecurrence : r);
        
        // Atualizar despesas futuras não pagas vinculadas a esta recorrência
        const transactions = readStorage(STORAGE_KEYS.finances, []);
        const nextTransactions = transactions.map((t) => {
          if (t.recorrenciaId === baseRecurrence.id && t.status !== 'Pago' && t.status !== 'paga') {
            return {
              ...t,
              descricao: baseRecurrence.descricao,
              categoria: baseRecurrence.categoria,
              valor: baseRecurrence.valor,
              formaPagamento: baseRecurrence.formaPagamento,
              fornecedor: baseRecurrence.fornecedor,
              observacoes: baseRecurrence.observacoes,
              contaOrigem: baseRecurrence.contaOrigem,
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
        trabalhoId: formData.projectId || '',
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
    }

    setModalOpen(false);
    loadLocalData();
  };

  const removeExpense = async (expense) => {
    if (expense.statusDerivado === 'paga') {
      alert('Despesas pagas devem ser revertidas ou canceladas antes da exclusão.');
      return;
    }
    const confirmed = window.confirm('Deseja excluir permanentemente este lançamento?');
    if (!confirmed) return;

    const transactions = readStorage(STORAGE_KEYS.finances, []);
    const nextTransactions = transactions.filter((t) => String(t.id) !== String(expense.id));
    writeStorage(STORAGE_KEYS.finances, nextTransactions);

    if (isSupabaseConfigured) {
      try {
        await supabase.from('financas').delete().eq('id', String(expense.id));
      } catch (e) {
        console.error(e);
      }
    }

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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
            Próximos vencimentos: {vencimentos.map((item) => `${item.descricao} (${item.vencimento})`).join(', ')}
          </span>
        </div>
      )}

      <div className="sf-metric-grid">
        <Metric label={area === 'fixa' ? 'Total mensal previsto' : 'Total lançado'} value={area === 'fixa' ? totalMensalFixo : totalAtual} />
        <Metric label={area === 'fixa' ? 'Custo anual previsto' : 'Categorias usadas'} value={area === 'fixa' ? totalMensalFixo * 12 : Object.keys(reports.byCategory).length} isNumber={area !== 'fixa'} />
        <Metric label="Lançamentos" value={despesas.length} isNumber />
      </div>

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
            {despesas.map((expense) => (
              <tr key={expense.id}>
                <td>
                  <strong>{expense.descricao}</strong>
                  <small>
                    <Tag size={12} /> {expense.categoria || 'Geral'}
                    {expense.trabalhoId ? ` | Vinculada ao Trabalho` : ''}
                    {expense.fornecedor ? ` | ${expense.fornecedor}` : ''}
                  </small>
                </td>
                <td>{expense.vencimento || '-'}</td>
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
            {despesas.length === 0 && (
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

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
            <Field label="Data de vencimento">
              <input
                type="date"
                style={inputStyle}
                value={area === 'fixa' ? formData.dataVencimento : formData.data}
                onChange={(event) =>
                  setFormData(
                    area === 'fixa'
                      ? { ...formData, dataVencimento: event.target.value, data: event.target.value }
                      : { ...formData, data: event.target.value, dataVencimento: event.target.value },
                  )
                }
              />
            </Field>
          </div>

          {area === 'fixa' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Frequência / Recorrência">
                <select style={inputStyle} value={formData.frequencia} onChange={(event) => setFormData({ ...formData, frequencia: event.target.value })}>
                  <option value="sem_recorrencia">Sem recorrência</option>
                  <option value="mensal">Mensal</option>
                  <option value="bimestral">Bimestral</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </Field>
              <Field label="Status">
                <select style={inputStyle} value={formData.status} onChange={(event) => setFormData({ ...formData, status: event.target.value })}>
                  <option value="Pago">Pago</option>
                  <option value="Pendente">Pendente</option>
                </select>
              </Field>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Forma de pagamento">
              <select style={inputStyle} value={formData.formaPagamento} onChange={(event) => setFormData({ ...formData, formaPagamento: event.target.value })}>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Trabalho vinculado">
              <select style={inputStyle} value={formData.projectId} onChange={(event) => setFormData({ ...formData, projectId: event.target.value })}>
                <option value="">Selecione...</option>
                {studio.projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.clienteNome} - {project.tipoServico}</option>
                ))}
              </select>
            </Field>
            <Field label="Fornecedor">
              <input style={inputStyle} value={formData.fornecedor} onChange={(event) => setFormData({ ...formData, fornecedor: event.target.value })} />
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
