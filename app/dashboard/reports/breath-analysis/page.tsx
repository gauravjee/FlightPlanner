// app/dashboard/reports/breath-analysis/page.tsx
// Breath Analysis Report (2026-08-20, session 4) — a read-only,
// daily/weekly/monthly rollup over the Breath Analyser (BA) Test Register
// (see app/dashboard/reports/breath-analyser/page.tsx, the register itself
// where entries are actually added/edited/deleted).
//
// Deliberately a SEPARATE page from the register rather than adding tabs
// to it: the register is a daily data-entry workflow (staff filling in
// today's tests), this is a reporting/compliance view over a date range
// with export — different job, same underlying `ba_tests` data via the
// same GET /api/ba-tests endpoint (already supports from/to filtering).
// No add/edit/delete here — this page is intentionally view + export only,
// matching the "Reports" section's other pages (Daily Flying Report is
// also read-only over already-saved data).
//
// Renamed from "Breath Analyser Register" to "Breath Analysis Report" in
// the Reports landing page per explicit user request (session 4) — the
// register (data entry) now lives only in the sidebar's direct "BA Test
// Register" link and the register page itself; "Report" is reserved for
// this aggregated/exportable view.

'use client';

import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { BA_TEST_VIEW_ROLES } from '@/lib/permissions';
import { generateBreathAnalysisReport } from '@/lib/pdf';
import type { BATest } from '@/types';
import { Wind, CalendarDays, FileSpreadsheet, FileDown } from 'lucide-react';

type Period = 'Daily' | 'Weekly' | 'Monthly';

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA');
}

