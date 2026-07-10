import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/Modal';
import { AutoSaveIndicator, useKeyboardShortcuts } from '../../components/PremiumUXKit';
import { formatMoney, parseMoney } from '../../utils/integratedData';
import { capitalizeFirst, capitalizeName, dateToInput, inputToDate, maskCurrency, maskDate, maskInstagram, maskPhone } from '../../utils/masks';
import { isSupabaseConfigured, supabase } from '../../utils/supabase';
import { calculatePaymentsSummary, createFinanceSeed, deleteAgendaEvent, readPayments as readProjectPayments, saveRow, upsertAgendaEvent } from '../../utils/dbData';
import { createId, readStorage, STORAGE_KEYS, writeStorage } from '../../utils/storage';
import {
  calculateClientSalarySummary,
  DEFAULT_SALARY_SPLIT,
  isSalarySplitValid,
  loadDistributionConfig,
  normalizeSalarySplit,
  PAYMENT_METHODS,
  preparePaymentsWithDistribution,
  syncProjectDistributionLedger,
} from '../../utils/financeEngine';
import './Clientes.css';

const emptyForm = {
  id: null,
  projectId: null,
  nome: '',
  email: '',
  telefone: '',
  instagram: '',
  tipoTrabalho: '',
  dataTrabalho: '',
  valorTotal: '',
  valorRestante: '',
  status: 'Ativo',
  contrato: '',
  pagamentos: [],
  divisaoSalarios: { ...DEFAULT_SALARY_SPLIT },
  retiradasSalariais: [],
};

const emptyWithdrawal = { pessoa: 'camilla', valor: '', data: '', observacao: '' };

const inputStyle = {
  width: '100%',
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid #333',
  background: '#111',
  color: '#fff',
};

const labelStyle = {
  color: '#888',
  fontSize: '0.78rem',
  marginBottom: '6px',
  display: 'block',
  fontWeight: 600,
};

const normalizeDate = (value) => dateToInput(value || '');
const displayDate = (value) => normalizeDate(value) || '-';

const getClientProject = (client, projects) => {
  return projects.find((project) =>
    project.clientId === client.id ||
    project.clienteId === client.id ||
    project.cliente_id === client.id ||
    project.client_id === client.id ||
    project.legacyClientId === client.id
  ) || null;
};

const mapClientRow = (client, projects) => {
  const project = getClientProject(client, projects);
  const pagamentos = readProjectPayments({
    ...(project || {}),
    historico_pagamentos: [
      ...(Array.isArray(project?.historico_pagamentos) ? project.historico_pagamentos : []),
      ...(Array.isArray(client.historico_pagamentos) ? client.historico_pagamentos : []),
    ],
  });
  const total = Number(project?.valorContratado ?? project?.valor_contratado ?? client.valorTotal ?? client.valor_total ?? 0);
  const { valorRecebido: received, valorRestante: remaining } = calculatePaymentsSummary(pagamentos, total);
  const divisaoSalarios = normalizeSalarySplit(project?.financeiro?.divisaoSalarios || DEFAULT_SALARY_SPLIT);
  const retiradasSalariais = project?.financeiro?.retiradasSalariais || [];
  const resumoSalarios = calculateClientSalarySummary(pagamentos, retiradasSalariais);

  return {
    ...client,
    project,
    projectId: project?.id || null,
    nome: client.nome || client.name || '',
    email: client.email || '',
    telefone: client.telefone || client.whatsapp || '',
    instagram: client.instagram || '',
    tipoTrabalho: project?.tipoServico || project?.tipo_servico || project?.servico || client.tipoTrabalho || client.tipo_trabalho || '-',
    dataTrabalho: project?.data || project?.data_trabalho || client.dataTrabalho || client.data_trabalho || client.data_evento || '',
    valorTotal: total,
    valorRestante: remaining,
    valorRecebido: received,
    status: project?.financeiro?.statusFinanceiro || project?.financeiro?.status_financeiro || project?.status || client.status || 'Ativo',
    contrato: project?.contrato?.status || project?.contrato?.numero || (typeof project?.contrato === 'string' ? project.contrato : ''),
    pagamentos,
    divisaoSalarios,
    retiradasSalariais,
    resumoSalarios,
  };
};

