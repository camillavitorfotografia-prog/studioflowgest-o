import { useEffect, useMemo, useState } from 'react';
import './Precificacao.css';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BriefcaseBusiness, Calculator, Check, CheckCircle2, ChevronDown, Clock3, DollarSign, FileText, Package, Percent, Plus, Save, Search, Settings, Sparkles, Trash2, Video, Wallet, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FINANCE_STORAGE_KEYS,
  buildFinanceSnapshot,
  calculateDepreciation,
  formatCurrency,
} from '../../utils/financeEngine';
import { maskCurrency } from '../../utils/masks';
import { getDbStudioData, subscribeDbUpdates } from '../../utils/dbData';
import { enrichPricingOption } from '../../features/proposals/services/packageSuggestions';

const categories = ['Casamento', 'Ensaio', 'Formatura', 'Corporativo', 'Eventos', 'Outro'];
const services = ['Fotografia', 'Filmagem', 'Fotografia + Filmagem'];
const steps = ['Trabalho', 'Detalhes', 'Custos', 'Resultado'];
const coverageOptions = ['Cerimonia', 'Cerimonia + Festa', 'Casamento Completo'];
const essayTypes = ['Casal', 'Gestante', 'Familia', 'Feminino', 'Infantil', 'Corporativo', 'Outro'];
const eventTypes = ['Aniversarios', 'Congressos', 'Palestras', 'Shows', 'Eventos religiosos', 'Eventos empresariais'];
const weddingHours = ['3', '4', '5', '6', '8', '10', '12', '15', '18', 'Personalizado'];
const essayDurations = ['1 hora', '2 horas', 'Sem limite', 'Personalizado'];
const baseExtras = ['segundoFotografo', 'segundoFilmmaker', 'drone', 'album', 'penDrive', 'entregaExpressa', 'deslocamento', 'hospedagem', 'alimentacao'];
const weddingExtras = ['preWedding', 'posWedding', 'welcomeDrink', 'beachDay', 'ensaioPosCasamento', 'chaBar', 'chaRevelacao', 'casamentoCivil', 'makingOf', 'horaExtra'];
const filmDeliveryKeys = [
  'filmeHighlight',
  'trailer',
  'teaserInstagram',
  'cerimoniaIntegra',
  'audioOriginal',
  'multicameras',
  'discursosIntegra',
  'primeiraDancaIntegra',
  'documentarioCompleto',
  'raw',
  'entrega4k',
  'fullHd',
  'sameDayEdit',
  'droneFilmagem',
  'segundoVideomaker',
  'terceiroVideomaker',
  'audioProfissional',
  'micCelebrante',
  'micNoivo',
  'gravacaoVotos',
  'captacaoAmbiente',
  'entregaExpressaVideo',
  'pendrivePersonalizado',
  'galeriaOnline',
];
const extras = [...baseExtras, ...weddingExtras];
const extraLabels = {
  segundoFotografo: 'Segundo fotografo',
  segundoFilmmaker: 'Segundo filmmaker',
  drone: 'Drone',
  album: 'Album',
  penDrive: 'Pen Drive',
  entregaExpressa: 'Entrega expressa',
  makingOf: 'Making Of',
  deslocamento: 'Deslocamento',
  hospedagem: 'Hospedagem',
  alimentacao: 'Alimentacao',
  preWedding: 'Pre Wedding',
  posWedding: 'Pos Wedding',
  welcomeDrink: 'Welcome Drink',
  beachDay: 'Beach Day',
  ensaioPosCasamento: 'Ensaio Pos Casamento',
  chaBar: 'Cha Bar',
  chaRevelacao: 'Cha Revelacao',
  casamentoCivil: 'Casamento Civil',
  horaExtra: 'Hora Extra',
};
const filmDeliveryLabels = {
  filmeHighlight: 'Filme Highlight',
  trailer: 'Trailer',
  teaserInstagram: 'Teaser para Instagram',
  cerimoniaIntegra: 'Cerimonia na integra',
  audioOriginal: 'Audio original sincronizado',
  multicameras: 'Multicameras',
  discursosIntegra: 'Discursos na integra',
  primeiraDancaIntegra: 'Primeira danca na integra',
  documentarioCompleto: 'Documentario completo',
  raw: 'Entrega dos arquivos RAW',
  entrega4k: 'Entrega em 4K',
  fullHd: 'Entrega em Full HD',
  sameDayEdit: 'Same Day Edit',
  droneFilmagem: 'Drone',
  segundoVideomaker: 'Segundo Videomaker',
  terceiroVideomaker: 'Terceiro Videomaker',
  audioProfissional: 'Captacao de audio profissional',
  micCelebrante: 'Microfone para celebrante',
  micNoivo: 'Microfone para noivo',
  gravacaoVotos: 'Gravacao dos votos',
  captacaoAmbiente: 'Captacao do ambiente',
  entregaExpressaVideo: 'Entrega Expressa',
  pendrivePersonalizado: 'Pendrive Personalizado',
  galeriaOnline: 'Galeria Online',
};
const highlightDurations = ['1 minuto', '2 minutos', '3 minutos', '5 minutos', '7 minutos', '10 minutos', '15 minutos', 'Personalizado'];
const documentaryDurations = ['15 minutos', '30 minutos', '45 minutos', '60 minutos', 'Personalizado'];
const collapsibleDefaults = {
  casamento: true,
  adicionais: true,
  filmagem: true,
  formatura: true,
  custos: true,
  equipamentos: false,
  configuracoes: false,
};
const defaultFilmDeliveries = filmDeliveryKeys.reduce((acc, key) => ({ ...acc, [key]: false }), {});
const normalizeProposalKey = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();


const readLocalJson = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const compactByShape = (shape, value) => {
  if (Array.isArray(shape)) {
    return Array.isArray(value) ? value.filter((item) => ['string', 'number', 'boolean'].includes(typeof item)).slice(0, 200) : [...shape];
  }
  if (shape && typeof shape === 'object') {
    const source = value && typeof value === 'object' ? value : {};
    return Object.fromEntries(Object.entries(shape).map(([key, defaultValue]) => [key, compactByShape(defaultValue, source[key] ?? defaultValue)]));
  }
  if (typeof shape === 'number') return Number.isFinite(Number(value)) ? Number(value) : shape;
  if (typeof shape === 'boolean') return typeof value === 'boolean' ? value : shape;
  return typeof value === 'string' || typeof value === 'number' ? value : shape;
};

const safeSetLocalJson = (key, value) => {
  const serialized = JSON.stringify(value);
  try {
    localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    if (error?.name !== 'QuotaExceededError' && error?.code !== 22 && !String(error?.message || '').toLowerCase().includes('quota')) throw error;
    try {
      localStorage.removeItem(key);
      localStorage.setItem(key, serialized);
      return true;
    } catch {
      return false;
    }
  }
};

const compactPricingOptionForStorage = (option = {}) => ({
  id: option.id,
  name: option.name,
  createdAt: option.createdAt,
  state: compactByShape(defaultState, option.state || {}),
  result: {
    currentPrice: Number(option.result?.currentPrice || 0),
    recommendedPrice: Number(option.result?.recommendedPrice || 0),
    minimumPrice: Number(option.result?.minimumPrice || 0),
    operationalCost: Number(option.result?.operationalCost || 0),
    laborCost: Number(option.result?.laborCost || 0),
    equipmentCost: Number(option.result?.equipmentCost || 0),
    overheadShare: Number(option.result?.overheadShare || 0),
    taxes: Number(option.result?.taxes || 0),
  },
  proposalPackage: option.proposalPackage ? {
    packageIndex: option.proposalPackage.packageIndex,
    packageName: option.proposalPackage.packageName,
    description: option.proposalPackage.description,
    bullets: Array.isArray(option.proposalPackage.bullets) ? option.proposalPackage.bullets.slice(0, 30) : [],
    priceValue: Number(option.proposalPackage.priceValue || 0),
    priceLabel: option.proposalPackage.priceLabel,
    category: option.proposalPackage.category,
    service: option.proposalPackage.service,
  } : undefined,
});

const persistPricingOptions = (options = []) => safeSetLocalJson(
  'cv_studio_pricing_options',
  options.slice(0, 12).map(compactPricingOptionForStorage),
);

const getProposalCategoryCandidates = (pricingState = {}) => {
  const category = normalizeProposalKey(pricingState.categoria);
  const essayType = normalizeProposalKey(pricingState.ensaioTipo || pricingState.tipoEnsaio);

  if (category.includes('casamento')) return ['casamento'];
  if (category.includes('formatura')) return ['formatura'];
  if (category.includes('corporativo')) return ['corporativo', 'marca pessoal'];
  if (category.includes('evento')) return ['eventos', 'evento'];
  if (category.includes('gestante') || essayType.includes('gestante')) return ['gestante', 'ensaio'];
  if (essayType.includes('corporativo')) return ['corporativo', 'marca pessoal'];
  if (essayType.includes('feminino') || essayType.includes('pessoal')) return ['pessoal', 'marca pessoal', 'ensaio'];
  if (category.includes('ensaio')) return ['ensaio', 'pessoal'];
  return [category, 'eventos', 'ensaio'].filter(Boolean);
};

const chooseProposalTemplate = (templates = [], pricingState = {}) => {
  const candidates = getProposalCategoryCandidates(pricingState);
  const proposals = templates.filter((template) => normalizeProposalKey(template.documentType) === 'proposal');
  const ranked = proposals
    .map((template) => {
      const category = normalizeProposalKey(template.category);
      const name = normalizeProposalKey(template.name);
      const candidateIndex = candidates.findIndex((candidate) => category === candidate || name.includes(candidate));
      const published = template.isPublished || normalizeProposalKey(template.status) === 'published';
      const latest = template.isLatest !== false;
      return { template, candidateIndex, published, latest };
    })
    .filter((item) => item.candidateIndex >= 0)
    .sort((a, b) => {
      if (a.candidateIndex !== b.candidateIndex) return a.candidateIndex - b.candidateIndex;
      if (a.published !== b.published) return a.published ? -1 : 1;
      if (a.latest !== b.latest) return a.latest ? -1 : 1;
      return Number(b.template.version || 0) - Number(a.template.version || 0);
    });
  return ranked[0]?.template || null;
};
const timeFields = [
  ['atendimento', 'Atendimento'],
  ['reunioes', 'Reunioes'],
  ['deslocamento', 'Deslocamento'],
  ['captacao', 'Captacao'],
  ['backup', 'Backup'],
  ['selecao', 'Selecao'],
  ['edicao', 'Edicao'],
  ['exportacao', 'Exportacao'],
  ['entrega', 'Entrega'],
  ['suporte', 'Suporte pos venda'],
];

