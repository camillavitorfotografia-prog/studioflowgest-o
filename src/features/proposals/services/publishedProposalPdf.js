import { PDFDocument, StandardFonts, degrees, rgb } from '../../../vendor/pdf-lib.esm.min.js';

const safeText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\u0020-\u007E]/g, (character) => (['\t', '\n', '\r'].includes(character) ? character : ''));

const colorFromHex = (value, fallback = '#ffffff') => {
  const raw = String(value || fallback).replace('#', '').trim();
  const normalized = raw.length === 3 ? raw.split('').map((char) => `${char}${char}`).join('') : raw;
  const number = Number.parseInt(normalized, 16);
  if (!Number.isFinite(number)) return rgb(1, 1, 1);
  return rgb(((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255);
};

const loadImage = async (pdf, source) => {
  if (!source) return null;
  const response = await fetch(source);
  if (!response.ok) throw new Error('Não foi possível carregar uma imagem da proposta.');
  const bytes = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('png') || String(source).startsWith('data:image/png')) return pdf.embedPng(bytes);
  return pdf.embedJpg(bytes);
};

const drawCoverImage = (page, image, box, opacity = 1) => {
  if (!image) return;
  const scale = Math.max(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
    opacity: Math.max(0, Math.min(1, Number(opacity ?? 1))),
  });
};

const wrapLine = (font, text, size, maxWidth) => {
  const words = safeText(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
};

const drawTextElement = (page, element, regular, bold, pageHeight) => {
  const font = Number(element.fontWeight || 400) >= 600 ? bold : regular;
  const size = Math.max(6, Number(element.fontSize || 16));
  const lineHeight = size * Number(element.lineHeight || 1.25);
  const width = Math.max(10, Number(element.width || 100));
  const x = Number(element.x || 0);
  const top = Number(element.y || 0);
  const rawLines = safeText(element.content || '').split('\n');
  const lines = rawLines.flatMap((line) => wrapLine(font, line, size, width));
  let y = pageHeight - top - size;
  for (const line of lines) {
    if (y < 0) break;
    const textWidth = font.widthOfTextAtSize(line, size);
    let drawX = x;
    if (element.align === 'center') drawX = x + Math.max(0, (width - textWidth) / 2);
    if (element.align === 'right') drawX = x + Math.max(0, width - textWidth);
    page.drawText(line, {
      x: drawX,
      y,
      size,
      font,
      color: colorFromHex(element.color, '#ffffff'),
      opacity: Math.max(0, Math.min(1, Number(element.opacity ?? 1))),
      rotate: degrees(Number(element.rotation || 0)),
    });
    y -= lineHeight;
  }
};

export async function generatePublishedProposalPdf({ template, pages, lead }) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const definition of pages || []) {
    const width = Number(definition.width || 595.28);
    const height = Number(definition.height || 841.89);
    const page = pdf.addPage([width, height]);
    const background = definition.background || {};
    if (background.url) {
      try {
        const image = await loadImage(pdf, background.url);
        drawCoverImage(page, image, { x: 0, y: 0, width, height }, background.opacity);
      } catch (error) {
        console.warn(error);
      }
    }
    if (background.overlayColor && Number(background.overlayOpacity || 0) > 0) {
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height,
        color: colorFromHex(background.overlayColor, '#000000'),
        opacity: Math.max(0, Math.min(1, Number(background.overlayOpacity || 0))),
      });
    }

    const elements = [...(definition.elements || [])]
      .filter((element) => element.visible !== false)
      .sort((a, b) => Number(a.zIndex || 0) - Number(b.zIndex || 0));

    for (const element of elements) {
      if (['text', 'pricing', 'dynamicField', 'package'].includes(element.type)) {
        drawTextElement(page, element, regular, bold, height);
        continue;
      }
      if (element.type === 'overlay') {
        page.drawRectangle({
          x: Number(element.x || 0),
          y: height - Number(element.y || 0) - Number(element.height || 0),
          width: Number(element.width || 0),
          height: Number(element.height || 0),
          color: colorFromHex(element.backgroundColor || element.fill, '#000000'),
          opacity: Math.max(0, Math.min(1, Number(element.opacity ?? 1))),
          rotate: degrees(Number(element.rotation || 0)),
        });
        continue;
      }
      if (['image', 'logo'].includes(element.type) && element.src) {
        try {
          const image = await loadImage(pdf, element.src);
          drawCoverImage(page, image, {
            x: Number(element.x || 0),
            y: height - Number(element.y || 0) - Number(element.height || 0),
            width: Number(element.width || 0),
            height: Number(element.height || 0),
          }, element.opacity);
        } catch (error) {
          console.warn(error);
        }
      }
    }
  }

  const bytes = await pdf.save();
  const clientName = safeText(lead?.nome || lead?.name || 'Cliente').replace(/\s+/g, '-');
  const modelName = safeText(template?.name || 'Proposta').replace(/\s+/g, '-');
  const fileName = `${modelName}-${clientName}-${new Date().toISOString().slice(0, 10)}.pdf`;
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { bytes, fileName };
}

export default generatePublishedProposalPdf;
