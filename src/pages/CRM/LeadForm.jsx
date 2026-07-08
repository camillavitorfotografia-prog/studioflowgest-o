import { useState } from 'react';
import { LEAD_ORIGINS, SERVICE_TYPES } from '../../data/crm';
import { capitalizeName, maskPhone } from '../../utils/masks';

const emptyLead = {
  nome: '',
  telefone: '',
  whatsapp: '',
  cidade: '',
  tipoServico: 'Casamento',
  dataEvento: '',
  dataOrcamento: new Date().toISOString().split('T')[0], // Data de hoje formatada
  origem: 'Instagram',
  observacoes: '',
  status: 'novo_lead',
};

export default function LeadForm({ initialData, onSave, onClose }) {
  const [formData, setFormData] = useState(() => ({ ...emptyLead, ...(initialData || {}) }));

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
      onSubmit={(event) => {
        event.preventDefault();
        onSave(formData);
        onClose();
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
          'Data do orçamento',
          <input
            type="date"
            style={inputStyle}
            value={formData.dataOrcamento}
            onChange={(event) => updateField('dataOrcamento', event.target.value)}
          />,
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {field(
          'Serviço',
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
            type="date"
            style={inputStyle}
            value={formData.dataEvento}
            onChange={(event) => updateField('dataEvento', event.target.value)}
          />,
        )}
      </div>

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
        'Observações',
        <textarea
          style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
          value={formData.observacoes}
          onChange={(event) => updateField('observacoes', event.target.value)}
        />,
      )}

      <button
        type="submit"
        style={{
          width: '100%',
          background: '#c5a059',
          color: '#000',
          padding: '14px',
          borderRadius: '8px',
          border: 'none',
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
      >
        Salvar Lead
      </button>
    </form>
  );
}