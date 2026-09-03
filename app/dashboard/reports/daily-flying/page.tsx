// app/dashboard/reports/daily-flying/page.tsx
// The Daily Flying Report — built to the exact format the FTO specified:
// a per-flight table plus a footer of day-level totals. See
// app/api/reports/daily-flying/route.ts for how it's computed/saved, and
// add-reports-module.sql for why a generated report is a saved snapshot
// rather than always-live data.
//
// Also hosts the minimal Safety Incident log (report + list) for the
// selected date — see app/api/safety-incidents/route.ts. Not the full
// DGCA-format Incident Report; just enough that an incident isn't lost
// between happening and a fuller report existing.

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Papa from 'papaparse';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { REPORTS_VIEW_ROLES, REPORTS_WRITE_ROLES, INCIDENT_REPORT_ROLES, SAFETY_INCIDENT_CATEGORIES } from '@/lib/permissions';
import { generateDailyFlyingReport } from '@/lib/pdf';
import type { DailyFlyingReport, SafetyIncident } from '@/types';
import {
  FileDown, FileSpreadsheet, RefreshCw, TriangleAlert, Plus, X,
  ClipboardList, CalendarDays,
} from 'lucide-react';

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA');
}

const STAT_ROWS: { key: keyof DailyFlyingReport['stats']; label: string; suffix?: string }[] = [
  { key: 'totalAircraftHours', label: 'Total Aircraft Hours', suffix: 'h' },
  { key: 'totalStudentHours', label: 'Total Student Flying Hours', suffix: 'h' },
  { key: 'totalInstructorHours', label: 'Total Instructor Hours', suffix: 'h' },
  { key: 'dualHours', label: 'Dual Hours', suffix: 'h' },
  { key: 'soloHours', label: 'Solo Hours', suffix: 'h' },
  { key: 'crossCountryHours', label: 'Cross-Country Hours', suffix: 'h' },
  { key: 'nightHours', label: 'Night Hours', suffix: 'h' },
  { key: 'aircraftGrounded', label: 'Aircraft Grounded' },
  { key: 'flightsCancelled', label: 'Flights Cancelled' },
  { key: 'weatherCancellations', label: 'Weather Cancellations' },
  { key: 'maintenanceCancellations', label: 'Maintenance Cancellations' },
  { key: 'otherCancellations', label: 'Other Cancellations' },
  { key: 'safetyIncidents', label: 'Safety Incidents' },
];

