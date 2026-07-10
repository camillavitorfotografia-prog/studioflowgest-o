import { useState } from 'react';
import { CRM_STATUSES, LEAD_ORIGINS, SERVICE_TYPES } from '../../data/crm';
import { capitalizeName, dateToInput, maskDate, maskPhone } from '../../utils/masks';

const emptyLead = {
  nome: '',
  email: '',
  telefone: '',
  whatsapp: '',
  cidade: '',
  tipoServico: 'Casamento',
  dataEvento: '',
  dataOrcamento: new Date().toISOString().split('T')[0],
  origem: 'Instagram',
  observacoes: '',
  status: 'novo_lead',
};

export default function LeadForm({ initialData, onSave }) {
  const [formData, setFormData] = useState(() => ({
    ...emptyLead,
    ...(initialData || {}),
    dataEvento: dateToInput(initialData?.dataEvento || emptyLead.dataEvento),
    dataOrcamento: dateToInput(initialData?.dataOrcamento || emptyLead.dataOrcamento),
  }));
  const [isSaving, setIsSaving] = useState(false);

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
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

  const field = (label, children) => (
    <label>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setIsSaving(true);
        try {
          await onSave(formData);
        } finally {
          setIsSaving(false);
        }
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
    >
      {field(
        'Nome completo',
        <input
          style={inputStyle}
          required
          value={formData.nome}
          onChange={(event) => updateField('nome', capitalizeName(event.target.value))}
        />,
      )}

      {field(
        'E-mail',
        <input
          type="email"
          autoComplete="email"
          style={inputStyle}
          value={formData.email || ''}
          onChange={(event) => updateField('email', event.target.value)}
        />,
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {field(
          'Telefone',
          <input
            style={inputStyle}
            placeholder="(00) 9 0000-0000"
            value={formData.telefone}
            onChange={(event) => updateField('telefone', maskPhone(event.target.value))}
          />,
        )}
        {field(
          'WhatsApp',
          <input
            style={inputStyle}
            placeholder="(00) 9 0000-0000"
            value={formData.whatsapp}
            onChange={(event) => updateField('whatsapp', maskPhone(event.target.value))}
          />,
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {field(
          'Cidade',
          <input
            style={inputStyle}
            value={formData.cidade}
            onChange={(event) => updateField('cidade', capitalizeName(event.target.value))}
          />,
        )}
        {field(
          'Data do orcamento',
          <input
            style={inputStyle}
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
            value={formData.dataOrcamento}
            onChange={(event) => updateField('dataOrcamento', maskDate(event.target.value))}
          />,
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {field(
          'Servico',
          <select
            style={inputStyle}
            value={formData.tipoServico}
            onChange={(event) => updateField('tipoServico', event.target.value)}
          >
            {SERVICE_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>,
        )}
        {field(
          'Data do evento',
          <input
            style={inputStyle}
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
            value={formData.dataEvento}
            onChange={(event) => updateField('dataEvento', maskDate(event.target.value))}
          />,
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {field(
          'Origem',
          <select
            style={inputStyle}
            value={formData.origem}
            onChange={(event) => updateField('origem', event.target.value)}
          >
            {LEAD_ORIGINS.map((origin) => (
              <option key={origin} value={origin}>{origin}</option>
            ))}
          </select>,
        )}
        {field(
          'Status',
          <select
            style={inputStyle}
            value={formData.status}
            onChange={(event) => updateField('status', event.target.value)}
          >
            {CRM_STATUSES.map((status) => (
              <option key={status.id} value={status.id}>{status.title}</option>
            ))}
          </select>,
        )}
      </div>

      {field(
        'Observacoes',
        <textarea
          style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
          value={formData.observacoes}
          onChange={(event) => updateField('observacoes', event.target.value)}
        />,
      )}

      <button
        type="submit"
        disabled={isSaving}
        style={{
          width: '100%',
          background: '#c5a059',
          color: '#000',
          padding: '14px',
          borderRadius: '8px',
          border: 'none',
          fontWeight: 'bold',
          cursor: isSaving ? 'wait' : 'pointer',
        }}
      >
        {isSaving ? 'Salvando...' : 'Salvar Lead'}
      </button>
    </form>
  );
}
