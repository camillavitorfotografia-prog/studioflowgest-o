import { useMemo, useState } from 'react';
import { MessageCircle, Plus, UserRoundCheck } from 'lucide-react';
import CRMStats from './CRMStats';
import KanbanBoard from './KanbanBoard';
import Modal from '../../components/Modal';
import LeadForm from './LeadForm';
import { getStatusTitle } from '../../data/crm';
import { formatCurrency, parseCurrency } from '../../utils/formatters';
import { processLeadApproval } from '../../utils/integrationEngine'; // Substituição do arquivo antigo pelo novo Motor de Integração
import { createId, readStorage, STORAGE_KEYS, syncLegacyLeads, writeStorage } from '../../utils/storage';

const normalizeLead = (lead) => ({
  historico: [],
  status: 'novo_lead',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...lead,
  id: lead.id?.toString() || createId('lead'),
});

export default function CRM() {
  const [leads, setLeads] = useState(() => syncLegacyLeads().map(normalizeLead));
  const [selectedLead, setSelectedLead] = useState(null);
  const [editingLead, setEditingLead] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const persistLeads = (nextLeads) => {
    setLeads(nextLeads);
    writeStorage(STORAGE_KEYS.leads, nextLeads);
  };

  const handleSaveLead = (leadData) => {
    const now = new Date().toISOString();

    if (leadData.id) {
      const nextLeads = leads.map((lead) =>
        lead.id === leadData.id
          ? {
              ...lead,
              ...leadData,
              updatedAt: now,
              historico: [
                ...(lead.historico || []),
                { data: now, acao: 'Dados do lead atualizados' },
              ],
            }
          : lead,
      );
      persistLeads(nextLeads);
      return;
    }

    const newLead = normalizeLead({
      ...leadData,
      id: createId('lead'),
      createdAt: now,
      updatedAt: now,
      historico: [{ data: now, acao: 'Lead criado no CRM' }],
    });

    persistLeads([newLead, ...leads]);
  };

  const convertLeadToClient = (lead) => {
    // Força a padronização do status para o motor de integração processar os outros módulos
    const leadAprovado = { ...lead, status: 'aprovado' };
    processLeadApproval(leadAprovado);
  };

  const handleUpdateStatus = (leadId, newStatus) => {
    const currentLead = leads.find((lead) => lead.id === leadId);
    if (!currentLead || currentLead.status === newStatus) return;

    // Disparado tanto pelo botão do Modal quanto pelo arrastar de cards no Kanban
    if (newStatus === 'aprovado') {
      convertLeadToClient(currentLead);
    }

    const now = new Date().toISOString();
    const updatedLeads = leads.map((lead) =>
      lead.id === leadId
        ? {
            ...lead,
            status: newStatus,
            updatedAt: now,
            historico: [
              ...(lead.historico || []),
              { data: now, acao: `Status alterado para ${getStatusTitle(newStatus)}` },
            ],
          }
        : lead,
    );

    persistLeads(updatedLeads);
    if (selectedLead?.id === leadId) {
      setSelectedLead(updatedLeads.find((lead) => lead.id === leadId));
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
            <h1 style={{ fontSize: '24px', margin: 0 }}>CRM - Pipeline Comercial</h1>
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

        <CRMStats leads={leads} />
        <KanbanBoard leads={leads} onMove={handleUpdateStatus} onClick={setSelectedLead} />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingLead(null);
        }}
        title={editingLead ? 'Editar Lead' : 'Novo Lead'}
      >
        <LeadForm
          initialData={editingLead}
          onSave={handleSaveLead}
          onClose={() => {
            setIsModalOpen(false);
            setEditingLead(null);
          }}
        />
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
                    <strong style={{ color: '#bbb' }}>{new Date(item.data).toLocaleString('pt-BR')}</strong> - {item.acao}
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