// components/staff/StaffFormModal.tsx
// Add / edit a staff record (B2, 2026-09-24). The staff ID is issued by the
// database on save and never changes; "Contract AME (SUB ID)" is chosen on
// add only. ID documents: on add they're typed straight in; on edit they
// show masked until "Show / edit" fetches the full values (the server logs
// every such view), and they're only sent back if they were opened.
'use client';

import { useState } from 'react';
import { X, Save, Lock } from 'lucide-react';
import { useEscapeToClose } from '@/lib/useEscapeToClose';
import type { StaffMember } from '@/lib/staff-id';

type Docs = { pan: string; aadhaar: string; passportNumber: string; passportIssueDate: string; passportIssuePlace: string };
const EMPTY_DOCS: Docs = { pan: '', aadhaar: '', passportNumber: '', passportIssueDate: '', passportIssuePlace: '' };

const TEXT_FIELDS: [keyof StaffMember, string, string?][] = [
  ['designation', 'Designation'],
  ['department', 'Department'],
  ['mobile', 'Mobile', 'tel'],
  ['personalEmail', 'Personal email', 'email'],
  ['dateOfBirth', 'Date of birth', 'date'],
  ['nationality', 'Nationality'],
  ['address', 'Address'],
  ['emergencyContactName', 'Emergency contact name'],
  ['emergencyContactPhone', 'Emergency contact phone', 'tel'],
];

interface Props {
  member: StaffMember | null; // null = add
  onClose: () => void;
  onSaved: () => void;
}

export default function StaffFormModal({ member, onClose, onSaved }: Props) {
  useEscapeToClose(onClose);
  const isNew = member === null;
  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {
      name: member?.name ?? '',
      joiningDate: member?.joiningDate ?? '',
      lastWorkingDate: member?.lastWorkingDate ?? '',
      employmentType: member?.employmentType ?? '',
      nationality: isNew ? 'Indian' : '',
    };
    for (const [k] of TEXT_FIELDS) if (member) f[k] = (member[k] as string | null) ?? '';
    return f;
  });
  const [isSub, setIsSub] = useState(false);
  const [docs, setDocs] = useState<Docs | null>(isNew ? EMPTY_DOCS : null); // null = not opened
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const openDocs = async () => {
    setLoadingDocs(true);
    setError('');
    const res = await fetch(`/api/staff/${member!.id}`);
    const body = await res.json().catch(() => ({}));
    setLoadingDocs(false);
    if (!res.ok) { setError(body.error || 'Failed to load ID documents.'); return; }
    setDocs({ ...EMPTY_DOCS, ...body.idDocuments });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload: Record<string, unknown> = { ...form, employmentType: form.employmentType || null };
    if (isNew) { payload.isSub = isSub; delete payload.lastWorkingDate; }
    if (docs) payload.idDocuments = docs;
    const res = await fetch(isNew ? '/api/staff' : `/api/staff/${member!.id}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(body.error || 'Failed to save.'); return; }
    onSaved();
  };

  const inputClass = 'w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)] disabled:opacity-60';
  const label = 'block text-xs text-tertiary mb-1';
  const joiningChanged = !isNew && form.joiningDate !== member!.joiningDate;
  const m = member?.documentsMasked;

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-labelledby="staff-form-title" onSubmit={save}
        className="surface-card w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 id="staff-form-title" className="text-lg font-semibold">{isNew ? 'Add staff member' : 'Edit staff member'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!isNew && (
            <div>
              <span className={label}>Staff ID</span>
              <div className={`${inputClass} font-mono`}>{member!.staffId}</div>
            </div>
          )}
          <div>
            <label htmlFor="sf-name" className={label}>Name *</label>
            <input id="sf-name" required value={form.name} onChange={e => set('name', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="sf-joining" className={label}>Joining date *</label>
            <input id="sf-joining" type="date" required value={form.joiningDate} onChange={e => set('joiningDate', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="sf-emptype" className={label}>Employment type</label>
            <select id="sf-emptype" value={form.employmentType} onChange={e => set('employmentType', e.target.value)} className={inputClass}>
              <option value="">—</option>
              <option value="PERMANENT">Permanent</option>
              <option value="CONTRACT">Contract</option>
            </select>
          </div>
          {TEXT_FIELDS.map(([k, text, type]) => (
            <div key={k} className={k === 'address' ? 'sm:col-span-2' : ''}>
              <label htmlFor={`sf-${k}`} className={label}>{text}</label>
              <input id={`sf-${k}`} type={type ?? 'text'} value={form[k] ?? ''} onChange={e => set(k, e.target.value)} className={inputClass} />
            </div>
          ))}
          {isNew && (
            <label className="sm:col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isSub} onChange={e => setIsSub(e.target.checked)} />
              Contract AME (SUB ID, e.g. SUBE26100000001). Can&apos;t be changed after saving.
            </label>
          )}
        </div>

        {joiningChanged && (
          <p className="text-xs mt-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--warning-soft)', color: 'var(--warning-text)' }}>
            You changed the joining date. The staff ID {member!.staffId} keeps the month it was issued with.
          </p>
        )}

        <fieldset className="surface-inner rounded-lg p-3 mt-4">
          <legend className="text-xs font-semibold px-1 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> ID documents (stored encrypted)</legend>
          {docs === null ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-secondary">
                {m ? <>PAN {m.pan ?? '—'} · Aadhaar {m.aadhaar ?? '—'} · Passport {m.passport ? 'on file' : '—'}</> : 'None on file.'}
              </span>
              <button type="button" onClick={openDocs} disabled={loadingDocs} className="text-sm font-semibold cursor-pointer" style={{ color: 'var(--accent)' }}>
                {loadingDocs ? 'Loading…' : 'Show / edit'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([['pan', 'PAN', 'text'], ['aadhaar', 'Aadhaar (12 digits)', 'text'], ['passportNumber', 'Passport number', 'text'],
                ['passportIssueDate', 'Passport date of issue', 'date'], ['passportIssuePlace', 'Passport place of issue', 'text']] as [keyof Docs, string, string][]).map(([k, text, type]) => (
                <div key={k}>
                  <label htmlFor={`sf-doc-${k}`} className={label}>{text}</label>
                  <input id={`sf-doc-${k}`} type={type} value={docs[k]} autoComplete="off"
                    onChange={e => setDocs(d => ({ ...d!, [k]: e.target.value }))} className={`${inputClass} font-mono`} />
                </div>
              ))}
              <p className="sm:col-span-2 text-xs text-tertiary">Only admins and super admins can see these. Opening them is logged.</p>
            </div>
          )}
        </fieldset>

        {!isNew && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="sf-lwd" className={label}>Last working day</label>
              <input id="sf-lwd" type="date" value={form.lastWorkingDate} min={form.joiningDate} onChange={e => set('lastWorkingDate', e.target.value)} className={inputClass} />
            </div>
            <p className="text-xs text-tertiary self-end">
              From 17:00 on this day their login is disabled and their instructor profile / AME entry become inactive. For a sudden exit, use &quot;deny login&quot; in User Management.
            </p>
          </div>
        )}

        {error && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm cursor-pointer" style={{ backgroundColor: 'var(--surface-muted)' }}>Cancel</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : isNew ? 'Add staff member' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
