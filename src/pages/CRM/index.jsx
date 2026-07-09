import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Plus, UserRoundCheck, Loader2 } from 'lucide-react';
import CRMStats from './CRMStats';
import KanbanBoard from './KanbanBoard';
import Modal from '../../components/Modal';
import LeadForm from './LeadForm';
import { getStatusTitle } from '../../data/crm';
import { formatCurrency, parseCurrency } from '../../utils/formatters';
import { approveLeadToProject } from '../../utils/integratedData';
import { writeStorage, STORAGE_KEYS } from '../../utils/storage';
import { supabase } from '../../utils/supabase';
import { useKeyboardShortcuts, AutoSaveIndicator } from '../../components/PremiumUXKit';

const mapLeadFromDb = (lead) => ({
  id: lead.id,
  nome: lead.nome || '',
  email: lead.email || '',
  nomeCasal: lead.nome_casal || lead.nomeCasal || '',
  tipoServico: lead.tipo_servico || lead.tipoServico || 'Casamento',
  status: lead.status || 'novo_lead',
  valorOrcamento: lead.valor_orcamento !== null && lead.valor_orcamento !== undefined ? String(lead.valor_orcamento) : (lead.valorOrcamento || '0'),
  dataEvento: lead.data_evento || lead.dataEvento || '',
  dataOrcamento: lead.data_orcamento || lead.dataOrcamento || '',
  origem: lead.origem || 'Instagram',
  telefone: lead.telefone || '',
  whatsapp: lead.whatsapp || lead.telefone || '',
  cidade: lead.cidade || '',
  observacoes: lead.observacoes || '',
  historico: lead.historico || [],
  createdAt: lead.created_at || lead.createdAt,
  updatedAt: lead.updated_at || lead.updatedAt,
});

const leadPayload = (leadData, now) => ({
  nome: leadData.nome || '',
  email: leadData.email || '',
  nome_casal: leadData.nomeCasal || '',
  tipo_servico: leadData.tipoServico || 'Casamento',
  valor_orcamento: parseCurrency(leadData.valorOrcamento),
  data_evento: leadData.dataEvento || null,
  data_orcamento: leadData.dataOrcamento || null,
  origem: leadData.origem || 'Instagram',
  telefone: leadData.telefone || '',
  whatsapp: leadData.whatsapp || leadData.telefone || '',
  cidade: leadData.cidade || '',
  observacoes: leadData.observacoes || '',
  updated_at: now,
});

