import { PDFDocument, StandardFonts, rgb } from '../../../vendor/pdf-lib.esm.min.js';

const clean = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '');

export async function generateProposalPdf({ template, proposal }) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const definition of template.pages) {
    const page = pdf.addPage([595.28, 841.89]);
    const asset = proposal.assets[definition.imageSlots[0]?.id];
    if (asset?.src) {
      const bytes = await fetch(asset.src).then((response) => response.arrayBuffer());
      const image = asset.src.startsWith('data:image/png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const scale = Math.max(595.28 / image.width, 841.89 / image.height) * Number(asset.zoom || 1);
      page.drawImage(image, { x: (595.28 - image.width * scale) * (Number(asset.x || 50) / 100), y: (841.89 - image.height * scale) * (1 - Number(asset.y || 50) / 100), width: image.width * scale, height: image.height * scale, opacity: Number(asset.opacity || 1) });
    }
    page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(.04, .04, .04), opacity: asset?.src ? .3 : .78 });
    let y = 700;
    for (const text of definition.fixedTexts) {
      page.drawText(clean(text), { x: 48, y, size: 11, font: regular, color: rgb(.93, .9, .84), maxWidth: 500 });
      y -= 36;
    }
    page.drawText(clean(definition.title), { x: 48, y, size: 28, font: bold, color: rgb(.79, .63, .42), maxWidth: 500 });
    if (definition.dynamicBlocks.includes('packages')) {
      const state = proposal.pricingSnapshot.state || {};
      page.drawText(clean(state.categoria || 'Pacote selecionado'), { x: 48, y: y - 70, size: 18, font: bold, color: rgb(1, 1, 1) });
      page.drawText(clean(state.service || state.ensaioTipo || ''), { x: 48, y: y - 100, size: 11, font: regular, color: rgb(.9, .9, .9) });
    }
  }
  const bytes = await pdf.save();
  const client = clean(proposal.clientName || 'Cliente').replace(/\s+/g, '-');
  const fileName = `Proposta-${template.type}-${client}-${new Date().toISOString().slice(0, 10)}.pdf`;
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { bytes, fileName };
}
