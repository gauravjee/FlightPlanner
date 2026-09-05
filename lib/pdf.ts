// lib/pdf.ts
// PDF generation service for student logbooks and the Daily Flying Report
// Uses jsPDF for PDF creation and jsPDF-AutoTable for tables

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FlightRecord, StudentRecord, BATest, MaintenanceRecord } from '@/types';

// jspdf-autotable augments the jsPDF instance with `lastAutoTable` at
// runtime, but its TS types don't declare that property — this local
// augmentation covers just the field this file reads from it.
interface JsPDFWithAutoTable extends jsPDF {
  lastAutoTable?: { finalY: number };
}

/**
 * Generate a student logbook PDF with all flight records
 * Includes student info, flight history table, totals, and instructor sign-off
 * 
 * @param student - The student's details
 * @param flights - Array of flight records for this student
 */
export function generateStudentLogbook(student: StudentRecord, flights: FlightRecord[]): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // ============================================================
  // HEADER
  // ============================================================
  doc.setFillColor(30, 41, 59); // Dark navy background
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('FlightPro Manager - Student Logbook', 14, 15);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 25);
  
  // ============================================================
  // STUDENT INFORMATION
  // ============================================================
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Student Information', 14, 45);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const studentInfo = [
    `Name: ${student.name}`,
    `Enrollment ID: ${student.enrollmentId}`,
    `Training Stage: ${student.trainingStage}`,
    `Total Hours: ${student.totalHours}h`,
    `Medical Expiry: ${student.medicalExpiry || 'N/A'}`,
  ];
  studentInfo.forEach((line, i) => {
    doc.text(line, 14, 55 + i * 7);
  });
  
  // ============================================================
  // FLIGHT RECORDS TABLE
  // ============================================================
  const tableData = flights.map(f => [
    new Date(f.flightDate).toLocaleDateString('en-IN'),
    f.aircraftReg || 'N/A',
    `${f.departureTime?.slice(0, 5) || '--'} - ${f.arrivalTime?.slice(0, 5) || '--'}`,
    f.totalHours?.toFixed(1) || '0',
    f.landings?.toString() || '0',
    f.flightType || 'N/A',
    f.sortieType?.replace(/_/g, ' ') || 'N/A',
    f.instructorName || 'N/A',
    '⭐'.repeat(f.studentPerformance || 0),
  ]);
  
  autoTable(doc, {
    startY: 95,
    head: [['Date', 'Aircraft', 'Time', 'Hrs', 'Ldgs', 'Type', 'Sortie', 'Instructor', 'Perf']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [0, 0, 0],
    },
    alternateRowStyles: {
      fillColor: [241, 245, 249],
    },
    margin: { left: 14, right: 14 },
  });
  
  // ============================================================
  // SUMMARY
  // ============================================================
  const totalHours = flights.reduce((sum, f) => sum + (f.totalHours || 0), 0);
  const totalLandings = flights.reduce((sum, f) => sum + (f.landings || 0), 0);
  const soloHours = flights.filter(f => f.flightType === 'SOLO').reduce((sum, f) => sum + (f.totalHours || 0), 0);
  const dualHours = flights.filter(f => f.flightType === 'DUAL').reduce((sum, f) => sum + (f.totalHours || 0), 0);
  
  const finalY = (doc as JsPDFWithAutoTable).lastAutoTable?.finalY || 150;
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Flight Summary', 14, finalY + 15);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const summary = [
    `Total Flights: ${flights.length}`,
    `Total Hours: ${totalHours.toFixed(1)}h`,
    `Total Landings: ${totalLandings}`,
    `Solo Hours: ${soloHours.toFixed(1)}h`,
    `Dual Hours: ${dualHours.toFixed(1)}h`,
  ];
  summary.forEach((line, i) => {
    doc.text(line, 14, finalY + 25 + i * 7);
  });
  
  // ============================================================
  // SIGN-OFF SECTION
  // ============================================================
  const signY = finalY + 70;
  doc.line(14, signY, 80, signY);
  doc.line(120, signY, 190, signY);
  doc.setFontSize(9);
  doc.text('Student Signature', 14, signY + 7);
  doc.text('Chief Flight Instructor', 120, signY + 7);
  
  // ============================================================
  // FOOTER
  // ============================================================
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(`Generated by FlightPro Manager | ${new Date().toLocaleString('en-IN')}`, 14, 285);
  
  // Save the PDF
  doc.save(`${student.name.replace(/\s+/g, '_')}_Logbook.pdf`);
}

