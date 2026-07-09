import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileText, FolderOpen, Image, MessageCircle, Phone, UserRound } from 'lucide-react';
import { formatMoney, getStudioData } from '../../utils/integratedData';

export default function Clientes() {
  const [studio, setStudio] = useState(() => getStudioData());
  const [selectedClientId, setSelectedClientId] = useState(null);

  useEffect(() => {
    const load = () => setStudio(getStudioData());
    load();
    
    // Ouvintes para manter sincronização cross-tab e imediata através do ecossistema
    window.addEventListener('focus', load);
    window.addEventListener('storage', load);
    window.addEventListener('sf_storage_update', load);
    
    return () => {
      window.removeEventListener('focus', load);
      window.removeEventListener('storage', load);
      window.removeEventListener('sf_storage_update', load);
    };
  }, []);

  const clients = useMemo(() => {
    return studio.clients.map((client) => {
      const projects = studio.projects.filter(
        (project) => project.clientId === client.id || project.clienteId === client.id
      );
      const totalInvested = projects.reduce((sum, project) => sum + Number(project.valorContratado || 0), 0);
      const totalPaid = projects.reduce((sum, project) => sum + Number(project.valorRecebido || 0), 0);
      
      return { ...client, projects, totalInvested, totalPaid };
    });
  }, [studio.clients, studio.projects]);

  const selectedClient = useMemo(() => {
    if (clients.length === 0) return null;
    return clients.find((client) => client.id === selectedClientId) || clients[0];
  }, [clients, selectedClientId]);

  return (
    <div className="sf-finance-section">
      <div className="sf-section-header">
        <div>
          <h1>Clientes</h1>
          <p>Dados pessoais centralizados e historico completo derivado dos projetos.</p>
        </div>
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
                <tr key={client.id} onClick={() => setSelectedClientId(client.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <strong>{client.nome}</strong>
                    <small>
                      <UserRound size={12} /> Cliente desde{' '}
                      {new Date(client.clienteDesde || client.createdAt || Date.now()).toLocaleDateString('pt-BR')}
                    </small>
                  </td>
                  <td>
                    <span>{client.whatsapp || client.telefone || '-'}</span>
                    <small>{client.instagram || client.email || client.cidade || '-'}</small>
                  </td>
                  <td>{client.projects.length}</td>
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
          {selectedClient ? (
            <ClientPanel client={selectedClient} />
          ) : (
            <div className="sf-card">
              <p className="sf-muted">Aprove um lead no CRM para criar cliente e projeto automaticamente.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ClientPanel({ client }) {
  const payments = useMemo(() => {
    return client.projects.flatMap((project) =>
      (project.financeiro?.receitas || []).map((payment) => ({
        ...payment,
        projectName: project.tipoServico,
      }))
    );
  }, [client.projects]);

  const timeline = useMemo(() => {
    return client.projects
      .flatMap((project) => project.timelineCompleta || [])
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [client.projects]);

  const contracts = useMemo(() => {
    return client.projects.filter((project) => project.contrato && Object.keys(project.contrato).length > 0);
  }, [client.projects]);

  const questionnaires = useMemo(() => {
    return client.projects.filter((project) => project.questionario && Object.keys(project.questionario).length > 0);
  }, [client.projects]);

  const files = useMemo(() => {
    return client.projects.flatMap((project) => project.arquivos || []);
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
        <Metric label="Projetos" value={client.projects.length} />
        <Metric label="Investido" value={formatMoney(client.totalInvested)} />
        <Metric label="Recebido" value={formatMoney(client.totalPaid)} />
      </div>

      <InfoBlock
        icon={Phone}
        title="Contato"
        rows={[client.telefone || '-', client.whatsapp || '-', client.instagram || '-']}
      />
      <InfoBlock
        icon={FolderOpen}
        title="Projetos"
        rows={client.projects.map(
          (project) => `${project.tipoServico} - ${project.data || 'Sem data'} - ${formatMoney(project.valorContratado)}`
        )}
        empty="Nenhum projeto vinculado."
      />
      <InfoBlock
        icon={MessageCircle}
        title="Pagamentos"
        rows={payments.map((payment) => `${payment.projectName}: ${formatMoney(payment.valor)} em ${payment.data || '-'}`)}
        empty="Nenhum pagamento registrado."
      />
      <InfoBlock
        icon={FileText}
        title="Contratos e questionarios"
        rows={[
          ...contracts.map((project) => `Contrato: ${project.tipoServico}`),
          ...questionnaires.map((project) => `Questionario: ${project.tipoServico}`),
        ]}
        empty="Sem contratos ou questionarios vinculados."
      />
      <InfoBlock
        icon={Image}
        title="Arquivos"
        rows={files.map((file) => file.nome || file.name || 'Arquivo')}
        empty="Nenhum arquivo vinculado."
      />
      <InfoBlock
        icon={CalendarDays}
        title="Linha do tempo"
        rows={timeline
          .slice(0, 8)
          .map(
            (item) => `${item.date ? new Date(item.date).toLocaleDateString('pt-BR') : '-'} - ${item.title}`
          )}
        empty="Sem movimentacoes ainda."
      />
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
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon size={17} /> {title}
      </h3>
      {visibleRows.length === 0 && <p className="sf-muted">{empty}</p>}
      {visibleRows.map((row, index) => (
        <div className="compact-row" key={`${title}-${index}`}>
          <span>{row}</span>
        </div>
      ))}
    </div>
  );
}