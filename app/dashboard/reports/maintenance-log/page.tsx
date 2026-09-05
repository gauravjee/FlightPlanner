// app/dashboard/reports/maintenance-log/page.tsx
// DGCA Aircraft Maintenance Log — item 42, the report half.
//
// Per-aircraft, date-ranged view of COMPLETED maintenance, in the column
// order of docs/dgca-templates/FlightPro_Maintenance_Log_Template_DRAFT.docx,
// with PDF and CSV export. Modeled on
// app/dashboard/reports/breath-analysis/page.tsx (same date-range +
// export-buttons shape) rather than inventing a third report layout.
//
// ⚠️ WHY ONLY COMPLETED RECORDS: a maintenance log is a record of work
// carried out. A SCHEDULED or IN_PROGRESS row is a plan, and listing plans
// in a compliance register alongside completed work is how an auditor ends
// up reading intended maintenance as performed maintenance. Open items are
// visible on the Maintenance page, which is where they belong.
//
// ⚠️ AND NO BASELINE ROWS. "Set Baseline" in the Maintenance Due panel
// writes a COMPLETED row solely to anchor an item's due clock — no work was
// performed and no AME certified anything. Correct data for scheduling; a
// misrepresentation in a register handed to a regulator. Excluded on the
// `isBaseline` column, which was added the same day this report was built,
// precisely because building the report made the problem visible. Excluded
// on the COLUMN and not on the description text: the old "Baseline entry
// for …" string is UI copy, and a compliance filter must not depend on
// wording anyone might reasonably edit.
//
// ⚠️ The "certification incomplete" badge is deliberately visible rather
// than hidden behind a filter: a completed job with no AME licence number
// and no CRS reference is exactly the gap this report exists to surface.

'use client';

import { useState, useMemo } from 'react';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { REPORTS_VIEW_ROLES } from '@/lib/permissions';
import { useAircraft } from '@/lib/hooks/useAircraft';
import { useMaintenanceRecords } from '@/lib/hooks/useMaintenanceRecords';
import { useFtoSettings, getFtoSetting } from '@/lib/hooks/useFtoSettings';
import { generateMaintenanceLogReport, formatLogDate } from '@/lib/pdf';
import { todayIST, daysFromTodayIST } from '@/lib/ist';
import { Wrench, FileDown, FileSpreadsheet, TriangleAlert } from 'lucide-react';

