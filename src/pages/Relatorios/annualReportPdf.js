import {
  PDFDocument,
  StandardFonts,
  rgb,
} from '../../vendor/pdf-lib.esm.min.js';
import { formatReportDate } from './annualReportData';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

const COLORS = {
  gold: rgb(0.67, 0.48, 0.22),
  dark: rgb(0.07, 0.07, 0.07),
  text: rgb(0.13, 0.13, 0.13),
  muted: rgb(0.42, 0.42, 0.42),
  light: rgb(0.95, 0.95, 0.94),
  border: rgb(0.84, 0.84, 0.82),
  positive: rgb(0.12, 0.45, 0.30),
  negative: rgb(0.70, 0.18, 0.18),
  white: rgb(1, 1, 1),
};

const sanitize = (value) => String(value ?? '')
  .replace(/[–—]/g, '-')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[^\x20-\x7EÀ-ÿ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const safeFileName = (value) => sanitize(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const money = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value || 0));

const wrapText = (text, font, size, maxWidth) => {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  if (!words.length) return ['-'];

  const lines = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      return;
    }

    if (current) lines.push(current);

    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      return;
    }

    let fragment = '';
    [...word].forEach((character) => {
      const next = `${fragment}${character}`;
      if (font.widthOfTextAtSize(next, size) > maxWidth && fragment) {
        lines.push(fragment);
        fragment = character;
      } else {
        fragment = next;
      }
    });
    current = fragment;
  });

  if (current) lines.push(current);
  return lines.length ? lines : ['-'];
};

const downloadBytes = (bytes, fileName) => {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
};

