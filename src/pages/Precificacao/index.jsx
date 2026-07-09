import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BriefcaseBusiness, Calculator, CheckCircle2, ChevronDown, Clock3, DollarSign, Package, Percent, Save, Settings, Sparkles, Video, Wallet } from 'lucide-react';
import {
  FINANCE_STORAGE_KEYS,
  buildFinanceSnapshot,
  calculateDepreciation,
  formatCurrency,
  getTransactionDate,
  getTransactionValue,
  isExpense,
  monthKey,
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
const defaultFilmDeliveries = filmDeliveryKeys.reduce((acc, key) => ({ ...acc, [key]: false }), {
  filmeHighlight: true,
  trailer: true,
  teaserInstagram: true,
  fullHd: true,
  galeriaOnline: true,
});
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

export default function Precificacao() {
  const [state, setState] = useState(() => deepMerge(defaultState, JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.pricing) || 'null')));
  const [pricingConfig, setPricingConfig] = useState(() => deepMerge(defaultConfig, JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.pricingConfig) || 'null')));
  const [data, setData] = useState({ clients: [], transactions: [], equipment: [], balances: {}, config: {} });

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      const db = await getDbStudioData();
      const equipment = db.equipment || [];
      if (!active) return;
      setData({
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

  const result = useMemo(() => {
    const snapshot = buildFinanceSnapshot(data);
    const projectsPerMonth = Math.max(1, Number(pricingConfig.projetosMes || 1));
    const fixedPerProject = snapshot.fixedMonthly / projectsPerMonth;
    const currentMonth = monthKey(new Date());
    const variablePerProject = data.transactions
      .filter((item) => isExpense(item) && item.tipo === 'variavel' && monthKey(getTransactionDate(item)) === currentMonth)
      .reduce((sum, item) => sum + getTransactionValue(item), 0) / projectsPerMonth;
    const selectedEquipment = data.equipment.filter((item) => state.selectedEquipment.includes(item.id));
    const equipmentCost = selectedEquipment.reduce((sum, item) => sum + calculateDepreciation(item).monthlyDepreciation, 0) / projectsPerMonth;
    const totalHours = Object.values(state.time).reduce((sum, value) => sum + Number(value || 0), 0);
    const laborCost = totalHours * moneyToNumber(pricingConfig.valorHora);
    const commercialBase = calculateCommercialBase(state, pricingConfig);
    const extrasTotal = state.extras.reduce((sum, key) => sum + moneyToNumber(pricingConfig.extras[key]), 0);
    const filmDeliveriesTotal = calculateFilmDeliveriesTotal(state, pricingConfig);
    const operationalCost = fixedPerProject + variablePerProject + equipmentCost + laborCost;
    const subtotal = commercialBase + extrasTotal + filmDeliveriesTotal;
    const taxes = subtotal * (Number(pricingConfig.impostoPercentual || 0) / 100);
    const netCost = operationalCost + taxes;
    const minimumPrice = Math.max(subtotal, netCost * 1.08);
    const recommendedPrice = Math.max(minimumPrice, netCost / Math.max(0.01, 1 - Number(pricingConfig.margem || 0) / 100));
    const premiumPrice = recommendedPrice * 1.25;
    const grossProfit = recommendedPrice - subtotal;
    const netProfit = recommendedPrice - netCost;
    const margin = recommendedPrice > 0 ? (netProfit / recommendedPrice) * 100 : 0;
    const displacementShare = recommendedPrice > 0 ? (moneyToNumber(pricingConfig.extras.deslocamento) / recommendedPrice) * 100 : 0;
    const depreciationShare = recommendedPrice > 0 ? (equipmentCost / recommendedPrice) * 100 : 0;

    return {
      fixedPerProject,
      variablePerProject,
      equipmentCost,
      totalHours,
      laborCost,
      operationalCost,
      commercialBase,
      extrasTotal,
      filmDeliveriesTotal,
      subtotal,
      taxes,
      netCost,
      minimumPrice,
      recommendedPrice,
      premiumPrice,
      grossProfit,
      netProfit,
      margin,
      hourValue: totalHours ? recommendedPrice / totalHours : 0,
      displacementShare,
      depreciationShare,
      valuePerStudent: state.categoria === 'Formatura' && Number(state.alunos) > 0 ? recommendedPrice / Number(state.alunos) : 0,
    };
  }, [data, pricingConfig, state]);

  const insights = useMemo(() => buildInsights(result), [result]);
  const costChart = [
    { name: 'Fixos', value: result.fixedPerProject, color: '#c5a059' },
    { name: 'Variaveis', value: result.variablePerProject, color: '#ef4444' },
    { name: 'Equipamentos', value: result.equipmentCost, color: '#2563eb' },
    { name: 'Tempo', value: result.laborCost, color: '#10b981' },
    { name: 'Impostos', value: result.taxes, color: '#f59e0b' },
  ].filter((item) => item.value > 0);
  const priceChart = [
    { name: 'Minimo', valor: result.minimumPrice },
    { name: 'Recomendado', valor: result.recommendedPrice },
    { name: 'Premium', valor: result.premiumPrice },
  ];

  const saveAll = () => {
    localStorage.setItem(FINANCE_STORAGE_KEYS.pricing, JSON.stringify(state));
    localStorage.setItem(FINANCE_STORAGE_KEYS.pricingConfig, JSON.stringify(pricingConfig));
    window.dispatchEvent(new Event('storage'));
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

  return (
    <div className="sf-finance-section">
      <div className="sf-section-header">
        <div>
          <h1>Precificacao</h1>
          <p>Motor inteligente para montar orcamentos por tipo de trabalho, custos reais e margem.</p>
        </div>
        <button className="sf-primary-button" onClick={saveAll}>
          <Save size={18} /> Salvar regras
        </button>
      </div>

      <div className="sf-pricing-shell">
        <main className="sf-pricing-main">
          <Stepper active={state.step} setActive={(step) => setState({ ...state, step })} />
          {state.step === 0 && <WorkStep state={state} setState={setState} />}
          {state.step === 1 && <SpecificStep state={state} setState={setState} config={pricingConfig} />}
          {state.step === 2 && (
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
          )}
          {state.step === 3 && <ResultStep result={result} insights={insights} costChart={costChart} priceChart={priceChart} state={state} />}
          <div className="sf-step-actions">
            <button className="sf-secondary-button" disabled={state.step === 0} onClick={() => setState({ ...state, step: Math.max(0, state.step - 1) })}>Voltar</button>
            <button className="sf-primary-button" onClick={() => setState({ ...state, step: Math.min(3, state.step + 1) })}>Continuar</button>
          </div>
        </main>

        <aside className="sf-pricing-summary">
          <div className="sf-card">
            <div className="metric-label"><Sparkles size={18} /> Resumo em tempo real</div>
            <strong>{formatCurrency(result.recommendedPrice)}</strong>
            <p className="sf-muted">{state.categoria} - {state.service}</p>
            <div className="formula-row"><span>Custo do projeto</span><strong>{formatCurrency(result.netCost)}</strong></div>
            <div className="formula-row"><span>Base comercial</span><strong>{formatCurrency(result.commercialBase)}</strong></div>
            <div className="formula-row"><span>Adicionais</span><strong>{formatCurrency(result.extrasTotal + result.filmDeliveriesTotal)}</strong></div>
            <div className="formula-row"><span>Preco minimo</span><strong>{formatCurrency(result.minimumPrice)}</strong></div>
            <div className="formula-row"><span>Preco premium</span><strong>{formatCurrency(result.premiumPrice)}</strong></div>
            <div className="formula-row"><span>Lucro liquido</span><strong>{formatCurrency(result.netProfit)}</strong></div>
            <div className="formula-row"><span>Margem</span><strong>{result.margin.toFixed(1)}%</strong></div>
            <div className="formula-row"><span>Valor por hora</span><strong>{formatCurrency(result.hourValue)}</strong></div>
            {state.categoria === 'Formatura' && <div className="formula-row"><span>Valor por aluno</span><strong>{formatCurrency(result.valuePerStudent)}</strong></div>}
          </div>

          <div className="sf-card">
            <h3>Consultor</h3>
            {insights.map((item) => (
              <div className={`sf-insight ${item.tone}`} key={item.text}>
                {item.tone === 'good' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <ConfigPanel config={pricingConfig} updateConfig={updateConfig} />
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
  if (result.recommendedPrice < result.netCost) output.push({ tone: 'bad', text: 'Esse orcamento esta abaixo do custo.' });
  if (result.margin < 20) output.push({ tone: 'bad', text: 'A margem esta muito baixa.' });
  if (result.margin >= 35) output.push({ tone: 'good', text: 'Este preco e recomendado.' });
  output.push({ tone: result.netProfit > 0 ? 'good' : 'bad', text: `O lucro liquido previsto e ${formatCurrency(result.netProfit)}.` });
  output.push({ tone: result.displacementShare > 8 ? 'bad' : 'good', text: `O custo do deslocamento representa ${result.displacementShare.toFixed(1)}% do orcamento.` });
  output.push({ tone: result.depreciationShare > 10 ? 'bad' : 'good', text: `A depreciacao dos equipamentos representa ${result.depreciationShare.toFixed(1)}%.` });
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

function ResultStep({ result, insights, costChart, priceChart, state }) {
  return (
    <section className="sf-finance-section">
      <div className="sf-metric-grid">
        <Metric icon={DollarSign} label="Preco minimo" value={result.minimumPrice} />
        <Metric icon={Wallet} label="Preco recomendado" value={result.recommendedPrice} tone="positive" />
        <Metric icon={Sparkles} label="Preco Premium" value={result.premiumPrice} />
        <Metric icon={Percent} label="Margem de lucro" value={`${result.margin.toFixed(1)}%`} />
        <Metric icon={Clock3} label="Valor da hora" value={result.hourValue} />
        <Metric icon={Calculator} label="Custo operacional" value={result.operationalCost} />
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
            <tr><td>Valor total do projeto</td><td>{formatCurrency(result.recommendedPrice)}</td><td>{state.categoria}</td></tr>
            <tr><td>Lucro bruto</td><td>{formatCurrency(result.grossProfit)}</td><td>Preco recomendado - subtotal comercial</td></tr>
            <tr><td>Lucro liquido</td><td>{formatCurrency(result.netProfit)}</td><td>Preco recomendado - custos reais</td></tr>
            <tr><td>Custos fixos</td><td>{formatCurrency(result.fixedPerProject)}</td><td>Financeiro</td></tr>
            <tr><td>Custos variaveis</td><td>{formatCurrency(result.variablePerProject)}</td><td>Financeiro</td></tr>
            <tr><td>Depreciacao</td><td>{formatCurrency(result.equipmentCost)}</td><td>Equipamentos</td></tr>
            <tr><td>Tempo estimado</td><td>{result.totalHours.toFixed(1)}h</td><td>Tempo de trabalho</td></tr>
          </tbody>
        </table>
      </div>
      <div className="sf-card">
        <h3>Leitura inteligente</h3>
        {insights.map((item) => <div className={`sf-insight ${item.tone}`} key={item.text}>{item.tone === 'good' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<span>{item.text}</span></div>)}
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
            <Field label="Projetos por mes"><input type="number" style={inputStyle} value={config.projetosMes} onChange={(event) => updateConfig('projetosMes', event.target.value)} /></Field>
            <Field label="Margem desejada (%)"><input type="number" style={inputStyle} value={config.margem} onChange={(event) => updateConfig('margem', event.target.value)} /></Field>
            <Field label="Impostos (%)"><input type="number" style={inputStyle} value={config.impostoPercentual} onChange={(event) => updateConfig('impostoPercentual', event.target.value)} /></Field>
            <Field label="Valor da hora"><input style={inputStyle} value={config.valorHora} onChange={(event) => updateConfig('valorHora', maskCurrency(event.target.value))} /></Field>
            <Field label="Hora extra de cobertura"><input style={inputStyle} value={config.valorHoraCobertura} onChange={(event) => updateConfig('valorHoraCobertura', maskCurrency(event.target.value))} /></Field>
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
  return <button type="button" className={active ? 'sf-toggle-card active' : 'sf-toggle-card'} onClick={onClick}>{label}</button>;
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
