export const CONTRACT_MODELS = [
  {
    id: 'contrato-casamento-2026',
    type: 'casamento',
    name: 'Contrato de Casamento',
    version: '2026.1',
    pages: 16,
    hasAttachments: true,
    sourceUrl: '/contracts/contrato-casamento-2026.pdf',
    specificFields: [
      'noivos',
      'cerimonia',
      'recepcao',
      'makingOf',
      'preWedding',
      'cobertura',
      'equipe',
      'fotosEssenciais',
      'cronograma',
      'cerimonial',
      'deslocamento',
      'hospedagem',
      'alimentacao',
    ],
  },
  {
    id: 'contrato-formatura-2026',
    type: 'formatura',
    name: 'Contrato de Formatura',
    version: '2026.1',
    pages: 12,
    hasAttachments: false,
    sourceUrl: '/contracts/contrato-formatura-2026.pdf',
    specificFields: [
      'instituicao',
      'curso',
      'turma',
      'representante',
      'alunos',
      'ensaio',
      'colacao',
      'duracao',
      'horaExtra',
      'fotosPorAluno',
      'eventoColetivo',
    ],
  },
  {
    id: 'contrato-ensaio-2026',
    type: 'ensaio',
    name: 'Contrato de Ensaio',
    version: '2026.1',
    pages: 12,
    hasAttachments: false,
    sourceUrl: '/contracts/contrato-ensaio-2026.pdf',
    specificFields: [
      'tipoEnsaio',
      'participantes',
      'duracao',
      'quantidadeFotos',
      'fotosExtras',
      'local',
      'reagendamento',
      'acompanhantes',
      'albumImpressos',
    ],
  },
];

const normalizeText = (value = '') => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
);

export const getContractModelById = (modelId = '') => (
  CONTRACT_MODELS.find(
    (model) => model.id === modelId,
  ) || null
);

export const suggestContractModel = (service = '') => {
  const value = normalizeText(service);

  if (
    value.includes('formatura')
    || value.includes('colacao')
    || value.includes('formando')
  ) {
    return CONTRACT_MODELS.find(
      (model) => model.type === 'formatura',
    ) || CONTRACT_MODELS[0];
  }

  if (
    value.includes('ensaio')
    || value.includes('gestante')
    || value.includes('familia')
    || value.includes('pre wedding')
    || value.includes('pre-wedding')
    || value.includes('casal')
  ) {
    return CONTRACT_MODELS.find(
      (model) => model.type === 'ensaio',
    ) || CONTRACT_MODELS[0];
  }

  return CONTRACT_MODELS.find(
    (model) => model.type === 'casamento',
  ) || CONTRACT_MODELS[0];
};

export const validateContractModel = (model = {}) => {
  const errors = [];

  if (!model.id) errors.push('ID ausente.');
  if (!model.name) errors.push('Nome ausente.');
  if (!model.type) errors.push('Categoria ausente.');
  if (!model.version) errors.push('Versão ausente.');
  if (!Number(model.pages)) errors.push('Número de páginas inválido.');
  if (!model.sourceUrl) errors.push('PDF original não informado.');

  return {
    valid: errors.length === 0,
    errors,
  };
};