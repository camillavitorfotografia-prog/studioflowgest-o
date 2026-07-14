import { createId } from '../utils/documentIds';

export const CONTRACT_BLUEPRINT_VERSION = 9;

export const CONTRACT_FIELD_OPTIONS = [
  'client.name','client.document','client.rg','client.phone','client.email','client.address',
  'studio.name','studio.document','studio.phone','studio.email','studio.address','studio.pix',
  'work.type','work.date','work.startTime','work.endTime','work.location','work.city','work.preWeddingLocation',
  'coverage.duration','package.photoQuantity','package.galleryIncluded','package.services',
  'pricing.total','pricing.deposit','pricing.balance','pricing.paymentMethod','pricing.installments',
  'pricing.firstDueDate','pricing.paymentConditions','pricing.extraPhotoValue',
  'signature.city','signature.date','signature.client','signature.studio','signature.witness1','signature.witness2',
  'graduation.course','graduation.institution','graduation.students','wedding.coupleNames','schedule.time',
];

const W = 595.28;
const H = 841.89;

const COLORS = {
  paper: '#fffdf9',
  cream: '#fbf5ef',
  blush: '#ecd2c2',
  blushLight: '#f7e9df',
  terracotta: '#a65f42',
  terracottaDark: '#7d402a',
  bronze: '#c08b6e',
  ink: '#2d2724',
  muted: '#766961',
  line: '#dfc7b7',
  white: '#ffffff',
};

const base = (type, options = {}) => ({
  id: createId(type),
  type,
  x: options.x ?? 0,
  y: options.y ?? 0,
  width: options.width ?? 100,
  height: options.height ?? 100,
  rotation: options.rotation ?? 0,
  opacity: options.opacity ?? 1,
  zIndex: options.zIndex ?? 1,
  locked: options.locked ?? false,
  visible: options.visible ?? true,
  metadata: {
    editable: true,
    ...(options.metadata || {}),
  },
});

const text = (content, options = {}) => ({
  ...base('text', options),
  content,
  fontFamily: options.fontFamily || 'Helvetica',
  fontSize: options.fontSize ?? 10.5,
  fontWeight: options.fontWeight || '400',
  fontStyle: options.fontStyle || 'normal',
  color: options.color || COLORS.ink,
  align: options.align || 'left',
  lineHeight: options.lineHeight ?? 1.4,
  letterSpacing: options.letterSpacing ?? 0,
  textTransform: 'none',
  hideIfEmpty: false,
});

const shape = (options = {}) => ({
  ...base('overlay', options),
  backgroundColor:
    options.backgroundColor || COLORS.blushLight,
  borderColor:
    options.borderColor || 'transparent',
  borderWidth:
    options.borderWidth ?? 0,
  borderRadius:
    options.borderRadius ?? 0,
});

const logo = () => ({
  ...base('logo', {
    x: 148,
    y: 54,
    width: 300,
    height: 170,
    zIndex: 8,
  }),
  src: '',
  alt: 'Logomarca do estúdio',
  objectFit: 'contain',
  objectPositionX: 50,
  objectPositionY: 50,
  imageScale: 1,
  preserveAspectRatio: true,
});

const line = (
  x,
  y,
  width,
  color = COLORS.line,
  height = 1,
) => shape({
  x,
  y,
  width,
  height,
  backgroundColor: color,
});

const ornament = (
  x,
  y,
  width = 40,
  height = 22,
  color = COLORS.bronze,
) => text('❦', {
  x,
  y,
  width,
  height,
  fontFamily: 'Georgia',
  fontSize: 18,
  color,
  align: 'center',
  lineHeight: 1,
  zIndex: 7,
});

const sectionNumber = (
  value,
  x,
  y,
) => [
  shape({
    x,
    y,
    width: 34,
    height: 34,
    backgroundColor: COLORS.blush,
    borderColor: '#d8b29b',
    borderWidth: 1,
    borderRadius: 17,
    zIndex: 4,
    metadata: {
      role: 'section-number-circle',
    },
  }),
  text(String(value).padStart(2, '0'), {
    x,
    y,
    width: 34,
    height: 34,
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.terracottaDark,
    align: 'center',
    lineHeight: 1,
    zIndex: 5,
    metadata: {
      role: 'section-number',
    },
  }),
];

const page = (name, order, elements) => ({
  id: createId('contract-page'),
  name,
  order,
  active: true,
  width: W,
  height: H,
  background: {
    type: 'color',
    color: COLORS.paper,
    opacity: 1,
    url: null,
  },
  elements,
  metadata: {
    fixedLegalContent: false,
    editableLegalContent: true,
    preservesOriginalText: true,
    designSystem: 'editorial-premium-v8',
  },
});

