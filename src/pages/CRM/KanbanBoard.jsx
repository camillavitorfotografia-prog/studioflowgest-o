import { CRM_STATUSES } from '../../data/crm';
import { formatCurrency, parseCurrency } from '../../utils/formatters';

export default function KanbanBoard({ leads, onMove, onClick }) {
  const getColumnLeads = (status) => leads.filter((lead) => lead.status === status);

  const getColumnValue = (status) => {
    return getColumnLeads(status).reduce((total, lead) => {
      return total + parseCurrency(lead.valorOrcamento);
    }, 0);
  };

  return (
    <div
      className="crm-kanban"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(245px, 1fr))',
        gap: '16px',
        width: '100%',
        alignItems: 'start',
      }}
    >
      {CRM_STATUSES.map((column) => {
        const columnLeads = getColumnLeads(column.id);
        const columnTotal = getColumnValue(column.id);

        return (
          <section
            className="crm-kanban-column"
            key={column.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const leadId = event.dataTransfer.getData('leadId');
              if (leadId) onMove(leadId, column.id);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '140px' }}
          >
            <div
              className="crm-kanban-column-header"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '8px 0',
                borderBottom: `2px solid ${column.color}`,
              }}
            >
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>{column.title}</div>
                <div style={{ fontSize: '0.75rem', color: '#777', marginTop: '3px' }}>
                  {formatCurrency(columnTotal)} em potencial
                </div>
              </div>
              <span style={{ fontSize: '0.8rem', color: '#888' }}>{columnLeads.length}</span>
            </div>

            <div className="crm-kanban-card-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {columnLeads.map((lead) => (
                <article
                  className="crm-kanban-card"
                  key={lead.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData('leadId', lead.id)}
                  onClick={() => onClick(lead)}
                  style={{
                    background: '#111',
                    padding: '16px',
                    borderRadius: '12px',
                    border: '1px solid #222',
                    cursor: 'grab',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>{lead.nome}</h4>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: column.color, flexShrink: 0, marginTop: '6px' }} />
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '4px' }}>{lead.tipoServico || 'Servico nao informado'}</div>
                  <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '10px' }}>{lead.dataEvento || 'Sem data definida'}</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700' }}>{formatCurrency(parseCurrency(lead.valorOrcamento))}</div>

                  <select
                    value={lead.status}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => onMove(lead.id, event.target.value)}
                    style={{
                      width: '100%',
                      marginTop: '12px',
                      background: '#1a1a1a',
                      border: '1px solid #333',
                      color: '#ddd',
                      padding: '8px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    {CRM_STATUSES.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.title}
                      </option>
                    ))}
                  </select>
                </article>
              ))}

              {columnLeads.length === 0 && (
                <div
                  style={{
                    border: '1px dashed #252525',
                    borderRadius: '12px',
                    padding: '18px',
                    color: '#555',
                    fontSize: '0.85rem',
                    textAlign: 'center',
                  }}
                >
                  Arraste leads para esta etapa.
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
