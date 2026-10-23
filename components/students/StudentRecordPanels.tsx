// components/students/StudentRecordPanels.tsx
// B3/B4 (13 Oct, claude/student-master-design-2026-10-13.md): the parts of an existing
// student's record that act straight away through their own endpoints, rather than
// through the form's Save: course history, status (admin), ID documents (admin).
// Inputs swallow Enter so they can't submit the surrounding student form.
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { StudentRecord } from '@/types';
import {
  useStudentCourses, startNextCourse, editStudentCourse, changeStudentStatus,
  fetchStudentDocuments, saveStudentDocuments, type StudentIdDocuments,
} from '@/lib/hooks/useStudents';
import { notify } from '@/lib/notify';
import { todayIST, formatDateTime, formatDate } from '@/lib/ist';

const field = 'w-full surface-inner rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[var(--accent)]';
const noEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault(); };
const ADMIN_ROLES = ['admin', 'super_admin'];
const OUTCOME_LABEL = { IN_PROGRESS: 'In progress', COMPLETED: 'Completed', DISCONTINUED: 'Discontinued' } as const;
export const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Active', GROUNDED: 'Grounded', SUSPENDED: 'Suspended', GRADUATED: 'Graduated', LEFT: 'Left' };
const fmt = formatDateTime;

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="pt-4 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
      <h4 className="text-sm font-semibold">{title} {note && <span className="text-xs text-tertiary font-normal">· {note}</span>}</h4>
      {children}
    </section>
  );
}

