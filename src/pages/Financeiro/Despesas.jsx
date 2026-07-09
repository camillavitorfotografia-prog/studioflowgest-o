import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CreditCard,
  Edit2,
  PackagePlus,
  Plus,
  Tag,
  Trash2,
} from 'lucide-react';
import Modal from '../../components/Modal';
import { getDbStudioData, subscribeDbUpdates } from '../../utils/dbData';
import { supabase } from '../../utils/supabase';
import { maskCurrency } from '../../utils/masks';
import {
  FINANCE_STORAGE_KEYS,
  FIXED_EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  VARIABLE_EXPENSE_CATEGORIES,
  createEquipmentFromExpense,
  formatCurrency,
  gerarLancamentosRecorrentes,
  getTransactionDate,
  getTransactionStatus,
  getTransactionValue,
  groupBySum,
  hasEquipmentKeyword,
  monthKey,
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
  frequencia: 'mensal',
  intervaloPersonalizado: 30,
  formaPagamento: 'Pix',
  status: 'Pago',
  observacoes: '',
  fornecedor: '',
  eventoRelacionado: '',
  contaOrigem: 'empresa',
  projectId: '',
  tipo: 'fixa',
  garantiaAte: '',
  vidaUtilAnos: 5,
  valorResidual: '',
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
  const [saldos, setSaldos] = useState(() =>
    JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.balances) || '{"salario": 0, "empresa": 0, "reserva": 0}'),
  );
  const [reposicao, setReposicao] = useState(() =>
    parseFloat(localStorage.getItem(FINANCE_STORAGE_KEYS.replacement) || '0'),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [studio, setStudio] = useState({ projects: [] });
  const [formData, setFormData] = useState({ ...emptyForm, tipo: area, projectId: '' });

  useEffect(() => {
    let active = true;
    const load = async () => {
      const db = await getDbStudioData();
      if (!active) return;
      setStudio(db);
      setTransacoes(db.transactions || []);
      setFormData((current) => ({ ...current, projectId: current.projectId || db.projects?.[0]?.id || '' }));
    };
    setTimeout(() => { void load(); }, 0);
    const unsubscribe = subscribeDbUpdates(load);
    window.addEventListener('focus', load);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('focus', load);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(FINANCE_STORAGE_KEYS.balances, JSON.stringify(saldos));
    localStorage.setItem(FINANCE_STORAGE_KEYS.replacement, reposicao.toString());
  }, [saldos, reposicao]);

  const despesas = useMemo(
    () => transacoes.filter((item) => item.tipoGeral === 'Saida' && item.tipo === area),
    [area, transacoes],
  );

  const vencimentos = useMemo(() => {
    const today = new Date();
    const alertLimit = new Date();
    alertLimit.setDate(today.getDate() + 7);

    return transacoes
      .filter((item) => item.tipoGeral === 'Saida' && item.tipo === 'fixa')
      .filter((item) => {
        const date = new Date(getTransactionDate(item));
        return getTransactionStatus(item) !== 'Pago' && date <= alertLimit;
      })
      .sort((a, b) => new Date(getTransactionDate(a)) - new Date(getTransactionDate(b)))
      .slice(0, 5);
  }, [transacoes]);

  const reports = useMemo(() => {
    const variableExpenses = transacoes.filter((item) => item.tipoGeral === 'Saida' && item.tipo === 'variavel');
    return {
      byCategory: groupBySum(despesas, (item) => item.categoria),
      byMonth: groupBySum(despesas, (item) => monthKey(getTransactionDate(item))),
      byEvent: groupBySum(variableExpenses, (item) => item.eventoRelacionado),
      bySupplier: groupBySum(transacoes.filter((item) => item.tipoGeral === 'Saida'), (item) => item.fornecedor),
    };
  }, [despesas, transacoes]);

  const totalMensalFixo = useMemo(() => {
    const currentMonth = monthKey(new Date());
    return transacoes
      .filter((item) => item.tipoGeral === 'Saida' && item.tipo === 'fixa' && monthKey(getTransactionDate(item)) === currentMonth)
      .reduce((sum, item) => sum + getTransactionValue(item), 0);
  }, [transacoes]);

  const totalAtual = despesas.reduce((sum, item) => sum + getTransactionValue(item), 0);

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({ ...emptyForm, tipo: area, status: area === 'fixa' ? 'Pendente' : 'Pago', projectId: studio.projects[0]?.id || '' });
    setModalOpen(true);
  };

  const openEditModal = (expense) => {
    setEditingId(expense.id);
    setFormData({
      ...emptyForm,
      ...expense,
      nome: expense.nome || expense.descricao || '',
      descricao: expense.descricao || expense.nome || '',
      valor: maskCurrency(String(Math.round(getTransactionValue(expense) * 100))),
      data: expense.data || expense.dataVencimento || '',
      dataVencimento: expense.dataVencimento || expense.data || '',
      valorResidual: expense.valorResidual ? maskCurrency(String(Math.round(Number(expense.valorResidual) * 100))) : '',
    });
    setModalOpen(true);
  };

  const updateBalance = (value, account) => {
    const nextBalances = { ...saldos };
    if (nextBalances[account] < value) {
      const confirmed = window.confirm(
        `O saldo da conta "${account}" e menor que a despesa. Deseja continuar e deixar o saldo negativo?`,
      );
      if (!confirmed) return null;
    }
    nextBalances[account] -= value;
    setSaldos(nextBalances);

    if (account === 'reserva') {
      setReposicao((current) => current + value);
      alert(`Atencao: ${formatCurrency(value)} saiu da Reserva e entrou nas obrigacoes de reposicao.`);
    }

    return nextBalances;
  };

  const maybeCreateEquipment = (expense) => {
    if (expense.tipo !== 'variavel' || !hasEquipmentKeyword(expense)) return;
    const confirmed = window.confirm('Este lancamento e um equipamento permanente?');
    if (!confirmed) return;

    const currentEquipment = JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.equipment) || '[]');
    const newEquipment = createEquipmentFromExpense(expense);
    const updatedEquipment = [...currentEquipment, newEquipment];
    localStorage.setItem(FINANCE_STORAGE_KEYS.equipment, JSON.stringify(updatedEquipment));
    window.dispatchEvent(new Event('storage'));
  };

  const saveExpense = async () => {
    const value = parseCurrency(formData.valor);
    const description = area === 'fixa' ? formData.nome : formData.descricao;
    if (!description || value <= 0) {
      alert('Preencha a descricao e o valor.');
      return;
    }

    if (!formData.projectId) {
      alert('Selecione o projeto deste lancamento.');
      return;
    }

    const baseExpense = {
      ...formData,
      id: editingId || Date.now(),
      tipo: area,
      tipoGeral: 'Saida',
      nome: area === 'fixa' ? formData.nome : formData.descricao,
      descricao: description,
      valor: value,
      valorResidual: parseCurrency(formData.valorResidual),
      data: area === 'fixa' ? formData.dataVencimento || formData.data : formData.data,
      dataVencimento: area === 'fixa' ? formData.dataVencimento || formData.data : formData.data,
      projectId: formData.projectId,
      updatedAt: new Date().toISOString(),
    };

    const shouldChargeNow = !editingId && (area === 'variavel' || baseExpense.status === 'Pago');
    if (shouldChargeNow && updateBalance(value, formData.contaOrigem) === null) return;

    const toDbPayload = (expense) => ({
      id: String(expense.id),
      project_id: expense.projectId,
      descricao: expense.descricao,
      nome: expense.nome,
      categoria: expense.categoria,
      valor: expense.valor,
      data: expense.data,
      data_vencimento: expense.dataVencimento,
      tipo: expense.tipo,
      tipo_geral: expense.tipoGeral,
      status: expense.status,
      forma_pagamento: expense.formaPagamento,
      conta_origem: expense.contaOrigem,
      fornecedor: expense.fornecedor,
      evento_relacionado: expense.eventoRelacionado,
      observacoes: expense.observacoes,
      updated_at: new Date().toISOString(),
    });

    if (editingId) {
      const { error } = await supabase.from('financas').update(toDbPayload(baseExpense)).eq('id', String(editingId));
      if (error) {
        console.error('Erro ao salvar lancamento:', error.message);
        return;
      }
    } else {
      const newEntries = area === 'fixa' ? gerarLancamentosRecorrentes(baseExpense) : [{ ...baseExpense, status: baseExpense.status || 'Pago' }];
      const { error } = await supabase.from('financas').insert(newEntries.map(toDbPayload));
      if (error) {
        console.error('Erro ao criar lancamento:', error.message);
        return;
      }
      maybeCreateEquipment(baseExpense);
    }

    const db = await getDbStudioData();
    setTransacoes(db.transactions || []);
    setModalOpen(false);
    window.dispatchEvent(new Event('sf_storage_update'));
  };

  const removeExpense = async (expense) => {
    const isRecurring = Boolean(expense.recurrenceId);
    const message = isRecurring
      ? 'Deseja cancelar esta recorrencia futura? O historico pago sera preservado.'
      : 'Deseja remover esta despesa? O saldo nao sera devolvido automaticamente.';
    if (!window.confirm(message)) return;

    if (!isRecurring) {
      const { error } = await supabase.from('financas').delete().eq('id', String(expense.id));
      if (error) console.error('Erro ao remover despesa:', error.message);
    } else {
      const future = transacoes.filter((item) => item.recurrenceId === expense.recurrenceId && getTransactionStatus(item) !== 'Pago' && item.id !== expense.id);
      await Promise.all(future.map((item) => supabase.from('financas').delete().eq('id', String(item.id))));
    }
    const db = await getDbStudioData();
    setTransacoes(db.transactions || []);
    window.dispatchEvent(new Event('sf_storage_update'));
  };

  const markAsPaid = async (expense) => {
    const value = getTransactionValue(expense);
    if (updateBalance(value, expense.contaOrigem || 'empresa') === null) return;
    const { error } = await supabase.from('financas').update({ status: 'Pago', data_pagamento: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', String(expense.id));
    if (error) console.error('Erro ao marcar como pago:', error.message);
    const db = await getDbStudioData();
    setTransacoes(db.transactions || []);
    window.dispatchEvent(new Event('sf_storage_update'));
  };

  const categories = area === 'fixa' ? FIXED_EXPENSE_CATEGORIES : VARIABLE_EXPENSE_CATEGORIES;
  const title = area === 'fixa' ? 'Despesas Fixas' : 'Despesas Variaveis';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>{title}</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '6px' }}>
            {area === 'fixa'
              ? 'Controle recorrencias, vencimentos e custo estrutural da empresa.'
              : 'Registre gastos pontuais por evento, categoria, fornecedor e equipamento.'}
          </p>
        </div>
        <button className="sf-primary-button" onClick={openCreateModal}>
          <Plus size={18} /> Novo lancamento
        </button>
      </div>

      {reposicao > 0 && (
        <div className="sf-alert">
          <AlertTriangle size={22} />
          <span>Reposicao de reserva pendente: {formatCurrency(reposicao)}</span>
        </div>
      )}

      {area === 'fixa' && vencimentos.length > 0 && (
        <div className="sf-alert warning">
          <AlertTriangle size={22} />
          <span>
            Proximos vencimentos: {vencimentos.map((item) => `${item.descricao} (${getTransactionDate(item)})`).join(', ')}
          </span>
        </div>
      )}

      <div className="sf-metric-grid">
        <Metric label={area === 'fixa' ? 'Total mensal fixo' : 'Total lancado'} value={area === 'fixa' ? totalMensalFixo : totalAtual} />
        <Metric label={area === 'fixa' ? 'Custo fixo anual' : 'Categorias usadas'} value={area === 'fixa' ? totalMensalFixo * 12 : Object.keys(reports.byCategory).length} isNumber={area !== 'fixa'} />
        <Metric label="Lancamentos" value={despesas.length} isNumber />
      </div>

      <div className="sf-table-card">
        <table className="sf-table">
          <thead>
            <tr>
              <th>Descricao / Categoria</th>
              <th>{area === 'fixa' ? 'Vencimento' : 'Data'}</th>
              <th>Pagamento</th>
              <th>Status</th>
              <th>Valor</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {despesas.map((expense) => (
              <tr key={expense.id}>
                <td>
                  <strong>{expense.descricao}</strong>
                  <small>
                    <Tag size={12} /> {expense.categoria || 'Geral'}
                    {expense.eventoRelacionado ? ` | ${expense.eventoRelacionado}` : ''}
                    {expense.fornecedor ? ` | ${expense.fornecedor}` : ''}
                  </small>
                </td>
                <td>{getTransactionDate(expense) || '-'}</td>
                <td>
                  <span className="sf-pill">
                    <CreditCard size={12} /> {expense.formaPagamento || expense.contaOrigem || '-'}
                  </span>
                </td>
                <td>
                  <span className={`sf-status ${getTransactionStatus(expense).toLowerCase()}`}>
                    {getTransactionStatus(expense)}
                  </span>
                </td>
                <td className="negative">-{formatCurrency(getTransactionValue(expense))}</td>
                <td>
                  <div className="sf-actions">
                    {getTransactionStatus(expense) !== 'Pago' && (
                      <button title="Marcar como pago" onClick={() => markAsPaid(expense)}>
                        <PackagePlus size={17} />
                      </button>
                    )}
                    <button title="Editar" onClick={() => openEditModal(expense)}>
                      <Edit2 size={17} />
                    </button>
                    <button title="Cancelar/remover" onClick={() => removeExpense(expense)}>
                      <Trash2 size={17} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {despesas.length === 0 && (
              <tr>
                <td colSpan="6" className="empty">
                  Nenhuma despesa cadastrada nesta area.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="sf-report-grid">
        <Report title="Total por categoria" data={reports.byCategory} />
        <Report title="Total por mes" data={reports.byMonth} />
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
            <Field label={area === 'fixa' ? 'Nome' : 'Descricao'}>
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
            <Field label={area === 'fixa' ? 'Data de vencimento' : 'Data'}>
              <input
                type="date"
                style={inputStyle}
                value={area === 'fixa' ? formData.dataVencimento : formData.data}
                onChange={(event) =>
                  setFormData(
                    area === 'fixa'
                      ? { ...formData, dataVencimento: event.target.value, data: event.target.value }
                      : { ...formData, data: event.target.value },
                  )
                }
              />
            </Field>
          </div>

          {area === 'fixa' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Frequencia">
                <select style={inputStyle} value={formData.frequencia} onChange={(event) => setFormData({ ...formData, frequencia: event.target.value })}>
                  <option value="mensal">Mensal</option>
                  <option value="anual">Anual</option>
                  <option value="semanal">Semanal</option>
                  <option value="personalizada">Personalizada</option>
                </select>
              </Field>
              <Field label="Status">
                <select style={inputStyle} value={formData.status} onChange={(event) => setFormData({ ...formData, status: event.target.value })}>
                  <option value="Pago">Pago</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Atrasado">Atrasado</option>
                </select>
              </Field>
            </div>
          )}

          {formData.frequencia === 'personalizada' && area === 'fixa' && (
            <Field label="Intervalo personalizado em dias">
              <input
                type="number"
                min="1"
                style={inputStyle}
                value={formData.intervaloPersonalizado}
                onChange={(event) => setFormData({ ...formData, intervaloPersonalizado: event.target.value })}
              />
            </Field>
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
            <Field label="Projeto vinculado">
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

          {area === 'variavel' && (
            <>
              <Field label="Evento relacionado (opcional)">
                <input style={inputStyle} value={formData.eventoRelacionado} onChange={(event) => setFormData({ ...formData, eventoRelacionado: event.target.value })} />
              </Field>
              {hasEquipmentKeyword(formData) && (
                <div className="sf-inline-note">
                  Parece uma compra de equipamento. Ao salvar, o sistema perguntara se deseja criar o item permanente.
                </div>
              )}
            </>
          )}

          <Field label="Observacoes">
            <textarea
              style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
              value={formData.observacoes}
              onChange={(event) => setFormData({ ...formData, observacoes: event.target.value })}
            />
          </Field>

          <button className="sf-primary-button wide" onClick={saveExpense}>
            Salvar lancamento
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