const exactSections = (
  content,
  markers = [],
) => {
  const found = markers
    .map((marker) => ({
      marker,
      index: content.indexOf(marker),
    }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);

  if (!found.length) return [content];

  const result = [];

  if (found[0].index > 0) {
    result.push(content.slice(0, found[0].index));
  }

  found.forEach((item, index) => {
    const next = found[index + 1];
    result.push(
      content.slice(
        item.index,
        next ? next.index : content.length,
      ),
    );
  });

  return result.filter(Boolean);
};

const fitFont = (
  value,
  min = 9,
  max = 11,
) => {
  const length = String(value || '').length;

  if (length <= 850) return max;
  if (length >= 2400) return min;

  const ratio = (2400 - length) / 1550;
  return Number(
    (min + ((max - min) * ratio)).toFixed(2),
  );
};

const extractSectionTitle = (section) => {
  const lines = String(section || '').split('\n');
  const titleLines = [];

  for (const lineValue of lines) {
    const line = lineValue.trim();

    if (!line) {
      if (titleLines.length) break;
      continue;
    }

    const isHeading = (
      titleLines.length < 3
      && line.length <= 55
      && (
        line === line.toUpperCase()
        || line.startsWith('ANEXO ')
      )
    );

    if (!isHeading) break;

    titleLines.push(lineValue);
  }

  const title = titleLines.join('\n').trim();
  const body = title
    ? section.slice(
        section.indexOf(titleLines[titleLines.length - 1])
        + titleLines[titleLines.length - 1].length,
      ).replace(/^\s+/, '')
    : section;

  return {
    title,
    body,
  };
};

const coverPage = (content, index) => {
  const lines = content.split('\n');
  const yearLine = lines.find(
    (lineValue) => /^20\d{2}$/.test(lineValue.trim()),
  ) || '';
  const title = lines
    .filter((lineValue) => lineValue !== yearLine)
    .join('\n');

  return page('Capa', index, [
    shape({
      x: 0,
      y: 0,
      width: W,
      height: H,
      backgroundColor: COLORS.paper,
    }),
    shape({
      x: 0,
      y: 0,
      width: 118,
      height: H,
      backgroundColor: '#f0dfd3',
    }),
    shape({
      x: 0,
      y: 0,
      width: 68,
      height: H,
      backgroundColor: '#e6d0c0',
      opacity: 0.72,
    }),
    shape({
      x: 25,
      y: 22,
      width: 545,
      height: 797,
      backgroundColor: 'transparent',
      borderColor: '#ddc2b0',
      borderWidth: 1,
      borderRadius: 2,
    }),
    shape({
      x: 95,
      y: 0,
      width: 1,
      height: H,
      backgroundColor: '#d3aa91',
    }),
    shape({
      x: 0,
      y: 735,
      width: W,
      height: 107,
      backgroundColor: COLORS.terracotta,
    }),
    logo(),
    ornament(278, 242, 40, 24),
    line(160, 255, 118),
    line(318, 255, 118),
    text(title, {
      x: 122,
      y: 305,
      width: 400,
      height: 210,
      fontFamily: 'Georgia',
      fontSize: 30,
      color: COLORS.ink,
      align: 'center',
      lineHeight: 1.18,
    }),
    ornament(278, 530, 40, 24),
    line(165, 542, 113),
    line(318, 542, 113),
    text(yearLine, {
      x: 210,
      y: 592,
      width: 175,
      height: 42,
      fontSize: 17,
      fontWeight: '700',
      color: COLORS.terracotta,
      align: 'center',
      letterSpacing: 2,
    }),
    text('CAMILLA VITOR FOTOGRAFIA', {
      x: 145,
      y: 768,
      width: 305,
      height: 25,
      fontSize: 9,
      fontWeight: '700',
      color: COLORS.white,
      align: 'center',
      letterSpacing: 1.4,
    }),
  ]);
};

const summaryPage = (content, index) => page(
  'Sumário',
  index,
  [
    text('SUMÁRIO', {
      x: 70,
      y: 47,
      width: 455,
      height: 46,
      fontFamily: 'Georgia',
      fontSize: 25,
      color: COLORS.ink,
      align: 'center',
      letterSpacing: 1.2,
    }),
    ornament(278, 97, 40, 24),
    line(130, 110, 148),
    line(318, 110, 148),
    shape({
      x: 46,
      y: 140,
      width: 503,
      height: 625,
      backgroundColor: COLORS.cream,
      borderColor: COLORS.line,
      borderWidth: 1,
      borderRadius: 14,
    }),
    text(content, {
      x: 72,
      y: 164,
      width: 451,
      height: 578,
      fontSize: 10.25,
      lineHeight: 1.52,
    }),
  ],
);

const partiesPage = (content, index) => {
  const splitIndex = content.indexOf('\n\nCONTRATADO');
  const first = splitIndex >= 0
    ? content.slice(0, splitIndex)
    : content;
  const second = splitIndex >= 0
    ? content.slice(splitIndex + 2)
    : '';

  return page(
    'Contratante e contratado',
    index,
    [
      text('CONTRATANTE E CONTRATADO', {
        x: 54,
        y: 42,
        width: 487,
        height: 46,
        fontFamily: 'Georgia',
        fontSize: 21,
        color: COLORS.ink,
        align: 'center',
        letterSpacing: 0.7,
      }),
      ornament(278, 96, 40, 24),
      line(128, 109, 150),
      line(318, 109, 150),
      shape({
        x: 42,
        y: 135,
        width: 511,
        height: 276,
        backgroundColor: COLORS.blushLight,
        borderColor: COLORS.line,
        borderWidth: 1,
        borderRadius: 18,
      }),
      ...sectionNumber(1, 57, 151),
      text(first, {
        x: 112,
        y: 156,
        width: 405,
        height: 228,
        fontSize: 11,
        lineHeight: 1.42,
      }),
      shape({
        x: 42,
        y: 448,
        width: 511,
        height: 276,
        backgroundColor: COLORS.cream,
        borderColor: COLORS.line,
        borderWidth: 1,
        borderRadius: 18,
      }),
      ...sectionNumber(2, 57, 464),
      text(second, {
        x: 112,
        y: 469,
        width: 405,
        height: 228,
        fontSize: 11,
        lineHeight: 1.42,
      }),
    ],
  );
};

const packagePage = (content, index) => {
  const markers = [
    'Pacote Escolhido:',
    'Valores e formas de pagamentos:',
    'Data, hora e local:',
    'As partes acima entendem como justas',
  ];
  const sections = exactSections(content, markers);
  const ys = [120, 315, 560, 720];
  const heights = [155, 205, 120, 70];

  const elements = [
    text('DADOS DO EVENTO E PACOTE CONTRATADO', {
      x: 55,
      y: 42,
      width: 485,
      height: 54,
      fontFamily: 'Georgia',
      fontSize: 20,
      color: COLORS.ink,
      align: 'center',
      lineHeight: 1.18,
    }),
    ornament(278, 94, 40, 24),
    line(125, 107, 153),
    line(318, 107, 153),
  ];

  sections.forEach((section, sectionIndex) => {
    const y = ys[sectionIndex] ?? 120;
    const height = heights[sectionIndex] ?? 120;

    elements.push(
      shape({
        x: 48,
        y,
        width: 499,
        height,
        backgroundColor:
          sectionIndex % 2 === 0
            ? COLORS.cream
            : COLORS.blushLight,
        borderColor: COLORS.line,
        borderWidth: 1,
        borderRadius: 12,
      }),
      ...sectionNumber(sectionIndex + 1, 62, y + 16),
      text(section, {
        x: 112,
        y: y + 20,
        width: 398,
        height: height - 36,
        fontSize: fitFont(
          section,
          9.4,
          10.7,
        ),
        lineHeight: 1.38,
      }),
    );
  });

  return page(
    'Dados do evento e pacote',
    index,
    elements,
  );
};

const MARKERS = {
  casamento: {
    4: ['QUAL É O OBJETIVO\nDESSE CONTRATO?'],
    5: [
      'PROCEDIMENTO DE\nDISPONIBILIZAÇÃO DAS FOTOS?',
      'SOBRE OS ÁLBUNS',
    ],
    6: ['COMO SERÁ REALIZADO O\nPAGAMENTO DO SERVIÇO?'],
    7: [
      'AUTORIZAÇÃO DE USO\nDE IMAGEM',
      'RECISÃO\nCONTRATUAL',
    ],
    8: ['REMARCAÇÕES\nDE ENSAIOS'],
    9: [
      'LISTA DE FOTOS\nESSENCIAIS',
      'LIMITAÇÕES E\nFORÇA MAIOR',
    ],
    10: [
      'TAXA DE DESLOCAMENTO,\nHOSPEDAGEM E ALIMENTAÇÃO',
      'DURAÇÃO DO\nCONTRATO',
    ],
    11: [
      'DISPOSIÇÕES\nGERAIS',
      'FORO DE\nELEIÇÃO',
      'USO E PROTEÇÃO DE DADOS',
    ],
    13: [
      'ANEXO I Lista de fotos essenciais',
      'ANEXO II Tabela de compensação',
    ],
    14: ['ANEXO III CRONOGRAMA DO CASAMENTO'],
    15: ['ANEXO IV Orientações e Condições para o Dia do Evento'],
  },
  ensaio: {
    4: [
      'QUAL É O OBJETIVO\nDESSE CONTRATO?',
      'PROCEDIMENTO DE\nDISPONIBILIZAÇÃO DAS FOTOS?',
    ],
    5: ['SOBRE OS ÁLBUNS'],
    6: ['COMO SERÁ REALIZADO O\nPAGAMENTO DO SERVIÇO?'],
    7: [
      'AUTORIZAÇÃO DE USO\nDE IMAGEM',
      'RECISÃO\nCONTRATUAL',
    ],
    8: ['REMARCAÇÕES\nDE ENSAIOS', 'FORÇA'],
    9: [
      'TAXA DE DESLOCAMENTO,\nHOSPEDAGEM E ALIMENTAÇÃO',
      'DURAÇÃO DO\nCONTRATO',
    ],
    10: [
      'DISPOSIÇÕES\nGERAIS',
      'FORO DE\nELEIÇÃO',
      'USO E PROTEÇÃO DE DADOS',
    ],
  },
  formatura: {
    4: ['QUAL É O OBJETIVO\nDESSE CONTRATO?'],
    5: [
      'PROCEDIMENTO DE\nDISPONIBILIZAÇÃO DAS FOTOS?',
      'SOBRE OS ÁLBUNS',
    ],
    6: ['COMO SERÁ REALIZADO O\nPAGAMENTO DO SERVIÇO?'],
    7: [
      'AUTORIZAÇÃO DE USO\nDE IMAGEM',
      'RECISÃO\nCONTRATUAL',
    ],
    8: ['REMARCAÇÕES\nDE ENSAIOS', 'FORÇA'],
    9: [
      'TAXA DE DESLOCAMENTO,\nHOSPEDAGEM E ALIMENTAÇÃO',
      'DURAÇÃO DO\nCONTRATO',
    ],
    10: [
      'DISPOSIÇÕES\nGERAIS',
      'FORO DE\nELEIÇÃO',
    ],
  },
};

const legalPage = (
  category,
  content,
  index,
) => {
  const sections = exactSections(
    content,
    MARKERS[category]?.[index] || [],
  );

  const gap = 16;
  const top = 52;
  const bottom = 38;
  const usable = H
    - top
    - bottom
    - (gap * (sections.length - 1));
  const sectionHeight = usable / sections.length;
  const elements = [
    text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', {
      x: 48,
      y: 14,
      width: 330,
      height: 18,
      fontSize: 7.8,
      fontWeight: '700',
      color: COLORS.muted,
      letterSpacing: 1,
    }),
    ornament(505, 11, 34, 18),
    line(48, 32, 499, COLORS.line),
  ];

  sections.forEach((section, sectionIndex) => {
    const y = top
      + (
        sectionIndex
        * (sectionHeight + gap)
      );

    const { title, body } = extractSectionTitle(section);
    const hasTitle = Boolean(title);
    const headerHeight = hasTitle ? 82 : 22;
    const bodyY = y + headerHeight;
    const bodyHeight = sectionHeight - headerHeight - 24;

    elements.push(
      shape({
        x: 42,
        y,
        width: 511,
        height: sectionHeight,
        backgroundColor:
          sectionIndex % 2 === 0
            ? COLORS.cream
            : COLORS.blushLight,
        borderColor: COLORS.line,
        borderWidth: 1,
        borderRadius: 14,
      }),
      shape({
        x: 42,
        y,
        width: 7,
        height: sectionHeight,
        backgroundColor: COLORS.terracotta,
        borderRadius: 14,
      }),
      ...sectionNumber(sectionIndex + 1, 63, y + 22),
    );

    if (hasTitle) {
      elements.push(
        text(title, {
          x: 112,
          y: y + 18,
          width: 405,
          height: 52,
          fontFamily: 'Georgia',
          fontSize:
            sections.length > 2
              ? 15
              : 16.5,
          color: COLORS.terracottaDark,
          align: 'left',
          lineHeight: 1.18,
          letterSpacing: 0.3,
        }),
        line(
          112,
          y + 72,
          405,
          COLORS.line,
        ),
      );
    }

    elements.push(
      text(body || section, {
        x: 72,
        y: bodyY,
        width: 443,
        height: bodyHeight,
        fontSize: fitFont(
          body || section,
          sections.length > 1 ? 9.1 : 9.5,
          sections.length > 1 ? 10.3 : 11,
        ),
        lineHeight: 1.38,
      }),
    );
  });

  elements.push(
    line(48, 812, 499, COLORS.line),
    text(String(index + 1).padStart(2, '0'), {
      x: 270,
      y: 816,
      width: 55,
      height: 16,
      fontSize: 7.5,
      color: COLORS.muted,
      align: 'center',
      letterSpacing: 1,
    }),
  );

  return page(
    `Página ${index + 1}`,
    index,
    elements,
  );
};

