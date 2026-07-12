import { createId } from '../utils/documentIds';

const W = 595.28; const H = 841.89;
const text = (content, x, y, width = 460, height = 70, extra = {}) => ({ id: createId('text'), name: content || 'Texto', type: 'text', content, x, y, width, height, rotation: 0, opacity: 1, zIndex: 4, locked: false, visible: true, fontFamily: 'Georgia', fontSize: 28, fontWeight: '400', fontStyle: 'normal', color: '#ffffff', align: 'left', lineHeight: 1.15, letterSpacing: 0, hideIfEmpty: true, ...extra });
const image = (x, y, width, height, extra = {}) => ({ id: createId('image'), name: 'Imagem', type: 'image', src: '', x, y, width, height, rotation: 0, opacity: 1, zoom: 1, positionX: 50, positionY: 50, zIndex: 1, locked: false, visible: true, preserveAspectRatio: true, borderRadius: 0, ...extra });
const dynamic = (label, key, x, y, extra = {}) => text(label, x, y, 420, 48, { type: 'pricing', name: label, dynamicKey: key, fontFamily: 'Arial', fontSize: 20, ...extra });
const shape = (type, x, y, width, height, extra = {}) => ({ id: createId(type), name: type, type, x, y, width, height, rotation: 0, opacity: .45, zIndex: 2, locked: false, visible: true, fill: '#000000', stroke: '#c9a06c', ...extra });
const page = (name, pageType, elements = [], background = {}) => ({ id: createId('page'), name, order: 0, active: true, pageType, width: W, height: H, background: { type: 'none', url: null, opacity: 1, overlayColor: '#000000', overlayOpacity: 0, positionX: 50, positionY: 50, zoom: 1, ...background }, elements, metadata: {} });

export const PROPOSAL_PAGE_LAYOUTS = [
  ['blank','Página em branco','blank',[]],
  ['full-image','Imagem em página inteira','photo',[image(0,0,W,H)]],
  ['full-title','Imagem em página inteira com título','cover',[image(0,0,W,H),shape('overlay',0,0,W,H),text('Título da proposta',55,620,480,100,{fontSize:44})]],
  ['title-subtitle','Imagem com título e subtítulo','cover',[image(0,0,W,H),shape('overlay',0,0,W,H),text('Título',55,590,480,70,{fontSize:42}),text('Subtítulo da página',58,670,420,45,{fontFamily:'Arial',fontSize:17})]],
  ['image-left','Imagem à esquerda e texto à direita','editorial',[image(0,0,300,H),text('Título editorial',335,180,220,90,{fontSize:34,color:'#161616'}),text('Conte sua história aqui.',335,300,210,170,{fontFamily:'Arial',fontSize:16,color:'#333333'})]],
  ['image-right','Texto à esquerda e imagem à direita','editorial',[text('Título editorial',45,180,220,90,{fontSize:34,color:'#161616'}),text('Conte sua história aqui.',45,300,210,170,{fontFamily:'Arial',fontSize:16,color:'#333333'}),image(295,0,300,H)]],
  ['collage-2','Colagem com 2 imagens','collage',[image(0,0,295,H),image(300,0,295,H)]],
  ['collage-3','Colagem com 3 imagens','collage',[image(0,0,375,H),image(380,0,215,418),image(380,423,215,419)]],
  ['collage-4','Colagem com 4 imagens','collage',[image(0,0,295,418),image(300,0,295,418),image(0,423,295,419),image(300,423,295,419)]],
  ['institutional','Página institucional','institutional',[text('Sobre nós',55,90,480,70,{fontSize:40,color:'#c9a06c'}),text('Uma história feita de imagens, presença e significado.',55,190,470,250,{fontFamily:'Arial',fontSize:18,color:'#efefef'})]],
  ['portfolio','Página de portfólio','portfolio',[image(28,28,539,650),text('Portfólio',48,710,480,65,{fontSize:36})]],
  ['package','Página de pacote','package',[text('Nome do pacote',55,70,480,65,{fontSize:38}),dynamic('R$ 0.000,00','price',55,155,{fontSize:34,color:'#c9a06c'}),dynamic('Serviços incluídos','services',55,245,{height:260,fontSize:18})]],
  ['investment','Página de investimento','investment',[text('Investimento',55,90,480,65,{fontSize:42}),dynamic('Nome do pacote','packageName',55,200),dynamic('Valor','price',55,270,{fontSize:38,color:'#c9a06c'}),dynamic('Entrada e parcelas','paymentTerms',55,350)]],
  ['package-comparison','Comparação de pacotes','comparison',[text('Escolha sua experiência',45,55,500,60,{fontSize:35}),dynamic('Pacote Essencial','package1',35,170,{width:165}),dynamic('Pacote Completo','package2',215,170,{width:165}),dynamic('Pacote Premium','package3',395,170,{width:165})]],
  ['payment','Condições de pagamento','payment',[text('Condições de pagamento',55,90,480,65,{fontSize:38}),dynamic('Entrada','deposit',55,220),dynamic('Parcelas','installments',55,290),dynamic('Condições','conditions',55,360,{height:180})]],
  ['testimonial-1','Depoimento com uma foto','testimonial',[image(55,80,485,380),text('“Uma experiência inesquecível.”',70,520,455,130,{fontSize:30}),text('Nome do cliente',70,680,380,35,{fontFamily:'Arial',fontSize:15,color:'#c9a06c'})]],
  ['testimonial-2','Depoimentos com duas fotos','testimonial',[image(35,55,250,330),image(310,55,250,330),text('“Depoimento do primeiro cliente.”',40,430,245,150,{fontSize:22}),text('“Depoimento do segundo cliente.”',310,430,245,150,{fontSize:22})]],
  ['final','Página final','final',[image(0,0,W,H),shape('overlay',0,0,W,H,{opacity:.55}),text('Vamos criar algo memorável?',60,330,475,150,{fontSize:42,align:'center'}),text('studio@exemplo.com',90,570,415,40,{fontFamily:'Arial',fontSize:17,align:'center'})]],
  ['import-jpeg','Importar página JPEG completa','import',[]],
  ['duplicate','Duplicar página existente','duplicate',[]],
].map(([id,name,pageType,elements])=>({id,name,pageType,elements}));

