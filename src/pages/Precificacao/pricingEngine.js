const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const clamp = (value, min, max) => Math.min(Math.max(Number(value || 0), min), max);
const round10 = (value) => Math.ceil(Number(value || 0) / 10) * 10;
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const includesPhoto = (service) => String(service || '').includes('Fotografia');
export const includesVideo = (service) => String(service || '').includes('Filmagem');

function essayCaptureHours(state = {}) {
  if (state.ensaioDuracao === '1 hora') return 1;
  if (state.ensaioDuracao === '2 horas') return 2;
  if (state.ensaioDuracao === 'Personalizado') return Math.max(1, Number(state.horas || 1));
  return 4;
}

function weddingCaptureHours(state = {}) {
  return Math.max(1, Number(state.horasCobertura === 'Personalizado' ? state.horasPersonalizadas : state.horasCobertura || 8));
}

function addResult({ category, labor, direct, equipment, structure, taxRate, minimumMargin, targetMargin, marketMin = 0, marketMax = 0, protectionFloor = 0, details = {} }) {
  const operationalCost = labor + direct + equipment + structure;
  const minimumPrice = Math.max(protectionFloor, operationalCost / Math.max(0.35, 1 - taxRate - minimumMargin));
  const technical = operationalCost / Math.max(0.30, 1 - taxRate - targetMargin);
  let recommended = Math.max(minimumPrice, marketMin, technical);
  if (marketMax > 0 && recommended > marketMax && minimumPrice <= marketMax) recommended = marketMax;
  recommended = round10(recommended);
  const taxes = recommended * taxRate;
  const netProfit = recommended - operationalCost - taxes;
  const margin = recommended ? (netProfit / recommended) * 100 : 0;
  return {
    category,
    laborCost: labor,
    directCosts: direct,
    equipmentCost: equipment,
    overheadShare: structure,
    operationalCost,
    minimumPrice,
    technicalPrice: technical,
    recommendedPrice: recommended,
    currentPrice: recommended,
    taxes,
    netProfit,
    grossProfit: recommended - operationalCost,
    margin,
    protectionFloor,
    marketMin,
    marketMax,
    marketStatus: marketMax && recommended > marketMax ? 'above' : recommended < marketMin ? 'below' : 'within',
    breakdown: { labor, direct, equipment, structure, taxRate, minimumMarginRate: minimumMargin, targetMarginRate: targetMargin, ...details },
    totalHours: Number(details.totalHours || 0),
    valuePerStudent: details.students ? recommended / details.students : 0,
    addOnProductionCost: direct,
    currentMargin: margin,
    variationPercent: 0,
    coherence: minimumPrice > marketMax && marketMax > 0 ? 'revisar-custos' : 'coerente',
    serviceWeight: 0,
    capacityPoints: 0,
    monthlyBusinessNeed: 0,
    rateableMonthlyBase: structure,
    variableOverheadRate: 0,
    fixedPerProject: structure,
    variablePerProject: direct,
    netCost: operationalCost + taxes,
    commercialBase: recommended,
    premiumPrice: recommended,
    hourValue: details.totalHours ? recommended / details.totalHours : 0,
    displacementShare: 0,
    depreciationShare: recommended ? equipment / recommended * 100 : 0,
  };
}

function weddingResult(state, config) {
  const hours = weddingCaptureHours(state);
  const photo = includesPhoto(state.service);
  const video = includesVideo(state.service);
  const extras = state.extras || [];
  const crewPhoto = photo ? 1 + (extras.includes('segundoFotografo') ? 1 : 0) : 0;
  const crewVideo = video ? 1 + (extras.includes('segundoFilmmaker') ? 1 : 0) : 0;
  const prep = 2.5;
  const capturePersonHours = hours * Math.max(1, crewPhoto + crewVideo);
  const photoPost = photo ? 2.5 + hours * 0.85 : 0;
  const videoPost = video ? 4 + hours * 1.65 : 0;
  const totalHours = prep + capturePersonHours + photoPost + videoPost + 1.5;
  const labor = totalHours * 55;
  let direct = 0;
  if (extras.includes('segundoFotografo')) direct += 500;
  if (extras.includes('segundoFilmmaker')) direct += 600;
  if (extras.includes('hospedagem')) direct += 500;
  if (extras.includes('alimentacao')) direct += 180;
  if (extras.includes('deslocamento')) direct += 150;
  if (extras.includes('drone')) direct += 180;
  if (extras.includes('preWedding')) direct += 280;
  if (extras.includes('makingOf')) direct += 120;
  const equipment = (photo ? 180 : 0) + (video ? 260 : 0) + Math.max(0, hours - 6) * (video ? 18 : 10);
  const structure = 280 + hours * 28;
  const full = state.cobertura === 'Casamento Completo';
  const marketMin = video ? (hours >= 10 ? 7200 : hours >= 8 ? 6000 : 4300) : (hours >= 8 ? 3200 : 2400);
  const marketMax = video ? (hours >= 10 ? 12000 : hours >= 8 ? 9500 : 7000) : (hours >= 8 ? 6000 : 4500);
  return addResult({ category: 'Casamento', labor, direct, equipment, structure: structure + (full ? 180 : 0), taxRate: 0.06, minimumMargin: 0.12, targetMargin: 0.34, marketMin, marketMax, details: { totalHours, captureHours: hours } });
}