const signaturePage = (content, index) => page(
  'Assinaturas',
  index,
  [
    text('ASSINATURAS', {
      x: 70,
      y: 48,
      width: 455,
      height: 46,
      fontFamily: 'Georgia',
      fontSize: 24,
      color: COLORS.ink,
      align: 'center',
      letterSpacing: 1,
    }),
    ornament(278, 98, 40, 24),
    line(130, 111, 148),
    line(318, 111, 148),
    shape({
      x: 56,
      y: 142,
      width: 483,
      height: 580,
      backgroundColor: COLORS.cream,
      borderColor: COLORS.line,
      borderWidth: 1,
      borderRadius: 16,
    }),
    text(content, {
      x: 90,
      y: 172,
      width: 415,
      height: 520,
      fontSize: 11,
      align: 'center',
      lineHeight: 1.6,
    }),
    shape({
      x: 0,
      y: 758,
      width: W,
      height: 84,
      backgroundColor: COLORS.terracotta,
    }),
    text('CAMILLA VITOR FOTOGRAFIA', {
      x: 150,
      y: 786,
      width: 295,
      height: 22,
      fontSize: 8.8,
      fontWeight: '700',
      color: COLORS.white,
      align: 'center',
      letterSpacing: 1.4,
    }),
  ],
);