const defaultConfig = {
  margem: 40,
  projetosMes: 4,
  valorHora: 'R$ 80,00',
  impostoPercentual: 6,
  margemMinima: 12,
  proLaboreMensal: 'R$ 6000,00',
  reservaMensal: 'R$ 1000,00',
  investimentoMensal: 'R$ 800,00',
  capacidadePontos: 30,
  custoAdicionaisPercentual: 55,
  rateioVariaveisPercentual: 20,
  faixasComerciais: {
    Casamento: { minimo: 0.9, maximo: 1.25 },
    Ensaio: { minimo: 0.85, maximo: 1.3 },
    Formatura: { minimo: 0.9, maximo: 1.25 },
    Corporativo: { minimo: 0.9, maximo: 1.3 },
    Eventos: { minimo: 0.9, maximo: 1.25 },
    Outro: { minimo: 0.9, maximo: 1.25 },
  },
  baseServicos: {
    Fotografia: 'R$ 2500,00',
    Filmagem: 'R$ 2800,00',
    'Fotografia + Filmagem': 'R$ 4500,00',
  },
  ensaios: {
    Fotografia: { '1 hora': 'R$ 700,00', '2 horas': 'R$ 900,00', 'Sem limite': 'R$ 1200,00' },
    Filmagem: { '1 hora': 'R$ 800,00', '2 horas': 'R$ 1100,00', 'Sem limite': 'R$ 1400,00' },
    'Fotografia + Filmagem': { '1 hora': 'R$ 1000,00', '2 horas': 'R$ 1300,00', 'Sem limite': 'R$ 1500,00' },
  },
  formaturaFaixas: [
    { id: 'ate5', label: 'Ate 5 alunos', min: 1, max: 5, valor: 'R$ 450,00' },
    { id: 'ate10', label: 'De 6 ate 10', min: 6, max: 10, valor: 'R$ 390,00' },
    { id: 'acima10', label: 'Acima de 10', min: 11, max: 999, valor: 'R$ 320,00' },
  ],
  formatura: {
    ensaioPorFotoAluno: 'R$ 8,00',
    coberturaColacao: 'R$ 1200,00',
    minimoIndividual: 'R$ 1800,00',
    minimoTurmaPequena: 'R$ 2400,00',
    limiteTurmaPequena: 4,
    adicionalFilmagemColacao: 'R$ 1200,00',
    adicionalFilmagemEnsaio: 'R$ 700,00',
    coberturaFesta: 'R$ 1600,00',
    drone: 'R$ 650,00',
    deslocamento: 'R$ 250,00',
  },
  coberturaCasamento: {
    Cerimonia: 1,
    'Cerimonia + Festa': 1.28,
    'Casamento Completo': 1.55,
  },
  valorHoraCobertura: 'R$ 180,00',
  extras: {
    segundoFotografo: 'R$ 700,00',
    segundoFilmmaker: 'R$ 800,00',
    drone: 'R$ 650,00',
    album: 'R$ 900,00',
    penDrive: 'R$ 120,00',
    entregaExpressa: 'R$ 450,00',
    filmagemCompleta: 'R$ 900,00',
    trailer: 'R$ 500,00',
    makingOf: 'R$ 450,00',
    deslocamento: 'R$ 250,00',
    hospedagem: 'R$ 500,00',
    alimentacao: 'R$ 180,00',
    preWedding: 'R$ 900,00',
    posWedding: 'R$ 850,00',
    welcomeDrink: 'R$ 650,00',
    beachDay: 'R$ 900,00',
    ensaioPosCasamento: 'R$ 850,00',
    chaBar: 'R$ 650,00',
    chaRevelacao: 'R$ 650,00',
    casamentoCivil: 'R$ 700,00',
    horaExtra: 'R$ 300,00',
  },
  filmagemEntregas: {
    filmeHighlight: 'R$ 700,00',
    highlightDuracoes: {
      '1 minuto': 'R$ 350,00',
      '2 minutos': 'R$ 450,00',
      '3 minutos': 'R$ 550,00',
      '5 minutos': 'R$ 700,00',
      '7 minutos': 'R$ 850,00',
      '10 minutos': 'R$ 1100,00',
      '15 minutos': 'R$ 1500,00',
    },
    trailer: 'R$ 500,00',
    teaserInstagram: 'R$ 350,00',
    cerimoniaIntegra: 'R$ 900,00',
    audioOriginal: 'R$ 250,00',
    multicameras: 'R$ 650,00',
    discursosIntegra: 'R$ 300,00',
    primeiraDancaIntegra: 'R$ 250,00',
    documentarioCompleto: 'R$ 1300,00',
    documentarioDuracoes: {
      '15 minutos': 'R$ 900,00',
      '30 minutos': 'R$ 1300,00',
      '45 minutos': 'R$ 1700,00',
      '60 minutos': 'R$ 2200,00',
    },
    raw: 'R$ 700,00',
    entrega4k: 'R$ 500,00',
    fullHd: 'R$ 0,00',
    sameDayEdit: 'R$ 1500,00',
    droneFilmagem: 'R$ 650,00',
    segundoVideomaker: 'R$ 900,00',
    terceiroVideomaker: 'R$ 800,00',
    audioProfissional: 'R$ 450,00',
    micCelebrante: 'R$ 180,00',
    micNoivo: 'R$ 180,00',
    gravacaoVotos: 'R$ 250,00',
    captacaoAmbiente: 'R$ 250,00',
    entregaExpressaVideo: 'R$ 550,00',
    pendrivePersonalizado: 'R$ 150,00',
    galeriaOnline: 'R$ 120,00',
  },
  ensaioRegras: {
    duracaoReferencia: { '1 hora': 1, '2 horas': 2, 'Sem limite': 4 },
    pisosFoto: { '1 hora': 'R$ 850,00', '2 horas': 'R$ 1150,00', 'Sem limite': 'R$ 1600,00' },
    pisosFotoFilme: { '1 hora': 'R$ 1400,00', '2 horas': 'R$ 1800,00', 'Sem limite': 'R$ 2450,00' },
    adicionalLocacao: 'R$ 180,00',
    adicionalPessoaFamilia: 'R$ 55,00',
    deslocamentoHoras: 1,
    multiplicadores: { Casal: 1, Gestante: 1.08, Familia: 1.15, Feminino: 1, Infantil: 1.1, Corporativo: 1.25, Outro: 1 },
  },
  corporativo: {
    valorHora: 'R$ 260,00', valorColaborador: 'R$ 35,00', valorFoto: 'R$ 12,00',
    minimo: 'R$ 900,00', adicionalFilmagem: 'R$ 750,00',
  },
  eventos: {
    valorHora: 'R$ 220,00', valorProfissional: 'R$ 350,00', mobilizacao: 'R$ 450,00',
    adicionalFilmagemBase: 'R$ 650,00', adicionalFilmagemHora: 'R$ 170,00',
    pisosFoto: { '2': 'R$ 900,00', '4': 'R$ 1400,00', '6': 'R$ 1900,00', '8': 'R$ 2400,00' },
    pisosFotoFilme: { '2': 'R$ 1500,00', '4': 'R$ 2300,00', '6': 'R$ 3100,00', '8': 'R$ 3900,00' },
    multiplicadores: { Aniversarios: 1, Congressos: 1.15, Palestras: 0.9, Shows: 1.35, 'Eventos religiosos': 1, 'Eventos empresariais': 1.2 },
  },
  calculoSimples: {
    custoHora: { Casamento: 65, Ensaio: 45, Formatura: 50, Corporativo: 55, Eventos: 55, Outro: 50 },
    estrutura: { Casamento: 420, Ensaio: 100, Formatura: 180, Corporativo: 180, Eventos: 200, Outro: 120 },
    equipamentoFoto: { Casamento: 180, Ensaio: 50, Formatura: 100, Corporativo: 90, Eventos: 110, Outro: 60 },
    equipamentoVideo: { Casamento: 260, Ensaio: 110, Formatura: 140, Corporativo: 140, Eventos: 170, Outro: 100 },
    deslocamentoCusto: 100,
    custoPorAluno: { completo: 210, colacao: 130, ensaio: 110 },
    margemAlvo: { Casamento: 0.35, Ensaio: 0.25, Formatura: 0.30, Corporativo: 0.28, Eventos: 0.28, Outro: 0.25 },
  },
};

const defaultState = {
  categoria: 'Casamento',
  service: 'Fotografia + Filmagem',
  step: 0,
  cobertura: 'Cerimonia + Festa',
  horasCobertura: '8',
  horasPersonalizadas: 8,
  ensaioTipo: 'Casal',
  ensaioDuracao: '2 horas',
  ensaioPersonalizado: 'R$ 900,00',
  alunos: 8,
  preFormatura: false,
  fotosEnsaio: 10,
  coberturaColacao: true,
  festa: false,
  droneFormatura: false,
  deslocamentoFormatura: false,
  colaboradores: 12,
  fotos: 30,
  pessoasEnsaio: 2,
  horas: 4,
  profissionais: 1,
  eventoTipo: 'Eventos empresariais',
  extras: [],
  filmDeliveries: defaultFilmDeliveries,
  highlightDuration: '5 minutos',
  highlightCustom: '',
  documentaryDuration: '30 minutos',
  documentaryCustom: '',
  collapsible: collapsibleDefaults,
  selectedEquipment: [],
  time: { atendimento: 1, reunioes: 1, deslocamento: 1, captacao: 4, backup: 1, selecao: 2, edicao: 6, exportacao: 1, entrega: 1, suporte: 1 },
};

const inputStyle = {
  width: '100%',
  background: 'var(--bg-main)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-main)',
  padding: '12px',
  borderRadius: '8px',
  fontSize: '0.9rem',
};

const moneyToNumber = (value) => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const normalized = value.toString().replace(/\D/g, '');
  return normalized ? Number(normalized) / 100 : 0;
};

const deepMerge = (base, saved) => {
  if (!saved || typeof saved !== 'object') return structuredClone(base);
  const output = Array.isArray(base) ? [...base] : { ...base };
  Object.entries(saved).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && base?.[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      output[key] = deepMerge(base[key], value);
      return;
    }
    output[key] = value;
  });
  return output;
};

const isVideoService = (service) => service === 'Filmagem' || service === 'Fotografia + Filmagem';
const scenarioStorageKey = 'cv_studio_pricing_scenario_name';
const capacityStorageKey = 'cv_studio_pricing_capacity';
const scenarioOptions = ['Cenário atual', 'Alta temporada', 'Pacotes premium', 'Porto Seguro', 'Goiânia'];
const defaultCapacity = {
  diasDisponiveis: 22,
  casamentos: 4,
  ensaios: 6,
  gestantes: 4,
  filmagensAvulsas: 3,
};