export function createPageFromLayout(layoutId, name) { const layout = PROPOSAL_PAGE_LAYOUTS.find((item)=>item.id===layoutId) || PROPOSAL_PAGE_LAYOUTS[0]; return page(name || layout.name, layout.pageType, layout.elements.map((element)=>({...element,id:createId(element.type)}))); }

export const DEFAULT_PROPOSAL_MODELS = [
  { name:'Casamento',category:'Casamento',pages:['Capa','Sobre nós','Essência','Portfólio 1','Dores e objeções','Página fotográfica','Promessa','Página fotográfica 2','Experiência','O noivo','Jornada','Pacote 1','Pacote 2','Pacote 3','Pacote 4','Condições de pagamento','Informações adicionais','Depoimento 1','Depoimento 2','Encerramento','Contato'] },
  { name:'Ensaio de casal',category:'Ensaio',pages:['Capa','Sobre nós','Essência','Colagem','Portfólio 1','Portfólio 2','Portfólio 3','Portfólio 4','Memória Viva','Experiência','Essencial','Condições','Texto institucional','Depoimento 1','Depoimento 2','Encerramento','Contato'] },
  { name:'Gestante',category:'Gestante',pages:['Capa','Sobre nós','Página fotográfica','Essência','Portfólio 1','Portfólio 2','Memória Viva','Experiência','Pacote adicional','Condições','Orientações','Depoimento 1','Depoimento 2','Encerramento','Contato'] },
  { name:'Ensaio pessoal',category:'Pessoal',pages:['Capa','Portfólio em colagem','Página fotográfica','Página institucional','Movimento','Essência','Presença','Como funciona','Condições','Encerramento'] },
  { name:'Formatura individual',category:'Formatura',pages:['Capa','Sobre nós','Boas-vindas','Missão','Portfólio','Investimento','Condições','Encerramento'] },
  { name:'Eventos',category:'Eventos',pages:['Capa','Sobre nós','Boas-vindas','Missão','Portfólio','Investimento','Condições','Encerramento'] },
  { name:'Posicionamento de imagem',category:'Marca pessoal',pages:['Capa','Conceito','Pacotes','Glamour','Identidade','Receptividade','Poder','Liderança','Confiança','Determinação','Autoestima','Autoridade','Encerramento'] },
];

const layoutForName=(name)=>name.includes('Capa')?'full-title':name.includes('Portfólio')?'portfolio':name.includes('Pacote')||name==='Essencial'?'package':name.includes('Condi')?'payment':name.includes('Depoimento')?'testimonial-1':name.includes('Encerramento')||name==='Contato'?'final':name.includes('fotográfica')?'full-image':'institutional';
export const createDefaultModelPages=(model)=>model.pages.map((name,order)=>({...createPageFromLayout(layoutForName(name),name),order}));