function essayResult(state) {
  const capture = essayCaptureHours(state);
  const photo = includesPhoto(state.service);
  const video = includesVideo(state.service);
  const locations = Math.max(1, Number(state.locacoes || 1));
  const people = Math.max(1, Number(state.pessoasEnsaio || (state.ensaioTipo === 'Familia' ? 4 : 2)));
  const prep = state.ensaioTipo === 'Corporativo' ? 1.2 : 0.7;
  const travel = (state.extras || []).includes('deslocamento') ? 1 : 0.4;
  const photoPost = photo ? 1.2 + capture * 1.15 + Math.max(0, people - 2) * 0.08 : 0;
  const videoPost = video ? 1.8 + capture * 1.8 : 0;
  const capturePersonHours = capture * (photo && video ? 2 : 1);
  const totalHours = prep + travel + capturePersonHours + photoPost + videoPost + 0.8;
  const typeFactor = { Casal: 1, Gestante: 1.05, Familia: 1.10, Feminino: 1, Infantil: 1.08, Corporativo: 1.18, Outro: 1 }[state.ensaioTipo] || 1;
  const labor = totalHours * 45 * typeFactor;
  const direct = Math.max(0, locations - 1) * 70 + (state.ensaioTipo === 'Familia' ? Math.max(0, people - 4) * 25 : 0) + ((state.extras || []).includes('deslocamento') ? 80 : 0);
  const equipment = (photo ? 45 : 0) + (video ? 90 : 0);
  const structure = 85 + Math.max(0, capture - 1) * 25;
  const photoBands = { 1: [650, 950], 2: [850, 1350], 4: [1200, 1800] };
  const videoBands = { 1: [1100, 1550], 2: [1400, 2100], 4: [1900, 2800] };
  const band = (video ? videoBands : photoBands)[capture >= 4 ? 4 : capture >= 2 ? 2 : 1];
  return addResult({ category: 'Ensaio', labor, direct, equipment, structure, taxRate: 0.06, minimumMargin: 0.12, targetMargin: 0.25, marketMin: band[0] * typeFactor, marketMax: band[1] * typeFactor, details: { totalHours, captureHours: capture, people, locations } });
}

function graduationResult(state, config) {
  const students = Math.max(1, Number(state.alunos || 1));
  const ceremonyHours = state.coberturaColacao ? Math.max(1, Number(state.horas || 4)) : 0;
  const photo = includesPhoto(state.service);
  const video = includesVideo(state.service);
  const essay = Boolean(state.preFormatura);
  const ceremony = Boolean(state.coberturaColacao);
  const essayCapture = essay ? Math.max(1.5, students * 0.16) : 0;
  const capturePersonHours = ceremonyHours * (video && photo ? 2 : 1) + essayCapture * (video && photo ? 2 : 1);
  const photoPost = photo ? (ceremony ? ceremonyHours * 0.7 + 1.5 : 0) + (essay ? students * 0.35 + 1.5 : 0) : 0;
  const videoPost = video ? 2.5 + (ceremonyHours + essayCapture) * 1.2 : 0;
  const totalHours = 1.8 + capturePersonHours + photoPost + videoPost + 1;
  const labor = totalHours * 48;
  let direct = students * (essay && ceremony ? 70 : essay ? 55 : 35);
  if (state.droneFormatura) direct += 180;
  if (state.deslocamentoFormatura) direct += 120;
  const equipment = (photo ? 100 : 0) + (video ? 140 : 0);
  const structure = 150 + students * 8 + ceremonyHours * 15;
  const minimumIndividual = Number(config?.formatura?.minimoIndividual ? String(config.formatura.minimoIndividual).replace(/\D/g, '') / 100 : 1800);
  const minimumSmall = Number(config?.formatura?.minimoTurmaPequena ? String(config.formatura.minimoTurmaPequena).replace(/\D/g, '') / 100 : 2400);
  const protectionFloor = students === 1 ? minimumIndividual : students <= 4 ? minimumSmall : 0;
  const perStudentMarket = essay && ceremony ? [400, 600] : ceremony ? [180, 320] : [220, 420];
  const marketMin = students >= 5 ? students * perStudentMarket[0] : protectionFloor;
  const marketMax = students >= 5 ? students * perStudentMarket[1] : Math.max(protectionFloor * 1.5, protectionFloor);
  return addResult({ category: 'Formatura', labor, direct, equipment, structure, taxRate: 0.06, minimumMargin: 0.12, targetMargin: 0.28, marketMin, marketMax, protectionFloor, details: { totalHours, students, ceremonyHours, essayCapture } });
}