function CoursesSection({ student }: { student: StudentRecord }) {
  const { data: session } = useSession();
  const isAdmin = ADMIN_ROLES.includes(session?.user?.role ?? '');
  const courses = useStudentCourses(student.id);
  const current = courses.find(c => c.outcome === 'IN_PROGRESS');
  const [programs, setPrograms] = useState<{ id: number; program_code: string; program_name: string }[]>([]);
  const [next, setNext] = useState<{ endDate: string; outcome: string; programId: string; startDate: string } | null>(null);
  const [editing, setEditing] = useState<{ id: number; startDate: string; endDate: string; outcome: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/config/training-programs?orderBy=sort_order&filterColumn=is_active&filterValue=true')
      .then(r => (r.ok ? r.json() : { rows: [] })).then(j => setPrograms(j.rows ?? [])).catch(() => setPrograms([]));
  }, []);

  const submitNext = async () => {
    if (!next) return;
    setBusy(true);
    const r = await startNextCourse(student.id, { programId: Number(next.programId), startDate: next.startDate, endDate: current ? next.endDate : undefined, outcome: current ? next.outcome : undefined });
    setBusy(false);
    if (r.error) return notify(r.error);
    notify(r.requirementsWarning ? `Next course started. Requirements: ${r.requirementsWarning}` : '✅ Next course started.', r.requirementsWarning ? 'warning' : 'success');
    setNext(null);
  };

  const submitEdit = async () => {
    if (!editing) return;
    setBusy(true);
    const r = await editStudentCourse(student.id, { courseId: editing.id, startDate: editing.startDate, endDate: editing.endDate, outcome: editing.outcome });
    setBusy(false);
    if (r.error) return notify(r.error);
    setEditing(null);
  };

  return (
    <Section title="Courses" note="logged flights and hours never change">
      {courses.length === 0 ? <p className="text-xs text-tertiary">No course history yet.</p> : (
        <table className="w-full text-xs [&_th]:pr-2 [&_td]:pr-2">
          <thead><tr className="text-left text-tertiary"><th className="pb-1">Program</th><th className="pb-1">Start</th><th className="pb-1">End</th><th className="pb-1">Outcome</th>{isAdmin && <th />}</tr></thead>
          <tbody>
            {courses.map(c => editing?.id === c.id ? (
              <tr key={c.id}>
                <td className="py-1">{c.programCode}</td>
                <td className="py-1"><input type="date" aria-label="Start date" className={field} value={editing.startDate} onKeyDown={noEnter} onChange={e => setEditing({ ...editing, startDate: e.target.value })} /></td>
                <td className="py-1"><input type="date" aria-label="End date" className={field} value={editing.endDate} onKeyDown={noEnter} onChange={e => setEditing({ ...editing, endDate: e.target.value })} /></td>
                <td className="py-1">
                  <select aria-label="Outcome" className={field} value={editing.outcome} onChange={e => setEditing({ ...editing, outcome: e.target.value })}>
                    {Object.entries(OUTCOME_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td className="py-1 whitespace-nowrap">
                  <button type="button" disabled={busy} onClick={submitEdit} className="underline cursor-pointer mr-2" style={{ color: 'var(--accent)' }}>Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="underline cursor-pointer text-tertiary">Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={c.id}>
                <td className="py-1" title={c.programName}>{c.programCode}</td>
                <td className="py-1">{formatDate(c.startDate)}</td>
                <td className="py-1">{c.endDate ?? '—'}</td>
                <td className="py-1">{OUTCOME_LABEL[c.outcome]}</td>
                {isAdmin && <td className="py-1"><button type="button" onClick={() => setEditing({ id: c.id, startDate: c.startDate, endDate: c.endDate ?? '', outcome: c.outcome })} className="underline cursor-pointer" style={{ color: 'var(--accent)' }}>Edit</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!next ? (
        <button type="button" onClick={() => setNext({ endDate: todayIST(), outcome: 'COMPLETED', programId: '', startDate: todayIST() })}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer" style={{ backgroundColor: 'var(--accent-fill)', color: 'var(--on-accent)' }}>
          {current ? 'Complete current course & start next' : 'Start a course'}
        </button>
      ) : (
        <div className="surface-inner rounded-lg p-3 space-y-2">
          {current && (
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block text-xs text-tertiary mb-1" htmlFor="nc-end">End {current.programCode} on</label>
                <input id="nc-end" type="date" className={field} value={next.endDate} onKeyDown={noEnter} onChange={e => setNext({ ...next, endDate: e.target.value })} /></div>
              <div><label className="block text-xs text-tertiary mb-1" htmlFor="nc-outcome">Outcome</label>
                <select id="nc-outcome" className={field} value={next.outcome} onChange={e => setNext({ ...next, outcome: e.target.value })}>
                  <option value="COMPLETED">Completed</option><option value="DISCONTINUED">Discontinued</option>
                </select></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><label className="block text-xs text-tertiary mb-1" htmlFor="nc-program">Next program</label>
              <select id="nc-program" className={field} value={next.programId} onChange={e => setNext({ ...next, programId: e.target.value })}>
                <option value="" disabled>Select…</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.program_code} · {p.program_name}</option>)}
              </select></div>
            <div><label className="block text-xs text-tertiary mb-1" htmlFor="nc-start">Starts on</label>
              <input id="nc-start" type="date" className={field} value={next.startDate} onKeyDown={noEnter} onChange={e => setNext({ ...next, startDate: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setNext(null)} className="flex-1 px-2 py-1.5 rounded-lg text-xs surface-inner cursor-pointer" style={{ border: '1px solid var(--border)' }}>Cancel</button>
            <button type="button" disabled={busy || !next.programId || !next.startDate} onClick={submitNext}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-60" style={{ backgroundColor: 'var(--accent-fill)', color: 'var(--on-accent)' }}>
              {current ? 'Complete & start next' : 'Start course'}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

function StatusSection({ student }: { student: StudentRecord }) {
  const [saved, setSaved] = useState(student.status); // the modal's student prop is a snapshot
  const [status, setStatus] = useState(student.status);
  const [reason, setReason] = useState('');
  const [disableLogin, setDisableLogin] = useState(true);
  const [savedUntil, setSavedUntil] = useState(student.groundedUntil ?? '');
  const [until, setUntil] = useState(student.groundedUntil ?? '');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<{ id: number; start: string }[]>([]);
  // A grounded student can be re-grounded with a new end date.
  const changed = status !== saved || (status === 'GROUNDED' && until !== savedUntil);
  const needsReason = status === 'GROUNDED' || status === 'SUSPENDED' || status === 'LEFT';

  const apply = async () => {
    setBusy(true);
    setBlocked([]);
    const r = await changeStudentStatus(student.id, {
      status, reason, disableLogin: status === 'LEFT' ? disableLogin : undefined, groundedUntil: status === 'GROUNDED' ? until : undefined,
    });
    setBusy(false);
    if (r.error) {
      setBlocked(r.bookings ?? []);
      return notify(r.error);
    }
    const parts = [status === 'GROUNDED' ? `✅ Grounded until ${until}.` : `✅ Status changed to ${STATUS_LABEL[status]}.`];
    if (r.cancelled?.length) parts.push(`${r.cancelled.length} booking(s) cancelled.`);
    if (r.loginDisabled) parts.push('Login disabled.');
    notify(parts.join(' '), 'success');
    setSaved(status);
    setSavedUntil(status === 'GROUNDED' ? until : '');
    setReason('');
  };

  return (
    <Section title="Status" note="admin only">
      <div className="flex gap-1 flex-wrap" role="radiogroup" aria-label="Student status">
        {Object.entries(STATUS_LABEL).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={status === v} onClick={() => setStatus(v)}
            className="px-3 py-1 rounded-full text-xs cursor-pointer"
            style={status === v ? { backgroundColor: 'var(--accent-fill)', color: 'var(--on-accent)' } : { border: '1px solid var(--border)' }}>
            {l}
          </button>
        ))}
      </div>
      {changed && (
        <>
          {status === 'GROUNDED' && (
            <div><label className="block text-xs text-tertiary mb-1" htmlFor="st-until">Grounded until (last day) *</label>
              <input id="st-until" type="date" min={todayIST()} className={field} value={until} onKeyDown={noEnter} onChange={e => setUntil(e.target.value)} /></div>
          )}
          <div><label className="block text-xs text-tertiary mb-1" htmlFor="st-reason">Reason{needsReason ? ' *' : ''}</label>
            <input id="st-reason" className={field} value={reason} onKeyDown={noEnter} onChange={e => setReason(e.target.value)} placeholder="e.g. Medical lapsed, awaiting renewal" /></div>
          {status === 'SUSPENDED' && <p className="text-xs text-tertiary">Their future bookings will be cancelled.</p>}
          {status === 'GROUNDED' && <p className="text-xs text-tertiary">Bookings up to that date will be cancelled; later ones stay. They return to Active automatically the next day.</p>}
          {(status === 'GRADUATED' || status === 'LEFT') && <p className="text-xs text-tertiary">Refused while they still have future bookings.</p>}
          {status === 'LEFT' && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={disableLogin} onChange={e => setDisableLogin(e.target.checked)} /> Also disable login
            </label>
          )}
          <button type="button" disabled={busy || (needsReason && !reason.trim()) || (status === 'GROUNDED' && !until)} onClick={apply}
            className="text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-60" style={{ backgroundColor: 'var(--warning)', color: 'var(--on-accent)' }}>
            {status === 'GROUNDED' && saved === 'GROUNDED' ? 'Change grounding' : `Change status to ${STATUS_LABEL[status]}`}
          </button>
        </>
      )}
      {blocked.length > 0 && (
        <ul className="text-xs list-disc pl-5" style={{ color: 'var(--warning-text)' }}>
          {blocked.map(b => <li key={b.id}>Booking #{b.id} · {fmt(b.start)}</li>)}
        </ul>
      )}
      {student.statusChangedAt && (
        <p className="text-xs text-tertiary">Last changed {fmt(student.statusChangedAt)}{student.statusReason ? ` · ${student.statusReason}` : ''}{savedUntil && saved === 'GROUNDED' ? ` · grounded until ${savedUntil}` : ''}.</p>
      )}
    </Section>
  );
}

function DocumentsSection({ student }: { student: StudentRecord }) {
  const [docs, setDocs] = useState<StudentIdDocuments | null>(null);
  const [busy, setBusy] = useState(false);
  const m = student.documentsMasked;

  const show = async () => {
    setBusy(true);
    const r = await fetchStudentDocuments(student.id);
    setBusy(false);
    if (r.error) return notify(r.error);
    setDocs({ aadhaar: '', passportNumber: '', passportIssueDate: '', passportIssuePlace: '', ...r.idDocuments });
  };
  const save = async () => {
    if (!docs) return;
    setBusy(true);
    const r = await saveStudentDocuments(student.id, docs);
    setBusy(false);
    if (r.error) return notify(r.error);
    notify('✅ ID documents saved.', 'success');
    setDocs(null);
  };

  return (
    <Section title="ID documents" note="admin only · every view is logged">
      {!docs ? (
        <>
          <p className="text-xs text-secondary">{m ? <>Aadhaar {m.aadhaar ?? '—'} · Passport {m.passport ?? '—'}</> : 'None on file.'}</p>
          <button type="button" disabled={busy} onClick={show} className="text-xs underline cursor-pointer" style={{ color: 'var(--accent)' }}>
            {busy ? 'Loading…' : m ? 'Show full ID numbers / edit' : 'Add ID documents'}
          </button>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {([['aadhaar', 'Aadhaar (12 digits)', 'text'], ['passportNumber', 'Passport number', 'text'],
            ['passportIssueDate', 'Passport date of issue', 'date'], ['passportIssuePlace', 'Passport place of issue', 'text']] as [keyof StudentIdDocuments, string, string][]).map(([k, label, type]) => (
            <div key={k}><label className="block text-xs text-tertiary mb-1" htmlFor={`sd-${k}`}>{label}</label>
              <input id={`sd-${k}`} type={type} className={field} value={docs[k] ?? ''} onKeyDown={noEnter} onChange={e => setDocs({ ...docs, [k]: e.target.value })} /></div>
          ))}
          <div className="col-span-2 flex gap-2">
            <button type="button" onClick={() => setDocs(null)} className="flex-1 px-2 py-1.5 rounded-lg text-xs surface-inner cursor-pointer" style={{ border: '1px solid var(--border)' }}>Close</button>
            <button type="button" disabled={busy} onClick={save} className="flex-1 px-2 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-60" style={{ backgroundColor: 'var(--accent-fill)', color: 'var(--on-accent)' }}>Save ID documents</button>
          </div>
        </div>
      )}
    </Section>
  );
}

export default function StudentRecordPanels({ student }: { student: StudentRecord }) {
  const { data: session } = useSession();
  const isAdmin = ADMIN_ROLES.includes(session?.user?.role ?? '');
  return (
    <div className="space-y-4">
      <CoursesSection student={student} />
      {isAdmin && <StatusSection student={student} />}
      {isAdmin && <DocumentsSection student={student} />}
    </div>
  );
}