export default function DailyFlyingReportPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canWrite = !!role && REPORTS_WRITE_ROLES.includes(role);
  const canReportIncident = !!role && INCIDENT_REPORT_ROLES.includes(role);

  const [date, setDate] = useState(todayStr());
  const [report, setReport] = useState<DailyFlyingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [remarksDraft, setRemarksDraft] = useState('');
  const [incidents, setIncidents] = useState<SafetyIncident[]>([]);
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentDesc, setIncidentDesc] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState<'MINOR' | 'MAJOR' | 'CRITICAL'>('MINOR');
  const [incidentCategory, setIncidentCategory] = useState<string>('OTHER');
  const [savingIncident, setSavingIncident] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Pure fetch — no setState here, so it's safe to call from an effect too
  // (react-hooks/set-state-in-effect flags any named function that sets
  // state anywhere in its body, even safely after an await, when called
  // from an effect).
  const fetchForDate = async (d: string) => {
    const [reportRes, incidentsRes] = await Promise.all([
      fetch(`/api/reports/daily-flying?date=${d}`),
      fetch(`/api/safety-incidents?date=${d}`),
    ]);
    const reportJson = await reportRes.json().catch(() => ({}));
    const incidentsJson = await incidentsRes.json().catch(() => ({}));
    return {
      report: reportJson.report || null,
      incidents: incidentsJson.incidents || [],
    };
  };

  // Used by the incident-report handler below — event-handler call, where
  // setState is always fine.
  const loadForDate = useCallback(async (d: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await fetchForDate(d);
      setReport(data.report);
      setRemarksDraft(data.report?.remarks || '');
      setIncidents(data.incidents);
    } catch {
      setErrorMsg('Failed to load report data.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Loads on mount (loading starts true above) and whenever the date
  // changes — the date picker's onChange flips loading back to true for
  // that case, since doing it here directly would itself be a synchronous
  // setState-in-effect.
  useEffect(() => {
    fetchForDate(date)
      .then(data => {
        setReport(data.report);
        setRemarksDraft(data.report?.remarks || '');
        setIncidents(data.incidents);
      })
      .catch(() => setErrorMsg('Failed to load report data.'))
      .finally(() => setLoading(false));
  }, [date]);

  useSetHeader({
    title: 'Daily Flying Report',
    subtitle: 'Per-day flight log & summary',
  });

  const handleGenerate = async () => {
    setGenerating(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/reports/daily-flying', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, remarks: remarksDraft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(json.error || 'Failed to generate report.');
        return;
      }
      setReport(json.report);
    } catch {
      setErrorMsg('Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportPdf = () => {
    if (!report) return;
    generateDailyFlyingReport(report);
  };

  const handleExportCsv = () => {
    if (!report) return;
    const rowsCsv = Papa.unparse(report.rows.map(r => ({
      Aircraft: r.aircraft, Student: r.student, Instructor: r.instructor, Sortie: r.sortie,
      Start: r.start, End: r.end, Hours: r.hours, 'Dual/Solo': r.type, Exercise: r.exercise, Remarks: r.remarks,
    })));
    const s = report.stats;
    const statsCsv = Papa.unparse(STAT_ROWS.map(sr => ({ Stat: sr.label, Value: s[sr.key] })));
    const csv = `FTO Daily Flying Report\nDate: ${report.reportDate}\nAirport: ${report.airportCode || 'N/A'}\n\n${rowsCsv}\n\nSummary\n${statsCsv}\n\nRemarks\n${(report.remarks || 'None').replace(/\n/g, ' ')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Daily_Flying_Report_${report.reportDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReportIncident = async () => {
    if (!incidentDesc.trim()) return;
    setSavingIncident(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/safety-incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentDate: date, description: incidentDesc, severity: incidentSeverity, category: incidentCategory }),
      });
      if (res.ok) {
        setIncidentDesc('');
        setIncidentSeverity('MINOR');
        setIncidentCategory('OTHER');
        setShowIncidentForm(false);
        await loadForDate(date);
      } else {
        const json = await res.json().catch(() => ({}));
        setErrorMsg(json.error || 'Failed to log incident.');
      }
    } finally {
      setSavingIncident(false);
    }
  };

  const severityBadgeClass = (sev: string) =>
    sev === 'CRITICAL' ? 'badge-danger' : sev === 'MAJOR' ? 'badge-warning' : 'badge-neutral';

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={REPORTS_VIEW_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">

            {/* ----- Controls ----- */}
            <div className="surface-card p-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-tertiary" />
                <input
                  type="date"
                  value={date}
                  onChange={e => { setDate(e.target.value); setLoading(true); }}
                  className="surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              {canWrite && (
                <button
                  onClick={handleGenerate}
                  disabled={generating || loading}
                  className="px-4 py-2 rounded-lg transition cursor-pointer font-semibold text-sm flex items-center gap-1.5 disabled:opacity-50"
                  style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
                >
                  <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
                  {report ? 'Regenerate' : 'Generate Report'}
                </button>
              )}

              <button
                onClick={handleExportPdf}
                disabled={!report}
                className="px-3 py-2 surface-inner rounded-lg text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80"
              >
                <FileDown className="w-4 h-4" /> Export PDF
              </button>
              <button
                onClick={handleExportCsv}
                disabled={!report}
                className="px-3 py-2 surface-inner rounded-lg text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80"
              >
                <FileSpreadsheet className="w-4 h-4" /> Export Excel/CSV
              </button>

              {report && (
                <span className="text-xs text-tertiary ml-auto">
                  Last generated {new Date(report.generatedAt).toLocaleString('en-IN')} by {report.generatedBy || 'Unknown'}
                </span>
              )}
            </div>

            {errorMsg && (
              <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
                {errorMsg}
              </div>
            )}

            {loading ? (
              <div className="surface-card p-8 text-center text-tertiary text-sm">Loading…</div>
            ) : !report ? (
              <div className="surface-card p-8 text-center">
                <ClipboardList className="w-8 h-8 mx-auto mb-2 text-tertiary" />
                <p className="text-sm text-secondary">No report generated for {date} yet.</p>
                {canWrite ? (
                  <p className="text-xs text-tertiary mt-1">Click &ldquo;Generate Report&rdquo; above to compile it from that day&apos;s flight records.</p>
                ) : (
                  <p className="text-xs text-tertiary mt-1">Ask an admin, super_admin, or operations user to generate it.</p>
                )}
              </div>
            ) : (
              <>
                {/* ----- Flight table ----- */}
                <div className="surface-card overflow-x-auto">
                  <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    <h3 className="font-bold">FTO Daily Flying Report</h3>
                    <p className="text-xs text-tertiary">Date: {report.reportDate} &middot; Airport: {report.airportCode || 'N/A'}</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-tertiary" style={{ borderBottom: '1px solid var(--border)' }}>
                        <th className="px-3 py-2">Aircraft</th>
                        <th className="px-3 py-2">Student</th>
                        <th className="px-3 py-2">Instructor</th>
                        <th className="px-3 py-2">Sortie</th>
                        <th className="px-3 py-2">Start</th>
                        <th className="px-3 py-2">End</th>
                        <th className="px-3 py-2">Hours</th>
                        <th className="px-3 py-2">Dual/Solo</th>
                        <th className="px-3 py-2">Exercise</th>
                        <th className="px-3 py-2">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.length === 0 ? (
                        <tr><td colSpan={10} className="px-3 py-6 text-center text-tertiary text-sm">No flights logged for this date.</td></tr>
                      ) : report.rows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="px-3 py-2">{r.aircraft}</td>
                          <td className="px-3 py-2">{r.student}</td>
                          <td className="px-3 py-2">{r.instructor}</td>
                          <td className="px-3 py-2">{r.sortie}</td>
                          <td className="px-3 py-2">{r.start}</td>
                          <td className="px-3 py-2">{r.end}</td>
                          <td className="px-3 py-2">{r.hours.toFixed(1)}</td>
                          <td className="px-3 py-2">{r.type}</td>
                          <td className="px-3 py-2">{r.exercise}</td>
                          <td className="px-3 py-2 text-tertiary">{r.remarks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ----- Summary stats ----- */}
                <div className="surface-card p-4">
                  <h3 className="font-bold mb-3">Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {STAT_ROWS.map(sr => (
                      <div key={sr.key} className="surface-inner p-3">
                        <p className="text-xs text-tertiary">{sr.label}</p>
                        <p className="text-lg font-bold">{report.stats[sr.key]}{sr.suffix || ''}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ----- Remarks ----- */}
                <div className="surface-card p-4">
                  <h3 className="font-bold mb-2">Remarks</h3>
                  {canWrite ? (
                    <>
                      <textarea
                        value={remarksDraft}
                        onChange={e => setRemarksDraft(e.target.value)}
                        rows={3}
                        placeholder="Free-text notes for this day's report…"
                        className="w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                      />
                      <p className="text-xs text-tertiary mt-1">
                        Edited remarks are only saved into the report once you click &ldquo;Regenerate&rdquo; above.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-secondary">{report.remarks || 'None'}</p>
                  )}
                </div>
              </>
            )}

            {/* ----- Safety incidents ----- */}
            <div className="surface-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold flex items-center gap-1.5">
                  <TriangleAlert className="w-4 h-4" style={{ color: 'var(--warning-text)' }} /> Safety Incidents — {date}
                </h3>
                {canReportIncident && !showIncidentForm && (
                  <button
                    onClick={() => setShowIncidentForm(true)}
                    className="px-3 py-1.5 text-xs surface-inner rounded-lg flex items-center gap-1 cursor-pointer hover:opacity-80"
                  >
                    <Plus className="w-3.5 h-3.5" /> Report Incident
                  </button>
                )}
              </div>

              {showIncidentForm && (
                <div className="surface-inner p-3 mb-3 space-y-2">
                  <textarea
                    value={incidentDesc}
                    onChange={e => setIncidentDesc(e.target.value)}
                    rows={2}
                    placeholder="What happened? (required)"
                    className="w-full rounded-lg px-3 py-2 text-sm surface-card focus:outline-none focus:border-[var(--accent)]"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={incidentSeverity}
                      onChange={e => setIncidentSeverity(e.target.value as 'MINOR' | 'MAJOR' | 'CRITICAL')}
                      className="surface-card rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value="MINOR">Minor</option>
                      <option value="MAJOR">Major</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                    <select
                      value={incidentCategory}
                      onChange={e => setIncidentCategory(e.target.value)}
                      className="surface-card rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)]"
                    >
                      {SAFETY_INCIDENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <button
                      onClick={handleReportIncident}
                      disabled={savingIncident || !incidentDesc.trim()}
                      className="px-3 py-1.5 text-xs rounded-lg font-semibold cursor-pointer disabled:opacity-50"
                      style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
                    >
                      {savingIncident ? 'Saving…' : 'Submit'}
                    </button>
                    <button
                      onClick={() => { setShowIncidentForm(false); setIncidentDesc(''); }}
                      className="px-3 py-1.5 text-xs surface-card rounded-lg cursor-pointer hover:opacity-80 flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                </div>
              )}

              {incidents.length === 0 ? (
                <p className="text-sm text-tertiary">No incidents logged for this date.</p>
              ) : (
                <div className="space-y-2">
                  {incidents.map(inc => (
                    <div key={inc.id} className="surface-inner p-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm">{inc.incidentNumber ? `${inc.incidentNumber} · ` : ''}{inc.description}</p>
                        <p className="text-xs text-tertiary mt-1">
                          {inc.incidentTime ? `${inc.incidentTime} · ` : ''}Reported by {inc.reportedBy || 'Unknown'}
                          {inc.assignedTo ? ` · Assigned to ${inc.assignedTo}` : ''}
                        </p>
                      </div>
                      <span className={`badge ${severityBadgeClass(inc.severity)}`}>{inc.severity}</span>
                    </div>
                  ))}
                </div>
              )}
              {report && incidents.length > 0 && report.stats.safetyIncidents !== incidents.length && (
                <p className="text-xs mt-2" style={{ color: 'var(--warning-text)' }}>
                  The generated report&apos;s incident count ({report.stats.safetyIncidents}) doesn&apos;t match the current list ({incidents.length}) — regenerate the report to pick up incidents logged after it was last generated.
                </p>
              )}
            </div>
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