const formFromClient = (client) => ({
  id: client.id,
  projectId: client.projectId,
  nome: client.nome || '',
  email: client.email || '',
  telefone: client.telefone || '',
  instagram: client.instagram || '',
  tipoTrabalho: client.tipoTrabalho === '-' ? '' : client.tipoTrabalho || '',
  dataTrabalho: normalizeDate(client.dataTrabalho),
  valorTotal: client.valorTotal ? maskCurrency(String(Math.round(Number(client.valorTotal) * 100))) : '',
  valorRestante: client.valorRestante ? maskCurrency(String(Math.round(Number(client.valorRestante) * 100))) : '',
  status: client.status || 'Ativo',
  contrato: client.contrato || '',
  pagamentos: (client.pagamentos || []).map((payment) => ({
    ...payment,
    id: payment.id || createId('payment'),
    valor: payment.valor ? maskCurrency(String(Math.round(parseMoney(payment.valor) * 100))) : '',
    data: normalizeDate(payment.data),
    status: payment.status || 'Recebido',
    formaPagamento: payment.formaPagamento || payment.forma_pagamento || 'Pix',
    observacao: payment.observacao || payment.observacoes || '',
  })),
  divisaoSalarios: normalizeSalarySplit(client.divisaoSalarios || DEFAULT_SALARY_SPLIT),
  retiradasSalariais: (client.retiradasSalariais || []).map((withdrawal) => ({
    ...withdrawal,
    id: withdrawal.id || createId('salary-withdrawal'),
    valor: withdrawal.valor ? maskCurrency(String(Math.round(parseMoney(withdrawal.valor) * 100))) : '',
    data: normalizeDate(withdrawal.data),
  })),
});

const saveLocalMirrors = (clients, projects) => {
  const normalizedClients = clients.map((client) => ({
    id: client.id,
    nome: client.nome || '',
    email: client.email || '',
    telefone: client.telefone || client.whatsapp || '',
    whatsapp: client.whatsapp || client.telefone || '',
    instagram: client.instagram || '',
    cidade: client.cidade || '',
    clienteDesde: client.created_at || client.clienteDesde || new Date().toISOString(),
    status: client.status || 'ativo',
    createdAt: client.created_at || client.createdAt || new Date().toISOString(),
    updatedAt: client.updated_at || new Date().toISOString(),
  }));

  const normalizedProjects = projects.map((project) => {
    const clientId = project.clientId || project.clienteId || project.cliente_id || project.client_id;
    const client = normalizedClients.find((item) => item.id === clientId) || {};
    const pagamentos = readProjectPayments(project);
    const valorContratado = Number(project.valorContratado ?? project.valor_contratado ?? 0);
    const { valorRecebido, valorRestante } = calculatePaymentsSummary(pagamentos, valorContratado);

    const currentFinance = project.financeiro && typeof project.financeiro === 'object' ? project.financeiro : {};

    return {
      id: project.id,
      clientId,
      clienteId: clientId,
      clienteNome: project.clienteNome || project.cliente_nome || client.nome || '',
      cliente: client,
      tipoServico: project.tipoServico || project.tipo_servico || project.servico || project.tipoTrabalho || 'Evento',
      categoria: project.categoria || project.tipoServico || project.tipo_servico || project.servico || 'Evento',
      status: currentFinance.statusFinanceiro || project.status || 'Ativo',
      valorContratado,
      valorRecebido,
      saldoRestante: valorRestante,
      data: project.data || project.data_trabalho || '',
      horario: project.horario || '',
      local: project.local || client.cidade || '',
      contrato: project.contrato || {},
      financeiro: {
        ...currentFinance,
        receitas: pagamentos,
        valorContratado,
        valorRecebido,
        saldoRestante: valorRestante,
        statusFinanceiro: currentFinance.statusFinanceiro || project.status || 'Ativo',
        divisaoSalarios: normalizeSalarySplit(currentFinance.divisaoSalarios || DEFAULT_SALARY_SPLIT),
        retiradasSalariais: currentFinance.retiradasSalariais || [],
      },
      receitas: pagamentos,
      pagamentos,
      historicoPagamentos: pagamentos,
      timeline: project.timeline || [],
      createdAt: project.created_at || project.createdAt || new Date().toISOString(),
      updatedAt: project.updated_at || new Date().toISOString(),
    };
  });

  localStorage.setItem('cv_studio_clients', JSON.stringify(normalizedClients));
  localStorage.setItem('cv_studio_projects', JSON.stringify(normalizedProjects));
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new Event('sf_storage_update'));
};