function corporateResult(state) {
  const hours = Math.max(1, Number(state.horas || 2));
  const collaborators = Math.max(1, Number(state.colaboradores || 1));
  const photos = Math.max(0, Number(state.fotos || 0));
  const photo = includesPhoto(state.service);
  const video = includesVideo(state.service);
  const capturePersonHours = hours * (photo && video ? 2 : 1);
  const photoPost = photo ? 1.5 + collaborators * 0.1 + photos * 0.02 : 0;
  const videoPost = video ? 2.5 + hours * 1.5 : 0;
  const totalHours = 1.4 + 0.6 + capturePersonHours + photoPost + videoPost + 0.8;
  const labor = totalHours * 52;
  const direct = Math.max(0, collaborators - 1) * 15 + photos * 2.5 + ((state.extras || []).includes('deslocamento') ? 100 : 0);
  const equipment = (photo ? 85 : 0) + (video ? 130 : 0);
  const structure = 160 + hours * 25;
  const marketMin = collaborators <= 2 ? 700 : collaborators <= 10 ? 1200 : 2000;
  const marketMax = collaborators <= 2 ? 1300 : collaborators <= 10 ? 3000 : 5000;
  return addResult({ category: 'Corporativo', labor, direct, equipment, structure, taxRate: 0.06, minimumMargin: 0.12, targetMargin: 0.28, marketMin: video ? marketMin + 600 : marketMin, marketMax: video ? marketMax + 1600 : marketMax, details: { totalHours, collaborators, photos } });
}

function eventResult(state) {
  const hours = Math.max(1, Number(state.horas || 4));
  const professionals = Math.max(1, Number(state.profissionais || 1));
  const photo = includesPhoto(state.service);
  const video = includesVideo(state.service);
  const multiplier = { Aniversarios: 1, Congressos: 1.12, Palestras: 0.95, Shows: 1.25, 'Eventos religiosos': 1, 'Eventos empresariais': 1.12 }[state.eventoTipo] || 1;
  const capturePersonHours = hours * professionals;
  const photoPost = photo ? 1.2 + hours * 0.75 : 0;
  const videoPost = video ? 2.5 + hours * 1.4 : 0;
  const totalHours = 1.4 + 0.8 + capturePersonHours + photoPost + videoPost + 0.8;
  const labor = totalHours * 50 * multiplier;
  const direct = Math.max(0, professionals - 1) * 280 + ((state.extras || []).includes('deslocamento') ? 100 : 0);
  const equipment = ((photo ? 90 : 0) + (video ? 150 : 0)) * multiplier;
  const structure = (170 + hours * 28) * multiplier;
  const baseMin = hours <= 2 ? 850 : hours <= 4 ? 1150 : hours <= 6 ? 1550 : 2100;
  const baseMax = hours <= 2 ? 1400 : hours <= 4 ? 2200 : hours <= 6 ? 3200 : 4500;
  return addResult({ category: 'Eventos', labor, direct, equipment, structure, taxRate: 0.06, minimumMargin: 0.12, targetMargin: 0.27, marketMin: (video ? baseMin + 600 : baseMin) * multiplier, marketMax: (video ? baseMax + 1500 : baseMax) * multiplier, details: { totalHours, professionals, captureHours: hours } });
}

export function calculatePricing({ state, config = {} }) {
  switch (state.categoria) {
    case 'Casamento': return weddingResult(state, config);
    case 'Formatura': return graduationResult(state, config);
    case 'Corporativo': return corporateResult(state, config);
    case 'Eventos': return eventResult(state, config);
    case 'Ensaio':
    default: return essayResult(state, config);
  }
}

