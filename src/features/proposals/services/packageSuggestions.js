import { formatCurrency } from '../../../utils/financeEngine';

const normalizeText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const money = (value) => formatCurrency(Number(value || 0));
const includesVideo = (state = {}) => String(state.service || '').includes('Filmagem');
const includesPhoto = (state = {}) => String(state.service || '').includes('Fotografia');
const unique = (items) => [...new Set(items.filter(Boolean))];

const presets = {
  casamento: [
    ['Wedding Movimento', 'Uma experiência completa, sem pressa, onde a história ganha imagem, som e emoção.'],
    ['Wedding Essência', 'Uma cobertura ampla e sensível para viver o dia com profundidade e guardar cada camada da história.'],
    ['Wedding Presença', 'Uma proposta elegante e equilibrada para quem deseja presença, verdade e memória bem contada.'],
    ['Registro Essencial', 'Para registrar com leveza e intenção o essencial do grande dia.'],
  ],
  formatura: [
    ['Experiência Completa', 'Da preparação à conquista: ensaio pré-formatura e cobertura da colação em uma experiência completa.'],
    ['Colação', 'Uma cobertura dedicada à cerimônia de conclusão, com atenção a cada momento importante.'],
    ['Pré-formatura', 'Um ensaio pensado para celebrar a trajetória antes da colação, com direção leve e identidade.'],
  ],
  ensaio: [
    ['Essencial — 1 hora', 'Uma experiência objetiva e sensível para guardar o essencial com beleza e verdade.'],
    ['Experiência — 2 horas', 'Mais tempo para criar variedade, conexão e uma narrativa visual completa.'],
    ['Imersão — sem limite rígido', 'Uma experiência sem pressa, com liberdade para viver o ensaio por inteiro.'],
  ],
  corporativo: [
    ['Retrato Essencial — 2 horas', 'Uma produção objetiva para atualizar a comunicação visual com consistência e profissionalismo.'],
    ['Identidade — 4 horas', 'Mais tempo para construir variedade de imagens, ambientes e narrativas da marca.'],
    ['Campanha — 8 horas', 'Uma diária completa para produzir um acervo amplo e estratégico de comunicação.'],
  ],
  eventos: [
    ['Cobertura Essencial — 2 horas', 'Registro objetivo dos momentos centrais do evento.'],
    ['Cobertura Completa — 4 horas', 'Tempo equilibrado para acompanhar a experiência e os principais acontecimentos.'],
    ['Cobertura Estendida — 6 horas', 'Uma cobertura ampla para eventos com programação mais longa e diversas etapas.'],
  ],
};

function categoryKey(category) {
  const key = normalizeText(category);
  if (key.includes('casamento')) return 'casamento';
  if (key.includes('formatura')) return 'formatura';
  if (key.includes('corporativo')) return 'corporativo';
  if (key.includes('evento')) return 'eventos';
  return 'ensaio';
}

export function suggestedPackageCount(category) {
  return categoryKey(category) === 'casamento' ? 4 : 3;
}

function weddingBullets(state = {}) {
  const hours = String(state.horasCobertura || '').toLowerCase() === 'personalizado' ? Number(state.horasPersonalizadas || 0) : Number(state.horasCobertura || 0);
  const extras = state.extras || [];
  const video = state.filmDeliveries || {};
  return unique([
    includesPhoto(state) ? 'Cobertura fotográfica completa' : null,
    includesPhoto(state) && includesVideo(state) ? 'Camilla + Júnior + equipe de apoio' : 'Camilla + Júnior',
    extras.includes('preWedding') ? 'Ensaio pré-casamento' : null,
    hours ? `Até ${hours} horas de cobertura` : null,
    extras.includes('makingOf') || state.cobertura === 'Casamento Completo' ? 'Making of da noiva e do noivo' : null,
    'Cerimônia e recepção',
    includesVideo(state) && video.teaserInstagram ? 'Teaser do casamento' : null,
    includesVideo(state) ? `Filme de highlights${state.highlightDuration ? ` (${String(state.highlightDuration).toLowerCase()})` : ''}` : null,
    includesPhoto(state) ? 'Todas as fotos tratadas' : null,
    'Entrega digital em alta resolução',
    includesVideo(state) && video.entrega4k ? 'Vídeos entregues em 4K' : null,
  ]);
}

function graduationBullets(state = {}, index = 0) {
  const students = Math.max(1, Number(state.alunos || 1));
  const video = includesVideo(state);
  if (index === 0) return unique([
    'Ensaio pré-formatura',
    `${Math.max(1, Number(state.fotosEnsaio || 10))} fotos tratadas por aluno`,
    'Cobertura da colação de grau',
    'Galeria digital individual',
    'Entrega em alta resolução',
    video ? 'Filmagem da colação' : null,
    `${students} aluno${students === 1 ? '' : 's'} nesta proposta`,
  ]);
  if (index === 1) return unique([
    'Cobertura da colação de grau',
    'Registros individuais e coletivos',
    'Entrega digital em alta resolução',
    video ? 'Filmagem da colação' : null,
    `${students} aluno${students === 1 ? '' : 's'} nesta proposta`,
  ]);
  return unique([
    'Ensaio pré-formatura',
    `${Math.max(1, Number(state.fotosEnsaio || 10))} fotos tratadas por aluno`,
    'Direção individual e coletiva',
    'Galeria digital individual',
    video ? 'Filme curto do ensaio' : null,
    `${students} aluno${students === 1 ? '' : 's'} nesta proposta`,
  ]);
}