function toISODate(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

// Monday-start week containing `dateStr`.
function weekRange(dateStr: string): { from: string; to: string; label: string } {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const from = toISODate(monday);
  const to = toISODate(sunday);
  const label = `${monday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${sunday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return { from, to, label };
}

// `monthStr` is an <input type="month"> value, 'YYYY-MM'.
function monthRange(monthStr: string): { from: string; to: string; label: string } {
  const [y, m] = monthStr.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const from = toISODate(first);
  const to = toISODate(last);
  const label = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return { from, to, label };
}

export default function BreathAnalysisReportPage() {
  const [period, setPeriod] = useState<Period>('Daily');
  const [date, setDate] = useState(todayStr());
  const [weekAnchor, setWeekAnchor] = useState(todayStr());
  const [month, setMonth] = useState(todayStr().slice(0, 7));

  const [tests, setTests] = useState<BATest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useSetHeader({
    title: 'Breath Analysis Report',
    subtitle: 'Daily / Weekly / Monthly rollup of the BA Test Register — CAR Section 5, Series F, Part III',
  });

  // Resolve the active period into a concrete from/to range + label,
  // recomputed whenever the period type or its own picker value changes.
  const range = useMemo(() => {
    if (period === 'Daily') {
      return { from: date, to: date, label: new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) };
    }
    if (period === 'Weekly') {
      return weekRange(weekAnchor);
    }
    return monthRange(month);
  }, [period, date, weekAnchor, month]);

  // Pure fetch — no setState here, so it's safe to call from an effect too
  // (react-hooks/set-state-in-effect flags any named function that sets
  // state anywhere in its body, even safely after an await, when called
  // from an effect).
  const fetchRange = async (from: string, to: string): Promise<BATest[]> => {
    const res = await fetch(`/api/ba-tests?from=${from}&to=${to}`);
    const json = await res.json().catch(() => ({}));
    return json.baTests || [];
  };

  // Loads on mount (loading starts true above) and whenever the resolved
  // range changes — each picker's onChange (and the period buttons) flips
  // loading back to true for that case, since doing it here directly would
  // itself be a synchronous setState-in-effect.
  useEffect(() => {
    fetchRange(range.from, range.to)
      .then(setTests)
      .catch(() => setErrorMsg('Failed to load the Breath Analysis Report.'))
      .finally(() => setLoading(false));
  }, [range.from, range.to]);

  const stats = useMemo(() => {
    const total = tests.length;
    const positive = tests.filter(t => (t.baPercentage ?? 0) > 0).length;
    const nil = total - positive;
    const studentCount = tests.filter(t => t.personType === 'STUDENT').length;
    const instructorCount = total - studentCount;
    return { total, positive, nil, studentCount, instructorCount };
  }, [tests]);

  const handleExportCsv = () => {
    if (tests.length === 0) return;
    const rows = tests.map(t => ({
      'Date': t.testDate,
      'Aircraft Flying': t.aircraftReg || '',
      'Safety Officer': t.safetyOfficerName,
      'Student / Instructor': t.personType === 'STUDENT' ? 'Student' : 'Instructor',
      'Name': t.personName,
      'License Number': t.licenseNumber || '',
      'Reporting Time': t.reportingTime || '',
      'BA Time': t.baTime || '',
      'BA Percentage': t.baPercentage != null ? t.baPercentage : '',
      'BA Equipment': t.baEquipment || '',
    }));
    const csv = `Breath Analysis Report\n${period} — ${range.label}\n\n${Papa.unparse(rows)}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Breath_Analysis_Report_${period}_${range.from}_to_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    if (tests.length === 0) return;
    generateBreathAnalysisReport({ period, periodLabel: range.label, tests });
  };

  const periodButtonClass = (p: Period) =>
    `px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${period === p ? '' : 'hover:opacity-80'}`;

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={BA_TEST_VIEW_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">

            {/* ----- Period selector + date/week/month picker + exports ----- */}
            <div className="surface-card p-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 surface-inner rounded-lg p-1">
                {(['Daily', 'Weekly', 'Monthly'] as Period[]).map(p => (
                  <button
                    key={p}
                    onClick={() => { setPeriod(p); setLoading(true); }}
                    className={periodButtonClass(p)}
                    style={period === p ? { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' } : { color: 'var(--text-secondary)' }}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-tertiary" />
                {period === 'Daily' && (
                  <input type="date" value={date} onChange={e => { setDate(e.target.value); setLoading(true); }}
                    className="surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]" />
                )}
                {period === 'Weekly' && (
                  <input type="date" value={weekAnchor} onChange={e => { setWeekAnchor(e.target.value); setLoading(true); }}
                    className="surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]" />
                )}
                {period === 'Monthly' && (
                  <input type="month" value={month} onChange={e => { setMonth(e.target.value); setLoading(true); }}
                    className="surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]" />
                )}
                <span className="text-sm text-secondary">{range.label}</span>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={handleExportCsv}
                  disabled={tests.length === 0}
                  className="px-3 py-2 surface-inner rounded-lg text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Export Excel/CSV
                </button>
                <button
                  onClick={handleExportPdf}
                  disabled={tests.length === 0}
                  className="px-3 py-2 surface-inner rounded-lg text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80"
                >
                  <FileDown className="w-4 h-4" /> Export PDF
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
                {errorMsg}
              </div>
            )}

            {/* ----- Summary stat tiles ----- */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Total Tests', value: stats.total },
                { label: 'Positive', value: stats.positive },
                { label: 'Nil', value: stats.nil },
                { label: 'Students', value: stats.studentCount },
                { label: 'Instructors', value: stats.instructorCount },
              ].map(tile => (
                <div key={tile.label} className="surface-card p-4">
                  <div className="text-xs text-tertiary mb-1">{tile.label}</div>
                  <div className="text-2xl font-bold">{tile.value}</div>
                </div>
              ))}
            </div>

            {/* ----- Report table ----- */}
            <div className="surface-card overflow-x-auto">
              <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <h3 className="font-bold flex items-center gap-1.5">
                  <Wind className="w-4 h-4" style={{ color: 'var(--accent)' }} /> Breath Analysis Report — {period} — {range.label}
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-tertiary" style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Aircraft Flying</th>
                    <th className="px-3 py-2">Safety Officer</th>
                    <th className="px-3 py-2">Student / Instructor</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">License Number</th>
                    <th className="px-3 py-2">Reporting Time</th>
                    <th className="px-3 py-2">BA Time</th>
                    <th className="px-3 py-2">BA Percentage</th>
                    <th className="px-3 py-2">BA Equipment</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={10} className="px-3 py-6 text-center text-tertiary">Loading…</td></tr>
                  ) : tests.length === 0 ? (
                    <tr><td colSpan={10} className="px-3 py-6 text-center text-tertiary">No BA tests logged for this {period.toLowerCase()} period yet.</td></tr>
                  ) : (
                    tests.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-3 py-2">{new Date(t.testDate).toLocaleDateString('en-IN')}</td>
                        <td className="px-3 py-2">{t.aircraftReg || '—'}</td>
                        <td className="px-3 py-2">{t.safetyOfficerName}</td>
                        <td className="px-3 py-2">{t.personType === 'STUDENT' ? 'Student' : 'Instructor'}</td>
                        <td className="px-3 py-2">{t.personName}</td>
                        <td className="px-3 py-2">{t.licenseNumber || '—'}</td>
                        <td className="px-3 py-2">{t.reportingTime || '—'}</td>
                        <td className="px-3 py-2">{t.baTime || '—'}</td>
                        <td className="px-3 py-2">
                          {t.baPercentage != null ? (
                            <span className={`badge ${t.baPercentage > 0 ? 'badge-danger' : 'badge-success'}`}>
                              {t.baPercentage.toFixed(3)}{t.baPercentage > 0 ? ' — Positive' : ' — Nil'}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2">{t.baEquipment || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
