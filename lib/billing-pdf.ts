// lib/billing-pdf.ts — billing B4 (22 Oct; claude/billing-design-2026-10-20.md, "B4 plan").
// PDF receipts, GST invoices and credit notes, drawn in the browser from the stored document (its own copy of the
// seller and buyer details), so a re-download always matches what was issued. "Rs." because the PDF font has no ₹.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GST_STATES } from '@/lib/billing';

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
