// app/dashboard/reports/breath-analyser/page.tsx
// Breath Analyser (BA) Test Register — pre-flight BA test log per CAR
// Section 5, Series F, Part III. Built against the exact register format
// the FTO shared (2026-08-20): Aircraft Flying, Safety Officer,
// Student/Instructor, Name, License Number (SPL for a student, CPL for an
// instructor), Reporting Time, BA Time, BA Percentage, BA Equipment.
//
// Modeled on app/dashboard/reports/daily-flying/page.tsx's date-scoped
// list pattern, but this register has no "generate a snapshot" step — an
// entry is added directly for the selected date and stays live-editable
// (see app/api/ba-tests/route.ts).
//
// License Number auto-fills from the selected person's own profile
// (student.splNumber or instructor.licenseNumber) rather than being typed
// fresh each time — 2026-08-20 design decision, matching this app's
// running "don't hand-retype what's already on file" pattern (DGCA Roll
// Number works the same way). It's still an editable field on the form in
// case a correction is needed.

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Papa from 'papaparse';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { BA_TEST_VIEW_ROLES, BA_TEST_WRITE_ROLES } from '@/lib/permissions';
import { useFlightStore } from '@/lib/store';
import type { BATest } from '@/types';
import {
  Wind, CalendarDays, Plus, X, Pencil, Trash2, FileSpreadsheet, Save,
} from 'lucide-react';

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA');
}

interface SafetyOfficer {
  id: string;
  name: string;
  email: string;
}

const EMPTY_FORM = {
  aircraftId: '',
  safetyOfficerId: '',
  personType: 'STUDENT' as 'STUDENT' | 'INSTRUCTOR',
  personId: '',
  licenseNumber: '',
  reportingTime: '',
  baTime: '',
  baPercentage: '',
  baEquipment: '',
};

export default function BreathAnalyserRegisterPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canWrite = !!role && BA_TEST_WRITE_ROLES.includes(role);

  const { aircraft, loadAircraft, students, loadStudents, instructors, loadInstructors } = useFlightStore();

  useEffect(() => {
    if (aircraft.length === 0) loadAircraft();
    if (students.length === 0) loadStudents();
    if (instructors.length === 0) loadInstructors();
  }, [aircraft.length, loadAircraft, students.length, loadStudents, instructors.length, loadInstructors]);

  const [date, setDate] = useState(todayStr());
  const [tests, setTests] = useState<BATest[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [safetyOfficers, setSafetyOfficers] = useState<SafetyOfficer[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadForDate = useCallback(async (d: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/ba-tests?date=${d}`);
      const json = await res.json().catch(() => ({}));
      setTests(json.baTests || []);
    } catch {
      setErrorMsg('Failed to load BA test register.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadForDate(date); }, [date, loadForDate]);

  useEffect(() => {
    if (!canWrite) return;
    (async () => {
      try {
        const res = await fetch('/api/safety-officers');
        const json = await res.json().catch(() => ({}));
        setSafetyOfficers(json.safetyOfficers || []);
      } catch {
        // Non-fatal — the Safety Officer field just stays empty to pick from.
      }
    })();
  }, [canWrite]);

  useSetHeader({
    title: 'Breath Analyser Register',
    subtitle: 'Pre-flight BA test log — CAR Section 5, Series F, Part III',
  });

  const activeStudents = useMemo(() => students.filter(s => s.status === 'ACTIVE'), [students]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  // Selecting a person auto-fills their License Number from their own
  // profile (SPL for a student, CPL/license number for an instructor) —
  // still editable afterward in case a correction is needed.
  const handlePersonChange = (personId: string) => {
    if (form.personType === 'STUDENT') {
      const s = activeStudents.find(x => x.id === personId);
      setForm(p => ({ ...p, personId, licenseNumber: s?.splNumber || '' }));
    } else {
      const i = instructors.find(x => x.id === personId);
      setForm(p => ({ ...p, personId, licenseNumber: i?.licenseNumber || '' }));
    }
  };

  const handlePersonTypeChange = (personType: 'STUDENT' | 'INSTRUCTOR') => {
    setForm(p => ({ ...p, personType, personId: '', licenseNumber: '' }));
  };

  const openEdit = (t: BATest) => {
    setEditingId(t.id);
    setForm({
      aircraftId: t.aircraftId || '',
      safetyOfficerId: t.safetyOfficerId || '',
      personType: t.personType,
      personId: t.personId || '',
      licenseNumber: t.licenseNumber || '',
      reportingTime: t.reportingTime || '',
      baTime: t.baTime || '',
      baPercentage: t.baPercentage != null ? String(t.baPercentage) : '',
      baEquipment: t.baEquipment || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const safetyOfficer = safetyOfficers.find(so => so.id === form.safetyOfficerId);
    const person = form.personType === 'STUDENT'
      ? activeStudents.find(s => s.id === form.personId)
      : instructors.find(i => i.id === form.personId);
    const ac = aircraft.find(a => a.id === form.aircraftId);

    if (!safetyOfficer) { setErrorMsg('Select a Safety Officer.'); return; }
    if (!person) { setErrorMsg('Select a Student or Instructor.'); return; }

    setSaving(true);
    setErrorMsg('');
    try {
      const payload = {
        testDate: date,
        aircraftId: form.aircraftId || undefined,
        aircraftReg: ac?.registration,
        safetyOfficerId: safetyOfficer.id,
        safetyOfficerName: safetyOfficer.name,
        personType: form.personType,
        personId: person.id,
        personName: person.name,
        licenseNumber: form.licenseNumber || undefined,
        reportingTime: form.reportingTime || undefined,
        baTime: form.baTime || undefined,
        baPercentage: form.baPercentage !== '' ? parseFloat(form.baPercentage) : undefined,
        baEquipment: form.baEquipment || undefined,
      };
      const res = editingId
        ? await fetch(`/api/ba-tests/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/ba-tests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      if (res.ok) {
        resetForm();
        await loadForDate(date);
      } else {
        const json = await res.json().catch(() => ({}));
        setErrorMsg(json.error || 'Failed to save BA test entry.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setErrorMsg('');
    const res = await fetch(`/api/ba-tests/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadForDate(date);
    } else {
      const json = await res.json().catch(() => ({}));
      setErrorMsg(json.error || 'Failed to delete BA test entry.');
    }
  };

  const handleExportCsv = () => {
    if (tests.length === 0) return;
    const rows = tests.map(t => ({
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
    const csv = `Breath Analyser Test\nDate: ${date}\n\n${Papa.unparse(rows)}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Breath_Analyser_Register_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={BA_TEST_VIEW_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">

            {/* ----- Controls ----- */}
            <div className="surface-card p-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-tertiary" />
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              {canWrite && !showForm && (
                <button
                  onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}
                  className="px-4 py-2 rounded-lg transition cursor-pointer font-semibold text-sm flex items-center gap-1.5"
                  style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
                >
                  <Plus className="w-4 h-4" /> Add BA Test Entry
                </button>
              )}

              <button
                onClick={handleExportCsv}
                disabled={tests.length === 0}
                className="px-3 py-2 surface-inner rounded-lg text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80"
              >
                <FileSpreadsheet className="w-4 h-4" /> Export Excel/CSV
              </button>
            </div>

            {errorMsg && (
              <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
                {errorMsg}
              </div>
            )}

            {/* ----- Add/Edit form ----- */}
            {showForm && (
              <form onSubmit={handleSubmit} className="surface-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold flex items-center gap-1.5">
                    <Wind className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    {editingId ? 'Edit BA Test Entry' : 'Add BA Test Entry'} — {date}
                  </h3>
                  <button type="button" onClick={resetForm} className="p-1.5 rounded-lg cursor-pointer hover:opacity-80">
                    <X className="w-4 h-4 text-tertiary" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-secondary mb-1">Aircraft Flying</label>
                    <select value={form.aircraftId} onChange={e => setForm(p => ({ ...p, aircraftId: e.target.value }))} className={inputClass}>
                      <option value="">Select aircraft…</option>
                      {aircraft.map(a => (
                        <option key={a.id} value={a.id}>{a.registration}{a.isSimulator ? ' (Simulator)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-secondary mb-1">Safety Officer *</label>
                    <select value={form.safetyOfficerId} onChange={e => setForm(p => ({ ...p, safetyOfficerId: e.target.value }))} required className={inputClass}>
                      <option value="">Select safety officer…</option>
                      {safetyOfficers.map(so => (
                        <option key={so.id} value={so.id}>{so.name}</option>
                      ))}
                    </select>
                    {safetyOfficers.length === 0 && (
                      <p className="text-xs mt-1" style={{ color: 'var(--warning-text)' }}>
                        No Safety Officer users yet — add one in Admin Setup → User Management.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-secondary mb-1">Student / Instructor *</label>
                    <select value={form.personType} onChange={e => handlePersonTypeChange(e.target.value as 'STUDENT' | 'INSTRUCTOR')} className={inputClass}>
                      <option value="STUDENT">Student</option>
                      <option value="INSTRUCTOR">Instructor</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-secondary mb-1">Name *</label>
                    <select value={form.personId} onChange={e => handlePersonChange(e.target.value)} required className={inputClass}>
                      <option value="">Select {form.personType === 'STUDENT' ? 'student' : 'instructor'}…</option>
                      {(form.personType === 'STUDENT' ? activeStudents : instructors).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-secondary mb-1">
                      License Number
                      <span className="text-xs text-tertiary ml-1">({form.personType === 'STUDENT' ? 'SPL' : 'CPL'})</span>
                    </label>
                    <input type="text" value={form.licenseNumber} onChange={e => setForm(p => ({ ...p, licenseNumber: e.target.value }))}
                      placeholder="Auto-filled from profile" className={inputClass} />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-secondary mb-1">Reporting Time</label>
                    <input type="time" value={form.reportingTime} onChange={e => setForm(p => ({ ...p, reportingTime: e.target.value }))} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-secondary mb-1">BA Time</label>
                    <input type="time" value={form.baTime} onChange={e => setForm(p => ({ ...p, baTime: e.target.value }))} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-secondary mb-1">BA Percentage</label>
                    <input type="number" step="0.001" min="0" value={form.baPercentage} onChange={e => setForm(p => ({ ...p, baPercentage: e.target.value }))}
                      placeholder="0.000" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-secondary mb-1">BA Equipment</label>
                    <input type="text" value={form.baEquipment} onChange={e => setForm(p => ({ ...p, baEquipment: e.target.value }))}
                      placeholder="e.g., Alcolyzer S/N 1042" className={inputClass} />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button type="submit" disabled={saving}
                    className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>
                    <Save className="w-4 h-4" /> {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Entry'}
                  </button>
                  <button type="button" onClick={resetForm} className="px-4 py-2 surface-inner rounded-lg text-sm cursor-pointer hover:opacity-80">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* ----- Register table ----- */}
            <div className="surface-card overflow-x-auto">
              <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <h3 className="font-bold flex items-center gap-1.5">
                  <Wind className="w-4 h-4" style={{ color: 'var(--accent)' }} /> Breath Analyser Test — {date}
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-tertiary" style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="px-3 py-2">Aircraft Flying</th>
                    <th className="px-3 py-2">Safety Officer</th>
                    <th className="px-3 py-2">Student / Instructor</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">License Number</th>
                    <th className="px-3 py-2">Reporting Time</th>
                    <th className="px-3 py-2">BA Time</th>
                    <th className="px-3 py-2">BA Percentage</th>
                    <th className="px-3 py-2">BA Equipment</th>
                    {canWrite && <th className="px-3 py-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={canWrite ? 10 : 9} className="px-3 py-6 text-center text-tertiary">Loading…</td></tr>
                  ) : tests.length === 0 ? (
                    <tr><td colSpan={canWrite ? 10 : 9} className="px-3 py-6 text-center text-tertiary">No BA tests logged for {date} yet.</td></tr>
                  ) : (
                    tests.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
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
                        {canWrite && (
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg cursor-pointer hover:opacity-80" aria-label="Edit entry">
                                <Pencil className="w-3.5 h-3.5 text-tertiary" />
                              </button>
                              <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg cursor-pointer hover:opacity-80" aria-label="Delete entry">
                                <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--danger)' }} />
                              </button>
                            </div>
                          </td>
                        )}
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
