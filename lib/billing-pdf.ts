// lib/billing-pdf.ts — billing B4 (22 Oct; claude/billing-design-2026-10-20.md, "B4 plan").
// PDF receipts, GST invoices and credit notes, drawn in the browser from the stored document (its own copy of the
// seller and buyer details), so a re-download always matches what was issued. "Rs." because the PDF font has no ₹.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GST_STATES, RECON_LABEL, type ReconStatus } from '@/lib/billing';

interface Party { name: string; address: string; gstin?: string; state: string; enrollmentId?: string }
export interface BillingDocument {
  id: number; doc_type: 'RECEIPT' | 'INVOICE' | 'CREDIT_NOTE'; doc_number: string; doc_date: string;
  payment_entry_id: number | null; against_document_id: number | null; cancelled?: boolean;
  seller: Party; buyer: Party; igst: boolean;
  taxable: number | string; cgst: number | string; sgst: number | string; igst_amount: number | string; total: number | string;
  lines: { id: number; description: string; sac: string | null; taxable: number | string; gst_rate: number | string | null; gst_amount: number | string; total: number | string }[];
}
export interface PaymentInfo { method: string | null; reference: string | null; entry_date: string }

export const DOC_LABEL = { RECEIPT: 'Receipt', INVOICE: 'Tax invoice', CREDIT_NOTE: 'Credit note' } as const;
const rs = (n: number | string) => `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stateLabel = (code: string) => (code ? `${code} - ${GST_STATES[code] ?? ''}` : '');
const dateLabel = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Download one document. againstNumber: the invoice a credit note corrects; payment: the payment behind a receipt. */
export function downloadBillingDocument(d: BillingDocument, opts: { againstNumber?: string; payment?: PaymentInfo } = {}) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();

  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, w, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(d.seller.name || 'Flight Training School', 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(doc.splitTextToSize(d.seller.address || '', w - 90).slice(0, 2), 14, 19);
  if (d.seller.gstin) doc.text(`GSTIN: ${d.seller.gstin}   State: ${stateLabel(d.seller.state)}`, 14, 29);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(DOC_LABEL[d.doc_type].toUpperCase(), w - 14, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`No. ${d.doc_number}`, w - 14, 20, { align: 'right' });
  doc.text(`Date: ${dateLabel(d.doc_date)}`, w - 14, 25, { align: 'right' });
  if (opts.againstNumber) doc.text(`Against invoice ${opts.againstNumber}`, w - 14, 30, { align: 'right' });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(d.doc_type === 'RECEIPT' ? 'Received from' : 'Bill to', 14, 44);
  doc.setFont('helvetica', 'normal');
  const buyer = [
    `${d.buyer.name}${d.buyer.enrollmentId ? ` (${d.buyer.enrollmentId})` : ''}`,
    ...doc.splitTextToSize(d.buyer.address || '', w - 28).slice(0, 2),
    ...(d.doc_type === 'RECEIPT' ? [] : [`Place of supply: ${stateLabel(d.buyer.state || d.seller.state)}`]),
  ];
  doc.text(buyer, 14, 50);
  let y = 50 + buyer.length * 4.5 + 4;

  if (d.doc_type === 'RECEIPT') {
    const p = opts.payment;
    doc.setFontSize(11);
    doc.text(doc.splitTextToSize(
      `Received with thanks ${rs(d.total)}${p?.method ? ` by ${p.method}` : ''}${p?.reference ? ` (ref. ${p.reference})` : ''}, towards fees.`, w - 28,
    ), 14, y + 4);
    if (d.cancelled) {
      doc.setTextColor(200, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(28);
      doc.text('CANCELLED', w / 2, y + 30, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }
    y += 40;
  } else {
    autoTable(doc, {
      startY: y,
      head: [['#', 'Description', 'SAC', 'Taxable value', 'GST %', 'GST', 'Total']],
      body: d.lines.map((l, i) => [i + 1, l.description, l.sac ?? '', rs(l.taxable), l.gst_rate == null ? '' : `${Number(l.gst_rate)}%`, rs(l.gst_amount), rs(l.total)]),
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [0, 0, 0] },
      columnStyles: { 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
    y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;
    const totals: [string, string][] = [
      ['Taxable value', rs(d.taxable)],
      ...(d.igst ? [['IGST', rs(d.igst_amount)] as [string, string]] : [['CGST', rs(d.cgst)], ['SGST', rs(d.sgst)]] as [string, string][]),
      [d.doc_type === 'CREDIT_NOTE' ? 'Total credited' : 'Total', rs(d.total)],
    ];
    totals.forEach(([k, v], i) => {
      doc.setFont('helvetica', i === totals.length - 1 ? 'bold' : 'normal');
      doc.text(k, w - 70, y + i * 5.5);
      doc.text(v, w - 14, y + i * 5.5, { align: 'right' });
    });
    y += totals.length * 5.5 + 6;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Computer-generated document; no signature required.', 14, Math.max(y, 120));
  doc.save(`${d.doc_number.replace(/[^A-Za-z0-9-]+/g, '_')}.pdf`);
}

// ---- B4b (22 Oct): statements and the reconciliation report ----
/** A balance the accountant's way: Dr = the student owes, Cr = money on account. */
export const drCr = (n: number) => (n === 0 ? rs(0) : `${rs(Math.abs(n))} ${n < 0 ? 'Dr' : 'Cr'}`);
type Cell = string | number;

function reportDoc(title: string, school: string, subtitle: string, orientation: 'portrait' | 'landscape' = 'portrait') {
  const doc = new jsPDF({ orientation });
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, w, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(school || 'Flight Training School', 14, 11);
  doc.text(title.toUpperCase(), w - 14, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(subtitle, w - 14, 18, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  return doc;
}

function table(doc: jsPDF, startY: number, head: string[], body: Cell[][], right: number[], foot?: Cell[]) {
  autoTable(doc, {
    startY, head: [head], body: body.length ? body : [[{ content: 'Nothing in this period.', colSpan: head.length }] as unknown as Cell[]],
    foot: foot ? [foot] : undefined, theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8 },
    footStyles: { fillColor: [241, 245, 249], textColor: [0, 0, 0], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [0, 0, 0] },
    columnStyles: Object.fromEntries(right.map(i => [i, { halign: 'right' as const }])),
    margin: { left: 14, right: 14 },
  });
  return ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY) + 8;
}

const periodLabel = (from: string, to: string) => `${dateLabel(from)} to ${dateLabel(to)}`;
const fileName = (s: string) => `${s.replace(/[^A-Za-z0-9-]+/g, '_')}.pdf`;

export interface StatementData {
  from: string; to: string; student: { name: string; enrollmentId: string; address: string };
  opening: number; charges: number; credits: number; closing: number;
  lines: { entry_date: string; kind: string; description: string; method: string | null; reference: string | null; debit: number | string; credit: number | string; balance: number }[];
}

/** One student's statement of account for a period. */
export function downloadStatement(s: StatementData, school: string) {
  const doc = reportDoc('Statement of account', school, periodLabel(s.from, s.to));
  doc.setFontSize(9);
  doc.text([`${s.student.name}${s.student.enrollmentId ? ` (${s.student.enrollmentId})` : ''}`, ...doc.splitTextToSize(s.student.address || '', 180).slice(0, 2)], 14, 32);
  const y = table(doc, 44, ['Date', 'Particulars', 'Charges', 'Paid / credit', 'Balance'], [
    [dateLabel(s.from), 'Opening balance', '', '', drCr(s.opening)],
    ...s.lines.map(l => [dateLabel(l.entry_date), `${l.description}${l.method ? ` (${l.method}${l.reference ? ` ${l.reference}` : ''})` : ''}`,
      Number(l.debit) ? rs(l.debit) : '', Number(l.credit) ? rs(l.credit) : '', drCr(l.balance)]),
  ], [2, 3, 4], ['', 'Closing balance', rs(s.charges), rs(s.credits), drCr(s.closing)]);
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Dr = amount owed to the school; Cr = money on account. Computer-generated statement.', 14, y);
  doc.save(fileName(`Statement_${s.student.enrollmentId || s.student.name}_${s.from}_${s.to}`));
}

export interface ConsolidatedData {
  from: string; to: string;
  rows: { name: string; enrollmentId: string; opening: number; charges: number; credits: number; closing: number }[];
  totals: { opening: number; charges: number; credits: number; closing: number };
}

/** All students for a period: one row each, with school totals. */
export function downloadConsolidated(c: ConsolidatedData, school: string, title: string) {
  const doc = reportDoc(title, school, periodLabel(c.from, c.to));
  table(doc, 32, ['Student', 'Enrolment', 'Opening', 'Charges', 'Paid / credit', 'Closing'],
    c.rows.map(r => [r.name, r.enrollmentId ?? '', drCr(r.opening), rs(r.charges), rs(r.credits), drCr(r.closing)]), [2, 3, 4, 5],
    [`${c.rows.length} students`, '', drCr(c.totals.opening), rs(c.totals.charges), rs(c.totals.credits), drCr(c.totals.closing)]);
  doc.save(fileName(`Consolidated_statement_${c.from}_${c.to}`));
}

export interface ReconRow {
  flight_date: string; student: string; aircraft: string; hours: number; packageHours: number; chargedHours: number;
  charged: number; voidedCharges: number; status: ReconStatus;
}
export interface ReconTotal { key: string; flights: number; hours: number; packageHours: number; charged: number }

/** The reconciliation report: every flight beside its charge, then totals by month, student and aircraft. */
export function downloadReconciliation(r: { from: string; to: string; rows: ReconRow[]; totals: { title: string; rows: ReconTotal[] }[] }, school: string) {
  const doc = reportDoc('Billing reconciliation', school, periodLabel(r.from, r.to), 'landscape');
  let y = table(doc, 32, ['Date', 'Student', 'Aircraft', 'Hours', 'From package', 'Charged hours', 'Charged', 'Status', 'Voided charges'],
    r.rows.map(x => [dateLabel(x.flight_date), x.student, x.aircraft, x.hours, x.packageHours || '', x.chargedHours || '', x.charged ? rs(x.charged) : '',
      RECON_LABEL[x.status], x.voidedCharges || '']), [3, 4, 5, 6, 8]);
  for (const t of r.totals) {
    if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(t.title, 14, y);
    doc.setFont('helvetica', 'normal');
    y = table(doc, y + 3, [t.title.replace('Totals by ', '').replace(/^./, m => m.toUpperCase()), 'Flights', 'Hours', 'From package', 'Charged'],
      t.rows.map(x => [x.key, x.flights, x.hours, x.packageHours, rs(x.charged)]), [1, 2, 3, 4]);
  }
  doc.save(fileName(`Billing_reconciliation_${r.from}_${r.to}`));
}