function essayBullets(state = {}, index = 0) {
  const duration = index === 0 ? '1 hora de ensaio' : index === 1 ? '2 horas de ensaio' : 'Experiência sem limite rígido de tempo';
  return unique([
    duration,
    includesPhoto(state) ? 'Todas as fotos selecionadas e tratadas' : null,
    'Direção leve e natural',
    'Entrega digital em alta resolução',
    includesVideo(state) ? 'Filme de highlights' : null,
  ]);
}


function corporateBullets(state = {}, index = 0) {
  const hours = [2, 4, 8][index] || Math.max(1, Number(state.horas || 2));
  return unique([
    `${hours} horas de produção`,
    `${Math.max(1, Number(state.colaboradores || 1))} colaborador${Number(state.colaboradores || 1) === 1 ? '' : 'es'}`,
    includesPhoto(state) ? 'Fotografias tratadas em alta resolução' : null,
    includesVideo(state) ? 'Filme institucional ou conteúdo em movimento' : null,
    'Direção e organização da produção',
    'Entrega digital',
  ]);
}

function eventBullets(state = {}, index = 0) {
  const hours = [2, 4, 6][index] || Math.max(1, Number(state.horas || 2));
  return unique([
    `${hours} horas de cobertura`,
    state.eventoTipo || 'Cobertura do evento',
    `${Math.max(1, Number(state.profissionais || 1))} profissional${Number(state.profissionais || 1) === 1 ? '' : 'is'}`,
    includesPhoto(state) ? 'Fotografias tratadas em alta resolução' : null,
    includesVideo(state) ? 'Filme de highlights do evento' : null,
    'Entrega digital',
  ]);
}

function bulletsFor(state, index) {
  const key = categoryKey(state.categoria);
  if (key === 'casamento') return weddingBullets(state);
  if (key === 'formatura') return graduationBullets(state, index);
  if (key === 'corporativo') return corporateBullets(state, index);
  if (key === 'eventos') return eventBullets(state, index);
  return essayBullets(state, index);
}

export function enrichPricingOption(option, index = 0) {
  const state = option?.state || {};
  const result = option?.result || {};
  const key = categoryKey(state.categoria);
  const preset = presets[key][index] || presets[key][0];
  const customPrice = Number(option?.proposalPackage?.priceValue || state.commercialPrice || 0);
  const priceValue = customPrice || Number(result.recommendedPrice || result.currentPrice || 0);
  const students = key === 'formatura' ? Math.max(1, Number(state.alunos || 1)) : null;
  return {
    ...option,
    name: option?.proposalPackage?.customPackageName ? option.proposalPackage.packageName : preset[0],
    proposalPackage: {
      ...(option?.proposalPackage || {}),
      packageIndex: index,
      packageName: option?.proposalPackage?.customPackageName ? option.proposalPackage.packageName : preset[0],
      description: option?.proposalPackage?.customDescription ? option.proposalPackage.description : preset[1],
      bullets: option?.proposalPackage?.customBullets ? option.proposalPackage.bullets : bulletsFor(state, index),
      priceValue,
      priceLabel: money(priceValue),
      students,
      pricePerStudent: students ? priceValue / students : null,
      pricePerStudentLabel: students ? money(priceValue / students) : null,
      totalLabel: money(priceValue),
      category: state.categoria || '',
      service: state.service || state.ensaioTipo || '',
    },
  };
}

export const enrichPricingOptions = (options = []) => (Array.isArray(options) ? options : []).map((item, index) => enrichPricingOption(item, index));

export function getPackageOptionForPage(page, pages = [], options = []) {
  if (!page) return null;
  const raw = normalizeText(`${page.id || ''} ${page.title || ''} ${page.name || ''}`);
  if (/pagamento|condicoes|condições/.test(raw)) return null;
  const packagePages = pages.filter((item) => /pacote|investimento|package/.test(normalizeText(`${item.id || ''} ${item.title || ''} ${item.name || ''}`)) && !/pagamento|condicoes|condições/.test(normalizeText(`${item.id || ''} ${item.title || ''} ${item.name || ''}`)));
  let index = packagePages.findIndex((item) => item.id === page.id);
  const explicit = raw.match(/(?:pacote|package)[-\s]?(\d+)/);
  if (explicit) index = Number(explicit[1]) - 1;
  const normalized = enrichPricingOptions(options);
  return index >= 0 ? (normalized[index] || null) : null;
}