export default function MaintenanceLogPage() {
  useSetHeader({
    title: 'Maintenance Log',
    subtitle: 'DGCA aircraft maintenance & release-to-service record',
  });

  const { aircraft } = useAircraft();
  const { maintenanceRecords, isLoading } = useMaintenanceRecords();
  const { ftoSettings } = useFtoSettings();

  const [aircraftId, setAircraftId] = useState('');
  const [from, setFrom] = useState(() => daysFromTodayIST(-90));
  const [to, setTo] = useState(() => todayIST());

  const selected = aircraft.find(a => String(a.id) === String(aircraftId));

  // Completed work only, for this aircraft, in range, oldest first — a log
  // reads chronologically, unlike the Maintenance page's soonest-due order.
  const rows = useMemo(() => {
    if (!aircraftId) return [];
    return maintenanceRecords
      .filter(r =>
        String(r.aircraftId) === String(aircraftId) &&
        r.status === 'COMPLETED' &&
        !r.isBaseline &&
        r.completedDate &&
        r.completedDate >= from &&
        r.completedDate <= to
      )
      .sort((a, b) => (a.completedDate || '').localeCompare(b.completedDate || ''));
  }, [maintenanceRecords, aircraftId, from, to]);

  // A completed job with no certifying AME and no CRS reference is an
  // incomplete regulatory record, not merely a blank field.
  const uncertified = rows.filter(r => !r.ameLicenseNo && !r.crsReference).length;

  const exportPdf = () => {
    if (!selected) return;
    generateMaintenanceLogReport({
      aircraftReg: selected.registration,
      aircraftType: selected.type,
      aircraftModel: selected.model,
      // Whose register this is — see the PDF header. Same
      // getFtoSetting('school_name') the print headers in ScheduleBoard and
      // FlightDetailModal use.
      ftoName: getFtoSetting(ftoSettings, 'school_name'),
      from, to, records: rows,
    });
  };

  // Real .xlsx, not CSV. CSV is plain text and cannot carry bold headers,
  // column widths or borders — a "formatted CSV" does not exist — and this
  // sheet gets handed to a CAMO or an auditor, so it should look like a
  // register rather than a dump.
  //
  // write-excel-file rather than exceljs: exceljs pulls ~96 transitive
  // packages (several EOL, with open advisories) into the lockfile to write
  // one styled worksheet; this one has a single dependency. Imported
  // DYNAMICALLY so it is fetched on click, not in the page bundle.
  //
  // ⚠️ API NOTES FOR v4 — all three of these differ from the library's own
  // README, which documents v2/v3. Check node_modules/write-excel-file/types
  // before changing this, not the docs site:
  //   • the import is the '/browser' SUBPATH; there is no bare '.' export
  //   • there is no `fileName` option — the call returns { toBlob, toFile }
  //   • cell props are `textColor` and `columnSpan`, not `color` and `span`
  const exportXlsx = async () => {
    if (!selected) return;
    const writeXlsxFile = (await import('write-excel-file/browser')).default;

    const HEADERS = [
      'Date', 'Ticket', 'Airframe Hrs', 'Defect / Snag Reported',
      'Rectification Action Taken', 'Parts / Materials Used',
      'AME Name', 'AME Licence No.', 'CRS Ref.',
    ];
    const WIDTHS = [13, 16, 13, 38, 38, 32, 20, 20, 18];
    const COLS = HEADERS.length;
    const BORDER = { borderStyle: 'thin' as const, borderColor: '#D1D5DB' };

    // A full-width banner row: one spanning cell plus (COLS - 1) empty cells,
    // which is how this library expresses a merge.
    const banner = (
      value: string,
      opts: {
        fontWeight?: 'bold'; fontSize?: number; backgroundColor?: string;
        wrap?: boolean; height?: number;
      } = {},
    ) => [{ value, type: String, columnSpan: COLS, ...opts }, ...Array(COLS - 1).fill(null)];

    // Omit `type` when there is no value: a typed cell with an empty value
    // is rejected, but the cell still has to exist so the grid's borders
    // stay unbroken across blank fields.
    const cell = (value: string | null) => ({
      ...(value ? { value, type: String } : {}),
      alignVertical: 'top' as const, wrap: true, ...BORDER,
    });

    const data = [
      banner('Aircraft Maintenance Log', { fontWeight: 'bold', fontSize: 14 }),
      banner(`${selected.registration} — ${selected.model || selected.type}`, { fontSize: 11 }),
      // Same ranking as the PDF header: the operating FTO identifies the
      // record and gets its own bold line; the period is a labelled filter
      // beneath it. The two artifacts of one register should not disagree
      // about what matters or about how a date is written.
      banner(getFtoSetting(ftoSettings, 'school_name') || 'FTO name not set', { fontWeight: 'bold', fontSize: 11 }),
      banner(`Period: ${formatLogDate(from)} to ${formatLogDate(to)}`, { fontSize: 10 }),
      // The same draft-format warning the page and the PDF carry — an
      // unverified compliance layout must say so on every artifact it
      // produces, not just the one that happens to be on screen.
      banner(
        'DRAFT FORMAT — not yet verified against the official DGCA / CAMO-approved register. Verify before use as a compliance record.',
        { fontWeight: 'bold', fontSize: 9, backgroundColor: '#FEF3C7', wrap: true, height: 24 },
      ),
      Array(COLS).fill(null),
      HEADERS.map(value => ({
        value, type: String, fontWeight: 'bold' as const,
        textColor: '#FFFFFF', backgroundColor: '#1E293B',
        alignVertical: 'center' as const, wrap: true, height: 26,
      })),
      ...rows.map(r => {
        const certified = Boolean(r.ameLicenseNo || r.crsReference);
        return [
          // A real date cell, not a string: in a spreadsheet the date column
          // is what people sort and filter on, and text sorts lexically.
          // Parsed at local NOON rather than midnight so no timezone
          // conversion anywhere can roll it back a day.
          {
            ...(r.completedDate
              ? { value: new Date(`${r.completedDate}T12:00:00`), type: Date, format: 'dd mmm yyyy' }
              : {}),
            alignVertical: 'top' as const, ...BORDER,
          },
          cell(r.ticketNumber ?? null),
          {
            ...(r.hobbsAtCompletion != null ? { value: r.hobbsAtCompletion, type: Number } : {}),
            alignVertical: 'top' as const, ...BORDER,
          },
          cell(r.description ?? null),
          cell(r.notes ?? null),
          cell(r.partsUsed ?? null),
          // An uncertified row is the gap this register exists to surface,
          // so it stays visible in the spreadsheet too — not only on screen.
          certified
            ? cell(r.ameName ?? null)
            : {
                value: 'Not certified', type: String,
                textColor: '#B91C1C', fontStyle: 'italic' as const,
                alignVertical: 'top' as const, ...BORDER,
              },
          cell(r.ameLicenseNo ?? null),
          cell(r.crsReference ?? null),
        ];
      }),
      Array(COLS).fill(null),
      banner(
        'Certified that the work specified above (except as otherwise stated) was carried out in accordance with the applicable requirements of Rule 61 of the Aircraft Rules, 1937, and in respect of that work, the aircraft/component is considered fit for release to service.',
        { fontSize: 9, wrap: true, height: 32 },
      ),
      Array(COLS).fill(null),
      // Blank signature block — the app records a CRS, it does not issue one.
      ['AME Name:', null, null, 'Licence No. & Category:', null, null, 'Signature:', null, 'Date:']
        .map(v => (v ? { value: v, type: String, fontWeight: 'bold' as const } : null)),
    ];

    await writeXlsxFile(data, {
      columns: WIDTHS.map(width => ({ width })),
      sheet: 'Maintenance Log',
      orientation: 'landscape',
      stickyRowsCount: 7,
    }).toFile(`Maintenance_Log_${selected.registration}_${from}_to_${to}.xlsx`);
  };

  const inputClass = 'w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]';

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={REPORTS_VIEW_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">

            <div className="surface-card p-4 flex items-start gap-2" style={{ borderLeft: '3px solid var(--warning, #ca8a04)' }}>
              <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--warning, #ca8a04)' }} />
              <p className="text-xs text-secondary">
                <strong>Draft format.</strong> This layout follows standard FTO maintenance
                record-keeping conventions, not a DGCA-issued form verified against your
                CAMO-approved register. Check it line by line before using it as a compliance
                record. The app records a Certificate of Release to Service; it does not issue
                one — the signed CRS stays on paper.
              </p>
            </div>

            <div className="surface-card p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs text-secondary mb-1">Aircraft *</label>
                  <select value={aircraftId} onChange={e => setAircraftId(e.target.value)} className={inputClass}>
                    <option value="">Select an aircraft…</option>
                    {aircraft.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.registration} — {a.model || a.type}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1">From</label>
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1">To</label>
                  <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputClass} />
                </div>
              </div>

              {selected && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={exportPdf} disabled={!rows.length}
                    className="px-4 py-2 rounded-lg text-sm flex items-center gap-1.5 surface-inner cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                    <FileDown className="w-4 h-4" /> Export PDF
                  </button>
                  <button onClick={exportXlsx} disabled={!rows.length}
                    className="px-4 py-2 rounded-lg text-sm flex items-center gap-1.5 surface-inner cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                    <FileSpreadsheet className="w-4 h-4" /> Export Excel
                  </button>
                </div>
              )}
            </div>

            {uncertified > 0 && (
              <div className="surface-card p-3 flex items-center gap-2">
                <TriangleAlert className="w-4 h-4 shrink-0" style={{ color: 'var(--danger)' }} />
                <p className="text-xs text-secondary">
                  <strong>{uncertified}</strong> of {rows.length} completed {rows.length === 1 ? 'record has' : 'records have'} no
                  AME licence number and no CRS reference. Add them from the Maintenance page before filing this log.
                </p>
              </div>
            )}

            <div className="surface-card p-4">
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-secondary" />
                {selected ? `${selected.registration} — Log Entries` : 'Log Entries'}
              </h2>

              {!aircraftId ? (
                <p className="text-secondary text-center py-6 text-sm">Select an aircraft to view its maintenance log.</p>
              ) : isLoading ? (
                <p className="text-secondary text-center py-6 text-sm">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="text-secondary text-center py-6 text-sm">
                  No completed maintenance for {selected?.registration} between {from} and {to}.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                        <th className="pb-3">Date</th>
                        <th className="pb-3">Ticket</th>
                        <th className="pb-3">Airframe Hrs</th>
                        <th className="pb-3">Defect / Snag</th>
                        <th className="pb-3">Rectification</th>
                        <th className="pb-3">Parts / Materials</th>
                        <th className="pb-3">AME</th>
                        <th className="pb-3">CRS Ref.</th>
                      </tr>
                    </thead>
                    <tbody className="text-secondary">
                      {rows.map(r => {
                        const certified = Boolean(r.ameLicenseNo || r.crsReference);
                        return (
                          <tr key={r.id} className="border-b align-top" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                            <td className="py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{r.completedDate}</td>
                            <td className="py-3 whitespace-nowrap">
                              {r.ticketNumber ? <span className="badge badge-accent">{r.ticketNumber}</span> : '—'}
                            </td>
                            <td className="py-3">{r.hobbsAtCompletion != null ? r.hobbsAtCompletion.toFixed(1) : '—'}</td>
                            <td className="py-3">{r.description || '—'}</td>
                            <td className="py-3">{r.notes || '—'}</td>
                            <td className="py-3">{r.partsUsed || '—'}</td>
                            <td className="py-3">
                              {certified ? (
                                <>
                                  <div style={{ color: 'var(--text-primary)' }}>{r.ameName || '—'}</div>
                                  <div className="text-xs">{r.ameLicenseNo || '—'}</div>
                                </>
                              ) : (
                                <span className="badge badge-danger">Not certified</span>
                              )}
                            </td>
                            <td className="py-3">{r.crsReference || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
