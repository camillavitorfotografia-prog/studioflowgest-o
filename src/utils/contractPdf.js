import { PDFDocument, StandardFonts, rgb } from '../vendor/pdf-lib.esm.min.js';

const sanitize=(value)=>String(value??'').replace(/[^\x20-\x7EÀ-ÿ]/g,' ');
const safeName=(value)=>sanitize(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'');

export async function generateContractPdf({model,contract}){
  const response=await fetch(model.sourceUrl);
  if(!response.ok)throw new Error('Não foi possível carregar o PDF original do contrato.');
  const originalBytes=await response.arrayBuffer();
  const pdf=await PDFDocument.load(originalBytes);
  const page=pdf.addPage([595.28,841.89]);
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const gold=rgb(.62,.43,.27);let y=790;
  page.drawText('FICHA DE DADOS VARIAVEIS DO CONTRATO',{x:42,y,size:15,font:bold,color:gold});y-=26;
  page.drawText(`${model.name} - modelo ${model.version}`,{x:42,y,size:9,font:regular,color:rgb(.3,.3,.3)});y-=28;
  const rows=[['Contratante',contract.clientName],['CPF / CNPJ',contract.clientDocument],['RG',contract.clientRg],['E-mail',contract.clientEmail],['Telefone',contract.clientPhone],['Endereco',contract.clientAddress],['Servico',contract.service],['Data do evento',contract.eventDate],['Horario',`${contract.startTime||''} ${contract.endTime?`as ${contract.endTime}`:''}`],['Local',contract.location],['Pacote',contract.packageName],['Servicos incluidos',contract.services],['Valor total',contract.total],['Entrada',contract.deposit],['Saldo',contract.balance],['Forma de pagamento',contract.paymentMethod],['Parcelas',contract.installments],['Vencimentos',contract.dueDates],['Contratado',contract.studioName],['CPF / CNPJ do estudio',contract.studioDocument],['PIX',contract.studioPix],['Assinatura / local',`${contract.signatureCity||''}, ${contract.signatureDate||''}`]];
  for(const[label,value]of rows){if(!value)continue;page.drawText(sanitize(label),{x:42,y,size:8,font:bold,color:rgb(.2,.2,.2)});const text=sanitize(value);const lines=[];let current='';for(const word of text.split(/\s+/)){if(regular.widthOfTextAtSize(`${current} ${word}`,9)>390){lines.push(current);current=word}else current=current?`${current} ${word}`:word}lines.push(current);for(const line of lines){page.drawText(line,{x:155,y,size:9,font:regular,color:rgb(.15,.15,.15)});y-=13}y-=7;if(y<80)break}
  page.drawText('As paginas anteriores correspondem integralmente ao PDF juridico original e permanecem inalteradas.',{x:42,y:38,size:7,font:regular,color:rgb(.4,.4,.4)});
  const bytes=await pdf.save();
  return {bytes,originalHashSnapshot:{modelId:model.id,version:model.version,pageCount:model.pages,sourceUrl:model.sourceUrl},fileName:`Contrato-${model.type}-${safeName(contract.clientName||'Cliente')}-${new Date().getFullYear()}.pdf`};
}

export function downloadPdf(bytes,fileName){const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=fileName;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}
