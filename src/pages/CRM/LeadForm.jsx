import { useMemo, useState } from 'react';
import { CRM_STATUSES, LEAD_ORIGINS, SERVICE_TYPES } from '../../data/crm';
import { capitalizeName, dateToInput, maskDate, maskPhone } from '../../utils/masks';

const PRIORITY_OPTIONS = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const TEMPERATURE_OPTIONS = [
  { value: 'frio', label: 'Frio' },
  { value: 'morno', label: 'Morno' },
  { value: 'quente', label: 'Quente' },
];

const emptyLead = {
  nome: '',
  email: '',
  telefone: '',
  whatsapp: '',
  cidade: '',
  tipoServico: 'Casamento',
  dataEvento: '',
  dataOrcamento: new Date().toISOString().split('T')[0],
  validadeOrcamentoDias: 30,
  origem: 'Instagram',
  indicacao: '',
  indicacaoClienteId: '',
  campanha: '',
  dataPrimeiroContato: new Date().toISOString().split('T')[0],
  dataUltimoContato: '',
  dataProximoFollowup: '',
  motivoPerda: '',
  motivoCancelamento: '',
  prioridade: 'media',
  temperatura: 'morno',
  probabilidadeFechamento: 50,
  anexos: [],
  observacoes: '',
  status: 'novo_lead',
};

const normalizeDuplicateText = (value = '') => (
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
);

const normalizeDuplicatePhone = (value = '') => (
  String(value).replace(/\D/g, '').slice(-11)
);

const getNameSimilarity = (first = '', second = '') => {
  const firstName = normalizeDuplicateText(first);
  const secondName = normalizeDuplicateText(second);

  if (!firstName || !secondName) return 0;
  if (firstName === secondName) return 1;

  const firstTokens = String(first)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const secondTokens = String(second)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const sharedTokens = firstTokens.filter(
    (token) => secondTokens.includes(token),
  ).length;

  return sharedTokens / Math.max(
    firstTokens.length,
    secondTokens.length,
    1,
  );
};

const parseBrazilianDate = (value = '') => {
  const normalized = String(value).trim();

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
    const [day, month, year] = normalized.split('/').map(Number);
    const date = new Date(year, month - 1, day);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
};

const formatBrazilianDate = (date) => (
  date
    ? date.toLocaleDateString('pt-BR')
    : 'Data não calculada'
);

