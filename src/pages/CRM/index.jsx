import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Plus, UserRoundCheck, Loader2 } from 'lucide-react';
import CRMStats from './CRMStats';
import KanbanBoard from './KanbanBoard';
import Modal from '../../components/Modal';
import LeadForm from './LeadForm';
import { getStatusTitle, normalizeLeadStatus } from '../../data/crm';
import { isSupabaseConfigured, supabase } from '../../utils/supabase';
import { convertLeadToClientProject, emitDbUpdate, isMissingRelationError, mapLeadFromDb, saveLeadRow } from '../../utils/dbData';
import { inputToDate } from '../../utils/masks';
import { parseCurrency } from '../../utils/formatters';
import { createId, readStorage, STORAGE_KEYS, writeStorage } from '../../utils/storage';
import { useKeyboardShortcuts, AutoSaveIndicator } from '../../components/PremiumUXKit';

const leadPayload = (leadData, now) => ({
  nome: leadData.nome || '',
  email: leadData.email || '',
  tipo_servico: leadData.tipoServico || 'Casamento',
  servico: leadData.tipoServico || 'Casamento',
  data_evento: inputToDate(leadData.dataEvento) || null,
  data_orcamento: inputToDate(leadData.dataOrcamento) || null,
  origem: leadData.origem || 'Instagram',
  telefone: leadData.telefone || '',
  whatsapp: leadData.whatsapp || leadData.telefone || '',
  cidade: leadData.cidade || '',
  observacoes: leadData.observacoes || '',
  status: normalizeLeadStatus(leadData.status),
  valor_orcamento: parseCurrency(leadData.valorOrcamento),
  updated_at: now,
});


const saveLeadToDb = async ({ id, payload }) => {
  return saveLeadRow({ id, payload });
};

const readLocalLeads = () => readStorage(STORAGE_KEYS.leads, []).map(mapLeadFromDb);

const saveLeadLocal = ({ id, payload }) => {
  const leads = readLocalLeads();
  const now = payload.updated_at || new Date().toISOString();
  const nextLead = mapLeadFromDb({
    id: id || createId('lead'),
    ...payload,
    created_at: payload.created_at || now,
    updated_at: now,
  });

  const nextLeads = id
    ? leads.map((lead) => (lead.id === id ? nextLead : lead))
    : [nextLead, ...leads];

  writeStorage(STORAGE_KEYS.leads, nextLeads);
  return nextLead;
};

export default function CRM() {
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [editingLead, setEditingLead] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [isLoading, setIsLoading] = useState(true);

  const fetchLeads = async () => {
    try {
      if (!isSupabaseConfigured) {
        const localLeads = readLocalLeads();
        setLeads(localLeads);
        emitDbUpdate();
        return localLeads;
      }

      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedLeads = (data || []).map(mapLeadFromDb);
      setLeads(mappedLeads);
      emitDbUpdate();
      return mappedLeads;
    } catch (err) {
      console.error('Erro ao buscar leads no Supabase:', err.message);
      const localLeads = readLocalLeads();
      setLeads(localLeads);
      return localLeads;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setTimeout(() => { void fetchLeads(); }, 0);

    const channel = supabase
      .channel('realtime-leads-crm')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        setTimeout(() => { void fetchLeads(); }, 0);
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

        if (isSupabaseConfigured) {
          await saveLeadToDb({ id: leadData.id, payload });
        } else {
          saveLeadLocal({ id: leadData.id, payload });
        }
      } else {
        payload.historico = [{ data: now, acao: 'Lead criado no CRM' }];
        payload.created_at = now;

        if (isSupabaseConfigured) {
          await saveLeadToDb({ payload });
        } else {
          saveLeadLocal({ payload });
        }
      }

      await fetchLeads();
      setIsModalOpen(false);
      setEditingLead(null);
    } catch (err) {
      console.error('Erro ao salvar lead no Supabase:', err.message);
      if (!isSupabaseConfigured || isMissingRelationError(err, 'leads')) {
        saveLeadLocal({ id: leadData.id, payload });
        await fetchLeads();
        setIsModalOpen(false);
        setEditingLead(null);
      }
    } finally {
      setSaveStatus('saved');
    }
  };

  const convertLeadToClient = async (lead) => {
    try {
      await convertLeadToClientProject(lead);
      return true;
    } catch (error) {
      console.error('Erro ao converter lead em cliente/projeto no Supabase:', error.message);
      return false;
    }
  };

  const handleUpdateStatus = async (leadId, newStatus) => {
    const currentLead = leads.find((lead) => lead.id === leadId);
    const normalizedStatus = normalizeLeadStatus(newStatus);
    if (!currentLead || currentLead.status === normalizedStatus) return;

    setSaveStatus('saving');

    if (normalizedStatus === 'aprovado') {
      const converted = await convertLeadToClient(currentLead);
      if (!converted) {
        setSaveStatus('saved');
        return;
      }
    }

    const now = new Date().toISOString();
    const nextHistorico = [
      ...(currentLead.historico || []),
      { data: now, acao: `Status alterado para ${getStatusTitle(normalizedStatus)}` },
    ];

    setLeads((current) => current.map((lead) => (
      lead.id === leadId ? { ...lead, status: normalizedStatus, historico: nextHistorico } : lead
    )));

    if (selectedLead?.id === leadId) {
      setSelectedLead((previous) => (previous ? { ...previous, status: normalizedStatus, historico: nextHistorico } : null));
    }

    try {
      const statusPayload = {
        status: normalizedStatus,
        updated_at: now,
        historico: nextHistorico,
      };
      if (isSupabaseConfigured) {
        await saveLeadRow({ id: leadId, payload: statusPayload });
      } else {
        saveLeadLocal({ id: leadId, payload: { ...currentLead, ...statusPayload } });
      }

      await fetchLeads();
    } catch (err) {
      console.error('Erro ao atualizar status no Supabase:', err.message);
      if (isMissingRelationError(err, 'leads')) {
        saveLeadLocal({ id: leadId, payload: { ...currentLead, status: normalizedStatus, updated_at: now, historico: nextHistorico } });
        await fetchLeads();
      } else {
        setLeads((current) => current.map((lead) => (
          lead.id === leadId ? currentLead : lead
        )));
        if (selectedLead?.id === leadId) setSelectedLead(currentLead);
      }
    } finally {
      setSaveStatus('saved');
    }
  };

  const leadSummary = useMemo(() => {
    return {
      total: leads.length,
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
              {leadSummary.total} leads cadastrados.
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