const CASAMENTO_TEXTS = [
  "Contrato de Prestação de\n Serviços Fotográficos\n\n\n\n\n          2026",
  "Sumário\nCONTRATANTE E CONTRATADO .................................................................. 3\n\nDADOS DO EVENTO E PACOTE CONTRATADO ........................................... 4\n\nOBJETO DO CONTRATO ................................................................................ 5\n\nPROCEDIMENTO DE DISPONIBILIZAÇÃO DAS FOTOS ............................... 6\n\nSOBRE O ÁLBUM ........................................................................................... 7\n\nFORMA DE PAGAMENTO DO SERVIÇO ........................................................ 8\n\nDIREITOS AUTORAIS E USO DE IMAGEM ..................................................... 9\n\nRESCISÃO CONTRATUAL ............................................................................ 10\n\nREMARCAÇÃO DE ENSAIOS E EVENTOS .................................................... 11\n\nLISTA DE FOTOS ESSENCIAIS E RESPONSABILIDADES .............................. 12\n\nLIMITAÇÕES E CASOS DE FORÇA MAIOR ................................................... 13\n\nTAXA DE DESLOCAMENTO, HOSPEDAGEM E ALIMENTAÇÃO .................. 14\n\nDURAÇÃO DO CONTRATO .......................................................................... 15\n\nDISPOSIÇÕES GERAIS .................................................................................. 16\n\nUSO E PROTEÇÃO DE DADOS (LGPD) ........................................................ 17\n\nFORO DE ELEIÇÃO ....................................................................................... 18\n\nASSINATURAS .............................................................................................. 19\n\nANEXOS\n\nANEXO I – LISTA DE FOTOS ESSENCIAIS .................................................... 20\nANEXO II – TABELA DE COMPENSAÇÃO POR FALTA DE FOTO ................ 21\nANEXO III – CRONOGRAMA DO CASAMENTO .......................................... 22\nANEXO IV – ORIENTAÇÕES E CONDIÇÕES PARA O DIA DO EVENTO....... 23",
  "CONTRATANTE\n\nNOME: {{client.name}}\nCPF: {{client.document}}\nRG: {{client.rg}}\nTELEFONE: {{client.phone}}\nE-MAIL: {{client.email}}\nENDEREÇO: {{client.address}}\n\n\nCONTRATADO\n\nNOME: {{studio.name}}\nCNPJ: {{studio.document}}\nTELEFONES: {{studio.phone}}\nE-MAIL: {{studio.email}}\nENDEREÇO: {{studio.address}}",
  "Pacote Escolhido:\n\nSEÇÃO: Casamento\nDURAÇÃO: {{coverage.duration}}\nQ. DE FOTOS: {{package.photoQuantity}}\nENVIO: {{package.galleryIncluded}}\n\n{{package.services}}\n\nValores e formas de pagamentos:\n\nValor total: {{pricing.total}}\nEntrada: {{pricing.deposit}}\nSaldo: {{pricing.balance}}\nForma de pagamento: {{pricing.paymentMethod}}\nParcelas: {{pricing.installments}}\nPrimeiro vencimento: {{pricing.firstDueDate}}\nCondições: {{pricing.paymentConditions}}\n\nFotos Extras: {{pricing.extraPhotoValue}}\n\nData, hora e local:\n\n{{work.city}}\nData: {{work.date}}\nHorário: {{work.startTime}} às {{work.endTime}}\nLocal: {{work.location}}\n\nAs partes acima entendem como justas\nas seguintes cláusulas e condições do\npresente contrato",
  "QUAL É O OBJETIVO\n                             DESSE CONTRATO?\n\nCLÁUSULA 1ª O objetivo desse contrato é a prestação de serviços de\nFOTOGRAFIA, que será realizado, nos moldes do plano descrito a cima e\nincluindo o seguintes serviços:\n\n  Cobertura fotográfica completa do casamento, cerimonia e pós casamento, a\n  depender do pacote escolhido, em local específico para as sessões. Caso haja\n  necessidade de cobertura após esse horário, poderá ser cobrado valor\n  adicional por hora excedente.\n\n  Disponibilização de todas as fotos editadas e devidamente selecionadas\n  entregues em plataforma própria;\n\n  Álbum caso contratado;\n\n  Fotos impressas caso contratado.\n\n\n\n\nParágrafo primeiro: O CONTRATANTE está ciente que o CONTRATADO\nprecisa do auxílio do cerimonial com a organização das fotos, a logística\nde lista de fotos protocolares, no entanto não precisa de auxílio do\ncerimonial ou outra pessoa com a “direção da fotografia” ou “ideia de\nposes” por trabalhar de forma diferenciada buscando a naturalidade e\ndirigindo os noivos de forma leve e tranquila para que aproveitem de\nverdade o casamento. (importante informar o cerimonial).",
  "PROCEDIMENTO DE\n                     DISPONIBILIZAÇÃO DAS FOTOS?\n\nCLÁUSULA 2ª O procedimento de disponibilização das fotos dará da\nseguinte forma:\n\n\n\n\n 1                                   2\n          O CONTRATADO NÃO\n          faz   a    entrega do                  Realizado o evento, a\n          material bruto (Raw),                  fotógrafa terá 60 dias\n          mas já entrega os                      para disponibilização\n          arquivos editados em                   das fotos editadas e\n          alta    resolução, no                  em alta resolução.\n          prazo estabelecido\n\n Parágrafo primeiro: O CONTRATANTE está ciente que o\n CONTRATADO nem sempre consegue enviar prévias do evento\n antes do prazo de edição, bem como não está obrigado a postar\n em suas redes sociais todos os trabalhos que realiza.\n\n Parágrafo segundo: Após o prazo determinado as fotos serão\n apagadas da plataforma a qual foi enviada as fotos.\n\n Parágrafo terceiro: Após 01 (um) ano da data do ensaio, a\n fotógrafa estará isenta de qualquer responsabilidade sobre o\n material fotográfico, ou seja, não terá obrigação, de guardar os\n arquivos digitais do ensaio.\n\n Parágrafo quarto: As fotos tratadas e entregues permanecem\n arquivadas até 2 anos no máximo a contar da entrega dos\n produtos.(Indicamos que assim que sejam recebidos os arquivos\n seja feito um backup imediato).\n\n\n\n                          SOBRE OS ÁLBUNS\n  CLÁUSULA 3ª Os álbuns são contratados a parte. Caso seja contratado, o\n  cliente deverá fazer a seleção das fotos que irão compor esse álbum no\n  mesmo momento em que fará a seleção das fotos, ou seja, no prazo de 10\n  dias após a disponibilização das fotos.",
  "COMO SERÁ REALIZADO O\n                       PAGAMENTO DO SERVIÇO?\n\nCLÁUSULA 4ª Pela contratação dos serviços, o pagamento se dará\nconforme tabela disponibilizada na página 4.\n\nPARÁGRAFO PRIMEIRO Caso o pagamento seja realizado através de pix ou\ntransferência bancária, o valor será depositado na conta corrente da\nCONTRATADA da seguinte forma:\n\n\n\n\n               CHAVE PIX: CNPJ 62.121.065/0001-42\n               BANCO: PágBank\n               FAVORECIDO: Camilla Silva Barros Vitor\n\n\n\n\nPARÁGRAFO SEGUNDO A data do ensaio só será reservada com o\npagamento de um sinal de 30% do valor integral.\n\nPARÁGRAFO TERCEIRO Em caso de atraso no pagamento do valor\nconvencionado nesta cláusula, incidirá (l) multa moratória de 10% (dez por\ncento) sobre o valor devido; (ll) juros de 1% (um por cento) ao mês, e (lll)\natualização monetária calculada com base na variação do IGP-M/FGV até a\ndata do efetivo pagamento da parcela devida.",
  "AUTORIZAÇÃO DE USO\n                             DE IMAGEM\nCLÁUSULA 5ª As imagens do evento são propriedade exclusiva da CONTRADADA. A\nreprodução não autorizada de imagens, para uso comercial por cópia digital ou outro meio\né proibida. AUTORIZO A CONTRATADA a fazer utilização irrestrita de minha imagem,\nintegralmente ou em parte, desde a presente data, em caráter gratuito, por período\nINDETERMINADO, para ser utilizada em trabalhos de publicidade, premiações nacionais\ne internacionais e/ou peças de divulgação comercial da pessoa física supracitada, com\ndireito a difusão pública irrestrita em cartazes, folhetos, outdoors, websites, redes\nsociais como Instagram, Facebook e outras, anúncios e todos os demais meios de\ndifusão de imagens, públicos ou privados, impressos ou eletrônicos, e na\ncomposição de portfólios, sem necessidade da citação e aviso prévio de meu nome.\nEsta autorização se refere a fotografias ou imagens em vídeo, com ou sem captação de\nsom, produzidas pela pessoa física supracitada, para serem veiculadas em mídias\neletrônicas e impressas de qualquer tipo. A presente autorização permite a modificação\ndas imagens, sua manipulação digital, adições ou subtrações de cores, textos e elementos\ndigitais.\n\n\n\n\n                                     RECISÃO\n                                     CONTRATUAL\n\n\n                          Caso o CONTRATANTE resolva efetuar o\n                          cancelamento de contrato, o valor recebido na\n            CLÁUSULA\n                          assinatura da contratação do mesmo (30% do\n               6ª\n                          valor   total)  não    será   retornado    ao\n                          CONTRATANTE.",
  "REMARCAÇÕES\n                              DE ENSAIOS\nCLÁUSULA    7ª   Reserva-se   o    direito   de   reagendar   ensaios/eventos\nfotográficos internos/externos, em caso de previsão de má condição do\ntempo ou Doença (sendo necessário enviar cópia de atestado médico), 24h\nantes do ensaio fotográfico. O reagendamento é feito de acordo com a\ndisponibilidade de datas da agenda do fotógrafo.\n\n\n7.2 O Cliente tem direito de fazer 1 (um) reagendamento do ensaio\nfotográfico sem motivos de força maior com 48h de antecedência ao\nensaio, sem cobrança de taxa de reagendamento. Caso o ensaio\nfotográfico precise ser reagendado mais de uma vez, por parte do Cliente,\npor outros motivos a não ser condições do tempo, o Cliente pagará uma\ntaxa de R$ 150,00 para cada novo reagendamento feito. O reagendamento\né feito de acordo com a disponibilidade de datas da agenda do fotógrafo.\n\n\n7.3 Caso haja o cancelamento do ensaio/evento e o Cliente queira fazer um\nreagendamento para uma nova data a CONTRATADA deve ser informada\ndo cancelamento com no mínimo 48h de antecedência, para garantir o\nreagendamento. O reagendamento é feito de acordo com a disponibilidade\nde datas da agenda do fotógrafo.\n\n\n7.4 Caso o Cliente informe o reagendamento a CONTRATADA com o prazo\ninferior de 48h antes do evento, a CONTRATADA reserva-se no direito de\ncancelar o serviço, não havendo reagendamento e nem devolução em\ndinheiro do valor investido de 30%.\n\n\n7.5 Caso o Cliente queira reagendar o evento mais de uma vez pagará uma\ntaxa de R$ 150,00 para cada novo reagendamento feito.",
  "LISTA DE FOTOS\n                                       ESSENCIAIS\n     CLÁUSULA 8ª Até 7 dias antes do evento, o CONTRATANTE deverá enviar a\n     Lista de Fotos Essenciais (Anexo I).\n\n\n     O cliente deverá indicar uma pessoa responsável por reunir os familiares.\n\n\n     Atrasos, ausência de convidados ou mudanças no cronograma não são\n     responsabilidade do fotógrafo.\n\n\n     Caso haja ausência de foto essencial por falha comprovada do fotógrafo,\n     poderá ocorrer compensação conforme Anexo II.\n\n\n\n\n                                    LIMITAÇÕES E\n                                    FORÇA MAIOR\nCLÁUSULA 9ª Todo esforço será feito para execução dos serviços e entrega dos\nprodutos deste contrato. A responsabilidade da CONTRADADA é limitada ao valor pago\npela CONTRATANTE em caso de alguma reivindicação, perda ou danos. Por se tratar de\num evento não controlado, não se pode garantir a entrega de qualquer imagem específica.\n\n\nEventos como:\n\n\n   chuva\n   atraso do cronograma\n   problemas técnicos imprevisíveis\n   interferência de convidados\n   restrições do local\npodem interferir no registro das imagens.\n\n\nA responsabilidade dos fotógrafos é limitada ao valor total pago no contrato.",
  "TAXA DE DESLOCAMENTO,\n             HOSPEDAGEM E ALIMENTAÇÃO\n\n\n\n\n            Fica a cargo do CONTRATANTE para\n            eventos/ensaios fora de Porto Seguro o\nCLÁUSULA    pagamento do deslocamento de R$ 3,00\n   10ª      por km rodado (ida e volta) + despesas\n            com hospedagem e alimentação durante o\n            evento.\n\n\n\n\n                      DURAÇÃO DO\n                      CONTRATO\n\n            Este contrato vigorará até a data em que forem\nCLÁUSULA    entregues todos os serviços do pacote escolhido,\n   11ª      ocasião em que será cumprida a obrigação dos\n            fotógrafos.\n\n\n\n\n            Quaisquer alterações neste contrato serão\nPARÁGRAFO   válidas e vincularão as partes se forem feitas por\n PRIMEIRO   termo aditivo devidamente assinado por ambas\n            as partes.",
  "DISPOSIÇÕES\n                                GERAIS\n                Desde já, os arquivos digitais provenientes deste contrato de\n                prestação de serviço, são de propriedade do CONTRATADO,\n                cabendo ao mesmo os créditos e direitos autorais, conforme\nCLÁUSULA\n                Lei 9.610, de 20/02/98. Havendo interesse do CONTRATANTE\n   12ª          em adquiri-los, os mesmos serão negociados à parte deste\n                contrato após seis meses decorridos da data do ensaio\n\nParágrafo primeiro: Por se tratar de serviço e contrato certo, o CONTRATADO\ngozará de plena exclusividade dos mesmos, ficando desde já previamente\najustado e determinado:\n\na) A proibição de terceiros, mesmo até convidados, parentes ou amigos que\nvenham a fazer quaisquer fotografias, com quaisquer tipo de equipamentos,\ndentro dos mesmos limites do evento e que venham – ao mesmo tempo –\nobstruir direta ou indiretamente o bom andamento dos trabalhos do\nCONTRATADO e equipe. Não sendo limitadas as fotografias de celular, desde\nque nos limites dos locais estabelecidos para convidados. Camilla Vitor -\ncamilla.tj@hotmail.com - IP: 179.162.72.102\n\nb) O CONTRATADO SE OBRIGADA neste contrato a realizar um registro\ncompleto, real e honesto do que aconteceu durante as horas contratadas e dos\ndetalhes incluindo tanto decoração como momentos de forma geral.\n\n\n\n                   Para dirimir quaisquer controvérsias oriundas do\n                   CONTRATO, as partes elegem o foro da comarca de\n     FORO DE       Porto Seguro-BA. Por estarem assim justos e\n     ELEIÇÃO       contratados, firmam o presente instrumento, em\n                   duas vias de igual teor, juntamente com 2 (duas)\n                   testemunhas.\n\n\n\n\n                   USO E PROTEÇÃO DE DADOS\n\n     CLÁUSULA      Todos os dados do CONTRATANTE serão\n        13ª        protegidos e utilizados apenas para fins\n                   fiscais e de contato, conforme a LGPD.",
  "ASSINATURAS\n\n{{signature.city}} – {{signature.date}}\n\n________________________________________________\n{{signature.client}}\nCPF: {{client.document}}\n\n_______________________________________________\n{{signature.studio}}\nCNPJ: {{studio.document}}\n\n_______________________________________________\n{{signature.witness1}}\nTestemunha\n\n_______________________________________________\n{{signature.witness2}}\nTestemunha",
  "ANEXOS\n\n\n\n\nANEXO I Lista de fotos essenciais      ANEXO II Tabela de compensação\n\n\n   Noivos com pais\n                                       Até 10% das fotos faltantes\n   Noivos com avós\n                                       sem compensação\n   Noivos com irmãos\n   Noivos com padrinhos                10% a 30%\n   Noivos com família completa         abatimento de 10%\n\n\nOutras fotos:                          30% a 50%\n                                       abatimento de 20%\nResponsável por reunir familiares:\nNome: _____________                    Acima de 50% restituição proporcional\nTelefone: __________                   até o valor do contrato.",
  "ANEXOS\n\nANEXO III CRONOGRAMA DO CASAMENTO\n\n\nEvento: Casamento\nData: {{work.date}}\nLocal: {{work.location}}\n\n\nCronograma previsto\nMaking of da noiva\nHorário: {{schedule.time}}\n\n\nMaking of do noivo\nHorário: {{schedule.time}}\n\n\nFirst Look (se houver)\nHorário: {{schedule.time}}\n\n\nCerimônia\nHorário: {{schedule.time}}\n\n\nFotos protocolares (família e padrinhos)\nHorário: {{schedule.time}}\n\n\nSessão dos noivos\nHorário: {{schedule.time}}\n\n\nInício da festa\nHorário: {{schedule.time}}\n\n\nEncerramento da cobertura\nHorário: {{schedule.time}}",
  "ANEXOS\nANEXO IV Orientações e Condições para o Dia do Evento\n\n\nEvento: Casamento\nData: {{work.date}}\nNoivos: {{wedding.coupleNames}}\n\n\nEste anexo apresenta orientações para facilitar o registro fotográfico do evento.\n\n\n1. Cronograma\nAtrasos no cronograma podem reduzir o tempo disponível para alguns registros\nfotográficos.\n\n\n2. Fotos com familiares\nRecomenda-se indicar uma pessoa para auxiliar na reunião dos familiares durante\nas fotos.\n\n\n3. Fotos do casal\nSempre que possível, recomenda-se reservar de 15 a 30 minutos para fotos\nexclusivas dos noivos.\n\n\n4. Interferência de convidados\nConvidados utilizando celulares ou câmeras próximas ao fotógrafo podem interferir\nnas imagens.\n\n\n5. Condições do local\nIluminação, espaço ou outras condições do ambiente podem influenciar no\nresultado final das fotografias.\n\n\nDeclaro estar ciente das orientações acima.\nCONTRATANTES\n_______________________________________________\nCONTRATADA\n_______________________________________________",
];
const ENSAIO_TEXTS = [
  "Contrato de Prestação de\n Serviços Fotográficos\n\n\n\n\n          2026",
  "Sumário\nCONTRATANTE E CONTRATADO..............................................................3\n\nQUAL É O OBJETIVO DESTE CONTRATO?.................................................5\n\nPROCEDIMENTO DE DISPONIBILIZAÇÃO DAS FOTOS............................5\n\nSOBRE O ÁLBUM.......................................................................................6\n\nCOMO SERÁ REALIZADO O PAGAMENTO DO SERVIÇO.........................7\n\nAUTORIZAÇÃO DE USO DE IMAGEM.......................................................8\n\nRESCISÃO CONTRATUAL..........................................................................8\n\nREMARCAÇÕES DE ENSAIOS....................................................................9\n\nDA FORÇA MAIOR.....................................................................................9\n\nTAXA DE DESLOCAMENTO......................................................................10\n\nDURAÇÃO DO CONTRATO......................................................................10\n\nDISPOSIÇÕES GERAIS...............................................................................11\n\nFORO DE ELEIÇÃO....................................................................................11",
  "CONTRATANTE\n\nNOME: {{client.name}}\nCPF: {{client.document}}\nRG: {{client.rg}}\nTELEFONE: {{client.phone}}\nE-MAIL: {{client.email}}\nENDEREÇO: {{client.address}}\n\n\nCONTRATADO\n\nNOME: {{studio.name}}\nCNPJ: {{studio.document}}\nTELEFONES: {{studio.phone}}\nE-MAIL: {{studio.email}}\nENDEREÇO: {{studio.address}}",
  "Pacote Escolhido:\n\nSEÇÃO: {{work.type}}\nDURAÇÃO: {{coverage.duration}}\nQ. DE FOTOS: {{package.photoQuantity}}\nENVIO: {{package.galleryIncluded}}\n\nValores e formas de pagamentos:\n\nValor total: {{pricing.total}}\nEntrada: {{pricing.deposit}}\nSaldo: {{pricing.balance}}\nForma de pagamento: {{pricing.paymentMethod}}\nParcelas: {{pricing.installments}}\nPrimeiro vencimento: {{pricing.firstDueDate}}\nCondições: {{pricing.paymentConditions}}\n\nFotos Extras: {{pricing.extraPhotoValue}}\n\nData, hora e local:\n\n{{work.city}}\nData: {{work.date}}\nHorário: {{work.startTime}}\nLocal: {{work.location}}\n\nAs partes acima entendem como justas\nas seguintes cláusulas e condições do\npresente contrato",
  "QUAL É O OBJETIVO\n                              DESSE CONTRATO?\n\nCLÁUSULA 1ª O objetivo desse contrato é a prestação de serviços de\nFOTOGRAFIA, que será realizado, nos moldes do plano descrito a cima e\nincluindo o seguintes serviços:\n\n  Cobertura fotográfica total do ensaio com 1h de duração, em local específico\n  para as sessões;\n\n  Disponibilização das fotos editadas em plataforma própria;\n\n  Álbum caso contratado;\n\n  Fotos impressas caso contratado.\n\n\n\n\n                         PROCEDIMENTO DE\n                         DISPONIBILIZAÇÃO DAS FOTOS?\n\n  CLÁUSULA 2ª O procedimento de disponibilização das fotos dará da\n  seguinte forma:\n\n\n\n\n   1                                     2\n             O CONTRATADO NÃO\n             faz   a    entrega do                   Realizado o evento, a\n             material bruto (Raw),                   fotógrafa terá 60 dias\n             mas já entrega os                       para disponibilização\n             arquivos editados em                    das fotos editadas e\n             alta    resolução, no                   em alta resolução.\n             prazo estabelecido",
  "Parágrafo primeiro: O CONTRATANTE está ciente que o\nCONTRATADO nem sempre consegue enviar prévias do evento\nantes do prazo de edição, bem como não está obrigado a postar\nem suas redes sociais todos os trabalhos que realiza.\n\nParágrafo segundo: Após o prazo determinado as fotos serão\napagadas da plataforma a qual foi enviada as fotos.\n\nParágrafo terceiro: Após 01 (um) ano da data do ensaio, a\nfotógrafa estará isenta de qualquer responsabilidade sobre o\nmaterial fotográfico, ou seja, não terá obrigação, de guardar os\narquivos digitais do ensaio.\n\nParágrafo quarto: As fotos tratadas e entregues permanecem\narquivadas até 2 anos no máximo a contar da entrega dos\nprodutos.(Indicamos que assim que sejam recebidos os arquivos\nseja feito um backup imediato).\n\n\n\n\n                        SOBRE OS ÁLBUNS\nCLÁUSULA 3ª Os álbuns são contratados a parte. Caso seja contratado, o\ncliente deverá fazer a seleção das fotos que irão compor esse álbum no\nmesmo momento em que fará a seleção das fotos, ou seja, no prazo de 10\ndias após a disponibilização das fotos.",
  "COMO SERÁ REALIZADO O\n                       PAGAMENTO DO SERVIÇO?\n\nCLÁUSULA 4ª Pela contratação dos serviços, o pagamento se dará\nconforme tabela disponibilizada na página 4.\n\nPARÁGRAFO PRIMEIRO Caso o pagamento seja realizado através de pix ou\ntransferência bancária, o valor será depositado na conta corrente da\nCONTRATADA da seguinte forma:\n\n\n\n\n               CHAVE PIX: CELULAR 73988936763\n               BANCO: Nubank\n               FAVORECIDO: Camilla Silva Barros Vitor\n\n\n\n\nPARÁGRAFO SEGUNDO A data do ensaio só será reservada com o\npagamento de um sinal de 30% do valor integral.\n\nPARÁGRAFO TERCEIRO Será permitida somente a participação de filhos e\nenteados nos ensaios de família. Para acompanhantes extras será cobrado\num valor de R$ 100,00 por pessoa.\n\nPARÁGRAFO QUARTO Em caso de atraso no pagamento do valor\nconvencionado nesta cláusula, incidirá (l) multa moratória de 10% (dez por\ncento) sobre o valor devido; (ll) juros de 1% (um por cento) ao mês, e (lll)\natualização monetária calculada com base na variação do IGP-M/FGV até a\ndata do efetivo pagamento da parcela devida.",
  "AUTORIZAÇÃO DE USO\n                             DE IMAGEM\nCLÁUSULA 5ª As imagens do evento são propriedade exclusiva da CONTRADADA. A\nreprodução não autorizada de imagens, para uso comercial por cópia digital ou outro meio\né proibida. AUTORIZO A CONTRATADA a fazer utilização irrestrita de minha imagem,\nintegralmente ou em parte, desde a presente data, em caráter gratuito, por período\nINDETERMINADO, para ser utilizada em trabalhos de publicidade, premiações nacionais\ne internacionais e/ou peças de divulgação comercial da pessoa física supracitada, com\ndireito a difusão pública irrestrita em cartazes, folhetos, outdoors, websites, redes\nsociais como Instagram, Facebook e outras, anúncios e todos os demais meios de\ndifusão de imagens, públicos ou privados, impressos ou eletrônicos, e na\ncomposição de portfólios, sem necessidade da citação e aviso prévio de meu nome.\nEsta autorização se refere a fotografias ou imagens em vídeo, com ou sem captação de\nsom, produzidas pela pessoa física supracitada, para serem veiculadas em mídias\neletrônicas e impressas de qualquer tipo. A presente autorização permite a modificação\ndas imagens, sua manipulação digital, adições ou subtrações de cores, textos e elementos\ndigitais.\n\n\n\n                                     RECISÃO\n                                     CONTRATUAL\n\n\n\n\n                          Caso o CONTRATANTE resolva efetuar o\n                          cancelamento de contrato, o valor recebido na\n            CLÁUSULA\n                          assinatura da contratação do mesmo (30% do\n               6ª\n                          valor   total)  não    será   retornado    ao\n                          CONTRATANTE.",
  "REMARCAÇÕES\n                              DE ENSAIOS\nCLÁUSULA    7ª   Reserva-se   o    direito   de   reagendar   ensaios/eventos\nfotográficos internos/externos, em caso de previsão de má condição do\ntempo ou Doença (sendo necessário enviar cópia de atestado médico), 24h\nantes do ensaio fotográfico. O reagendamento é feito de acordo com a\ndisponibilidade de datas da agenda do fotógrafo.\n\n\n6.2 O Cliente tem direito de fazer 1 (um) reagendamento do ensaio\nfotográfico sem motivos de força maior com 48h de antecedência ao\nensaio, sem cobrança de taxa de reagendamento. Caso o ensaio\nfotográfico precise ser reagendado mais de uma vez, por parte do Cliente,\npor outros motivos a não ser condições do tempo, o Cliente pagará uma\ntaxa de R$ 150,00 para cada novo reagendamento feito. O reagendamento\né feito de acordo com a disponibilidade de datas da agenda do fotógrafo.\n\n\n6.3 Caso haja o cancelamento do ensaio/evento e o Cliente queira fazer um\nreagendamento para uma nova data a CONTRATADA deve ser informada\ndo cancelamento com no mínimo 48h de antecedência, para garantir o\nreagendamento. O reagendamento é feito de acordo com a disponibilidade\nde datas da agenda do fotógrafo.\n\n\n6.4 Caso o Cliente informe o reagendamento a CONTRATADA com o prazo\ninferior de 48h antes do evento, a CONTRATADA reserva-se no direito de\ncancelar o serviço, não havendo reagendamento e nem devolução em\ndinheiro do valor investido de 30%.\n\n\n6.5 Caso o Cliente queira reagendar o evento mais de uma vez pagará uma\ntaxa de R$ 150,00 para cada novo reagendamento feito.\n\n                   Todo esforço será feito para execução dos\n                   serviços e entrega dos produtos deste contrato.\n                   A responsabilidade da CONTRADADA é limitada\n     FORÇA         ao valor pago pela CONTRATANTE em caso de\n     MAIOR         alguma reivindicação, perda ou danos. Por se\n                   tratar de um evento não controlado, não se pode\n                   garantir a entrega de qualquer imagem\n                   específica.",
  "TAXA DE DESLOCAMENTO,\n             HOSPEDAGEM E ALIMENTAÇÃO\n\n\n\n\n            Fica a cargo do CONTRATANTE para\n            eventos/ensaios fora de Porto Seguro o\nCLÁUSULA    pagamento do deslocamento de R$ 3,00\n   8ª       por km rodado (ida e volta) + despesas\n            com hospedagem e alimentação durante o\n            evento.\n\n\n\n\n                      DURAÇÃO DO\n                      CONTRATO\n\n            Este contrato vigorará até a data em que forem\nCLÁUSULA    entregues todos os serviços do pacote escolhido,\n   9ª       ocasião em que será cumprida a obrigação dos\n            fotógrafos.\n\n\n\n\n            Quaisquer alterações neste contrato serão\nPARÁGRAFO   válidas e vincularão as partes se forem feitas por\n PRIMEIRO   termo aditivo devidamente assinado por ambas\n            as partes.",
  "DISPOSIÇÕES\n                                GERAIS\n                Desde já, os arquivos digitais provenientes deste contrato de\n                prestação de serviço, são de propriedade do CONTRATADO,\n                cabendo ao mesmo os créditos e direitos autorais, conforme\nCLÁUSULA\n                Lei 9.610, de 20/02/98. Havendo interesse do CONTRATANTE\n   10ª          em adquiri-los, os mesmos serão negociados à parte deste\n                contrato após seis meses decorridos da data do ensaio\n\nParágrafo primeiro: Por se tratar de serviço e contrato certo, o CONTRATADO\ngozará de plena exclusividade dos mesmos, ficando desde já previamente\najustado e determinado:\n\na) A proibição de terceiros, mesmo até convidados, parentes ou amigos que\nvenham a fazer quaisquer fotografias, com quaisquer tipo de equipamentos,\ndentro dos mesmos limites do evento e que venham – ao mesmo tempo –\nobstruir direta ou indiretamente o bom andamento dos trabalhos do\nCONTRATADO e equipe. Não sendo limitadas as fotografias de celular, desde\nque nos limites dos locais estabelecidos para convidados. Camilla Vitor -\ncamilla.tj@hotmail.com - IP: 179.162.72.102\n\nb) O CONTRATADO SE OBRIGADA neste contrato a realizar um registro\ncompleto, real e honesto do que aconteceu durante as horas contratadas e dos\ndetalhes incluindo tanto decoração como momentos de forma geral.\n\n\n\n                   Para dirimir quaisquer controvérsias oriundas do\n                   CONTRATO, as partes elegem o foro da comarca de\n     FORO DE       Porto Seguro-BA. Por estarem assim justos e\n     ELEIÇÃO       contratados, firmam o presente instrumento, em\n                   duas vias de igual teor, juntamente com 2 (duas)\n                   testemunhas.\n\n\n\n\n                   USO E PROTEÇÃO DE DADOS\n\n     CLÁUSULA      Todos os dados do CONTRATANTE serão\n        11ª        protegidos e utilizados apenas para fins\n                   fiscais e de contato, conforme a LGPD.",
  "ASSINATURAS\n\n{{signature.city}} – {{signature.date}}\n\n________________________________________________\n{{signature.client}}\nCPF: {{client.document}}\n\n_______________________________________________\n{{signature.studio}}\nCNPJ: {{studio.document}}\n\n_______________________________________________\n{{signature.witness1}}\nTestemunha\n\n_______________________________________________\n{{signature.witness2}}\nTestemunha",
];
const FORMATURA_TEXTS = [
  "Contrato de Prestação de\n Serviços Fotográficos\n\n\n\n\n          2026",
  "Sumário\nCONTRATANTE E CONTRATADO..............................................................3\n\nQUAL É O OBJETIVO DESTE CONTRATO?.................................................5\n\nPROCEDIMENTO DE DISPONIBILIZAÇÃO DAS FOTOS............................5\n\nSOBRE O ÁLBUM.......................................................................................6\n\nCOMO SERÁ REALIZADO O PAGAMENTO DO SERVIÇO.........................7\n\nAUTORIZAÇÃO DE USO DE IMAGEM.......................................................8\n\nRESCISÃO CONTRATUAL..........................................................................8\n\nREMARCAÇÕES DE ENSAIOS....................................................................9\n\nDA FORÇA MAIOR.....................................................................................9\n\nTAXA DE DESLOCAMENTO......................................................................10\n\nDURAÇÃO DO CONTRATO......................................................................10\n\nDISPOSIÇÕES GERAIS...............................................................................11\n\nFORO DE ELEIÇÃO....................................................................................11",
  "CONTRATANTE\n\nNOME: {{client.name}}\nCPF: {{client.document}}\nRG: {{client.rg}}\nTELEFONE: {{client.phone}}\nE-MAIL: {{client.email}}\nENDEREÇO: {{client.address}}\n\n\nCONTRATADO\n\nNOME: {{studio.name}}\nCNPJ: {{studio.document}}\nTELEFONES: {{studio.phone}}\nE-MAIL: {{studio.email}}\nENDEREÇO: {{studio.address}}",
  "Pacote Escolhido:\n\nSEÇÃO: Ensaio de formandos / Colação de grau\nDURAÇÃO: {{coverage.duration}}\nQ. DE FOTOS: {{package.photoQuantity}}\nENVIO: {{package.galleryIncluded}}\n\nValores e formas de pagamentos:\n\nValor total: {{pricing.total}}\nEntrada: {{pricing.deposit}}\nSaldo: {{pricing.balance}}\nForma de pagamento: {{pricing.paymentMethod}}\nParcelas: {{pricing.installments}}\nPrimeiro vencimento: {{pricing.firstDueDate}}\nCondições: {{pricing.paymentConditions}}\n\nData, hora e local:\n\n{{work.city}}\nFORMatura: {{work.date}} - {{work.startTime}}\nLOCAL: {{work.location}}\nENSAIO EXTERNO: {{work.preWeddingLocation}}\n\nAs partes acima entendem como justas\nas seguintes cláusulas e condições do\npresente contrato",
  "QUAL É O OBJETIVO\n                             DESSE CONTRATO?\n\nCLÁUSULA 1ª O objetivo desse contrato é a prestação de serviços de\nFOTOGRAFIA, que será realizado, nos moldes do plano descrito a cima e\nincluindo o seguintes serviços:\n\n  Cobertura fotográfica do evento de formatura, em local previamente definido,\n  com permanência da equipe de fotografia por até 3 (três) horas de evento,\n  podendo ser estendido a 4h. Caso ultrapasse esse período, será cobrado R$\n  250,00 por hora extra, mediante disponibilidade e autorização do\n  CONTRATANTE no momento do evento.\n\n  Disponibilização de todas as fotos editadas e devidamente selecionadas\n  entregues em plataforma própria;\n\n  Álbum caso contratado;\n\n  Fotos impressas caso contratado.\n\n\n\nParágrafo primeiro: O CONTRATANTE está ciente que o CONTRATADO\nnão precisa de auxílio de outra pessoa com a “direção da fotografia” ou\n“ideia de poses” por trabalhar de forma diferenciada buscando a\nnaturalidade e dirigindo os contratados de forma leve e tranquila para\nque aproveitem de verdade o momento. (informação importante).\n\n\n   Serviço de fotografia referente a formatura dos alunos da turma de\n{{graduation.course}} no {{graduation.institution}}\n\n{{graduation.students}}",
  "PROCEDIMENTO DE\n                     DISPONIBILIZAÇÃO DAS FOTOS?\n\nCLÁUSULA 2ª O procedimento de disponibilização das fotos dará da\nseguinte forma:\n\n\n\n\n 1                                   2\n          O CONTRATADO não\n          faz   a    entrega do                  Realizado o evento, a\n          material bruto (Raw),                  fotógrafa terá 60 dias\n          mas já entrega os                      para disponibilização\n          arquivos editados em                   das fotos editadas e\n          alta    resolução, no                  em alta resolução.\n          prazo estabelecido\n\n Parágrafo primeiro: O CONTRATANTE está ciente que o\n CONTRATADO nem sempre consegue enviar prévias do evento\n antes do prazo de edição, bem como não está obrigado a postar\n em suas redes sociais todos os trabalhos que realiza.\n\n Parágrafo segundo: Após o prazo determinado as fotos serão\n apagadas da plataforma a qual foi enviada as fotos.\n\n Parágrafo terceiro: Após 01 (um) ano da data do ensaio, a\n fotógrafa estará isenta de qualquer responsabilidade sobre o\n material fotográfico, ou seja, não terá obrigação, de guardar os\n arquivos digitais do ensaio.\n\n Parágrafo quarto: As fotos tratadas e entregues permanecem\n arquivadas até 2 anos no máximo a contar da entrega dos\n produtos. (Indicamos que assim que sejam recebidos os arquivos\n seja feito um backup imediato).\n\n\n\n                          SOBRE OS ÁLBUNS\n  CLÁUSULA 3ª Os álbuns são contratados a parte. Caso seja contratado, o\n  cliente deverá fazer a seleção das fotos que irão compor esse álbum no\n  mesmo momento em que fará a seleção das fotos, ou seja, no prazo de 10\n  dias após a disponibilização das fotos.",
  "COMO SERÁ REALIZADO O\n                       PAGAMENTO DO SERVIÇO?\n\nCLÁUSULA 4ª Pela contratação dos serviços, o pagamento se dará\nconforme tabela disponibilizada na página 4.\n\nPARÁGRAFO PRIMEIRO Caso o pagamento seja realizado através de pix ou\ntransferência bancária, o valor será depositado na conta corrente da\nCONTRATADA da seguinte forma:\n\n\n\n\n               CHAVE PIX: Telefone 73988936763\n               BANCO: NuBank\n               FAVORECIDO: Camilla Silva Barros Vitor\n\n\n\n\nPARÁGRAFO SEGUNDO A data do ensaio só será reservada com o\npagamento de um sinal de 30% do valor integral.\n\nPARÁGRAFO TERCEIRO Em caso de atraso no pagamento do valor\nconvencionado nesta cláusula, incidirá (l) multa moratória de 10% (dez por\ncento) sobre o valor devido; (ll) juros de 1% (um por cento) ao mês, e (lll)\natualização monetária calculada com base na variação do IGP-M/FGV até a\ndata do efetivo pagamento da parcela devida.",
  "AUTORIZAÇÃO DE USO\n                             DE IMAGEM\nCLÁUSULA 5ª As imagens do evento são propriedade exclusiva da CONTRADADA. A\nreprodução não autorizada de imagens, para uso comercial por cópia digital ou outro meio\né proibida. AUTORIZO A CONTRATADA a fazer utilização irrestrita de minha imagem,\nintegralmente ou em parte, desde a presente data, em caráter gratuito, por período\nINDETERMINADO, para ser utilizada em trabalhos de publicidade, premiações nacionais\ne internacionais e/ou peças de divulgação comercial da pessoa física supracitada, com\ndireito a difusão pública irrestrita em cartazes, folhetos, outdoors, websites, redes\nsociais como Instagram, Facebook e outras, anúncios e todos os demais meios de\ndifusão de imagens, públicos ou privados, impressos ou eletrônicos, e na\ncomposição de portfólios, sem necessidade da citação e aviso prévio de meu nome.\nEsta autorização se refere a fotografias ou imagens em vídeo, com ou sem captação de\nsom, produzidas pela pessoa física supracitada, para serem veiculadas em mídias\neletrônicas e impressas de qualquer tipo. A presente autorização permite a modificação\ndas imagens, sua manipulação digital, adições ou subtrações de cores, textos e elementos\ndigitais.\n\n\n\n\n                                     RECISÃO\n                                     CONTRATUAL\n\n\n\n\n                          Caso o CONTRATANTE resolva efetuar o\n                          cancelamento de contrato, o valor recebido na\n            CLÁUSULA\n                          assinatura da contratação do mesmo (30% do\n               6ª\n                          valor   total)  não    será   retornado    ao\n                          CONTRATANTE.",
  "REMARCAÇÕES\n                              DE ENSAIOS\nCLÁUSULA    7ª   Reserva-se   o    direito   de   reagendar   ensaios/eventos\nfotográficos internos/externos, em caso de previsão de má condição do\ntempo ou Doença (sendo necessário enviar cópia de atestado médico), 24h\nantes do ensaio fotográfico. O reagendamento é feito de acordo com a\ndisponibilidade de datas da agenda do fotógrafo.\n\n\n7.2 O Cliente tem direito de fazer 1 (um) reagendamento do ensaio\nfotográfico sem motivos de força maior com 48h de antecedência ao\nensaio, sem cobrança de taxa de reagendamento. Caso o ensaio\nfotográfico precise ser reagendado mais de uma vez, por parte do Cliente,\npor outros motivos a não ser condições do tempo, o Cliente pagará uma\ntaxa de R$ 150,00 para cada novo reagendamento feito. O reagendamento\né feito de acordo com a disponibilidade de datas da agenda do fotógrafo.\n\n\n7.3 Caso haja o cancelamento do ensaio/evento e o Cliente queira fazer um\nreagendamento para uma nova data a CONTRATADA deve ser informada\ndo cancelamento com no mínimo 48h de antecedência, para garantir o\nreagendamento. O reagendamento é feito de acordo com a disponibilidade\nde datas da agenda do fotógrafo.\n\n\n7.4 Caso o Cliente informe o reagendamento a CONTRATADA com o prazo\ninferior de 48h antes do evento, a CONTRATADA reserva-se no direito de\ncancelar o serviço, não havendo reagendamento e nem devolução em\ndinheiro do valor investido de 30%.\n\n\n7.5 Caso o Cliente queira reagendar o evento mais de uma vez pagará uma\ntaxa de R$ 150,00 para cada novo reagendamento feito.\n\n                   Todo esforço será feito para execução dos\n                   serviços e entrega dos produtos deste contrato.\n                   A responsabilidade da CONTRADADA é limitada\n     FORÇA         ao valor pago pela CONTRATANTE em caso de\n     MAIOR         alguma reivindicação, perda ou danos. Por se\n                   tratar de um evento não controlado, não se pode\n                   garantir a entrega de qualquer imagem\n                   específica.",
  "TAXA DE DESLOCAMENTO,\n             HOSPEDAGEM E ALIMENTAÇÃO\n\n\n\n\n            Fica a cargo do CONTRATANTE para\n            eventos/ensaios fora de Porto Seguro o\nCLÁUSULA    pagamento do deslocamento de R$ 3,00\n   8ª       por km rodado (ida e volta) + despesas\n            com hospedagem e alimentação durante o\n            evento.\n\n\n\n\n                      DURAÇÃO DO\n                      CONTRATO\n\n            Este contrato vigorará até a data em que forem\nCLÁUSULA    entregues todos os serviços do pacote escolhido,\n   9ª       ocasião em que será cumprida a obrigação dos\n            fotógrafos.\n\n\n\n\n            Quaisquer alterações neste contrato serão\nPARÁGRAFO   válidas e vincularão as partes se forem feitas por\n PRIMEIRO   termo aditivo devidamente assinado por ambas\n            as partes.",
  "DISPOSIÇÕES\n                                GERAIS\n                Desde já, os arquivos digitais provenientes deste contrato de\n                prestação de serviço, são de propriedade do CONTRATADO,\n                cabendo ao mesmo os créditos e direitos autorais, conforme\nCLÁUSULA\n                Lei 9.610, de 20/02/98. Havendo interesse do CONTRATANTE\n   10ª          em adquiri-los, os mesmos serão negociados à parte deste\n                contrato após seis meses decorridos da data do ensaio\n\nParágrafo primeiro: Por se tratar de serviço e contrato certo, o CONTRATADO\ngozará de plena exclusividade dos mesmos, ficando desde já previamente\najustado e determinado:\n\na) A proibição de terceiros, mesmo até convidados, parentes ou amigos que\nvenham a fazer quaisquer fotografias, com quaisquer tipo de equipamentos,\ndentro dos mesmos limites do evento e que venham – ao mesmo tempo –\nobstruir direta ou indiretamente o bom andamento dos trabalhos do\nCONTRATADO e equipe. Não sendo limitadas as fotografias de celular, desde\nque nos limites dos locais estabelecidos para convidados. Camilla Vitor -\ncamillavitorfotografia@gmail.com - IP: 179.162.72.102\n\nb) O CONTRATADO SE OBRIGADA neste contrato a realizar um registro\ncompleto, real e honesto do que aconteceu durante as horas contratadas e dos\ndetalhes incluindo tanto decoração como momentos de forma geral.\n\n\n\n                   Para dirimir quaisquer controvérsias oriundas do\n                   CONTRATO, as partes elegem o foro da comarca de\n     FORO DE       Porto Seguro-BA. Por estarem assim justos e\n     ELEIÇÃO       contratados, firmam o presente instrumento, em\n                   duas vias de igual teor, juntamente com 2 (duas)\n                   testemunhas.",
  "ASSINATURAS\n\n{{signature.city}} – {{signature.date}}\n\n________________________________________________\n{{signature.client}}\nCPF: {{client.document}}\n\n_______________________________________________\n{{signature.studio}}\nCNPJ: {{studio.document}}\n\n_______________________________________________\n{{signature.witness1}}\nTestemunha\n\n_______________________________________________\n{{signature.witness2}}\nTestemunha",
];


const buildPages = (category, source) => source.map(
  (content, index) => {
    if (index === 0) return coverPage(content, index);
    if (index === 1) return summaryPage(content, index);
    if (index === 2) return partiesPage(content, index);
    if (index === 3) return packagePage(content, index);

    const signatureIndex =
      category === 'casamento'
        ? 12
        : 11;

    if (index === signatureIndex) {
      return signaturePage(content, index);
    }

    return legalPage(
      category,
      content,
      index,
    );
  },
);

export const buildContractBlueprint = (
  category = 'casamento',
) => {
  if (category === 'ensaio') {
    return buildPages('ensaio', ENSAIO_TEXTS);
  }

  if (category === 'formatura') {
    return buildPages('formatura', FORMATURA_TEXTS);
  }

  return buildPages('casamento', CASAMENTO_TEXTS);
};

export const isDefaultContractTemplate = (
  template = {},
) => (
  ['casamento', 'ensaio', 'formatura']
    .includes(template.category)
);
