import { useEffect, useMemo, useState } from 'react';
import './Precificacao.css';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BriefcaseBusiness, Calculator, Check, CheckCircle2, ChevronDown, Clock3, DollarSign, Package, Percent, Plus, Save, Search, Settings, Sparkles, Trash2, Video, Wallet, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FINANCE_STORAGE_KEYS,
  buildFinanceSnapshot,
  calculateDepreciation,
  formatCurrency,
} from '../../utils/financeEngine';
import { maskCurrency } from '../../utils/masks';
import { getDbStudioData, subscribeDbUpdates } from '../../utils/dbData';

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
  corporativo: { valorHora: 'R$ 300,00', valorColaborador: 'R$ 45,00', valorFoto: 'R$ 18,00' },
  eventos: { valorHora: 'R$ 260,00', valorProfissional: 'R$ 500,00' },
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

const buildWorkState = (overrides = {}) => deepMerge(defaultState, overrides);


function getServiceWeight(state) {
  const serviceFactor = state.service === 'Fotografia + Filmagem' ? 1.45 : state.service === 'Filmagem' ? 1.2 : 1;
  if (state.categoria === 'Casamento') {
    const hours = Number(state.horasCobertura === 'Personalizado' ? state.horasPersonalizadas : state.horasCobertura || 8);
    const coverageFactor = state.cobertura === 'Casamento Completo' ? 1.2 : state.cobertura === 'Cerimonia + Festa' ? 1 : 0.72;
    return Math.max(1.6, (hours / 3) * coverageFactor * serviceFactor);
  }
  if (state.categoria === 'Ensaio') {
    const duration = state.ensaioDuracao === '1 hora' ? 0.45 : state.ensaioDuracao === '2 horas' ? 0.65 : 0.9;
    return duration * serviceFactor;
  }
  if (state.categoria === 'Formatura') return Math.max(1.2, Number(state.alunos || 1) / 5) * serviceFactor;
  if (state.categoria === 'Corporativo') return Math.max(0.8, Number(state.horas || 1) / 3) * serviceFactor;
  if (state.categoria === 'Eventos') return Math.max(1, Number(state.horas || 1) / 2.75) * serviceFactor;
  return Math.max(0.7, Number(state.horas || 1) / 3) * serviceFactor;
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function calculatePricingResult({ data, pricingConfig, state }) {
  const snapshot = buildFinanceSnapshot(data);
  const totalHours = Object.values(state.time || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const laborCost = totalHours * moneyToNumber(pricingConfig.valorHora);
  const commercialBase = calculateCommercialBase(state, pricingConfig);
  const extrasTotal = (state.extras || []).reduce((sum, key) => sum + moneyToNumber(pricingConfig.extras[key]), 0);
  const filmDeliveriesTotal = calculateFilmDeliveriesTotal(state, pricingConfig);
  const currentPrice = commercialBase + extrasTotal + filmDeliveriesTotal;

  // A meta mensal completa continua visível para planejamento, mas não é despejada inteira em cada serviço.
  // O pró-labore já é remunerado pelo custo das horas; incluí-lo novamente no rateio criava dupla cobrança.
  // Despesas variáveis mensais entram apenas parcialmente no overhead, porque o restante deve ser lançado
  // como custo direto do trabalho quando realmente ocorrer.
  const monthlyBusinessNeed = snapshot.fixedMonthly
    + snapshot.variableAverage
    + snapshot.equipmentDepreciation
    + moneyToNumber(pricingConfig.proLaboreMensal)
    + moneyToNumber(pricingConfig.reservaMensal)
    + moneyToNumber(pricingConfig.investimentoMensal);
  const variableOverheadRate = clamp(Number(pricingConfig.rateioVariaveisPercentual || 0) / 100, 0, 1);
  const rateableMonthlyBase = snapshot.fixedMonthly
    + (snapshot.variableAverage * variableOverheadRate)
    + moneyToNumber(pricingConfig.reservaMensal)
    + moneyToNumber(pricingConfig.investimentoMensal);
  const capacityPoints = Math.max(1, Number(pricingConfig.capacidadePontos || 1));
  const serviceWeight = getServiceWeight(state);
  const overheadShare = rateableMonthlyBase * (serviceWeight / capacityPoints);

  const selectedEquipment = (data.equipment || []).filter((item) => (state.selectedEquipment || []).includes(item.id));
  const equipmentMonthlyBase = selectedEquipment.length
    ? selectedEquipment.reduce((sum, item) => sum + calculateDepreciation(item).monthlyDepreciation, 0)
    : snapshot.equipmentDepreciation;
  const selectedEquipmentReserve = equipmentMonthlyBase * (serviceWeight / capacityPoints);
  const addOnProductionCost = (extrasTotal + filmDeliveriesTotal) * (Number(pricingConfig.custoAdicionaisPercentual || 0) / 100);
  const operationalCost = overheadShare + laborCost + selectedEquipmentReserve + addOnProductionCost;

  const taxRate = Number(pricingConfig.impostoPercentual || 0) / 100;
  const targetMarginRate = Number(pricingConfig.margem || 0) / 100;
  const minimumMarginRate = Number(pricingConfig.margemMinima || 0) / 100;
  const minimumPrice = operationalCost / Math.max(0.05, 1 - taxRate - minimumMarginRate);
  const technicalPrice = operationalCost / Math.max(0.05, 1 - taxRate - targetMarginRate);

  const range = pricingConfig.faixasComerciais?.[state.categoria] || { minimo: 0.9, maximo: 1.25 };
  const marketMin = currentPrice > 0 ? currentPrice * Number(range.minimo || 0.9) : minimumPrice;
  const marketMax = currentPrice > 0 ? currentPrice * Number(range.maximo || 1.25) : technicalPrice * 1.15;
  const commercialFloor = Math.max(minimumPrice, marketMin);
  const commercialCeiling = Math.max(commercialFloor, marketMax);
  const recommendedPrice = clamp(technicalPrice, commercialFloor, commercialCeiling);
  const premiumPrice = Math.max(recommendedPrice, commercialCeiling);

  const taxes = recommendedPrice * taxRate;
  const netCost = operationalCost + taxes;
  const netProfit = recommendedPrice - netCost;
  const grossProfit = recommendedPrice - operationalCost;
  const margin = recommendedPrice > 0 ? (netProfit / recommendedPrice) * 100 : 0;
  const currentTaxes = currentPrice * taxRate;
  const currentNetProfit = currentPrice - operationalCost - currentTaxes;
  const currentMargin = currentPrice > 0 ? (currentNetProfit / currentPrice) * 100 : 0;
  const variationPercent = currentPrice > 0 ? ((recommendedPrice - currentPrice) / currentPrice) * 100 : 0;
  const coherence = technicalPrice > marketMax * 1.2 ? 'revisar-custos' : technicalPrice < marketMin * 0.8 ? 'mercado-acima' : 'coerente';
  const displacementValue = (state.extras || []).includes('deslocamento') ? moneyToNumber(pricingConfig.extras.deslocamento) : 0;
  const displacementShare = recommendedPrice > 0 ? (displacementValue / recommendedPrice) * 100 : 0;
  const depreciationShare = recommendedPrice > 0 ? (selectedEquipmentReserve / recommendedPrice) * 100 : 0;

  return {
    fixedPerProject: overheadShare,
    variablePerProject: 0,
    equipmentCost: selectedEquipmentReserve,
    totalHours,
    laborCost,
    operationalCost,
    commercialBase,
    extrasTotal,
    filmDeliveriesTotal,
    subtotal: currentPrice,
    currentPrice,
    monthlyBusinessNeed,
    rateableMonthlyBase,
    variableOverheadRate,
    capacityPoints,
    serviceWeight,
    overheadShare,
    addOnProductionCost,
    taxes,
    netCost,
    minimumPrice,
    technicalPrice,
    marketMin,
    marketMax,
    recommendedPrice,
    premiumPrice,
    grossProfit,
    netProfit,
    margin,
    currentMargin,
    variationPercent,
    coherence,
    hourValue: totalHours ? recommendedPrice / totalHours : 0,
    displacementShare,
    depreciationShare,
    valuePerStudent: state.categoria === 'Formatura' && Number(state.alunos) > 0 ? recommendedPrice / Number(state.alunos) : 0,
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
  const [state, setState] = useState(() => deepMerge(defaultState, JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.pricing) || 'null')));
  const [pricingConfig, setPricingConfig] = useState(() => deepMerge(defaultConfig, JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.pricingConfig) || 'null')));
  const [data, setData] = useState({ leads: [], clients: [], transactions: [], equipment: [], balances: {}, config: {} });
  const [savedOptions, setSavedOptions] = useState(() => JSON.parse(localStorage.getItem('cv_studio_pricing_options') || '[]'));
  const [proposalFlowOpen, setProposalFlowOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState(() => String(leadContext?.id || ''));
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedScenario, setSelectedScenario] = useState(() => localStorage.getItem(scenarioStorageKey) || scenarioOptions[0]);
  const [capacity, setCapacity] = useState(() => JSON.parse(localStorage.getItem(capacityStorageKey) || 'null') || defaultCapacity);
  const [selectedRowId, setSelectedRowId] = useState('casamento-6h');

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
        balances: JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.balances) || '{"salario":0,"empresa":0,"reserva":0}'),
        config: JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.config) || '{"salario":35,"empresa":45,"reserva":20}'),
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

  const snapshot = useMemo(() => buildFinanceSnapshot(data), [data]);
  const result = useMemo(() => calculatePricingResult({ data, pricingConfig, state }), [data, pricingConfig, state]);
  const insights = useMemo(() => buildInsights(result), [result]);
  const overviewRows = useMemo(() => buildOverviewRows(pricingConfig, data), [pricingConfig, data]);

  const selectedOverviewRow = overviewRows.find((item) => item.id === selectedRowId) || overviewRows[0] || null;
  const selectedLead = data.leads.find((lead) => String(lead.id) === selectedLeadId) || leadContext;
  const filteredLeads = data.leads.filter((lead) => String(lead.nome || lead.name || '').toLowerCase().includes(leadSearch.toLowerCase()));
  const suggestedModel = String(selectedLead?.tipoServico || selectedLead?.service || state.categoria).toLowerCase().includes('cas')
    ? 'proposta-casamento-2026'
    : String(selectedLead?.tipoServico || selectedLead?.service || state.categoria).toLowerCase().includes('form')
      ? 'proposta-formatura-individual-2026'
      : 'proposta-casal-2026';

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
    localStorage.setItem(FINANCE_STORAGE_KEYS.pricing, JSON.stringify(state));
    localStorage.setItem(FINANCE_STORAGE_KEYS.pricingConfig, JSON.stringify(pricingConfig));
    window.dispatchEvent(new Event('storage'));
  };

  const buildOption = () => ({ id: `option-${Date.now()}`, name: `Opção ${savedOptions.length + 1}`, state: structuredClone(state), result: { ...result }, createdAt: new Date().toISOString() });
  const saveCurrentOption = () => {
    const next = [...savedOptions, buildOption()];
    setSavedOptions(next);
    localStorage.setItem('cv_studio_pricing_options', JSON.stringify(next));
    saveAll();
  };
  const createAnotherOption = () => {
    saveCurrentOption();
    setState((current) => ({
      ...deepMerge(defaultState, current),
      extras: [],
      filmDeliveries: { ...defaultFilmDeliveries },
      step: 0,
    }));
    setActiveTab('services');
  };
  const continueToProposal = () => {
    if (!savedOptions.length) saveCurrentOption();
    setSelectedLeadId((current) => current || String(leadContext?.id || ''));
    setProposalFlowOpen(true);
  };
  const openProposal = () => {
    if (!selectedLead) return;
    saveAll();
    navigate('/propostas/editor', { state: { lead: selectedLead, modelId: suggestedModel, pricingOptions: savedOptions.length ? savedOptions : [buildOption()] } });
  };

  const loadOption = (option) => {
    if (!option?.state) return;
    setState((current) => ({
      ...deepMerge(defaultState, option.state),
      selectedEquipment: option.state.selectedEquipment?.length ? option.state.selectedEquipment : current.selectedEquipment,
    }));
    setActiveTab('services');
  };

  const removeOption = (optionId) => {
    const next = savedOptions.filter((option) => option.id !== optionId);
    setSavedOptions(next);
    localStorage.setItem('cv_studio_pricing_options', JSON.stringify(next));
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
      ...deepMerge(defaultState, null),
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
      ...deepMerge(defaultState, row.state),
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

  const activeStepContent = state.step === 0
    ? <WorkStep state={state} setState={setState} />
    : state.step === 1
      ? <SpecificStep state={state} setState={setState} config={pricingConfig} />
      : state.step === 2
        ? (
          <CostStep
            state={state}
            setState={setState}
            config={pricingConfig}
            setConfig={setPricingConfig}
            toggleExtra={toggleExtra}
            toggleEquipment={toggleEquipment}
            equipment={data.equipment}
            result={result}
          />
        )
        : <ResultStep result={result} insights={insights} costChart={costChart} priceChart={priceChart} savedOptions={savedOptions} onSaveOption={saveCurrentOption} onCreateAnother={createAnotherOption} onContinue={continueToProposal} />;

  return (
    <div className="sf-finance-section sf-pricing-screen">
      <div className="sf-section-header sf-pricing-topbar">
        <div>
          <h1>Precificação</h1>
          <p>Descubra quanto cada serviço precisa custar para pagar sua operação, remunerar seu trabalho e gerar lucro.</p>
        </div>
        <div className="sf-pricing-toolbar-actions">
          <select className="sf-scenario-select" value={selectedScenario} onChange={(event) => setSelectedScenario(event.target.value)}>
            {scenarioOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
          <button type="button" className="sf-secondary-button" onClick={startNewSimulation}><Plus size={17} /> Nova simulação</button>
          <button type="button" className="sf-secondary-button" onClick={saveAll}><Save size={17} /> Salvar cenário</button>
          <button type="button" className="sf-primary-button" onClick={() => setActiveTab('services')}><Package size={17} /> Criar pacote</button>
        </div>
      </div>

      {leadContext && (
        <div className="sf-alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <span>Orçamento para <strong>{leadContext.nome}</strong> · {leadContext.tipoServico || 'Serviço não informado'}</span>
          <button type="button" className="sf-secondary-button" onClick={() => navigate('/crm')}>Voltar ao CRM</button>
        </div>
      )}

      <div className="sf-pricing-kpi-grid">
        <Metric icon={Calculator} label="Custo mensal da empresa" value={companyMonthlyCost} />
        <Metric icon={Wallet} label="Pró-labore projetado" value={snapshot.projectedDistribution?.salario || 0} />
        <Metric icon={Sparkles} label="Lucro projetado" value={snapshot.monthlyProfit || 0} tone={(snapshot.monthlyProfit || 0) >= 0 ? 'positive' : 'warning'} />
        <Metric icon={DollarSign} label="Faturamento mínimo mensal" value={targetRevenue} />
        <Metric icon={Percent} label="Ticket médio necessário" value={targetTicket} />
      </div>

      <div className="sf-pricing-layout">
        <div className="sf-pricing-content">
          <div className="sf-pricing-tabbar">
            <button type="button" className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Visão geral</button>
            <button type="button" className={activeTab === 'costs' ? 'active' : ''} onClick={() => setActiveTab('costs')}>Custos</button>
            <button type="button" className={activeTab === 'services' ? 'active' : ''} onClick={() => setActiveTab('services')}>Serviços e pacotes</button>
            <button type="button" className={activeTab === 'simulations' ? 'active' : ''} onClick={() => setActiveTab('simulations')}>Simulações</button>
          </div>

          {activeTab === 'overview' && (
            <>
              <div className="sf-card sf-capacity-card">
                <div className="sf-pricing-section-head">
                  <div>
                    <h3>Capacidade produtiva mensal</h3>
                    <p>Use esta visão para comparar a meta do mês com sua capacidade real de execução.</p>
                  </div>
                </div>
                <div className="sf-capacity-grid">
                  <Field label="Dias disponíveis"><input type="number" min="1" style={inputStyle} value={capacity.diasDisponiveis} onChange={(event) => setCapacity((current) => ({ ...current, diasDisponiveis: event.target.value }))} /></Field>
                  <Field label="Casamentos"><input type="number" min="0" style={inputStyle} value={capacity.casamentos} onChange={(event) => setCapacity((current) => ({ ...current, casamentos: event.target.value }))} /></Field>
                  <Field label="Ensaios de casal"><input type="number" min="0" style={inputStyle} value={capacity.ensaios} onChange={(event) => setCapacity((current) => ({ ...current, ensaios: event.target.value }))} /></Field>
                  <Field label="Gestantes"><input type="number" min="0" style={inputStyle} value={capacity.gestantes} onChange={(event) => setCapacity((current) => ({ ...current, gestantes: event.target.value }))} /></Field>
                  <Field label="Filmagens avulsas"><input type="number" min="0" style={inputStyle} value={capacity.filmagensAvulsas} onChange={(event) => setCapacity((current) => ({ ...current, filmagensAvulsas: event.target.value }))} /></Field>
                  <div className="sf-capacity-total">
                    <span>Capacidade total estimada</span>
                    <strong>{capacityTotal}</strong>
                    <small>trabalhos/mês</small>
                  </div>
                </div>
                <div className={`sf-capacity-alert ${capacityGap >= 0 ? 'good' : 'bad'}`}>
                  {capacityGap >= 0
                    ? `Sua capacidade atual comporta a meta de ${projectsPerMonth} projeto(s) por mês.`
                    : `Sua meta atual exige ${Math.abs(capacityGap)} projeto(s) a mais por mês. Revise a capacidade ou o ticket médio.`}
                </div>
              </div>

              <div className="sf-card sf-pricing-table-card">
                <div className="sf-pricing-section-head">
                  <div>
                    <h3>Preço sustentável por serviço</h3>
                    <p>Selecione uma linha para ver o detalhamento completo e use a opção como base para a simulação.</p>
                  </div>
                </div>
                <div className="sf-pricing-table-wrapper">
                  <table className="sf-pricing-table">
                    <thead>
                      <tr>
                        <th>Serviço</th>
                        <th>Horas totais</th>
                        <th>Custo direto</th>
                        <th>Custo operacional</th>
                        <th>Preço mínimo</th>
                        <th>Preço recomendado</th>
                        <th>Preço atual</th>
                        <th>Margem no recomendado</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {overviewRows.map((row) => (
                        <tr key={row.id} className={selectedRowId === row.id ? 'is-selected' : ''} onClick={() => setSelectedRowId(row.id)}>
                          <td>
                            <strong>{row.title}</strong>
                            <small>{row.subtitle}</small>
                          </td>
                          <td>{row.result.totalHours.toFixed(0)}h</td>
                          <td>{formatCurrency(row.directCost)}</td>
                          <td>{formatCurrency(row.operationalCost)}</td>
                          <td>{formatCurrency(row.result.minimumPrice)}</td>
                          <td>{formatCurrency(row.result.recommendedPrice)}</td>
                          <td>{formatCurrency(row.currentPrice)}</td>
                          <td>
                            <span className={`sf-margin-badge ${row.result.margin >= 20 ? 'good' : row.result.margin >= 10 ? 'warning' : 'bad'}`}>{row.result.margin.toFixed(1)}%</span>
                          </td>
                          <td><button type="button" className="sf-table-link" onClick={(event) => { event.stopPropagation(); applyOverviewPreset(row); }}>Usar</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="sf-table-legend">
                  <span><i className="dot good" /> Margem saudável (&gt;20%)</span>
                  <span><i className="dot warning" /> Margem apertada (10% a 20%)</span>
                  <span><i className="dot bad" /> Abaixo do mínimo (&lt;10%)</span>
                </div>
              </div>
            </>
          )}

          {activeTab === 'costs' && (
            <div className="sf-pricing-two-column">
              <div className="sf-pricing-stack">
                <div className="sf-card">
                  <div className="sf-pricing-section-head">
                    <div>
                      <h3>Custos do serviço atual</h3>
                      <p>Ajuste tempo, adicionais e equipamentos sem sair da tela de precificação.</p>
                    </div>
                  </div>
                  <CostStep
                    state={state}
                    setState={setState}
                    config={pricingConfig}
                    setConfig={setPricingConfig}
                    toggleExtra={toggleExtra}
                    toggleEquipment={toggleEquipment}
                    equipment={data.equipment}
                    result={result}
                  />
                </div>
              </div>
              <div className="sf-pricing-stack">
                <ConfigPanel config={pricingConfig} updateConfig={updateConfig} />
              </div>
            </div>
          )}

          {activeTab === 'services' && (
            <div className="sf-pricing-two-column">
              <div className="sf-pricing-stack">
                <div className="sf-card sf-builder-card">
                  <div className="sf-pricing-section-head">
                    <div>
                      <h3>Monte o serviço</h3>
                      <p>Configure o trabalho, os adicionais e avance até a proposta em PDF.</p>
                    </div>
                    <button type="button" className="sf-secondary-button" onClick={saveAll}><Save size={16} /> Salvar regras</button>
                  </div>
                  <Stepper active={state.step} setActive={(step) => setState({ ...state, step })} />
                  <div className="sf-builder-body">{activeStepContent}</div>
                  <div className="sf-step-actions">
                    <button className="sf-secondary-button" disabled={state.step === 0} onClick={() => setState({ ...state, step: Math.max(0, state.step - 1) })}>Voltar</button>
                    {state.step < 3 && <button className="sf-primary-button" onClick={() => setState({ ...state, step: state.step + 1 })}>Continuar</button>}
                  </div>
                </div>
              </div>
              <div className="sf-pricing-stack">
                <div className="sf-card">
                  <div className="sf-pricing-section-head">
                    <div>
                      <h3>Pacotes salvos</h3>
                      <p>Salve variações antes de gerar o orçamento final.</p>
                    </div>
                    <div className="sf-saved-option-actions">
                      {savedOptions.length > 0 && <button type="button" className="sf-table-link danger" onClick={clearSavedOptions}><Trash2 size={15} /> Apagar todas</button>}
                      <button type="button" className="sf-secondary-button" onClick={saveCurrentOption}><Save size={16} /> Salvar opção</button>
                    </div>
                  </div>
                  <div className="sf-saved-options-list">
                    {!savedOptions.length && <p className="sf-muted">Nenhuma opção salva até agora.</p>}
                    {savedOptions.map((option) => (
                      <div key={option.id} className="sf-saved-option-item">
                        <div>
                          <strong>{option.name}</strong>
                          <small>{new Date(option.createdAt).toLocaleDateString('pt-BR')} · {formatCurrency(option.result?.recommendedPrice || 0)}</small>
                        </div>
                        <div className="sf-saved-option-actions">
                          <button type="button" className="sf-table-link" onClick={() => loadOption(option)}>Carregar</button>
                          <button type="button" className="sf-table-link danger" onClick={() => removeOption(option.id)}>Remover</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="sf-card sf-action-card">
                  <h3>Gerar orçamento</h3>
                  <p className="sf-muted">Continue para o fluxo de orçamento e abra o editor com o modelo sugerido.</p>
                  <button type="button" className="sf-primary-button" onClick={continueToProposal}><Sparkles size={16} /> Gerar orçamento</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'simulations' && (
            <div className="sf-pricing-stack">
              <div className="sf-card">
                <div className="sf-pricing-section-head">
                  <div>
                    <h3>Resultado da simulação</h3>
                    <p>Analise a escada de preço, a composição de custos e a margem antes de seguir para a proposta.</p>
                  </div>
                </div>
                <ResultStep result={result} insights={insights} costChart={costChart} priceChart={priceChart} savedOptions={savedOptions} onSaveOption={saveCurrentOption} onCreateAnother={createAnotherOption} onContinue={continueToProposal} />
              </div>
              <div className="sf-card">
                <div className="sf-pricing-section-head">
                  <div><h3>Simulações salvas</h3><p>Carregue uma alternativa ou apague as simulações que não deseja mais manter.</p></div>
                  {savedOptions.length > 0 && <button type="button" className="sf-table-link danger" onClick={clearSavedOptions}><Trash2 size={15} /> Apagar todas</button>}
                </div>
                <div className="sf-saved-options-list">
                  {!savedOptions.length && <p className="sf-muted">Nenhuma simulação salva.</p>}
                  {savedOptions.map((option) => (
                    <div key={option.id} className="sf-saved-option-item">
                      <div><strong>{option.name}</strong><small>{new Date(option.createdAt).toLocaleDateString('pt-BR')} · {formatCurrency(option.result?.recommendedPrice || 0)}</small></div>
                      <div className="sf-saved-option-actions">
                        <button type="button" className="sf-table-link" onClick={() => loadOption(option)}>Carregar</button>
                        <button type="button" className="sf-table-link danger" onClick={() => removeOption(option.id)}><Trash2 size={14} /> Apagar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="sf-pricing-inspector">
          <div className="sf-card sf-inspector-card">
            <div className="sf-inspector-head">
              <div>
                <h3>{detailContext.title}</h3>
                <p>{detailContext.subtitle}</p>
              </div>
              {activeTab === 'overview' && selectedOverviewRow && <button type="button" className="sf-secondary-button" onClick={() => applyOverviewPreset(selectedOverviewRow)}>Usar na simulação</button>}
            </div>
            <div className="sf-inspector-section">
              <div className="sf-inspector-tabs">
                <span className="active">Composição</span>
                <span>Simular preço</span>
              </div>
              <div className="sf-inspector-list">
                <div className="sf-inspector-block-title">1. Tempo dedicado <strong>Total: {detailContext.result.totalHours.toFixed(0)}h</strong></div>
                {timeFields.map(([key, label]) => (
                  <div className="formula-row" key={key}><span>{label}</span><strong>{Number(detailContext.time?.[key] || 0).toFixed(1)}h</strong></div>
                ))}
              </div>
            </div>
            <div className="sf-inspector-section">
              <div className="sf-inspector-block-title">2. Custos diretos <strong>Total: {formatCurrency(detailContext.result.laborCost + detailContext.result.equipmentCost + detailContext.result.addOnProductionCost)}</strong></div>
              <div className="formula-row"><span>Tempo de produção</span><strong>{formatCurrency(detailContext.result.laborCost)}</strong></div>
              <div className="formula-row"><span>Equipamentos</span><strong>{formatCurrency(detailContext.result.equipmentCost)}</strong></div>
              <div className="formula-row"><span>Produção dos adicionais</span><strong>{formatCurrency(detailContext.result.addOnProductionCost)}</strong></div>
              <div className="formula-row"><span>Impostos no preço recomendado</span><strong>{formatCurrency(detailContext.result.taxes)}</strong></div>
            </div>
            <div className="sf-inspector-section">
              <div className="sf-inspector-block-title">3. Distribuição do valor <strong>Preço atual: {formatCurrency(detailContext.currentPrice)}</strong></div>
              <div className="formula-row"><span>Custos diretos</span><strong>{formatCurrency(detailContext.result.laborCost + detailContext.result.equipmentCost + detailContext.result.addOnProductionCost)}</strong></div>
              <div className="formula-row"><span>Custos operacionais</span><strong>{formatCurrency(detailContext.result.operationalCost)}</strong></div>
              <div className="formula-row"><span>Lucro líquido</span><strong>{formatCurrency(detailContext.result.netProfit)}</strong></div>
              <div className="formula-row"><span>Reserva / margem</span><strong>{detailContext.result.margin.toFixed(1)}%</strong></div>
            </div>
            <div className="sf-inspector-metrics">
              <div><small>Valor por hora real</small><strong>{formatCurrency(detailContext.result.hourValue)}</strong></div>
              <div><small>Margem líquida</small><strong>{detailContext.result.margin.toFixed(1)}%</strong></div>
              <div><small>Lucro por trabalho</small><strong>{formatCurrency(detailContext.result.netProfit)}</strong></div>
            </div>
            <button type="button" className="sf-secondary-button sf-full-width" onClick={() => setActiveTab('services')}>Editar serviço</button>
          </div>
        </aside>
      </div>

      {proposalFlowOpen && <div className="sf-proposal-flow-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProposalFlowOpen(false); }}>
        <section className="sf-proposal-flow" role="dialog" aria-modal="true" aria-labelledby="proposal-flow-title">
          <header><div><span>Próxima etapa</span><h2 id="proposal-flow-title">Selecionar lead</h2></div><button type="button" aria-label="Fechar" onClick={() => setProposalFlowOpen(false)}><X /></button></header>
          {leadContext && <p className="sf-flow-hint"><Check size={16} /> Lead vindo do CRM pré-selecionado. Você pode trocá-lo.</p>}
          <label className="sf-lead-search"><Search size={17} /><input value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Pesquisar lead pelo nome" autoFocus /></label>
          <div className="sf-lead-options">{filteredLeads.map((lead) => <button type="button" key={lead.id} className={String(lead.id) === selectedLeadId ? 'active' : ''} onClick={() => setSelectedLeadId(String(lead.id))}><span><strong>{lead.nome || lead.name}</strong><small>{lead.tipoServico || lead.service || 'Serviço não informado'}</small></span>{String(lead.id) === selectedLeadId && <Check />}</button>)}{!filteredLeads.length && <p className="sf-muted">Nenhum lead encontrado.</p>}</div>
          {selectedLead && <div className="sf-model-suggestion"><span>Modelo sugerido</span><strong>{suggestedModel.includes('casamento') ? 'Casamento 2026' : suggestedModel.includes('formatura') ? 'Formatura individual 2026' : 'Ensaio de casal 2026'}</strong></div>}
          <footer><button type="button" className="sf-secondary-button" onClick={() => setProposalFlowOpen(false)}>Cancelar</button><button type="button" className="sf-primary-button" disabled={!selectedLead} onClick={openProposal}>Abrir proposta</button></footer>
        </section>
      </div>}
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
    return moneyToNumber(config.ensaios[state.service]?.[state.ensaioDuracao]);
  }
  if (state.categoria === 'Formatura') {
    const students = Math.max(1, Number(state.alunos || 1));
    const tier = config.formaturaFaixas.find((item) => students >= Number(item.min) && students <= Number(item.max)) || config.formaturaFaixas[0];
    let value = students * moneyToNumber(tier.valor);
    if (state.service !== 'Fotografia') value += moneyToNumber(config.baseServicos[state.service]) * 0.45;
    if (state.preFormatura) value += students * Math.max(0, Number(state.fotosEnsaio || 0)) * moneyToNumber(config.formatura.ensaioPorFotoAluno);
    if (state.coberturaColacao) value += moneyToNumber(config.formatura.coberturaColacao);
    if (state.festa) value += moneyToNumber(config.formatura.coberturaFesta);
    if (state.droneFormatura) value += moneyToNumber(config.formatura.drone);
    if (state.deslocamentoFormatura) value += moneyToNumber(config.formatura.deslocamento);
    return value;
  }
  if (state.categoria === 'Corporativo') {
    return Number(state.horas || 0) * moneyToNumber(config.corporativo.valorHora) + Number(state.colaboradores || 0) * moneyToNumber(config.corporativo.valorColaborador) + Number(state.fotos || 0) * moneyToNumber(config.corporativo.valorFoto);
  }
  if (state.categoria === 'Eventos') {
    return Number(state.horas || 0) * moneyToNumber(config.eventos.valorHora) + Number(state.profissionais || 1) * moneyToNumber(config.eventos.valorProfissional) + moneyToNumber(config.baseServicos[state.service]) * 0.45;
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
            {weddingHours.map((item) => <option key={item}>{item}</option>)}
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
              <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }} />
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
              <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }} />
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
