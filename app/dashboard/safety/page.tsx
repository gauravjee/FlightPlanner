// app/dashboard/safety/page.tsx
// Safety Management — turns the incident log (still reported from the
// Daily Flying Report page) into a workflow: view every logged incident,
// rate its risk on an ICAO Doc 9859 5x5 matrix (severity x likelihood),
// record a corrective action / assignee, and move it through
// OPEN -> IN_PROGRESS -> CLOSED. See add-safety-incident-workflow.sql and
// app/api/safety-incidents/[id]/route.ts.
//
// View: everyone in INCIDENT_REPORT_ROLES (same broad set who can already
// report/see incidents). Triage actions (risk rating, corrective action,
// status): only INCIDENT_MANAGE_ROLES — enforced server-side by the PATCH
// route; the form below is simply not rendered for anyone else.
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { INCIDENT_REPORT_ROLES, INCIDENT_MANAGE_ROLES, INCIDENT_RESOLVE_ROLES, SAFETY_INCIDENT_CATEGORIES } from '@/lib/permissions';
import type { SafetyIncident } from '@/types';
import { ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';

const STATUS_OPTIONS: SafetyIncident['status'][] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

function statusBadgeClass(status: SafetyIncident['status']) {
  if (status === 'CLOSED') return 'badge-success';
  if (status === 'RESOLVED') return 'badge-accent';
  if (status === 'IN_PROGRESS') return 'badge-warning';
  return 'badge-neutral';
}

function categoryLabel(category: string | undefined) {
  return SAFETY_INCIDENT_CATEGORIES.find(c => c.value === category)?.label || 'Other';
}

// ICAO Doc 9859 tolerability bands for a 1-25 risk score.
function riskBadgeClass(score: number | null | undefined) {
  if (score == null) return 'badge-neutral';
  if (score >= 15) return 'badge-danger';
  if (score >= 7) return 'badge-warning';
  return 'badge-success';
}
function riskLabel(score: number | null | undefined) {
  if (score == null) return 'Not rated';
  if (score >= 15) return `High (${score})`;
  if (score >= 7) return `Medium (${score})`;
  return `Low (${score})`;
}

export default function SafetyManagementPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canManage = !!role && INCIDENT_MANAGE_ROLES.includes(role);
  const canResolve = !!role && !canManage && INCIDENT_RESOLVE_ROLES.includes(role);
  const myName = session?.user?.name || session?.user?.email || '';

  const [incidents, setIncidents] = useState<SafetyIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'ALL' | SafetyIncident['status']>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Draft triage fields, keyed by the currently-expanded incident.
  const [draft, setDraft] = useState<{
    riskSeverity: string; riskLikelihood: string; status: SafetyIncident['status'];
    correctiveAction: string; assignedTo: string; resolutionNote: string;
  } | null>(null);
  // Maintenance's narrow resolve-note draft, kept separate so their save
  // can PATCH just {status, resolutionNote} — never the manager fields.
  const [resolveNote, setResolveNote] = useState('');

  // Pure fetch — no setState here, so it's safe to call from an effect too
  // (react-hooks/set-state-in-effect flags any named function that sets
  // state anywhere in its body, even safely after an await, when called
  // from an effect).
  const fetchIncidents = async (): Promise<SafetyIncident[]> => {
    const res = await fetch('/api/safety-incidents');
    const json = await res.json().catch(() => ({}));
    return json.incidents || [];
  };

  // Used by the triage save/resolve/close handlers below — event-handler
  // calls, where setState is always fine.
  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      setIncidents(await fetchIncidents());
    } catch {
      setErrorMsg('Failed to load incidents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents()
      .then(setIncidents)
      .catch(() => setErrorMsg('Failed to load incidents.'))
      .finally(() => setLoading(false));
  }, []);

  useSetHeader({
    title: 'Safety Management',
    subtitle: 'Risk-rate, assign, and close out logged incidents',
  });

  const filtered = useMemo(
    () => incidents.filter(i => filterStatus === 'ALL' || i.status === filterStatus),
    [incidents, filterStatus]
  );

  const openExpand = (inc: SafetyIncident) => {
    if (expandedId === inc.id) {
      setExpandedId(null);
      setDraft(null);
      return;
    }
    setExpandedId(inc.id);
    setDraft({
      riskSeverity: inc.riskSeverity != null ? String(inc.riskSeverity) : '',
      riskLikelihood: inc.riskLikelihood != null ? String(inc.riskLikelihood) : '',
      status: inc.status,
      correctiveAction: inc.correctiveAction || '',
      assignedTo: inc.assignedTo || '',
      resolutionNote: inc.resolutionNote || '',
    });
    setResolveNote(inc.resolutionNote || '');
  };

  const patchIncident = async (id: string, body: Record<string, unknown>) => {
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/safety-incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErrorMsg(json.error || 'Failed to save.');
        return;
      }
      setExpandedId(null);
      setDraft(null);
      await load();
    } catch {
      setErrorMsg('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = (id: string) => {
    if (!draft) return;
    patchIncident(id, {
      riskSeverity: draft.riskSeverity ? parseInt(draft.riskSeverity, 10) : null,
      riskLikelihood: draft.riskLikelihood ? parseInt(draft.riskLikelihood, 10) : null,
      status: draft.status,
      correctiveAction: draft.correctiveAction,
      assignedTo: draft.assignedTo,
      resolutionNote: draft.resolutionNote,
    });
  };

  // Maintenance: add a resolution note and mark RESOLVED — nothing else.
  const handleResolve = (id: string) => patchIncident(id, { status: 'RESOLVED', resolutionNote: resolveNote });

  // Original reporter (or a manager, via handleSave above): close only.
  const handleClose = (id: string) => patchIncident(id, { status: 'CLOSED' });

  const inputClass = "w-full surface-card rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={INCIDENT_REPORT_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
            <p className="text-xs text-tertiary">
              To report a new incident, use the Safety Incidents panel on the{' '}
              <a href="/dashboard/reports/daily-flying" className="underline">Daily Flying Report</a> page. This
              page is for tracking what happens after an incident is logged.
            </p>

            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {(['ALL', ...STATUS_OPTIONS] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer ${filterStatus === s ? 'font-semibold' : ''}`}
                    style={filterStatus === s
                      ? { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }
                      : { backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)' }}
                  >
                    {s === 'ALL' ? 'All' : s.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <span className="text-xs text-tertiary">{filtered.length} incident{filtered.length === 1 ? '' : 's'}</span>
            </div>

            {errorMsg && <p className="text-xs" style={{ color: 'var(--danger)' }}>{errorMsg}</p>}

            <div className="surface-card p-4">
              {loading ? (
                <p className="text-secondary text-center py-8">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="text-secondary text-center py-8 flex items-center justify-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" /> No incidents match this filter.
                </p>
              ) : (
                <div className="space-y-2">
                  {filtered.map(inc => (
                    <div key={inc.id} className="surface-inner p-3">
                      <button
                        onClick={() => openExpand(inc)}
                        className="w-full flex items-start justify-between gap-3 cursor-pointer text-left"
                      >
                        <div>
                          <p className="text-sm">{inc.incidentNumber ? `${inc.incidentNumber} · ` : ''}{inc.description}</p>
                          <p className="text-xs text-tertiary mt-1">
                            {inc.incidentDate}{inc.incidentTime ? ` · ${inc.incidentTime}` : ''} · {categoryLabel(inc.category)} · Reported by {inc.reportedBy || 'Unknown'}
                            {inc.assignedTo ? ` · Assigned to ${inc.assignedTo}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`badge ${inc.severity === 'CRITICAL' ? 'badge-danger' : inc.severity === 'MAJOR' ? 'badge-warning' : 'badge-neutral'}`}>{inc.severity}</span>
                          <span className={`badge ${riskBadgeClass(inc.riskScore)}`}>{riskLabel(inc.riskScore)}</span>
                          <span className={`badge ${statusBadgeClass(inc.status)}`}>{inc.status.replace('_', ' ')}</span>
                          {expandedId === inc.id ? <ChevronUp className="w-4 h-4 text-tertiary" /> : <ChevronDown className="w-4 h-4 text-tertiary" />}
                        </div>
                      </button>

                      {expandedId === inc.id && draft && (
                        <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: 'var(--border)' }}>
                          {canManage ? (
                            <>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs text-secondary mb-1">Severity (1-5)</label>
                                  <select value={draft.riskSeverity} onChange={e => setDraft(d => d && { ...d, riskSeverity: e.target.value })} className={inputClass}>
                                    <option value="">Not rated</option>
                                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-secondary mb-1">Likelihood (1-5)</label>
                                  <select value={draft.riskLikelihood} onChange={e => setDraft(d => d && { ...d, riskLikelihood: e.target.value })} className={inputClass}>
                                    <option value="">Not rated</option>
                                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs text-secondary mb-1">Assigned To</label>
                                <input type="text" value={draft.assignedTo} onChange={e => setDraft(d => d && { ...d, assignedTo: e.target.value })} className={inputClass} placeholder="Who owns the corrective action?" />
                              </div>
                              <div>
                                <label className="block text-xs text-secondary mb-1">Corrective Action</label>
                                <textarea value={draft.correctiveAction} onChange={e => setDraft(d => d && { ...d, correctiveAction: e.target.value })} rows={2} className={inputClass} />
                              </div>
                              <div>
                                <label className="block text-xs text-secondary mb-1">Resolution Note (Maintenance)</label>
                                <textarea value={draft.resolutionNote} onChange={e => setDraft(d => d && { ...d, resolutionNote: e.target.value })} rows={2} className={inputClass} />
                              </div>
                              <div>
                                <label className="block text-xs text-secondary mb-1">Status</label>
                                <select value={draft.status} onChange={e => setDraft(d => d && { ...d, status: e.target.value as SafetyIncident['status'] })} className={inputClass}>
                                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                </select>
                              </div>
                              <button
                                onClick={() => handleSave(inc.id)}
                                disabled={saving}
                                className="px-3 py-1.5 text-xs rounded-lg font-semibold cursor-pointer disabled:opacity-50"
                                style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
                              >
                                {saving ? 'Saving…' : 'Save'}
                              </button>
                              {inc.resolvedBy && (
                                <p className="text-xs text-tertiary">Resolved by {inc.resolvedBy}{inc.resolvedAt ? ` on ${new Date(inc.resolvedAt).toLocaleDateString('en-IN')}` : ''}</p>
                              )}
                              {inc.closedBy && (
                                <p className="text-xs text-tertiary">Closed by {inc.closedBy}{inc.closedAt ? ` on ${new Date(inc.closedAt).toLocaleDateString('en-IN')}` : ''}</p>
                              )}
                            </>
                          ) : canResolve && (inc.status === 'OPEN' || inc.status === 'IN_PROGRESS') ? (
                            <>
                              <p className="text-xs text-secondary">
                                Add a resolution note and mark this incident Resolved once the fix is confirmed. A safety manager or the
                                original reporter closes it out from there.
                              </p>
                              <div>
                                <label className="block text-xs text-secondary mb-1">Resolution Note</label>
                                <textarea value={resolveNote} onChange={e => setResolveNote(e.target.value)} rows={2} className={inputClass} placeholder="What was found and fixed?" />
                              </div>
                              <button
                                onClick={() => handleResolve(inc.id)}
                                disabled={saving}
                                className="px-3 py-1.5 text-xs rounded-lg font-semibold cursor-pointer disabled:opacity-50"
                                style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
                              >
                                {saving ? 'Saving…' : 'Mark Resolved'}
                              </button>
                            </>
                          ) : (
                            <>
                              <p className="text-xs text-secondary">
                                {inc.correctiveAction ? `Corrective action: ${inc.correctiveAction}` : 'No corrective action recorded yet.'}
                              </p>
                              {inc.assignedTo && <p className="text-xs text-tertiary">Assigned to {inc.assignedTo}</p>}
                              {inc.resolutionNote && <p className="text-xs text-secondary">Resolution note: {inc.resolutionNote}</p>}
                              {inc.resolvedBy && (
                                <p className="text-xs text-tertiary">Resolved by {inc.resolvedBy}{inc.resolvedAt ? ` on ${new Date(inc.resolvedAt).toLocaleDateString('en-IN')}` : ''}</p>
                              )}
                              {inc.closedBy ? (
                                <p className="text-xs text-tertiary">Closed by {inc.closedBy}{inc.closedAt ? ` on ${new Date(inc.closedAt).toLocaleDateString('en-IN')}` : ''}</p>
                              ) : !!myName && inc.reportedBy === myName && (
                                <button
                                  onClick={() => handleClose(inc.id)}
                                  disabled={saving}
                                  className="px-3 py-1.5 text-xs surface-card rounded-lg cursor-pointer hover:opacity-80 disabled:opacity-50"
                                >
                                  {saving ? 'Closing…' : 'Close Incident'}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
