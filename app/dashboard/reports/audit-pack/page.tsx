// app/dashboard/reports/audit-pack/page.tsx
// The DGCA Audit Pack — one PDF covering a date range, assembled from the
// report generators that already exist (lib/pdf.ts). An inspector asks for
// "the records for this period", not for four separate exports, and a
// browser will throttle four downloads fired in a row anyway.
//
// This page adds NO new report. It gathers the same data each report page
// gathers for itself, then hands it to generateAuditPack, which appends
// each section as pages of one document.
//
// ⚠️ THE DAILY FLYING REPORT IS A SAVED SNAPSHOT, NOT LIVE DATA. See
// add-reports-module.sql. A day nobody generated a report for has nothing
// to include, and this page deliberately does NOT generate the missing ones
// on the fly: that would write new saved reports (and stamp them with the
// wrong generated_by) as a side effect of clicking Export. Missing days are
// listed on screen before you export and printed on the pack's cover page
// instead, so a gap is visible rather than silent.

'use client';

import { useState, useMemo } from 'react';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { REPORTS_VIEW_ROLES } from '@/lib/permissions';
import { useAircraft } from '@/lib/hooks/useAircraft';
import { useMaintenanceRecords } from '@/lib/hooks/useMaintenanceRecords';
import { useFtoSettings, getFtoSetting } from '@/lib/hooks/useFtoSettings';
import { generateAuditPack } from '@/lib/pdf';
import { todayIST, daysFromTodayIST } from '@/lib/ist';
import type { BATest, DailyFlyingReport } from '@/types';
import { FileDown, TriangleAlert, CalendarDays, ClipboardList } from 'lucide-react';

// A pack is a compliance document, not a data dump: keep the range to
// something a person can actually check page by page, and keep the
// per-day fetch below from turning into hundreds of requests.
const MAX_DAYS = 92;