const packagePresets = {
  Casamento: [
    ['Wedding Movimento', 'Uma experiência completa, sem pressa, onde a história ganha imagem, som e emoção.'],
    ['Wedding Essência', 'Uma cobertura ampla e sensível para viver o dia com profundidade.'],
    ['Wedding Presença', 'Uma proposta equilibrada para guardar o que realmente importa.'],
    ['Registro Essencial', 'O essencial do grande dia registrado com leveza e intenção.'],
  ],
  Formatura: [
    ['Experiência Completa', 'Ensaio pré-formatura e colação em uma proposta completa.'],
    ['Colação', 'Cobertura dedicada à cerimônia de conclusão.'],
    ['Pré-formatura', 'Ensaio pensado para celebrar a trajetória antes da colação.'],
  ],
  Ensaio: [
    ['Essencial — 1 hora', 'Uma experiência objetiva e sensível.'],
    ['Experiência — 2 horas', 'Mais tempo para criar variedade e conexão.'],
    ['Imersão — sem limite rígido', 'Uma experiência sem pressa e com maior liberdade.'],
  ],
  Corporativo: [
    ['Retrato Essencial — 2 horas', 'Produção objetiva para atualizar a comunicação visual.'],
    ['Identidade — 4 horas', 'Mais variedade de ambientes e narrativas de marca.'],
    ['Campanha — 8 horas', 'Uma diária completa para construir um acervo estratégico.'],
  ],
  Eventos: [
    ['Cobertura Essencial — 2 horas', 'Registro objetivo dos momentos centrais.'],
    ['Cobertura Completa — 4 horas', 'Tempo equilibrado para acompanhar os principais acontecimentos.'],
    ['Cobertura Estendida — 6 horas', 'Cobertura ampla para uma programação mais longa.'],
  ],
};

function bullets(state, index) {
  if (state.categoria === 'Casamento') {
    const hours = weddingCaptureHours(state);
    return [includesPhoto(state.service) && 'Cobertura fotográfica completa', includesVideo(state.service) && 'Cobertura cinematográfica', `Até ${hours} horas de cobertura`, (state.extras || []).includes('preWedding') && 'Ensaio pré-casamento', (state.extras || []).includes('makingOf') && 'Making of', includesVideo(state.service) && 'Filme de highlights', 'Entrega digital em alta resolução'].filter(Boolean);
  }
  if (state.categoria === 'Formatura') {
    const photos = Math.max(1, Number(state.fotosEnsaio || 10));
    return index === 0 ? ['Ensaio pré-formatura', `${photos} fotos por aluno`, 'Cobertura da colação', includesVideo(state.service) && 'Filmagem'].filter(Boolean) : index === 1 ? ['Cobertura da colação', 'Registros individuais e coletivos', includesVideo(state.service) && 'Filmagem'].filter(Boolean) : ['Ensaio pré-formatura', `${photos} fotos por aluno`, 'Direção individual e coletiva'].filter(Boolean);
  }
  if (state.categoria === 'Ensaio') return [index === 0 ? '1 hora de ensaio' : index === 1 ? '2 horas de ensaio' : 'Experiência sem limite rígido', includesPhoto(state.service) && 'Fotos tratadas', includesVideo(state.service) && 'Filme de highlights', 'Entrega digital'].filter(Boolean);
  if (state.categoria === 'Corporativo') return [`${[2,4,8][index]} horas de produção`, `${state.colaboradores || 1} colaboradores`, includesPhoto(state.service) && 'Fotografias tratadas', includesVideo(state.service) && 'Filme institucional'].filter(Boolean);
  return [`${[2,4,6][index]} horas de cobertura`, state.eventoTipo, `${state.profissionais || 1} profissional(is)`, includesPhoto(state.service) && 'Fotografias tratadas', includesVideo(state.service) && 'Filme de highlights'].filter(Boolean);
}

export function enrichOption(option, index = 0) {
  const state = option.state || {};
  const preset = (packagePresets[state.categoria] || packagePresets.Ensaio)[index] || packagePresets.Ensaio[0];
  const price = Number(option.result?.recommendedPrice || option.result?.currentPrice || 0);
  return { ...option, name: preset[0], proposalPackage: { packageIndex: index, packageName: preset[0], description: preset[1], bullets: bullets(state, index), priceValue: price, priceLabel: formatCurrency(price), students: state.categoria === 'Formatura' ? Number(state.alunos || 1) : null } };
}

export function packageCountFor(category) { return category === 'Casamento' ? 4 : 3; }
export function copyPackageText(option) {
  const p = option.proposalPackage || {};
  return [p.packageName, p.priceLabel, '', p.description, '', ...(p.bullets || []).map((item) => `• ${item}`)].join('\n');
}
