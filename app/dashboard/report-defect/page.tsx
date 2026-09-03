// app/dashboard/report-defect/page.tsx
// Pilot-facing squawk reporting — any instructor or student can flag an
// aircraft defect straight after a flight, without needing full
// maintenance write access. See add-squawk-reporting.sql and
// app/api/maintenance-records/route.ts's restricted POST path.
//
// Deliberately its own page rather than added to /dashboard/maintenance —
// students can't see that page at all (MAINTENANCE_VIEW_ROLES excludes
// 'student'), and even for instructors it's a much lighter form (aircraft +
// description only) than the full staff MaintenanceForm.
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { useAircraft } from '@/lib/hooks/useAircraft';
import { useMaintenanceRecords, withMaintenanceRecordNames, addMaintenanceRecord } from '@/lib/hooks/useMaintenanceRecords';
import { SQUAWK_REPORT_ROLES } from '@/lib/permissions';
import { TriangleAlert } from 'lucide-react';

export default function ReportDefectPage() {
  const { data: session } = useSession();
  const { aircraft } = useAircraft();
  // 2026-09-01 (SWR migration, Stage 6): aircraftReg (read below) is no
  // longer baked into the fetched rows — see lib/hooks/useMaintenanceRecords.ts's
  // file header for why. No load effect needed either; useMaintenanceRecords()/
  // useAircraft() fetch on mount themselves.
  const { maintenanceRecords: rawMaintenanceRecords, isLoading: loadingMaintenance } = useMaintenanceRecords();
  const maintenanceRecords = withMaintenanceRecordNames(rawMaintenanceRecords, aircraft);

  const [aircraftId, setAircraftId] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useSetHeader({
    title: 'Report a Defect',
    subtitle: 'Flag an aircraft squawk for maintenance to triage',
  });

  const mySquawks = maintenanceRecords
    .filter(r => r.isSquawk)
    .filter(r => !session?.user?.name || r.reportedBy === session.user.name || r.reportedBy === session.user.email)
    .sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (!aircraftId || !description.trim()) {
      setErrorMsg('Pick an aircraft and describe the defect.');
      return;
    }
    setSaving(true);
    try {
      await addMaintenanceRecord({ aircraftId, description: description.trim() } as never);
      setAircraftId('');
      setDescription('');
      setSuccessMsg('Defect reported — maintenance has been notified.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";
  const statusBadgeClass = (status: string) =>
    status === 'COMPLETED' ? 'badge-success' : status === 'IN_PROGRESS' ? 'badge-warning' : status === 'CANCELLED' ? 'badge-neutral' : 'badge-accent';

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={SQUAWK_REPORT_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
            <form onSubmit={handleSubmit} className="surface-card p-4 space-y-3">
              <h3 className="font-bold flex items-center gap-1.5">
                <TriangleAlert className="w-4 h-4" style={{ color: 'var(--warning-text)' }} /> New Squawk
              </h3>
              <div>
                <label className="block text-xs text-secondary mb-1">Aircraft *</label>
                <select value={aircraftId} onChange={e => setAircraftId(e.target.value)} required className={inputClass}>
                  <option value="">Select Aircraft</option>
                  {aircraft.map(a => (
                    <option key={a.id} value={a.id}>{a.registration} ({a.type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-secondary mb-1">What&apos;s wrong? *</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                  placeholder="Describe the defect — what you noticed, when, and anything relevant to safe operation."
                  className={inputClass} />
              </div>
              {errorMsg && <p className="text-xs" style={{ color: 'var(--danger)' }}>{errorMsg}</p>}
              {successMsg && <p className="text-xs" style={{ color: 'var(--success)' }}>{successMsg}</p>}
              <button type="submit" disabled={saving}
                className="px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer disabled:opacity-50"
                style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>
                {saving ? 'Submitting…' : 'Report Defect'}
              </button>
            </form>

            <div className="surface-card p-4">
              <h3 className="font-bold mb-3">Your Reported Squawks</h3>
              {loadingMaintenance ? (
                <p className="text-secondary text-center py-4 text-sm">Loading…</p>
              ) : mySquawks.length === 0 ? (
                <p className="text-secondary text-center py-4 text-sm">You haven&apos;t reported any defects yet.</p>
              ) : (
                <div className="space-y-2">
                  {mySquawks.map(r => (
                    <div key={r.id} className="surface-inner p-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm">
                          {r.ticketNumber && (
                            <span className="font-mono text-xs mr-1.5" style={{ color: 'var(--warning-text)' }}>{r.ticketNumber}</span>
                          )}
                          {r.aircraftReg} — {r.description || 'No description'}
                        </p>
                        <p className="text-xs text-tertiary mt-1">Reported {r.scheduledDate}</p>
                      </div>
                      <span className={`badge ${statusBadgeClass(r.status)}`}>{r.status.replace('_', ' ')}</span>
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