const loadLocalStudio = () => ({
  clients: readStorage(STORAGE_KEYS.clients, []),
  projects: readStorage(STORAGE_KEYS.projects, []),
});

const saveLocalStudio = (clients, projects) => {
  saveLocalMirrors(clients, projects);
  writeStorage(STORAGE_KEYS.clients, clients);
  writeStorage(STORAGE_KEYS.projects, projects);
};


const calculatePayments = (formData) => {
  const pagamentos = (formData.pagamentos || []).map((payment) => ({
    ...payment,
    valor: parseMoney(payment.valor),
    data: inputToDate(payment.data),
    status: payment.status || 'Recebido',
    formaPagamento: payment.formaPagamento || payment.forma_pagamento || 'Pix',
    observacao: payment.observacao || payment.observacoes || '',
  }));
  const valorTotal = parseMoney(formData.valorTotal);
  const { valorRecebido, valorRestante } = calculatePaymentsSummary(pagamentos, valorTotal);
  const status = valorRestante <= 0 && valorTotal > 0
    ? 'Quitado'
    : (formData.status === 'Quitado' ? 'Pendente' : (formData.status || 'Pendente'));
  return { pagamentos, valorTotal, valorRecebido, valorRestante, status };
};

export default function Clientes() {
  const [studio, setStudio] = useState({ clients: [], projects: [] });
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState('saved');
  const [financeConfig, setFinanceConfig] = useState({ salario: 35, empresa: 45, reserva: 20 });
  const [withdrawalDraft, setWithdrawalDraft] = useState(emptyWithdrawal);

  const load = async () => {
    setSyncStatus('saving');
    try {
      if (!isSupabaseConfigured) {
        const localStudio = loadLocalStudio();
        setStudio(localStudio);
        saveLocalMirrors(localStudio.clients, localStudio.projects);
        return;
      }

      const [clientsRes, projectsRes] = await Promise.all([
        supabase.from('clientes').select('*').order('created_at', { ascending: false }),
        supabase.from('projetos').select('*'),
      ]);

      if (clientsRes.error) throw clientsRes.error;
      if (projectsRes.error) throw projectsRes.error;

      const nextStudio = {
        clients: clientsRes.data || [],
        projects: projectsRes.data || [],
      };

      setStudio(nextStudio);
      saveLocalMirrors(nextStudio.clients, nextStudio.projects);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error.message);
      const localStudio = loadLocalStudio();
      setStudio(localStudio);
    } finally {
      setSyncStatus('saved');
    }
  };

  useEffect(() => {
    setTimeout(() => { void load(); }, 0);

    window.addEventListener('focus', load);

    const channel = supabase
      .channel('clientes-projetos-db')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projetos' }, load)
      .subscribe();

    return () => {
      window.removeEventListener('focus', load);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    loadDistributionConfig().then(setFinanceConfig).catch((error) => {
      console.error('Erro ao carregar configuracao de distribuicao:', error.message);
    });
  }, []);

  const clients = useMemo(() => studio.clients.map((client) => mapClientRow(client, studio.projects)), [studio.clients, studio.projects]);

  const paymentSummary = useMemo(() => calculatePayments(formData), [formData]);
  const formattedRemaining = maskCurrency(String(Math.round(paymentSummary.valorRestante * 100)));
  const salaryPreviewPayments = useMemo(() => preparePaymentsWithDistribution(
    paymentSummary.pagamentos,
    financeConfig,
    { salarySplit: formData.divisaoSalarios },
  ), [financeConfig, formData.divisaoSalarios, paymentSummary.pagamentos]);
  const salarySummary = useMemo(() => calculateClientSalarySummary(
    salaryPreviewPayments,
    formData.retiradasSalariais,
  ), [formData.retiradasSalariais, salaryPreviewPayments]);

  useKeyboardShortcuts({
    n: () => openNewClient(),
    escape: () => closeModal(),
  });

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const updatePayment = (index, field, value) => {
    setFormData((current) => ({
      ...current,
      pagamentos: current.pagamentos.map((payment, paymentIndex) => (
        paymentIndex === index ? { ...payment, [field]: value } : payment
      )),
    }));
  };

  const addPayment = () => {
    setFormData((current) => ({
      ...current,
      pagamentos: [...current.pagamentos, { id: createId('payment'), valor: '', data: '', status: 'Recebido', formaPagamento: 'Pix', observacao: '' }],
    }));
  };

  const removePayment = (index) => {
    setFormData((current) => ({
      ...current,
      pagamentos: current.pagamentos.filter((_, paymentIndex) => paymentIndex !== index),
    }));
  };

  const addWithdrawal = () => {
    const value = parseMoney(withdrawalDraft.valor);
    const available = salarySummary[withdrawalDraft.pessoa]?.disponivel || 0;
    if (!withdrawalDraft.data || value <= 0) {
      alert('Informe a data e o valor da retirada.');
      return;
    }
    if (value > available) {
      alert('A retirada nao pode ser maior que o salario disponivel.');
      return;
    }
    setFormData((current) => ({
      ...current,
      retiradasSalariais: [...current.retiradasSalariais, {
        id: createId('salary-withdrawal'),
        pessoa: withdrawalDraft.pessoa,
        valor: withdrawalDraft.valor,
        data: withdrawalDraft.data,
        observacao: withdrawalDraft.observacao,
        status: 'Confirmada',
      }],
    }));
    setWithdrawalDraft(emptyWithdrawal);
  };

  const removeWithdrawal = (id) => {
    setFormData((current) => ({
      ...current,
      retiradasSalariais: current.retiradasSalariais.filter((withdrawal) => withdrawal.id !== id),
    }));
  };

  const openNewClient = () => {
    setFormData(emptyForm);
    setSelectedClientId(null);
    setIsModalOpen(true);
    setWithdrawalDraft(emptyWithdrawal);
  };

  const openEditClient = (client) => {
    setSelectedClientId(client.id);
    setFormData(formFromClient(client));
    setIsModalOpen(true);
    setWithdrawalDraft(emptyWithdrawal);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData(emptyForm);
    setWithdrawalDraft(emptyWithdrawal);
  };

  const saveClient = async (event) => {
    event.preventDefault();
    setSyncStatus('saving');

    const now = new Date().toISOString();
    const {
      pagamentos: draftPayments,
      valorTotal,
    } = calculatePayments(formData);

    if (!isSalarySplitValid(formData.divisaoSalarios)) {
      alert('A divisao entre Camilla e Junior deve somar exatamente 100%.');
      setSyncStatus('saved');
      return;
    }

    try {
      const existingClient = studio.clients.find((client) => client.id === formData.id) || {};
      const existingProject = studio.projects.find((project) => project.id === formData.projectId) || {};
      const currentFinance = existingProject.financeiro && typeof existingProject.financeiro === 'object'
        ? existingProject.financeiro
        : {};
      const preserveText = (value, fallback = '') => String(value || '').trim() ? value : fallback;
      const eventDate = inputToDate(formData.dataTrabalho) || existingProject.data || null;
      const persistedTotal = String(formData.valorTotal || '').trim()
        ? valorTotal
        : Number(existingProject.valor_contratado || 0);
      const clientBasePayload = {
        nome: preserveText(formData.nome, existingClient.nome),
        email: preserveText(formData.email, existingClient.email),
        telefone: preserveText(formData.telefone, existingClient.telefone || existingClient.whatsapp),
        whatsapp: preserveText(formData.telefone, existingClient.whatsapp || existingClient.telefone),
        instagram: preserveText(formData.instagram, existingClient.instagram),
        cliente_desde: existingClient.cliente_desde || existingClient.clienteDesde || now,
      };

      let savedClient;
      let savedProject;

      if (isSupabaseConfigured) {
        savedClient = await saveRow({
          table: 'clientes',
          id: formData.id,
          payload: formData.id ? clientBasePayload : { ...clientBasePayload, created_at: now },
        });
      } else {
        savedClient = {
          id: formData.id || createId('client'),
          ...clientBasePayload,
          created_at: formData.id ? undefined : now,
        };
      }

      const distributionConfig = await loadDistributionConfig();
      const normalizedPayments = draftPayments.map((payment) => ({
        ...payment,
        id: payment.id || createId('payment'),
        client_id: savedClient.id,
        valor: Number(payment.valor || 0),
        data: payment.data || null,
        status: payment.status || 'Recebido',
        formaPagamento: payment.formaPagamento || payment.forma_pagamento || 'Pix',
        observacao: payment.observacao || payment.observacoes || '',
        created_at: payment.created_at || now,
      }));
      const payments = preparePaymentsWithDistribution(normalizedPayments, distributionConfig, {
        projectId: formData.projectId || '',
        clientId: savedClient.id,
        clientName: clientBasePayload.nome,
        salarySplit: formData.divisaoSalarios,
      });
      const salaryWithdrawals = (formData.retiradasSalariais || []).map((withdrawal) => ({
        ...withdrawal,
        id: withdrawal.id || createId('salary-withdrawal'),
        valor: parseMoney(withdrawal.valor),
        data: inputToDate(withdrawal.data),
        status: withdrawal.status || 'Confirmada',
        observacao: withdrawal.observacao || '',
      }));
      const { valorRecebido: paid, valorRestante } = calculatePaymentsSummary(payments, persistedTotal);
      const status = valorRestante <= 0 && persistedTotal > 0
        ? 'Quitado'
        : (formData.status === 'Quitado' ? 'Pendente' : (formData.status || 'Pendente'));

      const projectPayload = {
        cliente_id: savedClient.id,
        tipo_servico: preserveText(formData.tipoTrabalho, existingProject.tipo_servico || 'Evento'),
        data: eventDate,
        valor_contratado: persistedTotal,
        valor_recebido: paid,
        contrato: {
          ...(existingProject.contrato && typeof existingProject.contrato === 'object' ? existingProject.contrato : {}),
          status: formData.contrato || 'Nao informado',
        },
        financeiro: {
          ...currentFinance,
          receitas: payments,
          valorContratado: persistedTotal,
          valorRecebido: paid,
          saldoRestante: valorRestante,
          statusFinanceiro: status,
          divisaoSalarios: normalizeSalarySplit(formData.divisaoSalarios),
          retiradasSalariais: salaryWithdrawals,
          updatedAt: now,
        },
      };

      if (isSupabaseConfigured) {
        savedProject = await saveRow({
          table: 'projetos',
          id: formData.projectId,
          payload: formData.projectId ? projectPayload : { ...projectPayload, created_at: now },
        });
      } else {
        savedClient = {
          ...savedClient,
          tipo_trabalho: projectPayload.tipo_servico,
          data_trabalho: eventDate,
          valor_total: persistedTotal,
          valor_restante: valorRestante,
          historico_pagamentos: payments,
          status,
        };
        savedProject = {
          id: formData.projectId || createId('project'),
          ...projectPayload,
          created_at: formData.projectId ? undefined : now,
        };

        const localStudio = loadLocalStudio();
        const nextClients = formData.id
          ? localStudio.clients.map((client) => (client.id === formData.id ? { ...client, ...savedClient } : client))
          : [{ ...savedClient, created_at: now }, ...localStudio.clients];
        const nextProjects = formData.projectId
          ? localStudio.projects.map((project) => (project.id === formData.projectId ? { ...project, ...savedProject } : project))
          : [{ ...savedProject, created_at: now }, ...localStudio.projects];
        saveLocalStudio(nextClients, nextProjects);
      }

      if (savedProject && isSupabaseConfigured) {
        await createFinanceSeed(savedProject, savedClient);
        await syncProjectDistributionLedger({
          payments,
          projectId: savedProject.id,
          clientId: savedClient.id,
          clientName: savedClient.nome || clientBasePayload.nome,
        });
        await upsertAgendaEvent(savedProject, savedClient);
      }

      setSelectedClientId(savedClient.id);
      closeModal();
      await load();
    } catch (error) {
      console.error('Erro ao salvar cliente:', error.message);
    } finally {
      setSyncStatus('saved');
    }
  };

  const deleteClient = async () => {
    if (!formData.id) return;
    setSyncStatus('saving');

    try {
      if (!isSupabaseConfigured) {
        const localStudio = loadLocalStudio();
        const nextProjects = formData.projectId
          ? localStudio.projects.filter((project) => project.id !== formData.projectId)
          : localStudio.projects;
        const nextClients = localStudio.clients.filter((client) => client.id !== formData.id);
        saveLocalStudio(nextClients, nextProjects);
        setSelectedClientId(null);
        closeModal();
        await load();
        return;
      }

      if (formData.projectId) {
        await deleteAgendaEvent(formData.projectId);
        const { error: projectError } = await supabase.from('projetos').delete().eq('id', formData.projectId);
        if (projectError) throw projectError;
      }

      const { error: clientError } = await supabase.from('clientes').delete().eq('id', formData.id);
      if (clientError) throw clientError;

      setSelectedClientId(null);
      closeModal();
      await load();
    } catch (error) {
      console.error('Erro ao excluir cliente:', error.message);
    } finally {
      setSyncStatus('saved');
    }
  };

  return (
    <div className="sf-finance-section">
      <div className="sf-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
            Clientes <AutoSaveIndicator state={syncStatus} />
          </h1>
          <p>Dados pessoais centralizados e historico completo derivado dos projetos.</p>
        </div>
        <button className="sf-primary-button" onClick={openNewClient}>
          <Plus size={16} /> Novo Cliente
        </button>
      </div>

      <div className="sf-table-card">
        <table className="sf-table">
          <thead>
            <tr>
              <th>Nome do cliente</th>
              <th>Telefone</th>
              <th>Tipo de trabalho</th>
              <th>Data do trabalho</th>
              <th>Valor total</th>
              <th>Valor restante</th>
              <th>Status</th>
              <th>Editar</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr
                key={client.id}
                onClick={() => setSelectedClientId(client.id)}
                style={{ cursor: 'pointer', backgroundColor: selectedClientId === client.id ? '#111111' : 'transparent' }}
              >
                <td><strong>{client.nome || '-'}</strong></td>
                <td>{client.telefone || '-'}</td>
                <td>{client.tipoTrabalho || '-'}</td>
                <td>{displayDate(client.dataTrabalho)}</td>
                <td className="positive"><strong>{formatMoney(client.valorTotal)}</strong></td>
                <td>{formatMoney(client.valorRestante)}</td>
                <td>{client.status || '-'}</td>
                <td>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEditClient(client);
                    }}
                    className="sf-secondary-button"
                    style={{ padding: '8px 10px' }}
                  >
                    <Pencil size={14} /> Editar
                  </button>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan="8" className="empty">Nenhum cliente integrado ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={formData.id ? 'Editar Cliente' : 'Novo Cliente'}>
        <form className="sf-client-form" onSubmit={saveClient} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Field label="Nome">
            <input required style={inputStyle} value={formData.nome} onChange={(event) => updateField('nome', capitalizeName(event.target.value))} />
          </Field>

          <Field label="E-mail">
            <input type="email" autoComplete="email" style={inputStyle} value={formData.email} onChange={(event) => updateField('email', event.target.value)} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Telefone">
              <input style={inputStyle} placeholder="(00) 9 0000-0000" value={formData.telefone} onChange={(event) => updateField('telefone', maskPhone(event.target.value))} />
            </Field>
            <Field label="Instagram">
              <input style={inputStyle} placeholder="@cliente" value={formData.instagram} onChange={(event) => updateField('instagram', maskInstagram(event.target.value))} />
            </Field>
          </div>

          <Field label="Tipo de trabalho">
            <input style={inputStyle} value={formData.tipoTrabalho} onChange={(event) => updateField('tipoTrabalho', capitalizeFirst(event.target.value))} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Data">
              <input style={inputStyle} inputMode="numeric" placeholder="dd/mm/aaaa" value={formData.dataTrabalho} onChange={(event) => updateField('dataTrabalho', maskDate(event.target.value))} />
            </Field>
            <Field label="Status">
              <input style={inputStyle} value={formData.status} onChange={(event) => updateField('status', capitalizeFirst(event.target.value))} />
            </Field>
          </div>

          <section className="sf-client-finance-center">
            <div className="sf-client-finance-title">
              <div>
                <h3>Centro Financeiro</h3>
                <p>Contrato, recebimentos, distribuicao e retiradas deste cliente.</p>
              </div>
            </div>

            <div className="sf-client-finance-grid">
              <Field label="Contrato">
                <input style={inputStyle} placeholder="Ex.: Assinado" value={formData.contrato} onChange={(event) => updateField('contrato', capitalizeFirst(event.target.value))} />
              </Field>
              <Field label="Valor contratado">
                <input style={inputStyle} inputMode="numeric" placeholder="R$ 0,00" value={formData.valorTotal} onChange={(event) => updateField('valorTotal', maskCurrency(event.target.value))} />
              </Field>
              <Field label="Total recebido">
                <input style={inputStyle} value={maskCurrency(String(Math.round(paymentSummary.valorRecebido * 100)))} readOnly />
              </Field>
              <Field label="Saldo restante">
                <input style={inputStyle} inputMode="numeric" placeholder="R$ 0,00" value={formattedRemaining} readOnly />
              </Field>
              <Field label="Status financeiro">
                <input style={inputStyle} value={paymentSummary.status} readOnly />
              </Field>
            </div>
          </section>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
              <span style={labelStyle}>Historico de pagamentos</span>
              <button type="button" className="sf-secondary-button" onClick={addPayment} style={{ padding: '8px 10px' }}>
                <Plus size={14} /> Adicionar pagamento
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {formData.pagamentos.map((payment, index) => {
                const distribution = salaryPreviewPayments[index]?.distribuicao;
                return (
                <div key={payment.id || index} className="sf-client-payment">
                  <div className="sf-client-payment-fields">
                    <input style={inputStyle} inputMode="numeric" placeholder="Valor" value={payment.valor} onChange={(event) => updatePayment(index, 'valor', maskCurrency(event.target.value))} />
                    <input style={inputStyle} inputMode="numeric" placeholder="dd/mm/aaaa" value={payment.data} onChange={(event) => updatePayment(index, 'data', maskDate(event.target.value))} />
                    <select style={inputStyle} value={payment.formaPagamento || 'Pix'} onChange={(event) => updatePayment(index, 'formaPagamento', event.target.value)}>
                      {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                    </select>
                    <select style={inputStyle} value={payment.status || 'Recebido'} onChange={(event) => updatePayment(index, 'status', event.target.value)}>
                      <option value="Recebido">Recebido</option>
                      <option value="Pendente">Pendente</option>
                      <option value="Estornado">Estornado</option>
                      <option value="Cancelado">Cancelado</option>
                    </select>
                    <input style={inputStyle} placeholder="Observacao" value={payment.observacao || ''} onChange={(event) => updatePayment(index, 'observacao', event.target.value)} />
                    <button type="button" className="sf-secondary-button" onClick={() => removePayment(index)} style={{ padding: '10px' }} title="Remover pagamento">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {distribution?.aplicada && (
                    <div className="sf-client-distribution">
                      <span>Fundo <strong>{formatMoney(distribution.valores.reserva)}</strong></span>
                      <span>Empresa <strong>{formatMoney(distribution.valores.empresa)}</strong></span>
                      <span>Salarios <strong>{formatMoney(distribution.valores.salario)}</strong></span>
                    </div>
                  )}
                </div>
              );})}
              {formData.pagamentos.length === 0 && <p className="sf-muted" style={{ margin: 0 }}>Nenhum pagamento registrado.</p>}
            </div>
          </div>

          <section className="sf-client-salary-center">
            <div className="sf-client-finance-title">
              <div>
                <h3>Divisao de Salarios</h3>
                <p>Percentuais aplicados somente sobre a parcela destinada a salarios.</p>
              </div>
              <strong className={isSalarySplitValid(formData.divisaoSalarios) ? 'valid' : 'invalid'}>
                {Number(formData.divisaoSalarios.camilla || 0) + Number(formData.divisaoSalarios.junior || 0)}%
              </strong>
            </div>

            <div className="sf-client-salary-config">
              <Field label="Camilla (%)">
                <input type="number" min="0" max="100" style={inputStyle} value={formData.divisaoSalarios.camilla} onChange={(event) => updateField('divisaoSalarios', { ...formData.divisaoSalarios, camilla: Number(event.target.value) })} />
              </Field>
              <Field label="Junior (%)">
                <input type="number" min="0" max="100" style={inputStyle} value={formData.divisaoSalarios.junior} onChange={(event) => updateField('divisaoSalarios', { ...formData.divisaoSalarios, junior: Number(event.target.value) })} />
              </Field>
            </div>

            <div className="sf-client-salary-cards">
              {['camilla', 'junior'].map((person) => (
                <div key={person}>
                  <h4>{person === 'camilla' ? 'Camilla' : 'Junior'}</h4>
                  <span>Acumulado <strong>{formatMoney(salarySummary[person].acumulado)}</strong></span>
                  <span>Retirado <strong>{formatMoney(salarySummary[person].retirado)}</strong></span>
                  <span>Disponivel <strong>{formatMoney(salarySummary[person].disponivel)}</strong></span>
                </div>
              ))}
            </div>

            <div className="sf-client-withdrawal-form">
              <select style={inputStyle} value={withdrawalDraft.pessoa} onChange={(event) => setWithdrawalDraft((current) => ({ ...current, pessoa: event.target.value }))}>
                <option value="camilla">Camilla</option>
                <option value="junior">Junior</option>
              </select>
              <input style={inputStyle} value={withdrawalDraft.valor} placeholder="Valor da retirada" onChange={(event) => setWithdrawalDraft((current) => ({ ...current, valor: maskCurrency(event.target.value) }))} />
              <input style={inputStyle} value={withdrawalDraft.data} placeholder="dd/mm/aaaa" onChange={(event) => setWithdrawalDraft((current) => ({ ...current, data: maskDate(event.target.value) }))} />
              <input style={inputStyle} value={withdrawalDraft.observacao} placeholder="Observacao" onChange={(event) => setWithdrawalDraft((current) => ({ ...current, observacao: event.target.value }))} />
              <button type="button" className="sf-secondary-button" onClick={addWithdrawal}><Plus size={14} /> Registrar retirada</button>
            </div>

            <div className="sf-client-withdrawal-list">
              {formData.retiradasSalariais.map((withdrawal) => (
                <div key={withdrawal.id}>
                  <span>{withdrawal.pessoa === 'camilla' ? 'Camilla' : 'Junior'} · {displayDate(withdrawal.data)} · {withdrawal.observacao || 'Sem observacao'}</span>
                  <strong>{formatMoney(parseMoney(withdrawal.valor))}</strong>
                  <button type="button" onClick={() => removeWithdrawal(withdrawal.id)} title="Remover retirada"><Trash2 size={14} /></button>
                </div>
              ))}
              {formData.retiradasSalariais.length === 0 && <p className="sf-muted">Nenhuma retirada registrada.</p>}
            </div>
          </section>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
            {formData.id ? (
              <button type="button" onClick={deleteClient} className="sf-secondary-button">
                <Trash2 size={16} /> Excluir
              </button>
            ) : <span />}
            <button type="submit" className="sf-primary-button">
              {formData.id ? 'Editar' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

