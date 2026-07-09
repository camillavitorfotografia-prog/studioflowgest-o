import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileText, FolderOpen, Image, MessageCircle, Phone, UserRound } from 'lucide-react';
import { formatMoney } from '../../utils/integratedData';
import { supabase } from '../../supabaseClient'; 
import { useKeyboardShortcuts, AutoSaveIndicator } from '../../components/PremiumUXKit';

export default function Clientes() {
  const [studio, setStudio] = useState({ clients: [], projects: [] });
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [syncStatus, setSyncStatus] = useState('saved');

  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newClient, setNewClient] = useState({
    nome: '', whatsapp: '', telefone: '', email: '', instagram: '', cidade: ''
  });

  // Função para capitalizar a primeira letra
  const formatName = (str) => {
    return str.replace(/\b\w/g, char => char.toUpperCase());
  };

  // NOVA FUNÇÃO: Máscara automática de telefone (00) 9 0000-0000
  const formatPhone = (value) => {
    if (!value) return '';
    const v = value.replace(/\D/g, '').slice(0, 11); // Remove tudo que não for número e limita a 11 dígitos
    if (v.length === 0) return '';
    if (v.length <= 2) return `(${v}`;
    if (v.length <= 3) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
    if (v.length <= 7) return `(${v.slice(0, 2)}) ${v.slice(2, 3)} ${v.slice(3)}`;
    return `(${v.slice(0, 2)}) ${v.slice(2, 3)} ${v.slice(3, 7)}-${v.slice(7)}`;
  };

  useEffect(() => {
    const load = async () => {
      setSyncStatus('saving');
      try {
        const [clientsRes, projectsRes] = await Promise.all([
          supabase.from('clientes').select('*'),
          supabase.from('projetos').select('*')
        ]);

        if (clientsRes.error) console.error('Erro clientes:', clientsRes.error);
        if (projectsRes.error) console.error('Erro projetos:', projectsRes.error);

        setStudio({
          clients: clientsRes.data || [],
          projects: projectsRes.data || []
        });
      } catch (err) {
        console.error('Falha geral ao conectar com o Supabase:', err);
      } finally {
        setTimeout(() => {
          setSyncStatus('saved');
        }, 600);
      }
    };
    
    load();
    
    window.addEventListener('focus', load);
    window.addEventListener('sf_storage_update', load);
    
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projetos' }, load)
      .subscribe();
    
    return () => {
      window.removeEventListener('focus', load);
      window.removeEventListener('sf_storage_update', load);
      supabase.removeChannel(channel);
    };
  }, []);

  const clients = useMemo(() => {
    return studio.clients.map((client) => {
      const projects = studio.projects.filter(
        (project) => 
          project.clientId === client.id || 
          project.clienteId === client.id || 
          project.cliente_id === client.id
      );
      const totalInvested = projects.reduce((sum, project) => sum + Number(project.valorContratado || project.valor_contratado || 0), 0);
      const totalPaid = projects.reduce((sum, project) => sum + Number(project.valorRecebido || project.valor_recebido || 0), 0);
      
      return { ...client, projects, totalInvested, totalPaid };
    });
  }, [studio.clients, studio.projects]);

  const selectedClient = useMemo(() => {
    if (clients.length === 0) return null;
    return clients.find((client) => client.id === selectedClientId) || clients[0];
  }, [clients, selectedClientId]);

  useKeyboardShortcuts({
    'arrowdown': () => {
      if (clients.length === 0) return;
      const currentIndex = clients.findIndex((c) => c.id === selectedClientId);
      if (currentIndex < clients.length - 1) {
        setSelectedClientId(clients[currentIndex + 1].id);
      } else if (currentIndex === -1) {
        setSelectedClientId(clients[0].id);
      }
    },
    'arrowup': () => {
      if (clients.length === 0) return;
      const currentIndex = clients.findIndex((c) => c.id === selectedClientId);
      if (currentIndex > 0) {
        setSelectedClientId(clients[currentIndex - 1].id);
      }
    },
    'escape': () => {
      setSelectedClientId(null);
      setIsAddingClient(false);
    }
  });

  const handleSaveClient = async (e) => {
    e.preventDefault();
    setSyncStatus('saving');
    
    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert([newClient])
        .select();

      if (error) {
        console.error('Erro detalhado do Supabase:', error);
        alert('Erro ao salvar. Verifique o console do navegador.');
        throw error;
      }
      
      setIsAddingClient(false);
      setNewClient({ nome: '', whatsapp: '', telefone: '', email: '', instagram: '', cidade: '' });
      if (data && data[0]) {
        setSelectedClientId(data[0].id);
      }
    } catch (err) {
      console.error('Erro ao salvar cliente:', err);
    } finally {
      setTimeout(() => setSyncStatus('saved'), 600);
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
        
        {/* BOTÃO ATUALIZADO: Cor dourada/bronze premium */}
        <button 
          onClick={() => {
            setIsAddingClient(!isAddingClient);
            setSelectedClientId(null);
          }} 
          style={{ 
            padding: '8px 16px', 
            backgroundColor: isAddingClient ? '#333' : '#c59b6d', 
            color: isAddingClient ? '#fff' : '#111', 
            border: isAddingClient ? '1px solid #444' : 'none', 
            borderRadius: '6px', 
            cursor: 'pointer', 
            fontWeight: '600', 
            transition: 'all 0.2s',
            fontSize: '14px'
          }}
        >
          {isAddingClient ? 'Cancelar' : '+ Novo Cliente'}
        </button>
      </div>

      <div className="sf-pricing-layout">
        <div className="sf-table-card">
          <table className="sf-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contato</th>
                <th>Projetos</th>
                <th>Investimento</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr 
                  key={client.id} 
                  onClick={() => {
                    setSelectedClientId(client.id);
                    setIsAddingClient(false);
                  }} 
                  style={{ 
                    cursor: 'pointer',
                    backgroundColor: selectedClientId === client.id && !isAddingClient ? '#111111' : 'transparent' 
                  }}
                >
                  <td>
                    <strong>{client.nome}</strong>
                    <small>
                      <UserRound size={12} /> Cliente desde{' '}
                      {new Date(client.clienteDesde || client.created_at || client.createdAt || Date.now()).toLocaleDateString('pt-BR')}
                    </small>
                  </td>
                  <td>
                    <span>{client.whatsapp || client.telefone || '-'}</span>
                    <small>{client.instagram || client.email || client.cidade || '-'}</small>
                  </td>
                  <td>{client.projects?.length || 0}</td>
                  <td className="positive">
                    <strong>{formatMoney(client.totalInvested)}</strong>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan="4" className="empty">
                    Nenhum cliente integrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <aside className="sf-pricing-summary">
          {isAddingClient ? (
            <div className="sf-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ margin: 0 }}>Adicionar Novo Cliente</h3>
              <form onSubmit={handleSaveClient} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input required placeholder="Nome completo *" value={newClient.nome} onChange={e => setNewClient({...newClient, nome: formatName(e.target.value)})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }} />
                
                {/* APLICAÇÃO DA MÁSCARA NOS CAMPOS DE TELEFONE */}
                <input placeholder="WhatsApp (Ex: (11) 9 9999-9999)" value={newClient.whatsapp} onChange={e => setNewClient({...newClient, whatsapp: formatPhone(e.target.value)})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }} />
                <input placeholder="Telefone Alternativo" value={newClient.telefone} onChange={e => setNewClient({...newClient, telefone: formatPhone(e.target.value)})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }} />
                
                <input placeholder="E-mail" type="email" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }} />
                <input placeholder="Instagram (Ex: @cliente)" value={newClient.instagram} onChange={e => setNewClient({...newClient, instagram: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }} />
                <input placeholder="Cidade" value={newClient.cidade} onChange={e => setNewClient({...newClient, cidade: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#111', color: '#fff' }} />
                
                <button type="submit" style={{ padding: '12px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '8px', transition: '0.2s' }}>
                  Salvar Cliente
                </button>
              </form>
            </div>
          ) : selectedClient ? (
            <ClientPanel client={selectedClient} />
          ) : (
            <div className="sf-card">
              <p className="sf-muted">Selecione um cliente para ver os detalhes ou adicione um novo.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// Subcomponentes mantidos inalterados
function ClientPanel({ client }) {
  const payments = useMemo(() => {
    return (client.projects || []).flatMap((project) =>
      (project.financeiro?.receitas || []).map((payment) => ({
        ...payment,
        projectName: project.tipoServico || project.tipo_servico,
      }))
    );
  }, [client.projects]);

  const timeline = useMemo(() => {
    return (client.projects || [])
      .flatMap((project) => project.timelineCompleta || project.timeline_completa || [])
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [client.projects]);

  const contracts = useMemo(() => {
    return (client.projects || []).filter((project) => project.contrato && Object.keys(project.contrato).length > 0);
  }, [client.projects]);

  const questionnaires = useMemo(() => {
    return (client.projects || []).filter((project) => project.questionario && Object.keys(project.questionario).length > 0);
  }, [client.projects]);

  const files = useMemo(() => {
    return (client.projects || []).flatMap((project) => project.arquivos || []);
  }, [client.projects]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="sf-card sf-company-card">
        <div className="sf-company-photo">
          {client.foto ? <img src={client.foto} alt={client.nome} /> : client.nome?.slice(0, 2).toUpperCase()}
        </div>
        <div className="sf-company-info">
          <strong>{client.nome}</strong>
          <span>{client.cidade || 'Cidade nao informada'}</span>
          <span>{client.instagram || client.email || 'Contato digital nao informado'}</span>
        </div>
      </div>

      <div className="sf-metric-grid">
        <Metric label="Projetos" value={client.projects?.length || 0} />
        <Metric label="Investido" value={formatMoney(client.totalInvested)} />
        <Metric label="Recebido" value={formatMoney(client.totalPaid)} />
      </div>

      <InfoBlock icon={Phone} title="Contato" rows={[client.telefone || '-', client.whatsapp || '-', client.instagram || '-']} />
      <InfoBlock icon={FolderOpen} title="Projetos" rows={(client.projects || []).map((project) => `${project.tipoServico || project.tipo_servico} - ${project.data || 'Sem data'} - ${formatMoney(project.valorContratado || project.valor_contratado)}`)} empty="Nenhum projeto vinculado." />
      <InfoBlock icon={MessageCircle} title="Pagamentos" rows={payments.map((payment) => `${payment.projectName}: ${formatMoney(payment.valor)} em ${payment.data || '-'}`)} empty="Nenhum pagamento registrado." />
      <InfoBlock icon={FileText} title="Contratos e questionarios" rows={[...contracts.map((project) => `Contrato: ${project.tipoServico || project.tipo_servico}`), ...questionnaires.map((project) => `Questionario: ${project.tipoServico || project.tipo_servico}`)]} empty="Sem contratos ou questionarios vinculados." />
      <InfoBlock icon={Image} title="Arquivos" rows={files.map((file) => file.nome || file.name || 'Arquivo')} empty="Nenhum arquivo vinculado." />
      <InfoBlock icon={CalendarDays} title="Linha do tempo" rows={timeline.slice(0, 8).map((item) => `${item.date ? new Date(item.date).toLocaleDateString('pt-BR') : '-'} - ${item.title}`)} empty="Sem movimentacoes ainda." />
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="sf-card metric">
      <div className="metric-label">{label}</div>
      <strong>{value}</strong>
    </div>
  );
}

function InfoBlock({ icon: Icon, title, rows, empty = 'Sem dados.' }) {
  const visibleRows = useMemo(() => rows.filter(Boolean), [rows]);
  return (
    <div className="sf-card">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon size={17} /> {title}</h3>
      {visibleRows.length === 0 && <p className="sf-muted">{empty}</p>}
      {visibleRows.map((row, index) => (<div className="compact-row" key={`${title}-${index}`}><span>{row}</span></div>))}
    </div>
  );
}