export default function CRM() {
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [editingLead, setEditingLead] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [isLoading, setIsLoading] = useState(true);

  const fetchLeads = async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedLeads = (data || []).map(mapLeadFromDb);
      setLeads(mappedLeads);
      writeStorage(STORAGE_KEYS.leads, mappedLeads);
      return mappedLeads;
    } catch (err) {
      console.error('Erro ao buscar leads no Supabase:', err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();

    const channel = supabase
      .channel('realtime-leads-crm')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchLeads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useKeyboardShortcuts({
    n: () => {
      setEditingLead(null);
      setIsModalOpen(true);
    },
    escape: () => {
      setIsModalOpen(false);
      setSelectedLead(null);
      setEditingLead(null);
    },
  });

  const handleSaveLead = async (leadData) => {
    setSaveStatus('saving');
    const now = new Date().toISOString();
    const payload = leadPayload(leadData, now);

    try {
      if (leadData.id) {
        const currentLead = leads.find((lead) => lead.id === leadData.id);
        payload.historico = [
          ...(currentLead?.historico || []),
          { data: now, acao: 'Dados do lead atualizados' },
        ];

        const { error } = await supabase
          .from('leads')
          .update(payload)
          .eq('id', leadData.id);

        if (error) throw error;
      } else {
        payload.status = 'novo_lead';
        payload.historico = [{ data: now, acao: 'Lead criado no CRM' }];
        payload.created_at = now;

        const { error } = await supabase
          .from('leads')
          .insert([payload])
          .select();

        if (error) throw error;
      }

      await fetchLeads();
      setSaveStatus('saved');
      setIsModalOpen(false);
      setEditingLead(null);
    } catch (err) {
      console.error('Erro ao salvar lead no Supabase:', err.message);
      setSaveStatus('saved');
    }
  };

  const convertLeadToClient = async (lead) => {
    approveLeadToProject({ ...lead, status: 'aprovado' });

    try {
      const cleanPhone = (lead.telefone || lead.whatsapp || '').replace(/\D/g, '');
      const { data: existingClients } = await supabase
        .from('clientes')
        .select('*')
        .or(`telefone.ilike.%${cleanPhone}%,whatsapp.ilike.%${cleanPhone}%,email.eq.${lead.email || 'sem-email'}`)
        .limit(1);

      const existing = existingClients?.[0];
      const clientPayload = {
        nome: lead.nome || 'Cliente sem nome',
        email: lead.email || '',
        telefone: lead.telefone || '',
        whatsapp: lead.whatsapp || lead.telefone || '',
        cidade: lead.cidade || '',
        origem: lead.origem || '',
        observacoes: lead.observacoes || '',
        updated_at: new Date().toISOString(),
      };

      const clientResult = existing
        ? await supabase.from('clientes').update(clientPayload).eq('id', existing.id).select().single()
        : await supabase.from('clientes').insert([{ ...clientPayload, created_at: new Date().toISOString() }]).select().single();

      if (clientResult.error) throw clientResult.error;

      const client = clientResult.data;
      const valor = parseCurrency(lead.valorOrcamento);
      const projectPayload = {
        cliente_id: client.id,
        cliente_nome: client.nome,
        tipo_servico: lead.tipoServico || 'Casamento',
        data: lead.dataEvento || null,
        valor_contratado: valor,
        valor_recebido: 0,
        saldo_restante: valor,
        status: 'contrato_fechado',
        lead_id: lead.id,
        updated_at: new Date().toISOString(),
      };

      const { data: existingProjects } = await supabase
        .from('projetos')
        .select('id')
        .eq('lead_id', lead.id)
        .limit(1);

      const projectRequest = existingProjects?.[0]
        ? supabase.from('projetos').update(projectPayload).eq('id', existingProjects[0].id)
        : supabase.from('projetos').insert([{ ...projectPayload, created_at: new Date().toISOString() }]);

      const { error: projectError } = await projectRequest;
      if (projectError) throw projectError;
    } catch (error) {
      console.error('Erro ao converter lead em cliente/projeto no Supabase:', error.message);
    }
  };

  const handleUpdateStatus = async (leadId, newStatus) => {
    const currentLead = leads.find((lead) => lead.id === leadId);
    if (!currentLead || currentLead.status === newStatus) return;

    setSaveStatus('saving');

    if (newStatus === 'aprovado') {
      await convertLeadToClient(currentLead);
    }

    const now = new Date().toISOString();
    const nextHistorico = [
      ...(currentLead.historico || []),
      { data: now, acao: `Status alterado para ${getStatusTitle(newStatus)}` },
    ];

    try {
      const { error } = await supabase
        .from('leads')
        .update({
          status: newStatus,
          updated_at: now,
          historico: nextHistorico,
        })
        .eq('id', leadId);

      if (error) throw error;

      await fetchLeads();

      if (selectedLead?.id === leadId) {
        setSelectedLead((prev) => (prev ? { ...prev, status: newStatus, historico: nextHistorico } : null));
      }
      setSaveStatus('saved');
    } catch (err) {
      console.error('Erro ao atualizar status no Supabase:', err.message);
      setSaveStatus('saved');
    }
  };

  const leadSummary = useMemo(() => {
    const openValue = leads
      .filter((lead) => !['aprovado', 'evento_realizado', 'finalizado', 'perdido'].includes(lead.status))
      .reduce((total, lead) => total + parseCurrency(lead.valorOrcamento), 0);

    return {
      total: leads.length,
      openValue,
    };
  }, [leads]);

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: '#050505', color: '#fff', padding: '24px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '18px', marginBottom: '32px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '24px', margin: 0 }}>
              CRM - Pipeline Comercial <AutoSaveIndicator state={saveStatus} />
            </h1>
            <p style={{ color: '#888', marginTop: '6px' }}>
              {leadSummary.total} leads cadastrados | {formatCurrency(leadSummary.openValue)} em oportunidades abertas.
            </p>
          </div>
          <button
            onClick={() => {
              setEditingLead(null);
              setIsModalOpen(true);
            }}
            style={{ background: '#c5a059', color: '#000', padding: '12px 22px', borderRadius: '8px', border: 'none', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={18} /> Novo Lead
          </button>
        </header>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '64px', color: '#c5a059' }}>
            <Loader2 style={{ animation: 'spin 1s linear infinite' }} size={32} />
          </div>
        ) : (
          <>
            <CRMStats leads={leads} />
            <KanbanBoard leads={leads} onMove={handleUpdateStatus} onClick={setSelectedLead} />
          </>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingLead(null);
        }}
        title={editingLead ? 'Editar Lead' : 'Novo Lead'}
      >
        <LeadForm initialData={editingLead} onSave={handleSaveLead} />
      </Modal>

      <Modal isOpen={Boolean(selectedLead)} onClose={() => setSelectedLead(null)} title="Detalhes do Lead">
        {selectedLead && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <h3 style={{ margin: '0 0 6px', color: '#fff' }}>{selectedLead.nome}</h3>
              <p style={{ margin: 0, color: '#999' }}>{selectedLead.nomeCasal || selectedLead.tipoServico}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Info label="Status" value={getStatusTitle(selectedLead.status)} />
              <Info label="Valor" value={formatCurrency(parseCurrency(selectedLead.valorOrcamento))} />
              <Info label="Data do evento" value={selectedLead.dataEvento || 'Nao informada'} />
              <Info label="Origem" value={selectedLead.origem || 'Nao informada'} />
              <Info label="Telefone" value={selectedLead.telefone || 'Nao informado'} />
              <Info label="WhatsApp" value={selectedLead.whatsapp || selectedLead.telefone || 'Nao informado'} />
            </div>

            {selectedLead.observacoes && (
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '10px', padding: '14px', color: '#bbb', fontSize: '0.9rem' }}>
                {selectedLead.observacoes}
              </div>
            )}

            <div>
              <h4 style={{ margin: '0 0 10px', color: '#ddd', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageCircle size={16} /> Historico
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {(selectedLead.historico || []).slice().reverse().map((item, index) => (
                  <div key={`${item.data}-${index}`} style={{ color: '#888', fontSize: '0.82rem', borderBottom: '1px solid #222', paddingBottom: '8px' }}>
                    <strong style={{ color: '#bbb' }}>{item.data ? new Date(item.data).toLocaleString('pt-BR') : '-'}</strong> - {item.acao}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setEditingLead(selectedLead);
                  setSelectedLead(null);
                  setIsModalOpen(true);
                }}
                style={{ background: '#1a1a1a', color: '#fff', border: '1px solid #333', padding: '10px 14px', borderRadius: '8px', cursor: 'pointer' }}
              >
                Editar lead
              </button>
              <button
                onClick={() => handleUpdateStatus(selectedLead.id, 'aprovado')}
                style={{ background: '#34d399', color: '#06130d', border: 'none', padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <UserRoundCheck size={16} /> Converter em cliente
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div style={{ background: '#111', border: '1px solid #222', borderRadius: '10px', padding: '12px' }}>
      <div style={{ color: '#777', fontSize: '0.75rem', marginBottom: '5px' }}>{label}</div>
      <div style={{ color: '#f5f5f5', fontWeight: 600, fontSize: '0.9rem' }}>{value}</div>
    </div>
  );
}