/** Every ISO date from `from` to `to`, inclusive. */
function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (d <= end) {
    out.push(d.toLocaleDateString('en-CA'));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function prettyDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AuditPackPage() {
  useSetHeader({
    title: 'DGCA Audit Pack',
    subtitle: 'One PDF covering a date range — flying, breath analysis and maintenance',
  });

  const { aircraft } = useAircraft();
  const { maintenanceRecords } = useMaintenanceRecords();
  const { ftoSettings } = useFtoSettings();

  const [from, setFrom] = useState(() => daysFromTodayIST(-30));
  const [to, setTo] = useState(() => todayIST());
  const [building, setBuilding] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [missingDates, setMissingDates] = useState<string[] | null>(null);

  const inputClass = 'w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]';

  const days = useMemo(() => (from && to && from <= to ? dateRange(from, to) : []), [from, to]);
  const rangeInvalid = !from || !to || from > to;
  const rangeTooLong = days.length > MAX_DAYS;

  // Completed, non-baseline maintenance in range, grouped by aircraft —
  // same filter the Maintenance Log page applies for a single aircraft.
  // Aircraft with nothing in range are left out rather than contributing a
  // page of empty table.
  const maintenanceByAircraft = useMemo(() => {
    if (rangeInvalid) return [];
    return aircraft
      .map(a => ({
        a,
        records: maintenanceRecords
          .filter(r =>
            String(r.aircraftId) === String(a.id) &&
            r.status === 'COMPLETED' &&
            !r.isBaseline &&
            r.completedDate &&
            r.completedDate >= from &&
            r.completedDate <= to
          )
          .sort((x, y) => (x.completedDate || '').localeCompare(y.completedDate || '')),
      }))
      .filter(g => g.records.length > 0);
  }, [aircraft, maintenanceRecords, from, to, rangeInvalid]);

  const handleExport = async () => {
    if (rangeInvalid || rangeTooLong) return;
    setBuilding(true);
    setErrorMsg('');
    setMissingDates(null);
    try {
      // ponytail: one GET per day, because /api/reports/daily-flying takes a
      // single date and a pack is an occasional, deliberate action — 30-odd
      // requests is cheaper than adding a range parameter to a route four
      // other things already depend on. Add `from`/`to` to that route if
      // packs ever get run in bulk.
      const [dailyResults, baRes] = await Promise.all([
        Promise.all(
          days.map(d =>
            fetch(`/api/reports/daily-flying?date=${d}`)
              .then(r => r.json())
              .then(j => ({ date: d, report: (j.report || null) as DailyFlyingReport | null }))
              .catch(() => ({ date: d, report: null }))
          )
        ),
        fetch(`/api/ba-tests?from=${from}&to=${to}`).then(r => r.json()).catch(() => ({})),
      ]);

      const dailyReports = dailyResults.filter(r => r.report).map(r => r.report as DailyFlyingReport);
      const missing = dailyResults.filter(r => !r.report).map(r => r.date);
      const tests: BATest[] = baRes.baTests || [];

      if (dailyReports.length === 0 && tests.length === 0 && maintenanceByAircraft.length === 0) {
        setErrorMsg('Nothing to export — no saved flying reports, breath analyser tests or completed maintenance in this range.');
        return;
      }

      generateAuditPack({
        ftoName: getFtoSetting(ftoSettings, 'school_name'),
        from,
        to,
        dailyReports,
        missingDates: missing,
        ba: tests.length > 0 ? { periodLabel: `${prettyDate(from)} – ${prettyDate(to)}`, tests } : null,
        maintenance: maintenanceByAircraft.map(({ a, records }) => ({
          aircraftReg: a.registration,
          aircraftType: a.type,
          aircraftModel: a.model,
          ftoName: getFtoSetting(ftoSettings, 'school_name'),
          logBookSerialNo: a.logBookSerialNo || '',
          camoApprovalNo: getFtoSetting(ftoSettings, 'camo_approval_no'),
          from,
          to,
          records,
        })),
      });

      setMissingDates(missing);
    } catch {
      setErrorMsg('Failed to build the audit pack.');
    } finally {
      setBuilding(false);
    }
  };

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={REPORTS_VIEW_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

            <div className="surface-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="text-base font-bold">Period</h3>
              </div>

              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-xs text-secondary">
                  From
                  <input type="date" value={from} max={to || undefined}
                    onChange={e => { setFrom(e.target.value); setMissingDates(null); }}
                    className={inputClass} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-secondary">
                  To
                  <input type="date" value={to} min={from || undefined}
                    onChange={e => { setTo(e.target.value); setMissingDates(null); }}
                    className={inputClass} />
                </label>
              </div>

              {rangeInvalid && (
                <p className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
                  Pick a start date on or before the end date.
                </p>
              )}
              {rangeTooLong && (
                <p className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>
                  That range is {days.length} days. Keep a pack to {MAX_DAYS} days or fewer so it stays checkable.
                </p>
              )}
            </div>

            <div className="surface-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="text-base font-bold">What the pack will contain</h3>
              </div>
              <ul className="text-sm text-secondary space-y-1.5">
                <li>Every saved Daily Flying Report in the range, in date order</li>
                <li>The Breath Analyser Test Register for the range, as one rollup</li>
                <li>
                  The Aircraft Maintenance Log for each aircraft with completed work in the
                  range — {maintenanceByAircraft.length} aircraft
                  {maintenanceByAircraft.length > 0 && ` (${maintenanceByAircraft.map(g => g.a.registration).join(', ')})`}
                </li>
              </ul>
              <p className="mt-3 text-xs text-tertiary">
                Days with no generated Daily Flying Report are listed on the pack&apos;s cover page rather than
                left out silently. Generate them on the Daily Flying Report page first if they are needed.
              </p>
            </div>

            <div className="surface-card p-4 flex items-start gap-2">
              <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--warning-text)' }} />
              <p className="text-xs text-secondary">
                The Aircraft Maintenance Log section carries a DRAFT FORMAT warning until its layout has been
                checked against your CAMO-approved register. A pack containing it is not yet a filing-ready
                document.
              </p>
            </div>

            {errorMsg && (
              <div className="surface-card p-4 text-sm" style={{ color: 'var(--danger)' }}>{errorMsg}</div>
            )}

            {missingDates && missingDates.length > 0 && (
              <div className="surface-card p-4">
                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--warning-text)' }}>
                  {missingDates.length} day(s) had no generated Daily Flying Report
                </p>
                <p className="text-xs text-secondary">{missingDates.map(prettyDate).join(',  ')}</p>
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={building || rangeInvalid || rangeTooLong}
              className="px-4 py-2 rounded-lg transition cursor-pointer font-semibold text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
            >
              <FileDown className="w-4 h-4" /> {building ? 'Building pack…' : 'Export Audit Pack (PDF)'}
            </button>

          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