/**
 * Generate the FTO Daily Flying Report PDF — the exact format supplied by
 * the FTO: a header (Date/Airport), a per-flight table, and a footer
 * block of day-level totals. Operates on an already-computed
 * DailyFlyingReport (see app/api/reports/daily-flying/route.ts for how
 * rows/stats are derived) rather than raw records, so the PDF always
 * matches whatever was actually saved/reviewed on screen.
 *
 * Supersedes the old generateDailyOpsSheet, which was built earlier but
 * never wired up to any button — this is its real replacement, shaped to
 * the FTO's actual specified format instead of a guessed one.
 *
 * @param report - The generated/saved Daily Flying Report
 */
export function generateDailyFlyingReport(report: {
  reportDate: string;
  airportCode?: string;
  rows: { aircraft: string; student: string; instructor: string; sortie: string; start: string; end: string; hours: number; type: string; exercise: string; remarks: string }[];
  stats: {
    totalAircraftHours: number; totalStudentHours: number; totalInstructorHours: number;
    dualHours: number; soloHours: number; crossCountryHours: number; nightHours: number;
    aircraftGrounded: number; flightsCancelled: number; weatherCancellations: number;
    maintenanceCancellations: number; otherCancellations: number; safetyIncidents: number;
  };
  remarks?: string;
}): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // ============================================================
  // HEADER
  // ============================================================
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('FTO Daily Flying Report', 14, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const dateLabel = new Date(report.reportDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Date: ${dateLabel}`, 14, 24);
  doc.text(`Airport: ${report.airportCode || 'N/A'}`, pageWidth - 14, 24, { align: 'right' });

  // ============================================================
  // FLIGHT TABLE
  // ============================================================
  const tableData = report.rows.map(r => [
    r.aircraft, r.student, r.instructor, r.sortie, r.start, r.end,
    r.hours.toFixed(1), r.type, r.exercise, r.remarks,
  ]);

  autoTable(doc, {
    startY: 38,
    head: [['Aircraft', 'Student', 'Instructor', 'Sortie', 'Start', 'End', 'Hours', 'Dual/Solo', 'Exercise', 'Remarks']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, textColor: [0, 0, 0] },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { left: 14, right: 14 },
  });

  // ============================================================
  // FOOTER SUMMARY
  // ============================================================
  const finalY = (doc as JsPDFWithAutoTable).lastAutoTable?.finalY || 45;
  const s = report.stats;
  const summaryLines = [
    `Total Aircraft Hours: ${s.totalAircraftHours.toFixed(1)}h`,
    `Total Student Flying Hours: ${s.totalStudentHours.toFixed(1)}h`,
    `Total Instructor Hours: ${s.totalInstructorHours.toFixed(1)}h`,
    `Dual Hours: ${s.dualHours.toFixed(1)}h`,
    `Solo Hours: ${s.soloHours.toFixed(1)}h`,
    `Cross-Country Hours: ${s.crossCountryHours.toFixed(1)}h`,
    `Night Hours: ${s.nightHours.toFixed(1)}h`,
    `Aircraft Grounded: ${s.aircraftGrounded}`,
    `Flights Cancelled: ${s.flightsCancelled}`,
    `  Weather Cancellations: ${s.weatherCancellations}`,
    `  Maintenance Cancellations: ${s.maintenanceCancellations}`,
    `  Other Cancellations: ${s.otherCancellations}`,
    `Safety Incidents: ${s.safetyIncidents}`,
  ];

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Summary', 14, finalY + 12);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const colSplit = Math.ceil(summaryLines.length / 2);
  summaryLines.slice(0, colSplit).forEach((line, i) => doc.text(line, 14, finalY + 20 + i * 6));
  summaryLines.slice(colSplit).forEach((line, i) => doc.text(line, 105, finalY + 20 + i * 6));

  const remarksY = finalY + 20 + colSplit * 6 + 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Remarks:', 14, remarksY);
  doc.setFont('helvetica', 'normal');
  const remarksText = doc.splitTextToSize(report.remarks?.trim() || 'None', pageWidth - 28);
  doc.text(remarksText, 14, remarksY + 7);

  // ============================================================
  // SIGN-OFF
  // ============================================================
  const signY = remarksY + 7 + remarksText.length * 5 + 15;
  doc.line(14, signY, 80, signY);
  doc.line(120, signY, 190, signY);
  doc.setFontSize(9);
  doc.text('Operations Officer', 14, signY + 7);
  doc.text('Chief Flight Instructor', 120, signY + 7);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(`Generated by FlightPro Manager | ${new Date().toLocaleString('en-IN')}`, 14, 290);

  doc.save(`Daily_Flying_Report_${report.reportDate}.pdf`);
}

/**
 * Generate the Breath Analysis Report PDF (2026-08-20, session 4) — a
 * daily/weekly/monthly rollup over the Breath Analyser (BA) Test Register
 * (see app/api/ba-tests/route.ts and app/dashboard/reports/breath-analysis/
 * page.tsx). Deliberately a separate function from
 * generateDailyFlyingReport rather than a generalized "report PDF" helper —
 * the BA table's columns and the summary stats it needs (positive/nil test
 * counts, student/instructor split) are specific to this data, and forcing
 * a shared shape would make both harder to read for no real reuse benefit
 * (same reasoning `generateStudentLogbook` and `generateDailyFlyingReport`
 * already don't share a table-rendering helper).
 *
 * Operates on the already-fetched BATest rows for the selected period,
 * so the PDF always matches what's on screen — same convention as the
 * Daily Flying Report PDF.
 */
export function generateBreathAnalysisReport(report: {
  period: 'Daily' | 'Weekly' | 'Monthly';
  periodLabel: string;  // human-readable range, e.g. "20 Aug 2026" or "18–24 Aug 2026"
  tests: BATest[];
}): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // ============================================================
  // HEADER
  // ============================================================
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Breath Analysis Report', 14, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${report.period} — ${report.periodLabel}`, 14, 24);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, pageWidth - 14, 24, { align: 'right' });

  // ============================================================
  // TEST TABLE — includes a Date column since a weekly/monthly report
  // spans more than one day, unlike the register's single-day view.
  // ============================================================
  const tableData = report.tests.map(t => [
    new Date(t.testDate).toLocaleDateString('en-IN'),
    t.aircraftReg || '—',
    t.safetyOfficerName,
    t.personType === 'STUDENT' ? 'Student' : 'Instructor',
    t.personName,
    t.licenseNumber || '—',
    t.reportingTime || '—',
    t.baTime || '—',
    t.baPercentage != null ? t.baPercentage.toFixed(3) : '—',
    t.baEquipment || '—',
  ]);

  autoTable(doc, {
    startY: 38,
    head: [['Date', 'Aircraft', 'Safety Officer', 'Student/Instr.', 'Name', 'License No.', 'Reporting', 'BA Time', 'BA %', 'Equipment']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, textColor: [0, 0, 0] },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { left: 14, right: 14 },
  });

  // ============================================================
  // SUMMARY — total tests, positive/nil split (baPercentage > 0 is
  // treated as "Positive" throughout this feature, same threshold as the
  // register page's own badge logic), student/instructor split.
  // ============================================================
  const total = report.tests.length;
  const positive = report.tests.filter(t => (t.baPercentage ?? 0) > 0).length;
  const nil = total - positive;
  const studentCount = report.tests.filter(t => t.personType === 'STUDENT').length;
  const instructorCount = total - studentCount;

  const finalY = (doc as JsPDFWithAutoTable).lastAutoTable?.finalY || 45;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Summary', 14, finalY + 12);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const summaryLines = [
    `Total Tests: ${total}`,
    `Positive: ${positive}`,
    `Nil: ${nil}`,
    `Students Tested: ${studentCount}`,
    `Instructors Tested: ${instructorCount}`,
  ];
  summaryLines.forEach((line, i) => doc.text(line, 14, finalY + 20 + i * 6));

  // ============================================================
  // SIGN-OFF
  // ============================================================
  const signY = finalY + 20 + summaryLines.length * 6 + 12;
  doc.line(14, signY, 80, signY);
  doc.line(120, signY, 190, signY);
  doc.setFontSize(9);
  doc.text('Safety Officer', 14, signY + 7);
  doc.text('Chief Flight Instructor', 120, signY + 7);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(`Generated by FlightPro Manager | ${new Date().toLocaleString('en-IN')}`, 14, 290);

  const safeLabel = report.periodLabel.replace(/[^\w-]+/g, '_');
  doc.save(`Breath_Analysis_Report_${report.period}_${safeLabel}.pdf`);
}
/**
 * Generate the DGCA Aircraft Maintenance Log for one aircraft over a date
 * range — the printable half of item 42.
 *
 * Column set matches docs/dgca-templates/FlightPro_Maintenance_Log_Template_DRAFT.docx.
 *
 * ⚠️ TWO THINGS THIS DELIBERATELY DOES NOT DO, both for the same reason —
 * this document is a RECORD of certification, not an act of it:
 *   1. It prints a signature block, left blank. The app never renders a
 *      signature, typed name-as-signature, or "digitally signed by" line.
 *   2. It carries the draft-format warning until the layout has been
 *      checked against the FTO's real CAMO-approved register. A compliance
 *      document that looks official while being unverified is worse than
 *      one that says so on its face.
 */
