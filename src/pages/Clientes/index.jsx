import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/Modal';
import { AutoSaveIndicator, useKeyboardShortcuts } from '../../components/PremiumUXKit';
import { formatMoney, parseMoney } from '../../utils/integratedData';
import { capitalizeFirst, capitalizeName, dateToInput, inputToDate, maskCurrency, maskDate, maskInstagram, maskPhone } from '../../utils/masks';
import { isSupabaseConfigured, supabase } from '../../utils/supabase';
import { calculatePaymentsSummary, createFinanceSeed, deleteAgendaEvent, saveRow, upsertAgendaEvent } from '../../utils/dbData';
import { createId, readStorage, STORAGE_KEYS, writeStorage } from '../../utils/storage';

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
  pagamentos: [],
};

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

const readPayments = (project) => {
  const payments = project?.pagamentos || project?.historico_pagamentos || project?.historicoPagamentos || project?.receitas || project?.financeiro?.receitas || [];
  return Array.isArray(payments) ? payments : [];
};

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
  const pagamentos = readPayments(project);
  const total = Number(project?.valorContratado ?? project?.valor_contratado ?? client.valorTotal ?? client.valor_total ?? 0);
  const { valorRecebido: received, valorRestante: remaining } = calculatePaymentsSummary(pagamentos, total);

  return {
    ...client,
    project,
    projectId: project?.id || null,
    nome: client.nome || client.name || '',
    email: client.email || '',
    telefone: client.telefone || client.whatsapp || '',
    instagram: client.instagram || '',
    tipoTrabalho: project?.tipoServico || project?.tipo_servico || project?.servico || client.tipoTrabalho || client.tipo_trabalho || '-',
    dataTrabalho: project?.data || project?.data_trabalho || client.dataTrabalho || client.data_trabalho || '',
    valorTotal: total,
    valorRestante: remaining,
    valorRecebido: received,
    status: project?.status || client.status || 'Ativo',
    pagamentos,
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
  pagamentos: (client.pagamentos || []).map((payment) => ({
    ...payment,
    valor: payment.valor ? maskCurrency(String(Math.round(parseMoney(payment.valor) * 100))) : '',
    data: normalizeDate(payment.data),
    status: payment.status || 'Recebido',
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
    const pagamentos = readPayments(project);
    const valorContratado = Number(project.valorContratado ?? project.valor_contratado ?? 0);
    const { valorRecebido, valorRestante } = calculatePaymentsSummary(pagamentos, valorContratado);

    return {
      id: project.id,
      clientId,
      clienteId: clientId,
      clienteNome: project.clienteNome || project.cliente_nome || client.nome || '',
      cliente: client,
      tipoServico: project.tipoServico || project.tipo_servico || project.servico || project.tipoTrabalho || 'Evento',
      categoria: project.categoria || project.tipoServico || project.tipo_servico || project.servico || 'Evento',
      status: project.status || 'contrato_fechado',
      valorContratado,
      valorRecebido,
      saldoRestante: valorRestante,
      data: project.data || project.data_trabalho || '',
      horario: project.horario || '',
      local: project.local || client.cidade || '',
      financeiro: { receitas: pagamentos },
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
  }));
  const valorTotal = parseMoney(formData.valorTotal);
  const { valorRecebido, valorRestante } = calculatePaymentsSummary(pagamentos, valorTotal);
  const status = valorRestante <= 0 && valorTotal > 0 ? 'Pago' : (formData.status || 'Pendente');
  return { pagamentos, valorTotal, valorRecebido, valorRestante, status };
};

export default function Clientes() {
  const [studio, setStudio] = useState({ clients: [], projects: [] });
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState('saved');

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

  const clients = useMemo(() => studio.clients.map((client) => mapClientRow(client, studio.projects)), [studio.clients, studio.projects]);

  const paymentSummary = useMemo(() => calculatePayments(formData), [formData]);
  const formattedRemaining = maskCurrency(String(Math.round(paymentSummary.valorRestante * 100)));

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
      pagamentos: [...current.pagamentos, { id: `payment-${Date.now()}`, valor: '', data: '', status: 'Recebido' }],
    }));
  };

  const removePayment = (index) => {
    setFormData((current) => ({
      ...current,
      pagamentos: current.pagamentos.filter((_, paymentIndex) => paymentIndex !== index),
    }));
  };

  const openNewClient = () => {
    setFormData(emptyForm);
    setSelectedClientId(null);
    setIsModalOpen(true);
  };

  const openEditClient = (client) => {
    setSelectedClientId(client.id);
    setFormData(formFromClient(client));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData(emptyForm);
  };

  const saveClient = async (event) => {
    event.preventDefault();
    setSyncStatus('saving');

    const now = new Date().toISOString();
    const {
      pagamentos: payments,
      valorTotal,
      valorRecebido: paid,
      valorRestante,
      status,
    } = calculatePayments(formData);

    try {
      const clientPayload = {
        nome: formData.nome,
        email: formData.email,
        telefone: formData.telefone,
        whatsapp: formData.telefone,
        instagram: formData.instagram,
        tipo_trabalho: formData.tipoTrabalho,
        data_trabalho: inputToDate(formData.dataTrabalho),
        valor_total: valorTotal,
        valor_restante: valorRestante,
        historico_pagamentos: payments,
        status,
        updated_at: now,
      };

      let savedClient;
      let savedProject;

      if (isSupabaseConfigured) {
        savedClient = await saveRow({
          table: 'clientes',
          id: formData.id,
          payload: formData.id ? clientPayload : { ...clientPayload, created_at: now },
        });
      } else {
        savedClient = {
          id: formData.id || createId('client'),
          ...clientPayload,
          created_at: formData.id ? undefined : now,
        };
      }

      const projectPayload = {
        cliente_id: savedClient.id,
        cliente_nome: savedClient.nome,
        tipo_servico: formData.tipoTrabalho,
        servico: formData.tipoTrabalho,
        data: inputToDate(formData.dataTrabalho),
        data_trabalho: inputToDate(formData.dataTrabalho),
        valor_contratado: valorTotal,
        valor_total: valorTotal,
        valor_recebido: paid,
        saldo_restante: valorRestante,
        valor_restante: valorRestante,
        status,
        pagamentos: payments,
        historico_pagamentos: payments,
        updated_at: now,
      };

      if (isSupabaseConfigured) {
        savedProject = await saveRow({
          table: 'projetos',
          id: formData.projectId,
          payload: formData.projectId ? projectPayload : { ...projectPayload, created_at: now },
        });
      } else {
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
        <form onSubmit={saveClient} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Valor total">
              <input style={inputStyle} inputMode="numeric" placeholder="R$ 0,00" value={formData.valorTotal} onChange={(event) => updateField('valorTotal', maskCurrency(event.target.value))} />
            </Field>
            <Field label="Valor restante">
              <input style={inputStyle} inputMode="numeric" placeholder="R$ 0,00" value={formattedRemaining} readOnly />
            </Field>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
              <span style={labelStyle}>Historico de pagamentos</span>
              <button type="button" className="sf-secondary-button" onClick={addPayment} style={{ padding: '8px 10px' }}>
                <Plus size={14} /> Adicionar pagamento
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {formData.pagamentos.map((payment, index) => (
                <div key={payment.id || index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                  <input style={inputStyle} inputMode="numeric" placeholder="Valor" value={payment.valor} onChange={(event) => updatePayment(index, 'valor', maskCurrency(event.target.value))} />
                  <input style={inputStyle} inputMode="numeric" placeholder="dd/mm/aaaa" value={payment.data} onChange={(event) => updatePayment(index, 'data', maskDate(event.target.value))} />
                  <input style={inputStyle} placeholder="Status" value={payment.status || ''} onChange={(event) => updatePayment(index, 'status', capitalizeFirst(event.target.value))} />
                  <button type="button" className="sf-secondary-button" onClick={() => removePayment(index)} style={{ padding: '10px' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {formData.pagamentos.length === 0 && <p className="sf-muted" style={{ margin: 0 }}>Nenhum pagamento registrado.</p>}
            </div>
          </div>

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