export default function LeadForm({
  initialData,
  onSave,
  leads = [],
}) {
  const [formData, setFormData] = useState(() => ({
    ...emptyLead,
    ...(initialData || {}),
    dataEvento: dateToInput(initialData?.dataEvento || emptyLead.dataEvento),
    dataOrcamento: dateToInput(initialData?.dataOrcamento || emptyLead.dataOrcamento),
    validadeOrcamentoDias: Number(
      initialData?.validadeOrcamentoDias
      ?? emptyLead.validadeOrcamentoDias,
    ),
    dataPrimeiroContato: dateToInput(initialData?.dataPrimeiroContato || emptyLead.dataPrimeiroContato),
    dataUltimoContato: dateToInput(initialData?.dataUltimoContato || emptyLead.dataUltimoContato),
    dataProximoFollowup: dateToInput(initialData?.dataProximoFollowup || emptyLead.dataProximoFollowup),
    prioridade: initialData?.prioridade || emptyLead.prioridade,
    temperatura: initialData?.temperatura || emptyLead.temperatura,
    probabilidadeFechamento: Number(
      initialData?.probabilidadeFechamento
      ?? emptyLead.probabilidadeFechamento,
    ),
    anexos: Array.isArray(initialData?.anexos) ? initialData.anexos : emptyLead.anexos,
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [allowDuplicateSave, setAllowDuplicateSave] = useState(false);

  const duplicateMatches = useMemo(() => {
    const currentId = initialData?.id;
    const email = normalizeDuplicateText(formData.email);
    const phone = normalizeDuplicatePhone(formData.telefone);
    const whatsapp = normalizeDuplicatePhone(formData.whatsapp);
    const name = formData.nome;

    return (Array.isArray(leads) ? leads : [])
      .filter((lead) => (
        String(lead?.id || '')
        !== String(currentId || '')
      ))
      .map((lead) => {
        const reasons = [];

        const sameOriginalRecord = (
          currentId
          && String(lead?.id || '') === String(currentId)
        );

        if (sameOriginalRecord) {
          return {
            lead,
            reasons: [],
          };
        }
        const leadEmail = normalizeDuplicateText(lead.email);
        const leadPhone = normalizeDuplicatePhone(lead.telefone);
        const leadWhatsapp = normalizeDuplicatePhone(
          lead.whatsapp || lead.telefone,
        );
        const nameSimilarity = getNameSimilarity(name, lead.nome);

        if (email && leadEmail && email === leadEmail) {
          reasons.push('mesmo e-mail');
        }

        if (
          phone
          && (
            phone === leadPhone
            || phone === leadWhatsapp
          )
        ) {
          reasons.push('mesmo telefone');
        }

        if (
          whatsapp
          && (
            whatsapp === leadWhatsapp
            || whatsapp === leadPhone
          )
        ) {
          reasons.push('mesmo WhatsApp');
        }

        if (
          nameSimilarity >= 0.8
          && normalizeDuplicateText(name).length >= 5
        ) {
          reasons.push('nome muito parecido');
        }

        return {
          lead,
          reasons: [...new Set(reasons)],
        };
      })
      .filter((item) => item.reasons.length > 0)
      .slice(0, 5);
  }, [
    formData.email,
    formData.nome,
    formData.telefone,
    formData.whatsapp,
    initialData?.id,
    leads,
  ]);

  const budgetExpirationDate = useMemo(() => {
    const sentDate = parseBrazilianDate(formData.dataOrcamento);
    const validityDays = Math.max(
      1,
      Number(formData.validadeOrcamentoDias || 30),
    );

    if (!sentDate) return null;

    const expiration = new Date(sentDate);
    expiration.setDate(expiration.getDate() + validityDays);

    return expiration;
  }, [
    formData.dataOrcamento,
    formData.validadeOrcamentoDias,
  ]);

  const updateField = (field, value) => {
    setAllowDuplicateSave(false);
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const inputStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #333',
    background: '#111',
    color: '#fff',
    boxSizing: 'border-box',
    minWidth: 0,
  };

  const labelStyle = {
    color: '#888',
    fontSize: '0.78rem',
    marginBottom: '6px',
    display: 'block',
    fontWeight: 600,
  };

  const field = (label, children) => (
    <label style={{ minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
  };

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          duplicateMatches.length > 0
          && !allowDuplicateSave
        ) {
          setAllowDuplicateSave(true);
          return;
        }

        setIsSaving(true);
        try {
          await onSave({
            ...formData,
            probabilidadeFechamento: Math.max(
              0,
              Math.min(100, Number(formData.probabilidadeFechamento || 0)),
            ),
          });
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

      <div style={gridStyle}>
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

      <div style={gridStyle}>
        {field(
          'Cidade',
          <input
            style={inputStyle}
            value={formData.cidade}
            onChange={(event) => updateField('cidade', capitalizeName(event.target.value))}
          />,
        )}

        {field(
          'Data de envio do orçamento',
          <input
            style={inputStyle}
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
            value={formData.dataOrcamento}
            onChange={(event) => updateField('dataOrcamento', maskDate(event.target.value))}
          />,
        )}

        {field(
          'Validade do orçamento',
          <select
            style={inputStyle}
            value={formData.validadeOrcamentoDias}
            onChange={(event) => {
              updateField(
                'validadeOrcamentoDias',
                Number(event.target.value),
              );
            }}
          >
            <option value={7}>7 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
            <option value={45}>45 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>,
        )}
      </div>

      <div
        style={{
          background: '#0d0d0d',
          border: '1px solid #242424',
          borderRadius: '10px',
          padding: '11px 12px',
          color: '#999',
          fontSize: '0.76rem',
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: '#c5a059' }}>
          Vencimento calculado:
        </strong>{' '}
        {formatBrazilianDate(budgetExpirationDate)}
      </div>

      <div style={gridStyle}>
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
            style={inputStyle}
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
            value={formData.dataEvento}
            onChange={(event) => updateField('dataEvento', maskDate(event.target.value))}
          />,
        )}
      </div>

      <div style={gridStyle}>
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

      <div
        style={{
          ...gridStyle,
          background: '#0d0d0d',
          border: '1px solid #242424',
          borderRadius: '12px',
          padding: '14px',
        }}
      >
        {field(
          'Prioridade',
          <select
            style={inputStyle}
            value={formData.prioridade}
            onChange={(event) => updateField('prioridade', event.target.value)}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>,
        )}

        {field(
          'Temperatura do lead',
          <select
            style={inputStyle}
            value={formData.temperatura}
            onChange={(event) => updateField('temperatura', event.target.value)}
          >
            {TEMPERATURE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>,
        )}

        {field(
          'Probabilidade de fechamento',
          <div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={formData.probabilidadeFechamento}
              onChange={(event) => {
                updateField('probabilidadeFechamento', Number(event.target.value));
              }}
              style={{
                width: '100%',
                accentColor: '#c5a059',
              }}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px',
                marginTop: '6px',
                color: '#777',
                fontSize: '0.75rem',
              }}
            >
              <span>0%</span>
              <strong style={{ color: '#c5a059' }}>
                {formData.probabilidadeFechamento}%
              </strong>
              <span>100%</span>
            </div>
          </div>,
        )}
      </div>

      <div style={gridStyle}>
        {field(
          'Indicação',
          <input
            style={inputStyle}
            placeholder="Nome de quem indicou"
            value={formData.indicacao || ''}
            onChange={(event) => updateField('indicacao', capitalizeName(event.target.value))}
          />,
        )}
        {field(
          'Campanha',
          <input
            style={inputStyle}
            placeholder="Ex.: Instagram - Noivas 2026"
            value={formData.campanha || ''}
            onChange={(event) => updateField('campanha', event.target.value)}
          />,
        )}
      </div>

      <div style={gridStyle}>
        {field(
          'Primeiro contato',
          <input
            style={inputStyle}
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
            value={formData.dataPrimeiroContato || ''}
            onChange={(event) => updateField('dataPrimeiroContato', maskDate(event.target.value))}
          />,
        )}
        {field(
          'Último contato',
          <input
            style={inputStyle}
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
            value={formData.dataUltimoContato || ''}
            onChange={(event) => updateField('dataUltimoContato', maskDate(event.target.value))}
          />,
        )}
        {field(
          'Próximo follow-up',
          <input
            style={inputStyle}
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
            value={formData.dataProximoFollowup || ''}
            onChange={(event) => updateField('dataProximoFollowup', maskDate(event.target.value))}
          />,
        )}
      </div>

      {field(
        'Observações',
        <textarea
          style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
          value={formData.observacoes}
          onChange={(event) => updateField('observacoes', event.target.value)}
        />,
      )}

      {formData.status === 'perdido' && field(
        'Motivo da perda',
        <textarea
          style={{ ...inputStyle, minHeight: '72px', resize: 'vertical' }}
          placeholder="Registre por que este lead não foi fechado"
          value={formData.motivoPerda || ''}
          onChange={(event) => updateField('motivoPerda', event.target.value)}
        />,
      )}

      {formData.status === 'cancelado' && field(
        'Motivo do cancelamento',
        <textarea
          style={{ ...inputStyle, minHeight: '72px', resize: 'vertical' }}
          placeholder="Registre por que este lead foi cancelado"
          value={formData.motivoCancelamento || ''}
          onChange={(event) => updateField('motivoCancelamento', event.target.value)}
        />,
      )}

      {duplicateMatches.length > 0 && (
        <div
          style={{
            background: '#1b1308',
            border: '1px solid #5a3d16',
            borderRadius: '10px',
            padding: '12px',
          }}
        >
          <div
            style={{
              color: '#fbbf24',
              fontSize: '0.82rem',
              fontWeight: 800,
              marginBottom: '7px',
            }}
          >
            Possível lead duplicado
          </div>

          <div
            style={{
              color: '#b9a57a',
              fontSize: '0.74rem',
              lineHeight: 1.5,
              marginBottom: '8px',
            }}
          >
            Verifique os registros abaixo. O sistema não bloqueia casos legítimos,
            mas pede uma confirmação antes de salvar.
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '7px',
            }}
          >
            {duplicateMatches.map(({ lead, reasons }) => (
              <div
                key={lead.id}
                style={{
                  background: '#111',
                  border: '1px solid #332a1d',
                  borderRadius: '8px',
                  padding: '9px',
                }}
              >
                <div
                  style={{
                    color: '#ddd',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                  }}
                >
                  {lead.nome || 'Lead sem nome'}
                </div>

                <div
                  style={{
                    color: '#a58e63',
                    fontSize: '0.69rem',
                    marginTop: '4px',
                  }}
                >
                  {reasons.join(' · ')}
                </div>
              </div>
            ))}
          </div>

          {allowDuplicateSave && (
            <div
              style={{
                color: '#f0c96f',
                fontSize: '0.72rem',
                fontWeight: 700,
                marginTop: '9px',
              }}
            >
              Clique novamente em “Salvar mesmo assim” para confirmar.
            </div>
          )}
        </div>
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
        {isSaving
          ? 'Salvando...'
          : duplicateMatches.length > 0 && allowDuplicateSave
            ? 'Salvar mesmo assim'
            : 'Salvar Lead'}
      </button>
    </form>
  );
}