export function generateMaintenanceLogReport(report: {
  aircraftReg: string;
  aircraftType: string;
  aircraftModel: string;
  ftoName?: string;
  from: string;
  to: string;
  records: MaintenanceRecord[];
  formatVerified?: boolean;
}): void {
  const doc = new jsPDF({ orientation: 'landscape' }) as JsPDFWithAutoTable;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Aircraft Maintenance Log', 14, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${report.aircraftReg} — ${report.aircraftModel || report.aircraftType || 'N/A'}`, 14, 24);
  const rangeLabel = `${new Date(report.from).toLocaleDateString('en-IN')} to ${new Date(report.to).toLocaleDateString('en-IN')}`;
  doc.text(rangeLabel, pageWidth - 14, 15, { align: 'right' });
  doc.text(report.ftoName || '', pageWidth - 14, 24, { align: 'right' });

  doc.setTextColor(0, 0, 0);
  let cursorY = 38;

  // The draft warning, printed on the document itself rather than only
  // living in the Word template's first table — see the note above.
  if (!report.formatVerified) {
    doc.setFillColor(254, 243, 199);
    doc.rect(14, cursorY - 5, pageWidth - 28, 12, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(
      'DRAFT FORMAT — not yet verified against the official DGCA / CAMO-approved register. Verify before use as a compliance record.',
      16, cursorY + 2,
    );
    doc.setFont('helvetica', 'normal');
    cursorY += 14;
  }

  const body = report.records.map(r => [
    r.completedDate ? new Date(r.completedDate).toLocaleDateString('en-IN') : '—',
    r.ticketNumber || '—',
    r.hobbsAtCompletion != null ? r.hobbsAtCompletion.toFixed(1) : '—',
    r.description || '—',
    r.notes || '—',
    r.partsUsed || '—',
    [r.ameName, r.ameLicenseNo].filter(Boolean).join(' / ') || '—',
    r.crsReference || '—',
  ]);

  autoTable(doc, {
    startY: cursorY,
    head: [['Date', 'Ticket', 'Airframe Hrs', 'Defect / Snag Reported', 'Rectification Action Taken', 'Parts / Materials Used', 'AME Name & Licence No.', 'CRS Ref.']],
    body: body.length ? body : [['—', '—', '—', 'No completed maintenance in this period.', '—', '—', '—', '—']],
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 20 }, 1: { cellWidth: 24 }, 2: { cellWidth: 18 },
      3: { cellWidth: 50 }, 4: { cellWidth: 50 }, 5: { cellWidth: 42 },
      6: { cellWidth: 38 }, 7: { cellWidth: 28 },
    },
  });

  let y = (doc.lastAutoTable?.finalY ?? cursorY) + 10;
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - 45) { doc.addPage(); y = 20; }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Certificate of Release to Service (CRS) — Summary', 14, y);
  y += 6;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const cert = 'Certified that the work specified above (except as otherwise stated) was carried out in accordance with the applicable requirements of Rule 61 of the Aircraft Rules, 1937, and in respect of that work, the aircraft/component is considered fit for release to service.';
  doc.text(doc.splitTextToSize(cert, pageWidth - 28), 14, y);
  y += 16;

  // Blank signature block — the app records a CRS, it does not issue one.
  doc.setFontSize(8);
  doc.text('AME Name: ______________________________', 14, y);
  doc.text('Licence No. & Category: ______________________________', 120, y);
  y += 12;
  doc.text('Signature: ______________________________', 14, y);
  doc.text('Date: ______________________________', 120, y);

  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Generated by FlightPro Manager on ${new Date().toLocaleDateString('en-IN')}. This printout is a record of maintenance carried out; it is not itself a Certificate of Release to Service.`,
    14, pageHeight - 8,
  );

  doc.save(`Maintenance_Log_${report.aircraftReg}_${report.from}_to_${report.to}.pdf`);
}