const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeCoverageHours = (value) => {
  if (String(value || '').toLowerCase().includes('personalizado')) {
    return 'Personalizado';
  }

  const match = String(value ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  const hours = match ? Number(match[0]) : 8;
  return Number.isFinite(hours) && hours > 0 ? String(hours) : '8';
};

const normalizePricingState = (value = {}) => {
  const merged = deepMerge(defaultState, value);

  return {
    ...merged,
    horasCobertura: normalizeCoverageHours(merged.horasCobertura),
    horasPersonalizadas: Math.max(1, toFiniteNumber(merged.horasPersonalizadas, 8)),
  };
};

const buildWorkState = (overrides = {}) => normalizePricingState(overrides);


function getEssayDurationHours(state, config) {
  if (state.ensaioDuracao === 'Personalizado') return Math.max(1, moneyToNumber(state.ensaioPersonalizado) / 500);
  return Number(config.ensaioRegras?.duracaoReferencia?.[state.ensaioDuracao] || (state.ensaioDuracao === '1 hora' ? 1 : state.ensaioDuracao === '2 horas' ? 2 : 4));
}

function getServiceWeight(state, config = defaultConfig) {
  const serviceFactor = state.service === 'Fotografia + Filmagem' ? 1.35 : state.service === 'Filmagem' ? 1.18 : 1;
  if (state.categoria === 'Casamento') {
    const hours = Math.max(1, toFiniteNumber(state.horasCobertura === 'Personalizado' ? state.horasPersonalizadas : state.horasCobertura, 8));
    const coverageFactor = state.cobertura === 'Casamento Completo' ? 1.2 : state.cobertura === 'Cerimonia + Festa' ? 1 : 0.72;
    return Math.max(1.6, (hours / 3) * coverageFactor * serviceFactor);
  }
  if (state.categoria === 'Ensaio') {
    const capture = getEssayDurationHours(state, config);
    const typeFactor = Number(config.ensaioRegras?.multiplicadores?.[state.ensaioTipo] || 1);
    const locationFactor = 1 + Math.max(0, Number(state.locacoes || 1) - 1) * 0.08;
    return Math.max(0.32, (0.28 + capture * 0.16) * typeFactor * locationFactor * serviceFactor);
  }
  if (state.categoria === 'Formatura') return Math.max(1.2, Number(state.alunos || 1) / 5) * serviceFactor;
  if (state.categoria === 'Corporativo') {
    return Math.max(0.55, (Number(state.horas || 1) * 0.18 + Number(state.colaboradores || 0) * 0.012) * serviceFactor);
  }
  if (state.categoria === 'Eventos') {
    const typeFactor = Number(config.eventos?.multiplicadores?.[state.eventoTipo] || 1);
    return Math.max(0.75, (0.45 + Number(state.horas || 1) * 0.2 + Math.max(0, Number(state.profissionais || 1) - 1) * 0.25) * typeFactor * serviceFactor);
  }
  return Math.max(0.5, Number(state.horas || 1) / 4) * serviceFactor;
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function calculateFormaturaHours(state) {
  const students = Math.max(1, Number(state.alunos || 1));
  const ceremonyHours = state.coberturaColacao ? Math.max(1, Number(state.horas || 3)) : 0;
  const essayCapture = state.preFormatura ? Math.max(1.5, students * 0.18) : 0;
  const photoPost = state.preFormatura ? Math.max(2, students * 0.55) : 0;
  const ceremonyPost = state.coberturaColacao ? Math.max(1.5, ceremonyHours * 0.9) : 0;
  const videoPost = isVideoService(state.service) ? Math.max(2, (ceremonyHours + essayCapture) * 1.25) : 0;
  return 2 + ceremonyHours + essayCapture + photoPost + ceremonyPost + videoPost;
}

function calculateEssayHours(state, config) {
  const capture = getEssayDurationHours(state, config);
  const locations = Math.max(1, Number(state.locacoes || 1));
  const people = Math.max(1, Number(state.pessoasEnsaio || (state.ensaioTipo === 'Familia' ? 4 : 2)));
  const prep = state.ensaioTipo === 'Corporativo' ? 1.25 : 0.75;
  const travel = (state.extras || []).includes('deslocamento') ? Number(config.ensaioRegras?.deslocamentoHoras || 1) : 0.35;
  const photoPost = includesPhotoService(state.service) ? (1.6 + capture * 1.35 + Math.max(0, locations - 1) * 0.45 + Math.max(0, people - 2) * 0.08) : 0;
  const videoPost = isVideoService(state.service) ? (1.5 + capture * 2.1 + Math.max(0, locations - 1) * 0.5) : 0;
  const captureLabor = capture * (state.service === 'Fotografia + Filmagem' ? 1.65 : 1);
  return prep + travel + captureLabor + 0.5 + photoPost + videoPost + 0.5;
}

function calculateCorporateHours(state) {
  const hours = Math.max(1, Number(state.horas || 1));
  const collaborators = Math.max(1, Number(state.colaboradores || 1));
  const captureLabor = hours * (state.service === 'Fotografia + Filmagem' ? 1.7 : 1);
  const photoPost = includesPhotoService(state.service) ? Math.max(1.5, collaborators * 0.12 + Number(state.fotos || 0) * 0.025) : 0;
  const videoPost = isVideoService(state.service) ? Math.max(2.5, hours * 1.8) : 0;
  return 1.25 + 0.75 + captureLabor + photoPost + videoPost + 0.75;
}

function calculateEventHours(state) {
  const hours = Math.max(1, Number(state.horas || 1));
  const professionals = Math.max(1, Number(state.profissionais || 1));
  const captureLabor = hours * professionals;
  const photoPost = includesPhotoService(state.service) ? Math.max(1.5, hours * 0.8) : 0;
  const videoPost = isVideoService(state.service) ? Math.max(3, hours * 1.55) : 0;
  return 1.25 + 1 + captureLabor + photoPost + videoPost + 0.75;
}

function includesPhotoService(service) {
  return service === 'Fotografia' || service === 'Fotografia + Filmagem';
}

function calculateWeddingHours(state) {
  const coverageHours = Math.max(1, toFiniteNumber(
    state.horasCobertura === 'Personalizado'
      ? state.horasPersonalizadas
      : state.horasCobertura,
    8,
  ));
  const includesPhoto = includesPhotoService(state.service);
  const includesVideo = isVideoService(state.service);
  const extras = Array.isArray(state.extras) ? state.extras : [];

  // Tempo de trabalho da equipe, não apenas o tempo presencial do evento.
  const planning = state.cobertura === 'Casamento Completo' ? 3.5 : 2.5;
  const captureLabor = coverageHours * (state.service === 'Fotografia + Filmagem' ? 2 : 1);
  const photoPost = includesPhoto ? 3.5 + coverageHours * 1.15 : 0;
  const videoPost = includesVideo ? 5.5 + coverageHours * 1.85 : 0;
  const delivery = 1.25;
  const preWedding = extras.includes('preWedding') ? (includesVideo ? 8 : 5.5) : 0;
  const makingOfComplexity = extras.includes('makingOf') ? 1 : 0;

  return planning + captureLabor + photoPost + videoPost + delivery + preWedding + makingOfComplexity;
}

function calculateServiceHours(state, config) {
  if (state.categoria === 'Casamento') return calculateWeddingHours(state);
  if (state.categoria === 'Formatura') return calculateFormaturaHours(state);
  if (state.categoria === 'Ensaio') return calculateEssayHours(state, config);
  if (state.categoria === 'Corporativo') return calculateCorporateHours(state);
  if (state.categoria === 'Eventos') return calculateEventHours(state);
  return Object.values(state.time || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function nearestEventFloor(hours, floors = {}) {
  const keys = Object.keys(floors).map(Number).sort((a, b) => a - b);
  const selected = keys.find((key) => hours <= key) || keys[keys.length - 1];
  return moneyToNumber(floors[String(selected)] || 0);
}

function getServiceProtectionFloor(state, config) {
  if (state.categoria === 'Formatura') return getFormaturaProtectionFloor(state, config);
  if (state.categoria === 'Ensaio') {
    const source = isVideoService(state.service) ? config.ensaioRegras?.pisosFotoFilme : config.ensaioRegras?.pisosFoto;
    const duration = state.ensaioDuracao === 'Personalizado' ? 'Sem limite' : state.ensaioDuracao;
    const base = moneyToNumber(source?.[duration]);
    const typeFactor = Number(config.ensaioRegras?.multiplicadores?.[state.ensaioTipo] || 1);
    const locations = Math.max(1, Number(state.locacoes || 1));
    const locationAdd = Math.max(0, locations - 1) * moneyToNumber(config.ensaioRegras?.adicionalLocacao);
    const people = Math.max(1, Number(state.pessoasEnsaio || (state.ensaioTipo === 'Familia' ? 4 : 2)));
    const peopleAdd = state.ensaioTipo === 'Familia' ? Math.max(0, people - 4) * moneyToNumber(config.ensaioRegras?.adicionalPessoaFamilia) : 0;
    return base * typeFactor + locationAdd + peopleAdd;
  }
  if (state.categoria === 'Corporativo') {
    const base = moneyToNumber(config.corporativo?.minimo);
    const videoAdd = isVideoService(state.service) ? moneyToNumber(config.corporativo?.adicionalFilmagem) : 0;
    return base + videoAdd;
  }
  if (state.categoria === 'Eventos') {
    const floors = isVideoService(state.service) ? config.eventos?.pisosFotoFilme : config.eventos?.pisosFoto;
    const base = nearestEventFloor(Math.max(1, Number(state.horas || 1)), floors);
    const typeFactor = Number(config.eventos?.multiplicadores?.[state.eventoTipo] || 1);
    const extraProfessionals = Math.max(0, Number(state.profissionais || 1) - 1) * moneyToNumber(config.eventos?.valorProfissional);
    return base * typeFactor + extraProfessionals;
  }
  return 0;
}

function getFormaturaProtectionFloor(state, config) {
  if (state.categoria !== 'Formatura') return 0;
  const students = Math.max(1, Number(state.alunos || 1));
  if (students === 1) return moneyToNumber(config.formatura?.minimoIndividual);
  if (students <= Math.max(2, Number(config.formatura?.limiteTurmaPequena || 4))) {
    return moneyToNumber(config.formatura?.minimoTurmaPequena);
  }
  return 0;
}

function getCategoryCostPolicy(state, pricingConfig, rawOverheadShare, rawEquipmentReserve, rawLaborCost) {
  if (state.categoria === 'Ensaio') {
    const capture = getEssayDurationHours(state, pricingConfig);
    const locations = Math.max(1, Number(state.locacoes || 1));
    const people = Math.max(1, Number(state.pessoasEnsaio || (state.ensaioTipo === 'Familia' ? 4 : 2)));
    const isVideo = isVideoService(state.service);
    const laborHourlyRate = clamp(moneyToNumber(pricingConfig.valorHora) * 0.68, 42, 60);
    const laborCost = calculateEssayHours(state, pricingConfig) * laborHourlyRate;
    const overheadCap = 95 + capture * 32 + Math.max(0, locations - 1) * 45 + Math.max(0, people - 4) * 18 + (isVideo ? 85 : 0);
    const equipmentCap = 45 + capture * 18 + (isVideo ? 70 : 0);
    return {
      laborCost,
      overheadShare: Math.min(rawOverheadShare, overheadCap),
      equipmentReserve: Math.min(rawEquipmentReserve, equipmentCap),
    };
  }

  if (state.categoria === 'Corporativo') {
    const hours = Math.max(1, Number(state.horas || 1));
    const collaborators = Math.max(1, Number(state.colaboradores || 1));
    const laborHourlyRate = clamp(moneyToNumber(pricingConfig.valorHora) * 0.78, 50, 70);
    return {
      laborCost: calculateCorporateHours(state) * laborHourlyRate,
      overheadShare: Math.min(rawOverheadShare, 180 + hours * 45 + collaborators * 5),
      equipmentReserve: Math.min(rawEquipmentReserve, 90 + hours * 22 + (isVideoService(state.service) ? 90 : 0)),
    };
  }

  if (state.categoria === 'Eventos') {
    const hours = Math.max(1, Number(state.horas || 1));
    const professionals = Math.max(1, Number(state.profissionais || 1));
    const laborHourlyRate = clamp(moneyToNumber(pricingConfig.valorHora) * 0.82, 52, 75);
    return {
      laborCost: calculateEventHours(state) * laborHourlyRate,
      overheadShare: Math.min(rawOverheadShare, 220 + hours * 55 + Math.max(0, professionals - 1) * 100),
      equipmentReserve: Math.min(rawEquipmentReserve, 110 + hours * 25 + (isVideoService(state.service) ? 120 : 0)),
    };
  }

  return { laborCost: rawLaborCost, overheadShare: rawOverheadShare, equipmentReserve: rawEquipmentReserve };
}

function calculatePricingResult({ data, pricingConfig, state }) {
  const snapshot = buildFinanceSnapshot(data);
  const category = state.categoria || 'Outro';
  const calculatedHours = calculateServiceHours(state, pricingConfig);
  const totalHours = Number.isFinite(calculatedHours) && calculatedHours > 0
    ? calculatedHours
    : 0;
  const calculationValid = totalHours > 0;
  const simple = pricingConfig.calculoSimples || defaultConfig.calculoSimples;
  const taxRate = clamp(Number(pricingConfig.impostoPercentual || 0) / 100, 0, 0.4);
  const minimumMarginRate = clamp(Number(pricingConfig.margemMinima || 0) / 100, 0, 0.45);
  const targetMarginRate = clamp(Number(simple.margemAlvo?.[category] ?? 0.25), minimumMarginRate, 0.45);
  const laborHourlyRate = Number(simple.custoHora?.[category] || 50);
  const essayTypeFactor = category === 'Ensaio' ? clamp(Number(pricingConfig.ensaioRegras?.multiplicadores?.[state.ensaioTipo] || 1), 1, 1.15) : 1;
  const laborCost = totalHours * laborHourlyRate * essayTypeFactor;

  const includesPhoto = includesPhotoService(state.service);
  const includesVideo = isVideoService(state.service);
  let equipmentCost = includesPhoto ? Number(simple.equipamentoFoto?.[category] || 0) : 0;
  if (includesVideo) equipmentCost += Number(simple.equipamentoVideo?.[category] || 0);

  let overheadShare = Number(simple.estrutura?.[category] || 0);
  let directCosts = 0;
  const displacementEnabled = (state.extras || []).includes('deslocamento');
  if (displacementEnabled) directCosts += Number(simple.deslocamentoCusto || 0);

  if (category === 'Ensaio') {
    const capture = getEssayDurationHours(state, pricingConfig);
    const locations = Math.max(1, Number(state.locacoes || 1));
    const people = Math.max(1, Number(state.pessoasEnsaio || (state.ensaioTipo === 'Familia' ? 4 : 2)));
    overheadShare += Math.max(0, capture - 1) * 30;
    directCosts += Math.max(0, locations - 1) * 80;
    if (state.ensaioTipo === 'Familia') directCosts += Math.max(0, people - 4) * 35;
    if (state.ensaioTipo === 'Corporativo') overheadShare += 80;
  }

  if (category === 'Formatura') {
    const students = Math.max(1, Number(state.alunos || 1));
    const packageKey = state.preFormatura && state.coberturaColacao ? 'completo' : state.coberturaColacao ? 'colacao' : 'ensaio';
    directCosts += students * Number(simple.custoPorAluno?.[packageKey] || 0);
    if (students > 10) overheadShare += (students - 10) * 8;
  }

  if (category === 'Corporativo') {
    const collaborators = Math.max(1, Number(state.colaboradores || 1));
    const photos = Math.max(0, Number(state.fotos || 0));
    directCosts += Math.max(0, collaborators - 1) * 18 + photos * 3;
  }

  if (category === 'Eventos') {
    const professionals = Math.max(1, Number(state.profissionais || 1));
    const typeFactor = Number(pricingConfig.eventos?.multiplicadores?.[state.eventoTipo] || 1);
    directCosts += Math.max(0, professionals - 1) * 300;
    overheadShare *= typeFactor;
    equipmentCost *= typeFactor;
  }

  if (category === 'Casamento') {
    const extrasSelected = state.extras || [];
    directCosts += extrasSelected.includes('segundoFotografo') ? 500 : 0;
    directCosts += extrasSelected.includes('segundoFilmmaker') ? 600 : 0;
    directCosts += extrasSelected.includes('hospedagem') ? 500 : 0;
    directCosts += extrasSelected.includes('alimentacao') ? 180 : 0;
    directCosts += extrasSelected.includes('drone') ? 180 : 0;
  }

  const addOnProductionCost = directCosts;
  const operationalCost = laborCost + equipmentCost + overheadShare + directCosts;
  const protectionFloor = category === 'Formatura' ? getFormaturaProtectionFloor(state, pricingConfig) : 0;
  const calculatedMinimumPrice = operationalCost / Math.max(0.2, 1 - taxRate - minimumMarginRate);
  const minimumPrice = Math.max(calculatedMinimumPrice, protectionFloor);
  const calculatedTechnicalPrice = operationalCost / Math.max(0.2, 1 - taxRate - targetMarginRate);
  const technicalPrice = Math.max(minimumPrice, calculatedTechnicalPrice);
  const recommendedPrice = Math.ceil(technicalPrice / 10) * 10;
  const currentPrice = recommendedPrice;
  const taxes = recommendedPrice * taxRate;
  const netCost = operationalCost + taxes;
  const netProfit = recommendedPrice - netCost;
  const margin = recommendedPrice > 0 ? (netProfit / recommendedPrice) * 100 : 0;
  const monthlyBusinessNeed = snapshot.fixedMonthly + snapshot.variableAverage + snapshot.equipmentDepreciation + moneyToNumber(pricingConfig.proLaboreMensal) + moneyToNumber(pricingConfig.reservaMensal) + moneyToNumber(pricingConfig.investimentoMensal);

  return {
    isValid: calculationValid && [
      operationalCost, minimumPrice, technicalPrice, recommendedPrice, netProfit, margin,
    ].every(Number.isFinite),
    validationMessage: calculationValid
      ? ''
      : 'Revise as horas e os campos numéricos antes de gerar a proposta.',
    fixedPerProject: Number.isFinite(overheadShare) ? overheadShare : 0,
    variablePerProject: directCosts,
    equipmentCost,
    totalHours,
    laborCost,
    operationalCost,
    commercialBase: recommendedPrice,
    extrasTotal: 0,
    filmDeliveriesTotal: 0,
    subtotal: currentPrice,
    currentPrice,
    monthlyBusinessNeed,
    rateableMonthlyBase: overheadShare,
    variableOverheadRate: 0,
    capacityPoints: 0,
    serviceWeight: 0,
    overheadShare,
    addOnProductionCost,
    directCosts,
    taxes,
    netCost,
    minimumPrice,
    protectionFloor,
    technicalPrice,
    marketMin: 0,
    marketMax: 0,
    recommendedPrice,
    premiumPrice: recommendedPrice,
    grossProfit: recommendedPrice - operationalCost,
    netProfit,
    margin,
    currentMargin: margin,
    variationPercent: 0,
    coherence: 'coerente',
    hourValue: totalHours ? recommendedPrice / totalHours : 0,
    displacementShare: recommendedPrice > 0 ? (displacementEnabled ? Number(simple.deslocamentoCusto || 0) / recommendedPrice * 100 : 0) : 0,
    depreciationShare: recommendedPrice > 0 ? equipmentCost / recommendedPrice * 100 : 0,
    valuePerStudent: category === 'Formatura' && Number(state.alunos) > 0 ? recommendedPrice / Number(state.alunos) : 0,
    breakdown: {
      labor: laborCost,
      direct: directCosts,
      equipment: equipmentCost,
      structure: overheadShare,
      taxRate,
      minimumMarginRate,
      targetMarginRate,
    },
  };
}

function buildOverviewRows(pricingConfig, data) {
  const presets = [
    {
      id: 'casamento-6h',
      title: 'Casamento 6h',
      subtitle: 'Fotografia',
      state: buildWorkState({
        categoria: 'Casamento',
        service: 'Fotografia',
        cobertura: 'Cerimonia + Festa',
        horasCobertura: '6',
        time: { atendimento: 1, reunioes: 2, deslocamento: 2, captacao: 6, backup: 1, selecao: 3, edicao: 5, exportacao: 1, entrega: 1, suporte: 1 },
      }),
    },
    {
      id: 'casamento-9h',
      title: 'Casamento 9h',
      subtitle: 'Fotografia + Filmagem',
      state: buildWorkState({
        categoria: 'Casamento',
        service: 'Fotografia + Filmagem',
        cobertura: 'Casamento Completo',
        horasCobertura: '9',
        extras: ['makingOf'],
        filmDeliveries: { ...defaultFilmDeliveries, cerimoniaIntegra: true },
        time: { atendimento: 1, reunioes: 2, deslocamento: 2, captacao: 9, backup: 1, selecao: 4, edicao: 10, exportacao: 2, entrega: 1, suporte: 2 },
      }),
    },
    {
      id: 'ensaio-casal',
      title: 'Ensaio casal',
      subtitle: 'Fotografia',
      state: buildWorkState({
        categoria: 'Ensaio',
        service: 'Fotografia',
        ensaioTipo: 'Casal',
        ensaioDuracao: '2 horas',
        time: { atendimento: 1, reunioes: 0.5, deslocamento: 1, captacao: 2, backup: 0.5, selecao: 1, edicao: 3, exportacao: 0.5, entrega: 0.5, suporte: 0.5 },
      }),
    },
    {
      id: 'gestante',
      title: 'Gestante',
      subtitle: 'Fotografia',
      state: buildWorkState({
        categoria: 'Ensaio',
        service: 'Fotografia',
        ensaioTipo: 'Gestante',
        ensaioDuracao: '2 horas',
        time: { atendimento: 1, reunioes: 0.5, deslocamento: 1, captacao: 2, backup: 0.5, selecao: 1, edicao: 2.5, exportacao: 0.5, entrega: 0.5, suporte: 0.5 },
      }),
    },
    {
      id: 'filmagem-4h',
      title: 'Filmagem 4h',
      subtitle: 'Vídeo',
      state: buildWorkState({
        categoria: 'Eventos',
        service: 'Filmagem',
        horas: 4,
        profissionais: 1,
        time: { atendimento: 1, reunioes: 0.5, deslocamento: 1, captacao: 4, backup: 1, selecao: 0.5, edicao: 5, exportacao: 1, entrega: 0.5, suporte: 0.5 },
      }),
    },
  ];

  return presets.map((item) => {
    const result = calculatePricingResult({ data, pricingConfig, state: item.state });
    return {
      ...item,
      result,
      currentPrice: result.currentPrice,
      operationalCost: result.operationalCost,
      directCost: result.laborCost + result.addOnProductionCost + result.equipmentCost,
    };
  });
}

export default function Precificacao() {
  const location = useLocation();
  const navigate = useNavigate();
  const leadContext = location.state?.lead;
  const [state, setState] = useState(() => normalizePricingState(compactByShape(defaultState, readLocalJson(FINANCE_STORAGE_KEYS.pricing, null))));
  const [pricingConfig, setPricingConfig] = useState(() => deepMerge(defaultConfig, compactByShape(defaultConfig, readLocalJson(FINANCE_STORAGE_KEYS.pricingConfig, null))));
  const [data, setData] = useState({ leads: [], clients: [], transactions: [], equipment: [], balances: {}, config: {} });
  const [savedOptions, setSavedOptions] = useState(() => enrichPricingOption ? (readLocalJson('cv_studio_pricing_options', []) || []).map((option, index) => enrichPricingOption(option, index)) : []);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedScenario, setSelectedScenario] = useState(() => localStorage.getItem(scenarioStorageKey) || scenarioOptions[0]);
  const [capacity, setCapacity] = useState(() => readLocalJson(capacityStorageKey, defaultCapacity) || defaultCapacity);
  const [selectedRowId, setSelectedRowId] = useState('casamento-6h');
  const [commercialPrice, setCommercialPrice] = useState('');

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      const db = await getDbStudioData();
      const equipment = db.equipment || [];
      if (!active) return;
      setData({
        leads: db.leads || [],
        clients: db.clients || [],
        transactions: db.transactions || [],
        equipment,
        balances: readLocalJson(FINANCE_STORAGE_KEYS.balances, { salario: 0, empresa: 0, reserva: 0 }) || { salario: 0, empresa: 0, reserva: 0 },
        config: readLocalJson(FINANCE_STORAGE_KEYS.config, { salario: 35, empresa: 45, reserva: 20 }) || { salario: 35, empresa: 45, reserva: 20 },
      });
      setState((current) => ({
        ...current,
        selectedEquipment: current.selectedEquipment.length ? current.selectedEquipment : equipment.map((item) => item.id),
      }));
    };

    setTimeout(() => { void loadData(); }, 0);
    window.addEventListener('focus', loadData);
    const unsubscribe = subscribeDbUpdates(loadData);
    return () => {
      active = false;
      window.removeEventListener('focus', loadData);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(scenarioStorageKey, selectedScenario);
  }, [selectedScenario]);

  useEffect(() => {
    localStorage.setItem(capacityStorageKey, JSON.stringify(capacity));
  }, [capacity]);
  useEffect(() => {
    safeSetLocalJson(FINANCE_STORAGE_KEYS.pricing, compactByShape(defaultState, state));
    safeSetLocalJson(FINANCE_STORAGE_KEYS.pricingConfig, compactByShape(defaultConfig, pricingConfig));
    persistPricingOptions(savedOptions);
    // Executa apenas na montagem para substituir versões antigas e excessivamente grandes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.categoria === 'Formatura' && state.service === 'Filmagem') {
      setState((current) => ({ ...current, service: 'Fotografia + Filmagem' }));
    }
  }, [state.categoria, state.service]);

  const snapshot = useMemo(() => buildFinanceSnapshot(data), [data]);
  const result = useMemo(() => calculatePricingResult({ data, pricingConfig, state }), [data, pricingConfig, state]);
  useEffect(() => { setCommercialPrice(''); }, [result.recommendedPrice, state.categoria, state.service]);
  const insights = useMemo(() => buildInsights(result), [result]);
  const overviewRows = useMemo(() => buildOverviewRows(pricingConfig, data), [pricingConfig, data]);

  const selectedOverviewRow = overviewRows.find((item) => item.id === selectedRowId) || overviewRows[0] || null;
  const companyMonthlyCost = snapshot.fixedMonthly + snapshot.variableAverage + snapshot.equipmentDepreciation + moneyToNumber(pricingConfig.proLaboreMensal) + moneyToNumber(pricingConfig.reservaMensal) + moneyToNumber(pricingConfig.investimentoMensal);
  const projectsPerMonth = Math.max(1, Number(pricingConfig.projetosMes || 1));
  const targetRevenue = companyMonthlyCost / Math.max(0.05, 1 - Number(pricingConfig.impostoPercentual || 0) / 100 - Number(pricingConfig.margem || 0) / 100);
  const targetTicket = targetRevenue / projectsPerMonth;
  const capacityTotal = Number(capacity.casamentos || 0) + Number(capacity.ensaios || 0) + Number(capacity.gestantes || 0) + Number(capacity.filmagensAvulsas || 0);
  const capacityGap = capacityTotal - projectsPerMonth;

  const costChart = [
    { name: 'Rateio mensal', value: result.overheadShare, color: '#c5a059' },
    { name: 'Tempo', value: result.laborCost, color: '#10b981' },
    { name: 'Produção adicional', value: result.addOnProductionCost, color: '#ef4444' },
    { name: 'Equipamentos selecionados', value: result.equipmentCost, color: '#2563eb' },
    { name: 'Impostos', value: result.taxes, color: '#f59e0b' },
  ].filter((item) => item.value > 0);
  const priceChart = [
    { name: 'Atual', valor: result.currentPrice },
    { name: 'Mínimo', valor: result.minimumPrice },
    { name: 'Técnico', valor: result.technicalPrice },
    { name: 'Recomendado', valor: result.recommendedPrice },
  ];

  const saveAll = () => {
    const stateSaved = safeSetLocalJson(FINANCE_STORAGE_KEYS.pricing, compactByShape(defaultState, state));
    const configSaved = safeSetLocalJson(FINANCE_STORAGE_KEYS.pricingConfig, compactByShape(defaultConfig, pricingConfig));
    window.dispatchEvent(new Event('storage'));
    return stateSaved && configSaved;
  };

  const commercialPriceValue = commercialPrice ? moneyToNumber(commercialPrice) : result.recommendedPrice;
  const buildOption = () => enrichPricingOption({ id: `option-${Date.now()}`, name: `Opção ${savedOptions.length + 1}`, state: structuredClone(state), result: { ...result, currentPrice: commercialPriceValue, recommendedPrice: commercialPriceValue }, createdAt: new Date().toISOString() }, savedOptions.length);
  const saveCurrentOption = () => {
    if (!result.isValid) {
      window.alert(result.validationMessage || 'Revise os dados antes de salvar esta opção.');
      return;
    }
    const next = [...savedOptions, buildOption()];
    setSavedOptions(next);
    persistPricingOptions(next);
    saveAll();
  };
  const buildSuggestedOption = (nextState, index) => enrichPricingOption({
    id: `suggestion-${String(nextState.categoria || 'servico').toLowerCase()}-${String(nextState.service || nextState.ensaioTipo || 'opcao').toLowerCase().replace(/\s+/g, '-')}-${index + 1}`,
    name: `Opção ${index + 1}`,
    state: structuredClone(nextState),
    result: { ...calculatePricingResult({ data, pricingConfig, state: nextState }) },
    createdAt: new Date().toISOString(),
  }, index);

  const buildSuggestionStates = () => {
    const cloneState = () => ({
      ...structuredClone(state),
      extras: Array.isArray(state.extras) ? [...state.extras] : [],
      filmDeliveries: { ...defaultFilmDeliveries, ...(state.filmDeliveries || {}) },
    });

    if (state.categoria === 'Casamento') {
      const selectedService = state.service || 'Fotografia';
      const includesVideo = isVideoService(selectedService);
      const optionalExtras = (state.extras || []).filter((key) => ['segundoFotografo', 'segundoFilmmaker', 'drone', 'deslocamento', 'alimentacao', 'hospedagem'].includes(key));
      const videoDeliveries = includesVideo
        ? { ...defaultFilmDeliveries, filmeHighlight: true, teaserInstagram: true, entrega4k: true }
        : { ...defaultFilmDeliveries };

      return [
        (() => { const next = cloneState(); next.service = selectedService; next.cobertura = 'Casamento Completo'; next.horasCobertura = '12'; next.extras = [...new Set(['preWedding', 'makingOf', ...optionalExtras])]; next.filmDeliveries = { ...videoDeliveries }; next.highlightDuration = '5 minutos'; return next; })(),
        (() => { const next = cloneState(); next.service = selectedService; next.cobertura = 'Cerimonia + Festa'; next.horasCobertura = '10'; next.extras = [...new Set(['makingOf', ...optionalExtras])]; next.filmDeliveries = { ...videoDeliveries }; next.highlightDuration = '5 minutos'; return next; })(),
        (() => { const next = cloneState(); next.service = selectedService; next.cobertura = 'Cerimonia + Festa'; next.horasCobertura = '8'; next.extras = [...new Set(optionalExtras)]; next.filmDeliveries = { ...videoDeliveries, teaserInstagram: false }; next.highlightDuration = '3 minutos'; return next; })(),
        (() => { const next = cloneState(); next.service = 'Fotografia'; next.cobertura = 'Cerimonia + Festa'; next.horasCobertura = '6'; next.extras = optionalExtras.filter((key) => !['segundoFilmmaker', 'drone'].includes(key)); next.filmDeliveries = { ...defaultFilmDeliveries }; next.highlightDuration = ''; return next; })(),
      ];
    }

    if (state.categoria === 'Formatura') return [
      (() => { const next = cloneState(); next.preFormatura = true; next.coberturaColacao = true; next.festa = false; return next; })(),
      (() => { const next = cloneState(); next.preFormatura = false; next.coberturaColacao = true; next.festa = false; return next; })(),
      (() => { const next = cloneState(); next.preFormatura = true; next.coberturaColacao = false; next.festa = false; return next; })(),
    ];

    if (state.categoria === 'Ensaio') return ['1 hora', '2 horas', 'Sem limite'].map((duration) => { const next = cloneState(); next.categoria = 'Ensaio'; next.ensaioDuracao = duration; return next; });

    if (state.categoria === 'Corporativo') return [2, 4, 8].map((hours) => { const next = cloneState(); next.horas = hours; return next; });

    if (state.categoria === 'Eventos') return [2, 4, 6].map((hours) => { const next = cloneState(); next.horas = hours; return next; });

    return [cloneState()];
  };

  const generateSuggestedPackages = () => {
    if (!result.isValid) {
      window.alert(result.validationMessage || 'Revise os dados antes de gerar sugestões.');
      return;
    }
    if (savedOptions.length) {
      const overwrite = window.confirm('Gerar novas sugestões automáticas e substituir as opções salvas atualmente?');
      if (!overwrite) return;
    }
    const suggestions = buildSuggestionStates();
    const next = suggestions.map((optionState, index) => buildSuggestedOption(optionState, index));
    setSavedOptions(next);
    persistPricingOptions(next);
    saveAll();
  };
  const createAnotherOption = () => {
    saveCurrentOption();
    setState((current) => ({
      ...normalizePricingState(current),
      extras: [],
      filmDeliveries: { ...defaultFilmDeliveries },
      step: 0,
    }));
    setActiveTab('services');
  };
  const loadOption = (option) => {
    if (!option?.state) return;
    setState((current) => ({
      ...normalizePricingState(option.state),
      selectedEquipment: option.state.selectedEquipment?.length ? option.state.selectedEquipment : current.selectedEquipment,
    }));
    setCommercialPrice(maskCurrency(option.proposalPackage?.priceValue || option.result?.recommendedPrice || option.result?.currentPrice || 0));
    setActiveTab('services');
  };

  const removeOption = (optionId) => {
    const next = savedOptions.filter((option) => option.id !== optionId);
    setSavedOptions(next);
    persistPricingOptions(next);
  };

  const clearSavedOptions = () => {
    if (!savedOptions.length) return;
    const confirmed = window.confirm('Apagar todas as simulações salvas? Esta ação não pode ser desfeita.');
    if (!confirmed) return;
    setSavedOptions([]);
    localStorage.removeItem('cv_studio_pricing_options');
  };

  const startNewSimulation = () => {
    setState((current) => ({
      ...normalizePricingState(),
      selectedEquipment: current.selectedEquipment.length ? current.selectedEquipment : data.equipment.map((item) => item.id),
    }));
    setActiveTab('services');
  };

  const updateConfig = (path, value) => {
    setPricingConfig((current) => setByPath(current, path, value));
  };

  const toggleExtra = (key) => {
    setState((current) => ({
      ...current,
      extras: current.extras.includes(key) ? current.extras.filter((item) => item !== key) : [...current.extras, key],
    }));
  };

  const toggleEquipment = (id) => {
    setState((current) => ({
      ...current,
      selectedEquipment: current.selectedEquipment.includes(id) ? current.selectedEquipment.filter((item) => item !== id) : [...current.selectedEquipment, id],
    }));
  };

  const applyOverviewPreset = (row) => {
    setState((current) => ({
      ...normalizePricingState(row.state),
      selectedEquipment: current.selectedEquipment.length ? current.selectedEquipment : data.equipment.map((item) => item.id),
      step: 1,
    }));
    setActiveTab('services');
  };

  const detailContext = activeTab === 'overview' && selectedOverviewRow
    ? {
      title: selectedOverviewRow.title,
      subtitle: selectedOverviewRow.subtitle,
      result: selectedOverviewRow.result,
      time: selectedOverviewRow.state.time,
      currentPrice: selectedOverviewRow.currentPrice,
    }
    : {
      title: `${state.categoria}`,
      subtitle: state.service,
      result,
      time: state.time,
      currentPrice: result.recommendedPrice,
    };

  const packageCount = state.categoria === 'Casamento' ? 4 : 3;
  const packageActionLabel = `Gerar ${packageCount} sugestões`;
  const categoryTabs = [
    { key: 'Casamento', label: 'Casamento' },
    { key: 'Formatura', label: 'Formatura' },
    { key: 'Ensaio', label: 'Ensaio' },
    { key: 'Gestante', label: 'Gestante' },
    { key: 'Corporativo', label: 'Corporativo' },
    { key: 'Eventos', label: 'Eventos' },
  ];
  const selectedCategoryKey = state.categoria === 'Ensaio' && state.ensaioTipo === 'Gestante' ? 'Gestante' : state.categoria;
  const setCategory = (key) => {
    if (key === 'Gestante') setState((current) => ({ ...current, categoria: 'Ensaio', ensaioTipo: 'Gestante', step: 0 }));
    else if (key === 'Ensaio') setState((current) => ({ ...current, categoria: 'Ensaio', ensaioTipo: current.ensaioTipo === 'Gestante' ? 'Casal' : current.ensaioTipo, step: 0 }));
    else setState((current) => ({ ...current, categoria: key, step: 0 }));
    setSavedOptions([]);
    setCommercialPrice('');
  };
  const liveSuggestedOptions = buildSuggestionStates().map((optionState, index) => buildSuggestedOption(optionState, index));
  const visibleOptions = liveSuggestedOptions;
  const proposalPreviewOption = visibleOptions[0]?.proposalPackage || enrichPricingOption({
    id: 'proposal-preview',
    name: 'Pacote selecionado',
    state,
    result: {
      ...result,
      currentPrice: commercialPriceValue,
      recommendedPrice: commercialPriceValue,
    },
  }, 0).proposalPackage;
  const commercialTaxes = commercialPriceValue * (Number(pricingConfig.impostoPercentual || 0) / 100);
  const marginAmount = commercialPriceValue - result.operationalCost - commercialTaxes;
  const formaturaPerStudent = state.categoria === 'Formatura' ? commercialPriceValue / Math.max(1, Number(state.alunos || 1)) : 0;

  return (
    <div className="minimal-pricing-page">
      <header className="minimal-pricing-header">
        <div>
          <h1>Precificação</h1>
          <p>Defina o valor comercial com base no cálculo interno, sem expor complexidade.</p>
        </div>
        <div className="minimal-header-actions">
          <button type="button" className="minimal-gold-button" onClick={generateSuggestedPackages}><Sparkles size={17} /> {packageActionLabel}</button>
          <button type="button" className="minimal-outline-button" onClick={saveCurrentOption}><Save size={17} /> Salvar opção</button>
        </div>
      </header>

      <nav className="minimal-category-tabs">
        {categoryTabs.map((item) => <button type="button" key={item.key} className={selectedCategoryKey === item.key ? 'active' : ''} onClick={() => setCategory(item.key)}>{item.label}</button>)}
      </nav>

      {leadContext && <div className="minimal-context-bar"><span>Precificação para <strong>{leadContext.nome}</strong></span><button type="button" onClick={() => navigate('/crm')}>Voltar ao CRM</button></div>}

      <section className="minimal-pricing-grid">
        <article className="minimal-panel service-panel">
          <div className="minimal-panel-title"><Settings size={20} /><div><h2>Configuração do serviço</h2><p>As opções mudam de acordo com o trabalho selecionado.</p></div></div>

          {state.categoria === 'Casamento' && <div className="minimal-fields">
            <label><span>Formato</span><select value={state.service} onChange={(e) => setState({ ...state, service: e.target.value })}>{services.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Cobertura</span><select value={state.cobertura} onChange={(e) => setState({ ...state, cobertura: e.target.value })}>{coverageOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Horas</span><select value={state.horasCobertura} onChange={(e) => setState({ ...state, horasCobertura: e.target.value })}>{weddingHours.map((item) => <option key={item} value={item}>{item === 'Personalizado' ? item : `${item} horas`}</option>)}</select></label>
            <label><span>Equipe</span><div className="minimal-readonly">Camilla + Júnior {state.service === 'Fotografia + Filmagem' ? '+ apoio' : ''}</div></label>
            <div className="minimal-extra-row"><span>Extras</span><div>{['preWedding','makingOf','segundoFotografo','segundoFilmmaker','drone'].map((key) => <button type="button" key={key} className={state.extras.includes(key) ? 'active' : ''} onClick={() => toggleExtra(key)}>{extraLabels[key]}</button>)}</div></div>
          </div>}

          {state.categoria === 'Formatura' && <div className="minimal-fields">
            <label><span>Quantidade de alunos</span><input type="number" min="1" value={state.alunos} onChange={(e) => setState({ ...state, alunos: Number(e.target.value) })} /></label>
            <label><span>Formato</span><select value={state.service === 'Filmagem' ? 'Fotografia + Filmagem' : state.service} onChange={(e) => setState({ ...state, service: e.target.value })}><option>Fotografia</option><option>Fotografia + Filmagem</option></select></label>
            <label><span>Horas da colação</span><input type="number" min="1" value={state.horas || 3} onChange={(e) => setState({ ...state, horas: Number(e.target.value) })} /></label>
            <label><span>Fotos incluídas no ensaio</span><input type="number" min="1" value={state.fotosEnsaio || 10} onChange={(e) => setState({ ...state, fotosEnsaio: Number(e.target.value) })} /><small>Aplicadas somente aos pacotes que incluem pré-formatura.</small></label>
            <div className="minimal-switches"><button type="button" className={state.preFormatura ? 'active' : ''} onClick={() => setState({ ...state, preFormatura: !state.preFormatura })}>Simular ensaio pré-formatura</button><button type="button" className={state.coberturaColacao ? 'active' : ''} onClick={() => setState({ ...state, coberturaColacao: !state.coberturaColacao })}>Simular colação de grau</button></div>
            <div className="minimal-protection-note">O botão “Gerar 3 sugestões” sempre cria: ensaio + colação, somente colação e somente ensaio. Para até {pricingConfig.formatura.limiteTurmaPequena || 4} alunos, o sistema respeita o mínimo sustentável configurado.</div>
          </div>}

          {state.categoria === 'Ensaio' && <div className="minimal-fields">
            <label><span>Tipo de ensaio</span><select value={state.ensaioTipo} onChange={(e) => setState({ ...state, ensaioTipo: e.target.value })}>{essayTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Formato</span><select value={state.service} onChange={(e) => setState({ ...state, service: e.target.value })}>{services.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Duração</span><select value={state.ensaioDuracao} onChange={(e) => setState({ ...state, ensaioDuracao: e.target.value })}>{essayDurations.filter((item) => item !== 'Personalizado').map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Locações</span><select value={state.locacoes || 1} onChange={(e) => setState({ ...state, locacoes: Number(e.target.value) })}><option value="1">1 locação</option><option value="2">2 locações</option><option value="3">3 locações</option></select></label>
            <label><span>Quantidade de pessoas</span><input type="number" min="1" value={state.pessoasEnsaio || (state.ensaioTipo === 'Familia' ? 4 : 2)} onChange={(e) => setState({ ...state, pessoasEnsaio: Number(e.target.value) })} /></label>
            <div className="minimal-switches"><button type="button" className={state.service !== 'Fotografia' ? 'active' : ''} onClick={() => setState({ ...state, service: state.service === 'Fotografia' ? 'Fotografia + Filmagem' : 'Fotografia' })}>Incluir filmagem</button><button type="button" className={state.extras.includes('deslocamento') ? 'active' : ''} onClick={() => toggleExtra('deslocamento')}>Deslocamento</button></div>
            <div className="minimal-protection-note">O custo considera captação, atendimento, deslocamento, seleção, edição, entrega, quantidade de pessoas e peso operacional específico do tipo de ensaio.</div>
          </div>}

          {state.categoria === 'Corporativo' && <div className="minimal-fields">
            <label><span>Formato</span><select value={state.service} onChange={(e) => setState({ ...state, service: e.target.value })}><option>Fotografia</option><option>Fotografia + Filmagem</option></select></label>
            <label><span>Horas de produção</span><input type="number" min="1" value={state.horas || 2} onChange={(e) => setState({ ...state, horas: Number(e.target.value) })} /></label>
            <label><span>Colaboradores</span><input type="number" min="1" value={state.colaboradores || 1} onChange={(e) => setState({ ...state, colaboradores: Number(e.target.value) })} /></label>
            <label><span>Fotos finais previstas</span><input type="number" min="0" value={state.fotos || 0} onChange={(e) => setState({ ...state, fotos: Number(e.target.value) })} /></label>
            <div className="minimal-protection-note">O cálculo considera montagem, captação, volume de colaboradores, tratamento por foto, entrega e edição de filme quando incluída.</div>
          </div>}

          {state.categoria === 'Eventos' && <div className="minimal-fields">
            <label><span>Tipo de evento</span><select value={state.eventoTipo} onChange={(e) => setState({ ...state, eventoTipo: e.target.value })}>{eventTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Formato</span><select value={state.service} onChange={(e) => setState({ ...state, service: e.target.value })}><option>Fotografia</option><option>Fotografia + Filmagem</option></select></label>
            <label><span>Duração</span><input type="number" min="1" value={state.horas || 4} onChange={(e) => setState({ ...state, horas: Number(e.target.value) })} /></label>
            <label><span>Profissionais</span><input type="number" min="1" value={state.profissionais || 1} onChange={(e) => setState({ ...state, profissionais: Number(e.target.value) })} /></label>
            <div className="minimal-switches"><button type="button" className={state.extras.includes('deslocamento') ? 'active' : ''} onClick={() => toggleExtra('deslocamento')}>Deslocamento</button></div>
            <div className="minimal-protection-note">Shows, congressos e eventos empresariais recebem pesos maiores de operação e responsabilidade. O piso aumenta conforme duração e equipe.</div>
          </div>}
        </article>

        <article className="minimal-panel finance-panel">
          <div className="minimal-panel-title"><Calculator size={20} /><div><h2>Resumo financeiro interno</h2><p>Visível somente para você.</p></div></div>
          {!result.isValid && <div className="minimal-calculation-error"><AlertTriangle size={17} /><span>{result.validationMessage}</span></div>}
          <div className="minimal-finance-small"><div><span>Custo interno total</span><strong>{formatCurrency(result.operationalCost)}</strong></div><div><span>Preço mínimo sustentável</span><strong>{formatCurrency(result.minimumPrice)}</strong></div></div>
          <details className="minimal-cost-breakdown"><summary>Ver composição do custo</summary><div><span>Mão de obra ({result.totalHours.toFixed(1)}h)</span><strong>{formatCurrency(result.breakdown?.labor || 0)}</strong></div><div><span>Custos diretos</span><strong>{formatCurrency(result.breakdown?.direct || 0)}</strong></div><div><span>Uso de equipamentos</span><strong>{formatCurrency(result.breakdown?.equipment || 0)}</strong></div><div><span>Estrutura do estúdio</span><strong>{formatCurrency(result.breakdown?.structure || 0)}</strong></div></details>
          <label className="minimal-commercial-price"><span>Preço comercial</span><input value={commercialPrice || maskCurrency(result.recommendedPrice)} onChange={(e) => setCommercialPrice(maskCurrency(e.target.value))} /><small>Este é o único valor levado para a proposta.</small></label>
          <div className={`minimal-margin-row ${marginAmount < 0 ? 'negative' : ''}`}><span>Resultado estimado após custos e impostos</span><strong>{formatCurrency(marginAmount)}</strong></div>{result.protectionFloor > 0 && <div className="minimal-floor-applied">Mínimo de proteção aplicado: {formatCurrency(result.protectionFloor)}</div>}
          {state.categoria === 'Formatura' && <div className="minimal-student-summary"><div><span>Valor por aluno</span><strong>{formatCurrency(formaturaPerStudent)}</strong></div><div><span>Total da turma</span><strong>{formatCurrency(commercialPriceValue)}</strong></div></div>}
        </article>
      </section>

      <section className="minimal-panel suggestions-panel">
        <div className="minimal-panel-title"><Sparkles size={20} /><div><h2>Pacotes sugeridos</h2><p>{state.categoria === 'Casamento' ? 'Quatro níveis de experiência.' : state.categoria === 'Formatura' ? 'Três combinações para turma, colação e ensaio.' : state.categoria === 'Corporativo' ? 'Três níveis conforme duração e volume de pessoas.' : state.categoria === 'Eventos' ? 'Três coberturas conforme duração do evento.' : 'Três opções por tempo de ensaio.'}</p></div></div>
        <div className={`minimal-package-grid count-${packageCount}`}>
          {visibleOptions.slice(0, packageCount).map((option, index) => {
            const details = option.proposalPackage || {};
            const price = details.priceValue || option.result?.recommendedPrice || option.result?.currentPrice || commercialPriceValue;
            const perStudent = state.categoria === 'Formatura' ? price / Math.max(1, Number(state.alunos || 1)) : 0;
            return <article className="minimal-package-card" key={option.id || index}><span className="package-number">{index + 1}</span><h3>{details.packageName || option.name}</h3><strong>{formatCurrency(price)}</strong>{state.categoria === 'Formatura' && <small>{formatCurrency(perStudent)} por aluno · total de {formatCurrency(price)}</small>}<p>{details.description || 'Uma proposta equilibrada para este serviço.'}</p><ul className="minimal-package-items">{(details.bullets || []).slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul><button type="button" onClick={() => loadOption(option)}>Editar pacote</button></article>;
          })}
        </div>
      </section>

      <section className="minimal-panel proposal-output-panel">
        <div className="proposal-output-copy"><FileText size={21} /><div><h2>Resumo para o Canva</h2><p>Copie o nome, o valor, a descrição e os itens incluídos de cada pacote para o seu modelo no Canva.</p></div></div>
        <div className="proposal-output-preview"><div><span>Nome do pacote</span><strong>{proposalPreviewOption?.packageName || 'Pacote selecionado'}</strong></div><div><span>Valor final</span><strong>{formatCurrency(commercialPriceValue)}</strong></div><div><span>Descrição curta</span><p>{proposalPreviewOption?.description || 'Experiência pensada para este trabalho.'}</p></div><div><span>Itens inclusos</span><ul>{(proposalPreviewOption?.bullets || []).slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul></div></div>
      </section>

    </div>
  );

}

function calculateCommercialBase(state, config) {
  if (state.categoria === 'Casamento') {
    const hours = state.horasCobertura === 'Personalizado' ? Number(state.horasPersonalizadas || 0) : Number(state.horasCobertura || 0);
    const base = moneyToNumber(config.baseServicos[state.service]);
    const coverageFactor = Number(config.coberturaCasamento[state.cobertura] || 1);
    return base * coverageFactor + Math.max(0, hours - 4) * moneyToNumber(config.valorHoraCobertura);
  }
  if (state.categoria === 'Ensaio') {
    if (state.ensaioDuracao === 'Personalizado') return moneyToNumber(state.ensaioPersonalizado);
    const source = isVideoService(state.service) ? config.ensaioRegras?.pisosFotoFilme : config.ensaioRegras?.pisosFoto;
    const base = moneyToNumber(source?.[state.ensaioDuracao] || config.ensaios[state.service]?.[state.ensaioDuracao]);
    const typeFactor = Number(config.ensaioRegras?.multiplicadores?.[state.ensaioTipo] || 1);
    const locationAdd = Math.max(0, Number(state.locacoes || 1) - 1) * moneyToNumber(config.ensaioRegras?.adicionalLocacao);
    const people = Math.max(1, Number(state.pessoasEnsaio || (state.ensaioTipo === 'Familia' ? 4 : 2)));
    const peopleAdd = state.ensaioTipo === 'Familia' ? Math.max(0, people - 4) * moneyToNumber(config.ensaioRegras?.adicionalPessoaFamilia) : 0;
    return base * typeFactor + locationAdd + peopleAdd;
  }
  if (state.categoria === 'Formatura') {
    const students = Math.max(1, Number(state.alunos || 1));
    const tier = config.formaturaFaixas.find((item) => students >= Number(item.min) && students <= Number(item.max)) || config.formaturaFaixas[0];
    const perStudentBase = students * moneyToNumber(tier.valor);
    const ceremonyHours = Math.max(1, Number(state.horas || 3));
    const ceremonyValue = state.coberturaColacao
      ? moneyToNumber(config.formatura.coberturaColacao) + Math.max(0, ceremonyHours - 3) * moneyToNumber(config.valorHoraCobertura)
      : 0;
    const essayValue = state.preFormatura
      ? students * Math.max(1, Number(state.fotosEnsaio || 10)) * moneyToNumber(config.formatura.ensaioPorFotoAluno)
      : 0;
    const videoValue = isVideoService(state.service)
      ? (state.coberturaColacao ? moneyToNumber(config.formatura.adicionalFilmagemColacao) : 0)
        + (state.preFormatura ? moneyToNumber(config.formatura.adicionalFilmagemEnsaio) : 0)
      : 0;
    let value = perStudentBase + ceremonyValue + essayValue + videoValue;
    if (state.festa) value += moneyToNumber(config.formatura.coberturaFesta);
    if (state.droneFormatura) value += moneyToNumber(config.formatura.drone);
    if (state.deslocamentoFormatura) value += moneyToNumber(config.formatura.deslocamento);
    return Math.max(value, getFormaturaProtectionFloor(state, config));
  }
  if (state.categoria === 'Corporativo') {
    const base = Number(state.horas || 0) * moneyToNumber(config.corporativo.valorHora)
      + Number(state.colaboradores || 0) * moneyToNumber(config.corporativo.valorColaborador)
      + Number(state.fotos || 0) * moneyToNumber(config.corporativo.valorFoto);
    const video = isVideoService(state.service) ? moneyToNumber(config.corporativo.adicionalFilmagem) : 0;
    return Math.max(base + video, moneyToNumber(config.corporativo.minimo) + video);
  }
  if (state.categoria === 'Eventos') {
    const hours = Math.max(1, Number(state.horas || 1));
    const professionals = Math.max(1, Number(state.profissionais || 1));
    const typeFactor = Number(config.eventos?.multiplicadores?.[state.eventoTipo] || 1);
    const photoBase = moneyToNumber(config.eventos.mobilizacao) + hours * moneyToNumber(config.eventos.valorHora);
    const extraProfessionals = Math.max(0, professionals - 1) * moneyToNumber(config.eventos.valorProfissional);
    const video = isVideoService(state.service)
      ? moneyToNumber(config.eventos.adicionalFilmagemBase) + hours * moneyToNumber(config.eventos.adicionalFilmagemHora)
      : 0;
    return (photoBase + extraProfessionals + video) * typeFactor;
  }
  return moneyToNumber(config.baseServicos[state.service]) + Number(state.horas || 0) * moneyToNumber(config.valorHoraCobertura);
}

function calculateFilmDeliveriesTotal(state, config) {
  if (!isVideoService(state.service)) return 0;
  return Object.entries(state.filmDeliveries || {}).reduce((sum, [key, active]) => {
    if (!active) return sum;
    if (key === 'filmeHighlight') {
      return sum + moneyToNumber(config.filmagemEntregas.highlightDuracoes?.[state.highlightDuration] || config.filmagemEntregas.filmeHighlight);
    }
    if (key === 'documentarioCompleto') {
      return sum + moneyToNumber(config.filmagemEntregas.documentarioDuracoes?.[state.documentaryDuration] || config.filmagemEntregas.documentarioCompleto);
    }
    return sum + moneyToNumber(config.filmagemEntregas[key]);
  }, 0);
}

function buildInsights(result) {
  const output = [];
  if (result.currentPrice < result.minimumPrice) {
    output.push({ tone: 'bad', text: `O preço atual está ${formatCurrency(result.minimumPrice - result.currentPrice)} abaixo do mínimo sustentável.` });
  } else {
    output.push({ tone: 'good', text: `O preço atual cobre o mínimo sustentável e gera margem estimada de ${result.currentMargin.toFixed(1)}%.` });
  }
  if (Math.abs(result.variationPercent) <= 20) {
    output.push({ tone: 'good', text: `O reajuste sugerido é de ${result.variationPercent.toFixed(1)}%, dentro de uma faixa comercial moderada.` });
  } else {
    output.push({ tone: 'bad', text: `A diferença de ${result.variationPercent.toFixed(1)}% exige revisão antes de alterar o preço.` });
  }
  if (result.coherence === 'revisar-custos') {
    output.push({ tone: 'bad', text: 'O preço técnico ficou muito acima da faixa comercial. Revise capacidade, pró-labore, horas e rateios para evitar superfaturamento.' });
  } else if (result.coherence === 'mercado-acima') {
    output.push({ tone: 'good', text: 'Seu preço comercial está acima do cálculo técnico; isso pode refletir posicionamento, experiência e valor percebido.' });
  } else {
    output.push({ tone: 'good', text: 'Custos, margem e faixa comercial estão coerentes entre si.' });
  }
  output.push({ tone: result.netProfit > 0 ? 'good' : 'bad', text: `Lucro líquido estimado no preço recomendado: ${formatCurrency(result.netProfit)}.` });
  return output;
}

function setByPath(source, path, value) {
  const next = structuredClone(source);
  const keys = path.split('.');
  let cursor = next;
  keys.slice(0, -1).forEach((key) => {
    cursor[key] = cursor[key] || {};
    cursor = cursor[key];
  });
  cursor[keys.at(-1)] = value;
  return next;
}

function Stepper({ active, setActive }) {
  return (
    <div className="sf-stepper">
      {steps.map((step, index) => (
        <button key={step} className={active === index ? 'active' : ''} onClick={() => setActive(index)}>
          <span>{index + 1}</span>
          {step}
        </button>
      ))}
    </div>
  );
}

function WorkStep({ state, setState }) {
  return (
    <section className="sf-card">
      <h3>Tipo de trabalho</h3>
      <div className="sf-choice-grid">
        {categories.map((category) => (
          <button key={category} className={state.categoria === category ? 'active' : ''} onClick={() => setState({ ...state, categoria: category })}>
            <BriefcaseBusiness size={18} />
            <strong>{category}</strong>
            <span>{category === 'Formatura' ? 'Regras por aluno' : category === 'Casamento' ? 'Cobertura completa' : 'Experiencia dedicada'}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SpecificStep({ state, setState, config }) {
  return (
    <section className="sf-pricing-costs">
      <CollapsibleCard title={state.categoria} open={state.collapsible[state.categoria === 'Formatura' ? 'formatura' : 'casamento']} onToggle={() => toggleSection(state, setState, state.categoria === 'Formatura' ? 'formatura' : 'casamento')}>
        <ServiceSelector state={state} setState={setState} />
        {state.categoria === 'Casamento' && <WeddingFields state={state} setState={setState} config={config} />}
        {state.categoria === 'Ensaio' && <EssayFields state={state} setState={setState} config={config} />}
        {state.categoria === 'Formatura' && <GraduationFields state={state} setState={setState} config={config} />}
        {state.categoria === 'Corporativo' && <CorporateFields state={state} setState={setState} />}
        {state.categoria === 'Eventos' && <EventFields state={state} setState={setState} />}
        {state.categoria === 'Outro' && <GenericFields state={state} setState={setState} />}
      </CollapsibleCard>
      {state.categoria === 'Casamento' && (
        <CollapsibleCard title="Servicos adicionais" open={state.collapsible.adicionais} onToggle={() => toggleSection(state, setState, 'adicionais')}>
          <WeddingExtras state={state} config={config} toggleExtra={(key) => toggleStateExtra(state, setState, key)} />
        </CollapsibleCard>
      )}
      {isVideoService(state.service) && (
        <CollapsibleCard title="Entregas da Filmagem" icon={Video} open={state.collapsible.filmagem} onToggle={() => toggleSection(state, setState, 'filmagem')}>
          <FilmDeliveryFields state={state} setState={setState} config={config} />
        </CollapsibleCard>
      )}
    </section>
  );
}

function ServiceSelector({ state, setState }) {
  return (
    <div className="sf-segmented spaced">
      {services.map((service) => <button key={service} className={state.service === service ? 'active' : ''} onClick={() => setState({ ...state, service })}>{service}</button>)}
    </div>
  );
}

function WeddingFields({ state, setState, config }) {
  return (
    <>
      <div className="sf-form-grid">
        <Field label="Tipo de cobertura">
          <select style={inputStyle} value={state.cobertura} onChange={(event) => setState({ ...state, cobertura: event.target.value })}>
            {coverageOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Horas de cobertura">
          <select style={inputStyle} value={state.horasCobertura} onChange={(event) => setState({ ...state, horasCobertura: event.target.value })}>
            {weddingHours.map((item) => <option key={item} value={item}>{item === 'Personalizado' ? item : `${item} horas`}</option>)}
          </select>
        </Field>
        {state.horasCobertura === 'Personalizado' && <Field label="Horas manuais"><input type="number" style={inputStyle} value={state.horasPersonalizadas} onChange={(event) => setState({ ...state, horasPersonalizadas: event.target.value })} /></Field>}
      </div>
      <p className="sf-muted">Base atual do servico: {formatCurrency(moneyToNumber(config.baseServicos[state.service]))}</p>
    </>
  );
}

function WeddingExtras({ state, config, toggleExtra }) {
  return (
    <div className="sf-choice-grid compact">
      {weddingExtras.map((key) => (
        <Toggle
          key={key}
          label={`${extraLabels[key]} - ${config.extras[key]}`}
          active={state.extras.includes(key)}
          onClick={() => toggleExtra(key)}
        />
      ))}
    </div>
  );
}

function FilmDeliveryFields({ state, setState, config }) {
  const updateDelivery = (key) => {
    setState((current) => ({
      ...current,
      filmDeliveries: {
        ...current.filmDeliveries,
        [key]: !current.filmDeliveries[key],
      },
    }));
  };

  return (
    <div className="sf-pricing-costs">
      <div className="sf-form-grid">
        <Toggle label={`Filme Highlight - ${config.filmagemEntregas.highlightDuracoes?.[state.highlightDuration] || config.filmagemEntregas.filmeHighlight}`} active={state.filmDeliveries.filmeHighlight} onClick={() => updateDelivery('filmeHighlight')} />
        {state.filmDeliveries.filmeHighlight && (
          <Field label="Duracao do Highlight">
            <select style={inputStyle} value={state.highlightDuration} onChange={(event) => setState({ ...state, highlightDuration: event.target.value })}>
              {highlightDurations.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
        )}
        {state.highlightDuration === 'Personalizado' && state.filmDeliveries.filmeHighlight && <Field label="Duracao personalizada"><input style={inputStyle} value={state.highlightCustom} onChange={(event) => setState({ ...state, highlightCustom: event.target.value })} /></Field>}
      </div>

      <div className="sf-choice-grid compact">
        {['trailer', 'teaserInstagram', 'cerimoniaIntegra'].map((key) => (
          <Toggle key={key} label={`${filmDeliveryLabels[key]} - ${config.filmagemEntregas[key]}`} active={state.filmDeliveries[key]} onClick={() => updateDelivery(key)} />
        ))}
      </div>

      {state.filmDeliveries.cerimoniaIntegra && (
        <div className="sf-subsection">
          <p className="sf-muted">Detalhes da cerimonia na integra</p>
          <div className="sf-choice-grid compact">
            {['audioOriginal', 'multicameras', 'discursosIntegra', 'primeiraDancaIntegra'].map((key) => (
              <Toggle key={key} label={`${filmDeliveryLabels[key]} - ${config.filmagemEntregas[key]}`} active={state.filmDeliveries[key]} onClick={() => updateDelivery(key)} />
            ))}
          </div>
        </div>
      )}

      <div className="sf-form-grid">
        <Toggle label={`Documentario completo - ${config.filmagemEntregas.documentarioDuracoes?.[state.documentaryDuration] || config.filmagemEntregas.documentarioCompleto}`} active={state.filmDeliveries.documentarioCompleto} onClick={() => updateDelivery('documentarioCompleto')} />
        {state.filmDeliveries.documentarioCompleto && (
          <Field label="Duracao do documentario">
            <select style={inputStyle} value={state.documentaryDuration} onChange={(event) => setState({ ...state, documentaryDuration: event.target.value })}>
              {documentaryDurations.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
        )}
        {state.documentaryDuration === 'Personalizado' && state.filmDeliveries.documentarioCompleto && <Field label="Duracao personalizada"><input style={inputStyle} value={state.documentaryCustom} onChange={(event) => setState({ ...state, documentaryCustom: event.target.value })} /></Field>}
      </div>

      <div className="sf-choice-grid compact">
        {[
          'raw',
          'entrega4k',
          'fullHd',
          'sameDayEdit',
          'droneFilmagem',
          'segundoVideomaker',
          'terceiroVideomaker',
          'audioProfissional',
          'micCelebrante',
          'micNoivo',
          'gravacaoVotos',
          'captacaoAmbiente',
          'entregaExpressaVideo',
          'pendrivePersonalizado',
          'galeriaOnline',
        ].map((key) => (
          <Toggle key={key} label={`${filmDeliveryLabels[key]} - ${config.filmagemEntregas[key]}`} active={state.filmDeliveries[key]} onClick={() => updateDelivery(key)} />
        ))}
      </div>
    </div>
  );
}

function EssayFields({ state, setState, config }) {
  return (
    <div className="sf-form-grid">
      <Field label="Qual tipo?">
        <select style={inputStyle} value={state.ensaioTipo} onChange={(event) => setState({ ...state, ensaioTipo: event.target.value })}>
          {essayTypes.map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label="Tempo contratado">
        <select style={inputStyle} value={state.ensaioDuracao} onChange={(event) => setState({ ...state, ensaioDuracao: event.target.value })}>
          {essayDurations.map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      {state.ensaioDuracao === 'Personalizado' && <Field label="Valor personalizado"><input style={inputStyle} value={state.ensaioPersonalizado} onChange={(event) => setState({ ...state, ensaioPersonalizado: maskCurrency(event.target.value) })} /></Field>}
      <p className="sf-muted">Regra atual: {state.ensaioDuracao === 'Personalizado' ? state.ensaioPersonalizado : config.ensaios[state.service]?.[state.ensaioDuracao]}</p>
    </div>
  );
}

function GraduationFields({ state, setState, config }) {
  return (
    <div className="sf-form-grid">
      <Field label="Quantidade de alunos"><input type="number" min="1" style={inputStyle} value={state.alunos} onChange={(event) => setState({ ...state, alunos: event.target.value })} /></Field>
      <Field label="Fotos do ensaio por aluno"><input type="number" min="0" style={inputStyle} value={state.fotosEnsaio} onChange={(event) => setState({ ...state, fotosEnsaio: event.target.value })} /></Field>
      <Toggle label="Ensaio Pre Formatura" active={state.preFormatura} onClick={() => setState({ ...state, preFormatura: !state.preFormatura })} />
      <Toggle label={`Cobertura da colacao - ${config.formatura.coberturaColacao}`} active={state.coberturaColacao} onClick={() => setState({ ...state, coberturaColacao: !state.coberturaColacao })} />
      <Toggle label={`Cobertura da festa - ${config.formatura.coberturaFesta}`} active={state.festa} onClick={() => setState({ ...state, festa: !state.festa })} />
      <Toggle label={`Drone - ${config.formatura.drone}`} active={state.droneFormatura} onClick={() => setState({ ...state, droneFormatura: !state.droneFormatura })} />
      <Toggle label={`Deslocamento - ${config.formatura.deslocamento}`} active={state.deslocamentoFormatura} onClick={() => setState({ ...state, deslocamentoFormatura: !state.deslocamentoFormatura })} />
    </div>
  );
}

function CorporateFields({ state, setState }) {
  return (
    <div className="sf-form-grid">
      <Field label="Quantidade de horas"><input type="number" min="1" style={inputStyle} value={state.horas} onChange={(event) => setState({ ...state, horas: event.target.value })} /></Field>
      <Field label="Colaboradores"><input type="number" min="0" style={inputStyle} value={state.colaboradores} onChange={(event) => setState({ ...state, colaboradores: event.target.value })} /></Field>
      <Field label="Quantidade de fotos"><input type="number" min="0" style={inputStyle} value={state.fotos} onChange={(event) => setState({ ...state, fotos: event.target.value })} /></Field>
    </div>
  );
}

function EventFields({ state, setState }) {
  return (
    <div className="sf-form-grid">
      <Field label="Tipo de evento"><select style={inputStyle} value={state.eventoTipo} onChange={(event) => setState({ ...state, eventoTipo: event.target.value })}>{eventTypes.map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Horas"><input type="number" min="1" style={inputStyle} value={state.horas} onChange={(event) => setState({ ...state, horas: event.target.value })} /></Field>
      <Field label="Profissionais"><input type="number" min="1" style={inputStyle} value={state.profissionais} onChange={(event) => setState({ ...state, profissionais: event.target.value })} /></Field>
    </div>
  );
}

function GenericFields({ state, setState }) {
  return <CorporateFields state={state} setState={setState} />;
}

function CostStep({ state, setState, config, setConfig, toggleExtra, toggleEquipment, equipment, result }) {
  const productionExtras = state.categoria === 'Casamento' ? baseExtras : extras;

  return (
    <section className="sf-pricing-costs">
      <CollapsibleCard title="Custos adicionais de producao" open={state.collapsible.custos} onToggle={() => toggleSection(state, setState, 'custos')}>
        <div className="sf-choice-grid compact">
          {productionExtras.map((key) => <Toggle key={key} label={`${extraLabels[key]} - ${config.extras[key]}`} active={state.extras.includes(key)} onClick={() => toggleExtra(key)} />)}
        </div>
      </CollapsibleCard>
      <div className="sf-card">
        <h3>Tempo de trabalho</h3>
        <div className="sf-time-grid">
          {timeFields.map(([key, label]) => <Field key={key} label={label}><input type="number" min="0" step="0.5" style={inputStyle} value={state.time[key]} onChange={(event) => setState({ ...state, time: { ...state.time, [key]: event.target.value } })} /></Field>)}
        </div>
        <div className="formula-total"><span>Total investido</span><strong>{result.totalHours.toFixed(1)}h</strong></div>
        <Field label="Valor da hora"><input style={inputStyle} value={config.valorHora} onChange={(event) => setConfig({ ...config, valorHora: maskCurrency(event.target.value) })} /></Field>
      </div>
      <CollapsibleCard title="Equipamentos utilizados" open={state.collapsible.equipamentos} onToggle={() => toggleSection(state, setState, 'equipamentos')}>
        <div className="sf-equipment-picker">
          {equipment.length === 0 && <p className="sf-muted">Cadastre equipamentos para aplicar depreciacao automatica.</p>}
          {equipment.map((item) => {
            const depreciation = calculateDepreciation(item);
            return (
              <button key={item.id} className={state.selectedEquipment.includes(item.id) ? 'active' : ''} onClick={() => toggleEquipment(item.id)}>
                <Package size={16} />
                <span>{item.nome}</span>
                <strong>{formatCurrency(depreciation.monthlyDepreciation / Math.max(1, Number(config.projetosMes || 1)))}</strong>
              </button>
            );
          })}
        </div>
      </CollapsibleCard>
    </section>
  );
}

function ResultStep({ result, insights, costChart, priceChart, savedOptions, onSaveOption, onCreateAnother, onContinue }) {
  return (
    <section className="sf-finance-section">
      <div className="sf-metric-grid">
        <Metric icon={BriefcaseBusiness} label="Preço atual" value={result.currentPrice} />
        <Metric icon={DollarSign} label="Mínimo sustentável" value={result.minimumPrice} />
        <Metric icon={Calculator} label="Preço técnico" value={result.technicalPrice} />
        <Metric icon={Wallet} label="Preço recomendado" value={result.recommendedPrice} tone="positive" />
        <Metric icon={Percent} label="Margem recomendada" value={`${result.margin.toFixed(1)}%`} />
        <Metric icon={Clock3} label="Peso operacional" value={`${result.serviceWeight.toFixed(1)} pts`} />
      </div>
      <div className="sf-panel-grid">
        <div className="sf-card">
          <h3>Escada de valor</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={priceChart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="name" stroke="#A1A1AA" tickLine={false} axisLine={false} />
              <YAxis stroke="#A1A1AA" tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ background: 'var(--surface-card)', border: '1px solid var(--border-color)', borderRadius: 8 }} />
              <Bar dataKey="valor" fill="#c5a059" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="sf-card">
          <h3>Composicao do custo</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={costChart} dataKey="value" innerRadius={58} outerRadius={86} paddingAngle={4} stroke="none">
                {costChart.map((item) => <Cell key={item.name} fill={item.color} />)}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ background: 'var(--surface-card)', border: '1px solid var(--border-color)', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
          {costChart.map((item) => <div className="report-row" key={item.name}><span>{item.name}</span><strong>{formatCurrency(item.value)}</strong></div>)}
        </div>
      </div>
      <div className="sf-table-card">
        <table className="sf-table">
          <thead><tr><th>Indicador</th><th>Valor</th><th>Origem</th></tr></thead>
          <tbody>
            <tr><td>Preço atual configurado</td><td>{formatCurrency(result.currentPrice)}</td><td>Pacote e adicionais selecionados</td></tr>
            <tr><td>Faixa comercial</td><td>{formatCurrency(result.marketMin)} a {formatCurrency(result.marketMax)}</td><td>Limites por categoria</td></tr>
            <tr><td>Preço recomendado</td><td>{formatCurrency(result.recommendedPrice)}</td><td>Equilíbrio técnico e comercial</td></tr>
            <tr><td>Lucro líquido estimado</td><td>{formatCurrency(result.netProfit)}</td><td>Após custos e impostos</td></tr>
            <tr><td>Meta mensal completa</td><td>{formatCurrency(result.monthlyBusinessNeed)}</td><td>Visão gerencial; não é rateada integralmente</td></tr>
            <tr><td>Base mensal rateável</td><td>{formatCurrency(result.rateableMonthlyBase)}</td><td>Fixos + {Math.round(result.variableOverheadRate * 100)}% dos variáveis + reservas</td></tr>
            <tr><td>Rateio deste serviço</td><td>{formatCurrency(result.overheadShare)}</td><td>{result.serviceWeight.toFixed(2)} de {result.capacityPoints} pontos mensais</td></tr>
            <tr><td>Tempo estimado</td><td>{result.totalHours.toFixed(1)}h</td><td>{formatCurrency(result.laborCost)} em mão de obra</td></tr>
          </tbody>
        </table>
      </div>
      <div className="sf-card">
        <h3>Leitura inteligente</h3>
        {insights.map((item) => <div className={`sf-insight ${item.tone}`} key={item.text}>{item.tone === 'good' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<span>{item.text}</span></div>)}
      </div>
      <div className="sf-result-actions">
        <div><strong>{savedOptions.length} opção(ões) salva(s)</strong><span>Monte alternativas de pacote antes de gerar a proposta.</span></div>
        <button type="button" className="sf-secondary-button" onClick={onSaveOption}><Save size={17} /> Salvar esta opção</button>
        <button type="button" className="sf-secondary-button" onClick={onCreateAnother}><Plus size={17} /> Criar outra opção</button>
        <button type="button" className="sf-primary-button" onClick={onContinue}>Continuar para proposta</button>
      </div>
    </section>
  );
}

function ConfigPanel({ config, updateConfig }) {
  return (
    <section className="sf-card">
      <div className="metric-label"><Settings size={18} /> Configuracao da Precificacao</div>
      <div className="sf-settings-stack">
        <DetailsGroup title="Geral" open>
          <div className="sf-config-grid">
            <Field label="Projetos por mês (referência)"><input type="number" style={inputStyle} value={config.projetosMes} onChange={(event) => updateConfig('projetosMes', event.target.value)} /></Field>
            <Field label="Capacidade mensal em pontos"><input type="number" min="1" style={inputStyle} value={config.capacidadePontos} onChange={(event) => updateConfig('capacidadePontos', event.target.value)} /></Field>
            <Field label="Margem desejada (%)"><input type="number" style={inputStyle} value={config.margem} onChange={(event) => updateConfig('margem', event.target.value)} /></Field>
            <Field label="Margem mínima (%)"><input type="number" style={inputStyle} value={config.margemMinima} onChange={(event) => updateConfig('margemMinima', event.target.value)} /></Field>
            <Field label="Impostos (%)"><input type="number" style={inputStyle} value={config.impostoPercentual} onChange={(event) => updateConfig('impostoPercentual', event.target.value)} /></Field>
            <Field label="Pró-labore mensal"><input style={inputStyle} value={config.proLaboreMensal} onChange={(event) => updateConfig('proLaboreMensal', maskCurrency(event.target.value))} /></Field>
            <Field label="Reserva mensal"><input style={inputStyle} value={config.reservaMensal} onChange={(event) => updateConfig('reservaMensal', maskCurrency(event.target.value))} /></Field>
            <Field label="Investimento mensal"><input style={inputStyle} value={config.investimentoMensal} onChange={(event) => updateConfig('investimentoMensal', maskCurrency(event.target.value))} /></Field>
            <Field label="Custo estimado dos adicionais (%)"><input type="number" min="0" max="100" style={inputStyle} value={config.custoAdicionaisPercentual} onChange={(event) => updateConfig('custoAdicionaisPercentual', event.target.value)} /></Field>
            <Field label="Despesas variáveis no rateio mensal (%)"><input type="number" min="0" max="100" style={inputStyle} value={config.rateioVariaveisPercentual} onChange={(event) => updateConfig('rateioVariaveisPercentual', event.target.value)} /></Field>
            <Field label="Valor da hora (custo interno)"><input style={inputStyle} value={config.valorHora} onChange={(event) => updateConfig('valorHora', maskCurrency(event.target.value))} /></Field>
            <Field label="Hora extra de cobertura"><input style={inputStyle} value={config.valorHoraCobertura} onChange={(event) => updateConfig('valorHoraCobertura', maskCurrency(event.target.value))} /></Field>
          </div>
        </DetailsGroup>
        <DetailsGroup title="Faixas comerciais por categoria">
          <div className="sf-config-grid">
            {categories.map((category) => (
              <div className="sf-card" key={category} style={{ padding: 14 }}>
                <strong>{category}</strong>
                <div className="sf-config-grid" style={{ marginTop: 10 }}>
                  <Field label="Mínimo x preço atual"><input type="number" step="0.05" style={inputStyle} value={config.faixasComerciais[category]?.minimo} onChange={(event) => updateConfig(`faixasComerciais.${category}.minimo`, event.target.value)} /></Field>
                  <Field label="Máximo x preço atual"><input type="number" step="0.05" style={inputStyle} value={config.faixasComerciais[category]?.maximo} onChange={(event) => updateConfig(`faixasComerciais.${category}.maximo`, event.target.value)} /></Field>
                </div>
              </div>
            ))}
          </div>
        </DetailsGroup>
        <DetailsGroup title="Bases e coberturas">
          <div className="sf-config-grid">
            {services.map((service) => <Field key={service} label={`Base ${service}`}><input style={inputStyle} value={config.baseServicos[service]} onChange={(event) => updateConfig(`baseServicos.${service}`, maskCurrency(event.target.value))} /></Field>)}
            {coverageOptions.map((coverage) => <Field key={coverage} label={`Fator ${coverage}`}><input type="number" step="0.01" style={inputStyle} value={config.coberturaCasamento[coverage]} onChange={(event) => updateConfig(`coberturaCasamento.${coverage}`, event.target.value)} /></Field>)}
          </div>
        </DetailsGroup>
        <DetailsGroup title="Formatura">
          <div className="sf-config-grid">
            <Field label="Foto de ensaio por aluno"><input style={inputStyle} value={config.formatura.ensaioPorFotoAluno} onChange={(event) => updateConfig('formatura.ensaioPorFotoAluno', maskCurrency(event.target.value))} /></Field>
            <Field label="Cobertura da colacao"><input style={inputStyle} value={config.formatura.coberturaColacao} onChange={(event) => updateConfig('formatura.coberturaColacao', maskCurrency(event.target.value))} /></Field>
            <Field label="Cobertura da festa"><input style={inputStyle} value={config.formatura.coberturaFesta} onChange={(event) => updateConfig('formatura.coberturaFesta', maskCurrency(event.target.value))} /></Field>
            <Field label="Drone"><input style={inputStyle} value={config.formatura.drone} onChange={(event) => updateConfig('formatura.drone', maskCurrency(event.target.value))} /></Field>
            <Field label="Deslocamento"><input style={inputStyle} value={config.formatura.deslocamento} onChange={(event) => updateConfig('formatura.deslocamento', maskCurrency(event.target.value))} /></Field>
          </div>
        </DetailsGroup>
        <DetailsGroup title="Servicos adicionais">
          <div className="sf-config-grid">
            {extras.map((key) => <Field key={key} label={extraLabels[key]}><input style={inputStyle} value={config.extras[key]} onChange={(event) => updateConfig(`extras.${key}`, maskCurrency(event.target.value))} /></Field>)}
          </div>
        </DetailsGroup>
        <DetailsGroup title="Entregas da filmagem">
          <div className="sf-config-grid">
            {filmDeliveryKeys.filter((key) => key !== 'filmeHighlight' && key !== 'documentarioCompleto').map((key) => <Field key={key} label={filmDeliveryLabels[key]}><input style={inputStyle} value={config.filmagemEntregas[key]} onChange={(event) => updateConfig(`filmagemEntregas.${key}`, maskCurrency(event.target.value))} /></Field>)}
            {highlightDurations.filter((item) => item !== 'Personalizado').map((duration) => <Field key={duration} label={`Highlight ${duration}`}><input style={inputStyle} value={config.filmagemEntregas.highlightDuracoes[duration]} onChange={(event) => updateConfig(`filmagemEntregas.highlightDuracoes.${duration}`, maskCurrency(event.target.value))} /></Field>)}
            {documentaryDurations.filter((item) => item !== 'Personalizado').map((duration) => <Field key={duration} label={`Documentario ${duration}`}><input style={inputStyle} value={config.filmagemEntregas.documentarioDuracoes[duration]} onChange={(event) => updateConfig(`filmagemEntregas.documentarioDuracoes.${duration}`, maskCurrency(event.target.value))} /></Field>)}
          </div>
        </DetailsGroup>
        <DetailsGroup title="Corporativo e eventos">
          <div className="sf-config-grid">
            <Field label="Hora corporativa"><input style={inputStyle} value={config.corporativo.valorHora} onChange={(event) => updateConfig('corporativo.valorHora', maskCurrency(event.target.value))} /></Field>
            <Field label="Valor por colaborador"><input style={inputStyle} value={config.corporativo.valorColaborador} onChange={(event) => updateConfig('corporativo.valorColaborador', maskCurrency(event.target.value))} /></Field>
            <Field label="Valor por foto"><input style={inputStyle} value={config.corporativo.valorFoto} onChange={(event) => updateConfig('corporativo.valorFoto', maskCurrency(event.target.value))} /></Field>
            <Field label="Hora de evento"><input style={inputStyle} value={config.eventos.valorHora} onChange={(event) => updateConfig('eventos.valorHora', maskCurrency(event.target.value))} /></Field>
            <Field label="Profissional extra em eventos"><input style={inputStyle} value={config.eventos.valorProfissional} onChange={(event) => updateConfig('eventos.valorProfissional', maskCurrency(event.target.value))} /></Field>
          </div>
        </DetailsGroup>
      </div>
    </section>
  );
}

function Field({ label, children }) {
  return <label className="sf-field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, active, onClick }) {
  const splitAt = label.lastIndexOf(' - ');
  const name = splitAt > 0 ? label.slice(0, splitAt) : label;
  const value = splitAt > 0 ? label.slice(splitAt + 3) : '';
  return <button type="button" aria-pressed={active} className={active ? 'sf-toggle-card active' : 'sf-toggle-card'} onClick={onClick}><span className="sf-toggle-check">{active && <Check size={13} />}</span><span className="sf-toggle-copy"><strong>{name}</strong>{value && <small>{value}</small>}</span></button>;
}

function CollapsibleCard({ title, children, open, onToggle, icon: Icon = ChevronDown }) {
  return (
    <div className="sf-card sf-collapsible-card">
      <button type="button" className="sf-collapsible-header" onClick={onToggle}>
        <span className="metric-label">{Icon !== ChevronDown && <Icon size={18} />}{title}</span>
        <ChevronDown size={18} className={open ? 'open' : ''} />
      </button>
      {open && <div className="sf-collapsible-content">{children}</div>}
    </div>
  );
}

function DetailsGroup({ title, children, open = false }) {
  return (
    <details className="sf-settings-group" open={open}>
      <summary>
        <span>{title}</span>
        <ChevronDown size={16} />
      </summary>
      {children}
    </details>
  );
}

function toggleSection(state, setState, key) {
  setState({
    ...state,
    collapsible: {
      ...state.collapsible,
      [key]: !state.collapsible[key],
    },
  });
}

function toggleStateExtra(state, setState, key) {
  setState({
    ...state,
    extras: state.extras.includes(key) ? state.extras.filter((item) => item !== key) : [...state.extras, key],
  });
}

function Metric({ icon: Icon, label, value, tone = 'neutral' }) {
  const content = typeof value === 'number' ? formatCurrency(value) : value;
  return (
    <div className={`sf-card metric ${tone}`}>
      <div className="metric-label"><Icon size={18} /> {label}</div>
      <strong>{content}</strong>
    </div>
  );
}