export async function generateAnnualReportPdf({ report, studio = {} }) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page;
  let y;
  let pageNumber = 0;

  const drawFooter = () => {
    page.drawLine({
      start: { x: MARGIN, y: 31 },
      end: { x: PAGE_WIDTH - MARGIN, y: 31 },
      thickness: 0.5,
      color: COLORS.border,
    });
    page.drawText(
      sanitize('Relatório gerencial para conferência. Não substitui documentos fiscais, extratos bancários ou orientação contábil.'),
      { x: MARGIN, y: 18, size: 6.5, font: regular, color: COLORS.muted, maxWidth: CONTENT_WIDTH - 45 },
    );
    page.drawText(String(pageNumber), {
      x: PAGE_WIDTH - MARGIN - 16,
      y: 18,
      size: 7,
      font: bold,
      color: COLORS.muted,
    });
  };

  const addPage = ({ sectionTitle = '' } = {}) => {
    if (page) drawFooter();
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pageNumber += 1;
    y = PAGE_HEIGHT - MARGIN;

    page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 72,
      width: PAGE_WIDTH,
      height: 72,
      color: COLORS.dark,
    });
    page.drawText(sanitize(studio.name || studio.legalName || 'StudioFlow'), {
      x: MARGIN,
      y: PAGE_HEIGHT - 34,
      size: 15,
      font: bold,
      color: COLORS.gold,
    });
    page.drawText(`RELATÓRIO ANUAL ${report.year}`, {
      x: MARGIN,
      y: PAGE_HEIGHT - 53,
      size: 8.5,
      font: bold,
      color: COLORS.white,
    });

    if (sectionTitle) {
      const width = bold.widthOfTextAtSize(sanitize(sectionTitle), 8);
      page.drawText(sanitize(sectionTitle), {
        x: PAGE_WIDTH - MARGIN - width,
        y: PAGE_HEIGHT - 53,
        size: 8,
        font: bold,
        color: COLORS.white,
      });
    }

    y = PAGE_HEIGHT - 94;
  };

  const ensureSpace = (height, sectionTitle = '') => {
    if (y - height < 48) addPage({ sectionTitle });
  };

  const drawSectionTitle = (title, subtitle = '') => {
    ensureSpace(subtitle ? 48 : 32, title);
    page.drawText(sanitize(title), {
      x: MARGIN,
      y,
      size: 13,
      font: bold,
      color: COLORS.dark,
    });
    y -= 17;

    if (subtitle) {
      const lines = wrapText(subtitle, regular, 7.5, CONTENT_WIDTH);
      lines.forEach((line) => {
        page.drawText(line, {
          x: MARGIN,
          y,
          size: 7.5,
          font: regular,
          color: COLORS.muted,
        });
        y -= 10;
      });
    }

    y -= 8;
  };

  const drawInfoRow = (label, value) => {
    ensureSpace(18);
    page.drawText(sanitize(label), {
      x: MARGIN,
      y,
      size: 8,
      font: bold,
      color: COLORS.muted,
    });
    page.drawText(sanitize(value || '-'), {
      x: MARGIN + 125,
      y,
      size: 8.5,
      font: regular,
      color: COLORS.text,
      maxWidth: CONTENT_WIDTH - 125,
    });
    y -= 16;
  };

  const drawMetricGrid = (items) => {
    const gap = 9;
    const width = (CONTENT_WIDTH - gap) / 2;
    const height = 54;

    items.forEach((item, index) => {
      if (index % 2 === 0) ensureSpace(height + 8);
      const column = index % 2;
      const x = MARGIN + (column * (width + gap));
      const boxY = y - height;

      page.drawRectangle({
        x,
        y: boxY,
        width,
        height,
        color: COLORS.light,
        borderColor: COLORS.border,
        borderWidth: 0.6,
      });
      page.drawText(sanitize(item.label), {
        x: x + 12,
        y: boxY + 34,
        size: 7.2,
        font: bold,
        color: COLORS.muted,
      });
      page.drawText(sanitize(item.value), {
        x: x + 12,
        y: boxY + 14,
        size: 13.5,
        font: bold,
        color: item.color || COLORS.dark,
        maxWidth: width - 24,
      });

      if (column === 1 || index === items.length - 1) y -= height + 9;
    });
  };

  const drawWarning = (title, body) => {
    const lines = wrapText(body, regular, 7.5, CONTENT_WIDTH - 28);
    const height = 29 + (lines.length * 10);
    ensureSpace(height + 8);
    page.drawRectangle({
      x: MARGIN,
      y: y - height,
      width: CONTENT_WIDTH,
      height,
      color: rgb(1, 0.97, 0.89),
      borderColor: COLORS.gold,
      borderWidth: 0.7,
    });
    page.drawText(sanitize(title), {
      x: MARGIN + 13,
      y: y - 18,
      size: 8.5,
      font: bold,
      color: COLORS.dark,
    });
    let lineY = y - 31;
    lines.forEach((line) => {
      page.drawText(line, {
        x: MARGIN + 13,
        y: lineY,
        size: 7.5,
        font: regular,
        color: COLORS.text,
      });
      lineY -= 10;
    });
    y -= height + 10;
  };

  const drawTable = ({ title, columns, rows, emptyText = 'Sem registros para o período.' }) => {
    drawSectionTitle(title);
    const headerHeight = 24;
    const fontSize = 6.8;
    const paddingX = 6;
    const lineHeight = 9;
    const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
    const offsetX = MARGIN + Math.max(0, (CONTENT_WIDTH - tableWidth) / 2);

    const drawHeader = () => {
      ensureSpace(headerHeight + 20, title);
      let x = offsetX;
      page.drawRectangle({
        x: offsetX,
        y: y - headerHeight,
        width: tableWidth,
        height: headerHeight,
        color: COLORS.dark,
      });
      columns.forEach((column) => {
        page.drawText(sanitize(column.label), {
          x: x + paddingX,
          y: y - 15,
          size: 6.5,
          font: bold,
          color: COLORS.white,
          maxWidth: column.width - (paddingX * 2),
        });
        x += column.width;
      });
      y -= headerHeight;
    };

    drawHeader();

    if (!rows.length) {
      ensureSpace(32, title);
      page.drawRectangle({
        x: offsetX,
        y: y - 29,
        width: tableWidth,
        height: 29,
        borderColor: COLORS.border,
        borderWidth: 0.5,
      });
      page.drawText(sanitize(emptyText), {
        x: offsetX + 8,
        y: y - 18,
        size: 7.3,
        font: regular,
        color: COLORS.muted,
      });
      y -= 40;
      return;
    }

    rows.forEach((row, rowIndex) => {
      const cellLines = columns.map((column) => wrapText(
        row[column.key] ?? '-',
        regular,
        fontSize,
        column.width - (paddingX * 2),
      ));
      const rowHeight = Math.max(25, (Math.max(...cellLines.map((lines) => lines.length)) * lineHeight) + 10);

      if (y - rowHeight < 48) {
        addPage({ sectionTitle: title });
        drawHeader();
      }

      page.drawRectangle({
        x: offsetX,
        y: y - rowHeight,
        width: tableWidth,
        height: rowHeight,
        color: rowIndex % 2 === 0 ? COLORS.white : rgb(0.975, 0.975, 0.97),
        borderColor: COLORS.border,
        borderWidth: 0.35,
      });

      let x = offsetX;
      columns.forEach((column, columnIndex) => {
        let cellY = y - 14;
        const lines = cellLines[columnIndex];
        lines.forEach((line) => {
          const color = column.color
            ? column.color(row[column.key], row)
            : COLORS.text;
          page.drawText(line, {
            x: x + paddingX,
            y: cellY,
            size: fontSize,
            font: column.bold ? bold : regular,
            color,
            maxWidth: column.width - (paddingX * 2),
          });
          cellY -= lineHeight;
        });
        x += column.width;
      });

      y -= rowHeight;
    });

    y -= 14;
  };

  addPage({ sectionTitle: 'Resumo' });

  page.drawText('RELATÓRIO FINANCEIRO ANUAL', {
    x: MARGIN,
    y,
    size: 22,
    font: bold,
    color: COLORS.dark,
  });
  y -= 29;
  page.drawText(`Exercício ${report.year} - apoio à organização do Imposto de Renda`, {
    x: MARGIN,
    y,
    size: 10.5,
    font: bold,
    color: COLORS.gold,
  });
  y -= 28;

  drawInfoRow('Estúdio / empresa', studio.name || studio.legalName || 'Não informado');
  drawInfoRow('CPF / CNPJ', studio.document || 'Não informado');
  drawInfoRow('E-mail', studio.email || 'Não informado');
  drawInfoRow('Telefone', studio.phone || studio.whatsapp || 'Não informado');
  drawInfoRow('Endereço', studio.address || 'Não informado');
  drawInfoRow('Gerado em', new Date().toLocaleString('pt-BR'));
  y -= 5;

  drawSectionTitle(
    'Resumo do exercício',
    'Projetos são filtrados pela data do trabalho. Recebimentos e despesas são filtrados pela data efetiva de pagamento registrada no StudioFlow.',
  );

  drawMetricGrid([
    { label: 'Projetos com data no ano', value: String(report.totals.projects) },
    { label: 'Receita contratada dos trabalhos', value: money(report.totals.contracted) },
    { label: 'Recebimentos com data no ano', value: money(report.totals.annualReceived), color: COLORS.positive },
    { label: 'Recebido em Empresa / CNPJ', value: money(report.totals.companyReceived), color: COLORS.positive },
    { label: 'Saldo dos trabalhos do ano', value: money(report.totals.remaining) },
    { label: 'Despesas pagas no ano', value: money(report.totals.annualExpenses), color: COLORS.negative },
    { label: 'Resultado financeiro do ano', value: money(report.totals.annualResult), color: report.totals.annualResult >= 0 ? COLORS.positive : COLORS.negative },
    { label: 'Casamentos no ano', value: String(report.totals.weddings) },
  ]);

  if (report.warnings.receiptsWithoutDate || report.warnings.expensesWithoutDate || report.warnings.projectsWithoutDate || report.warnings.pendingExpenses) {
    drawWarning(
      'Dados que precisam de conferência',
      `${report.warnings.receiptsWithoutDate} recebimento(s), somando ${money(report.warnings.receiptsWithoutDateAmount)}, estão sem data individual e não entram no fluxo anual. ${report.warnings.expensesWithoutDate} despesa(s) paga(s), somando ${money(report.warnings.expensesWithoutDateAmount)}, estão sem data. ${report.warnings.pendingExpenses} despesa(s), somando ${money(report.warnings.pendingExpensesAmount)}, ainda não estão confirmadas como pagas e não entram no resultado anual. ${report.warnings.projectsWithoutDate} projeto(s) estão sem data do trabalho.`,
    );
  }

  drawTable({
    title: 'Fluxo financeiro mensal',
    columns: [
      { key: 'month', label: 'Mês', width: 70, bold: true },
      { key: 'received', label: 'Recebido', width: 125 },
      { key: 'companyReceived', label: 'Empresa / CNPJ', width: 125 },
      { key: 'expenses', label: 'Despesas pagas', width: 110 },
      { key: 'result', label: 'Resultado', width: 81, bold: true, color: (value) => String(value).startsWith('-') ? COLORS.negative : COLORS.positive },
    ],
    rows: report.monthly.map((item) => ({
      month: item.label,
      received: money(item.received),
      companyReceived: money(item.companyReceived),
      expenses: money(item.expenses),
      result: money(item.result),
    })),
  });

  drawTable({
    title: 'Recebimentos registrados no ano',
    columns: [
      { key: 'date', label: 'Data', width: 58 },
      { key: 'client', label: 'Cliente / origem', width: 145, bold: true },
      { key: 'service', label: 'Serviço', width: 90 },
      { key: 'method', label: 'Forma / conta', width: 120 },
      { key: 'amount', label: 'Valor', width: 98, bold: true, color: () => COLORS.positive },
    ],
    rows: report.receipts.map((receipt) => ({
      date: formatReportDate(receipt.date),
      client: receipt.clientName,
      service: receipt.service,
      method: `${receipt.method || 'Não informado'} / ${receipt.account || 'Não informado'}`,
      amount: money(receipt.amount),
    })),
    emptyText: 'Nenhum recebimento com data foi registrado neste ano.',
  });

  drawTable({
    title: 'Despesas pagas no ano',
    columns: [
      { key: 'date', label: 'Data', width: 58 },
      { key: 'description', label: 'Descrição', width: 160, bold: true },
      { key: 'category', label: 'Categoria', width: 100 },
      { key: 'method', label: 'Pagamento / conta', width: 110 },
      { key: 'amount', label: 'Valor', width: 83, bold: true, color: () => COLORS.negative },
    ],
    rows: report.expenses.map((expense) => ({
      date: formatReportDate(expense.date),
      description: expense.description,
      category: expense.category,
      method: `${expense.method || 'Não informado'} / ${expense.account || 'Não informado'}`,
      amount: money(expense.amount),
    })),
    emptyText: 'Nenhuma despesa marcada como paga foi registrada neste ano.',
  });

  drawTable({
    title: 'Trabalhos com data no ano',
    columns: [
      { key: 'date', label: 'Data', width: 58 },
      { key: 'client', label: 'Cliente', width: 120, bold: true },
      { key: 'service', label: 'Serviço', width: 80 },
      { key: 'contracted', label: 'Contratado', width: 84 },
      { key: 'received', label: 'Recebido total', width: 84 },
      { key: 'remaining', label: 'Saldo', width: 85 },
    ],
    rows: report.projectRows.map((project) => ({
      date: formatReportDate(project.date),
      client: project.clientName,
      service: project.service,
      contracted: money(project.contracted),
      received: money(project.receivedTotal),
      remaining: money(project.remaining),
    })),
    emptyText: 'Nenhum trabalho possui data neste ano.',
  });

  drawFooter();
  const bytes = await pdf.save();
  const studioName = safeFileName(studio.name || 'StudioFlow');
  const fileName = `${studioName || 'StudioFlow'}-Relatorio-Anual-${report.year}.pdf`;
  downloadBytes(bytes, fileName);

  return { bytes, fileName };
}
