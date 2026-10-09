import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { ReportData } from './data';
// DejaVu Sans (open licence, see DejaVuSans-LICENSE.txt), inlined so no request is made to load it.
import fontData from './DejaVuSans.ttf?inline';

type Rgb = [number, number, number];
const INK: Rgb = [27, 27, 24];
const MUTED: Rgb = [93, 93, 85];
const ACCENT: Rgb = [63, 125, 70];
const LINE: Rgb = [222, 221, 211];
const PAPER: Rgb = [247, 246, 241];

const MARGIN = 14;
const PAGE_H = 297;

/** Draws the report. Only one font weight is embedded (it is large), so emphasis comes from size and colour. */
export function renderReport(r: ReportData, japaneseFont?: string): Uint8Array<ArrayBuffer> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  // The whole report is set in one font: DejaVu, or M PLUS 1p (base64, downloaded by the user) when the report was
  // built for Japanese. M PLUS has Latin, kana, kanji and ₱ too, so mixed names print correctly.
  const family = r.japanese && japaneseFont ? 'MPLUS1p' : 'DejaVuSans';
  doc.addFileToVFS('DejaVuSans.ttf', fontData.slice(fontData.indexOf(',') + 1));
  doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  if (family === 'MPLUS1p') {
    doc.addFileToVFS('MPLUS1p.ttf', japaneseFont!);
    doc.addFont('MPLUS1p.ttf', 'MPLUS1p', 'normal');
  }
  doc.setFont(family, 'normal');
  doc.setProperties({ title: 'FairsHare report', creator: 'FairsHare' });

  let y = 18;
  const ink = (size: number, color: Rgb) => doc.setFontSize(size).setTextColor(...color);

  // Wordmark: "hare" inside "fairshare" in the accent colour.
  ink(11, INK);
  doc.text('fairs', MARGIN, y);
  ink(11, ACCENT);
  doc.text('hare', MARGIN + doc.getTextWidth('fairs'), y);

  // Hare mark, top right: same shapes as public/icon.svg on a 512 grid.
  const k = 14 / 512;
  const hx = 210 - MARGIN - 14;
  doc.setFillColor(...ACCENT);
  for (const ex of [158, 278]) doc.roundedRect(hx + ex * k, 6 + 56 * k, 76 * k, 210 * k, 38 * k, 38 * k, 'F');
  doc.ellipse(hx + 256 * k, 6 + 340 * k, 140 * k, 118 * k, 'F');
  doc.setFillColor(...PAPER);
  doc.circle(hx + 306 * k, 6 + 322 * k, 16 * k, 'F');

  y += 9;
  ink(20, INK);
  const title = doc.splitTextToSize(r.tripName, 210 - 2 * MARGIN) as string[];
  doc.text(title, MARGIN, y);
  y += title.length * 8;
  ink(10, MUTED);
  for (const line of r.heading) {
    doc.text(line, MARGIN, y);
    y += 5;
  }
  y += 5;

  const tableLook = {
    theme: 'grid',
    margin: { left: MARGIN, right: MARGIN, bottom: 16 },
    styles: { font: family, fontStyle: 'normal', fontSize: 9, cellPadding: 2, textColor: INK, lineColor: LINE, lineWidth: 0.1 },
    headStyles: { fillColor: PAPER, textColor: MUTED, fontStyle: 'normal' },
  } as const;
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  function section(name: string, minSpace = 40) {
    if (y > PAGE_H - minSpace) {
      doc.addPage();
      y = 18;
    }
    ink(10, MUTED);
    doc.text(name.toUpperCase(), MARGIN, y);
    y += 3;
  }
  function note(text: string) {
    ink(10, INK);
    doc.text(text, MARGIN, y + 4);
    y += 12;
  }
  function table(head: string[], body: string[][], rightAligned: number[], widths: Record<number, number> = {}) {
    autoTable(doc, {
      ...tableLook,
      startY: y,
      head: [head],
      body,
      columnStyles: Object.fromEntries(head.map((_, i) => [i, { ...(rightAligned.includes(i) && { halign: 'right' }), ...(widths[i] && { cellWidth: widths[i] }) }])),
      didParseCell: (d) => {
        if (d.section === 'head' && rightAligned.includes(d.column.index)) d.cell.styles.halign = 'right';
      },
    });
    y = lastY() + 9;
  }

  section('Expenses');
  if (r.ledger.length === 0) note('No expenses yet');
  else table(['Date', 'Expense', 'Paid by', 'Amount', `In ${r.currency}`], r.ledger.map((l) => [l.date, l.title, l.paidBy, l.amount, l.base]), [3, 4], { 0: 24 });

  section('Per member');
  if (r.members.length === 0) note('No members yet');
  else table(['Member', 'Paid', 'Owed', 'Balance'], r.members.map((m) => [m.name, m.paid, m.owed, m.balance]), [1, 2, 3]);

  section('Settle up');
  if (r.settle.length === 0) note('All settled');
  else {
    autoTable(doc, { ...tableLook, startY: y, body: r.settle.map((s) => [s]) });
    y = lastY() + 9;
  }

  if (r.payments.length > 0) {
    section('Payments already made');
    autoTable(doc, { ...tableLook, startY: y, body: r.payments.map((p) => [p]) });
    y = lastY() + 9;
  }

  if (r.replaced) {
    ink(8, MUTED);
    doc.text('Some characters cannot be printed in this report and appear as ?', MARGIN, Math.min(y, PAGE_H - 20));
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    ink(8, MUTED);
    doc.text(`fairshare · ${r.tripName} · Page ${p} of ${pages}`, MARGIN, PAGE_H - 8);
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
