// components/admin/ConfigTable.tsx
// One add/edit/delete table for the simple Admin Setup config tables.
//
// 2026-09-05: Roles, Sortie Types, Ground School Subjects and Training
// Programs were four copies of the same 250-330 line component — same
// useState block, same fetch-on-mount, same POST/PATCH/DELETE against
// /api/admin/config/<endpoint>, same form-above-table layout, same
// ConfirmDialog. Only the nouns and the columns differed. Each tab is now
// a declaration (fields + columns) and this file holds the behaviour, so
// adding the next config table is ~40 lines instead of another 300.
//
// Deliberately NOT used by the tabs with real logic of their own
// (Aircraft, Maintenance Schedule, Requirements, Exercises, Users,
// Holidays, Settings) — bending this component to fit those is how a
// helper turns into a framework.

'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase-client';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Pencil, Plus, Save, Trash2 } from 'lucide-react';

export type FormValue = string | number | boolean | null;
export type FormState = Record<string, FormValue>;

export interface ConfigField {
  name: string;
  type: 'text' | 'number' | 'checkbox' | 'select';
  default: FormValue;
  label?: string;
  placeholder?: string;
  required?: boolean;
  uppercase?: boolean;
  maxLength?: number;
  step?: string;
  /** number fields: parseInt rather than parseFloat */
  integer?: boolean;
  /** number fields: an empty box stores null instead of 0 */
  nullable?: boolean;
  options?: { label: string; value: string }[];
  /** span the whole form row instead of one grid cell */
  full?: boolean;
  /** kept in the form state (so an edit round-trips it) but not rendered */
  hidden?: boolean;
  /** groups fields under a shared heading — see `groups` below */
  group?: string;
  /** escape hatch for a per-field extra (e.g. a colour swatch) */
  after?: (value: FormValue) => ReactNode;
}

export interface ConfigColumn<T> {
  header: string;
  render: (row: T) => ReactNode;
  /** the identifying column — rendered bold in the primary text colour */
  primary?: boolean;
}

interface ConfigTableProps<T> {
  title: string;
  icon: ReactNode;
  description?: ReactNode;
  /** Supabase table to read, and the /api/admin/config/<endpoint> to write */
  table: string;
  endpoint: string;
  orderBy?: string;
  fields: ConfigField[];
  columns: ConfigColumn<T>[];
  /** heading + note shown above each named field group, in first-seen order */
  groups?: Record<string, { note?: ReactNode; cols?: number; baseCols?: number }>;
  cols?: number;
  singular: string;
  deleteMessage?: string;
  emptyMessage?: string;
  /** row -> accessible name, used on the Edit/Delete buttons */
  labelFor: (row: T) => string;
  /** called after every reload — e.g. to revalidate a shared SWR key */
  onChanged?: () => void;
}

// Tailwind scans source for literal class names, so a template-literal
// `md:grid-cols-${n}` would never be generated. Fixed map, not interpolation.
const GRID_COLS: Record<number, string> = {
  1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3',
  4: 'md:grid-cols-4', 5: 'md:grid-cols-5',
};
const BASE_COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2' };

const INPUT_CLASS =
  'w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]';

const defaultsOf = (fields: ConfigField[]): FormState =>
  Object.fromEntries(fields.map(f => [f.name, f.default]));

export default function ConfigTable<T extends { id: number }>({
  title, icon, description, table, endpoint, orderBy = 'id',
  fields, columns, groups, cols = 2, singular,
  deleteMessage, emptyMessage, labelFor, onChanged,
}: ConfigTableProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<T | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(() => defaultsOf(fields));

  // Pure fetch — sets no state — so it is safe to call from the mount
  // effect below (react-hooks/set-state-in-effect flags any named function
  // that sets state anywhere in its body when called from an effect).
  const fetchRows = async (): Promise<T[]> => {
    const { data, error } = await supabase.from(table).select('*').order(orderBy);
    if (error) {
      console.error(`Error loading ${table}:`, error.message);
      return [];
    }
    onChanged?.();
    return (data ?? []) as T[];
  };

  const reload = async () => {
    setLoading(true);
    setRows(await fetchRows());
    setLoading(false);
  };

  useEffect(() => {
    fetchRows().then(data => { setRows(data); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  const reset = () => { setEditing(null); setForm(defaultsOf(fields)); };

  // All writes go through the shared, role-checked config route rather than
  // straight to Supabase from the browser (2026-08-21 security hardening).
  const handleSave = async () => {
    if (fields.some(f => f.required && !String(form[f.name] ?? '').trim())) return;

    const url = `/api/admin/config/${endpoint}`;
    const body = editing ? { id: editing.id, ...form } : form;
    await fetch(url, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    reset();
    reload();
  };

  const handleEdit = (row: T) => {
    setEditing(row);
    const r = row as unknown as Record<string, FormValue>;
    setForm(Object.fromEntries(fields.map(f => [f.name, r[f.name] ?? f.default])));
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget == null) return;
    await fetch(`/api/admin/config/${endpoint}?id=${deleteTarget}`, { method: 'DELETE' });
    setDeleteTarget(null);
    reload();
  };

  const setField = (f: ConfigField, raw: string | boolean) => {
    let value: FormValue;
    if (f.type === 'checkbox') value = raw as boolean;
    else if (f.type === 'number') {
      const s = raw as string;
      if (s === '') value = f.nullable ? null : 0;
      else value = f.integer ? (parseInt(s) || 0) : (parseFloat(s) || 0);
    } else {
      value = f.uppercase ? (raw as string).toUpperCase() : (raw as string);
    }
    setForm(p => ({ ...p, [f.name]: value }));
  };

  const renderField = (f: ConfigField) => {
    const value = form[f.name];
    const input =
      f.type === 'checkbox' ? (
        <div className="flex items-center space-x-2 pt-5">
          <input type="checkbox" checked={Boolean(value)} className="w-4 h-4"
            onChange={e => setField(f, e.target.checked)} />
          <label className="text-sm text-secondary">{f.label}</label>
        </div>
      ) : f.type === 'select' ? (
        <select value={String(value ?? '')} className={INPUT_CLASS}
          onChange={e => setField(f, e.target.value)}>
          {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          type={f.type}
          step={f.step}
          maxLength={f.maxLength}
          placeholder={f.placeholder}
          value={value == null ? '' : String(value)}
          onChange={e => setField(f, e.target.value)}
          className={INPUT_CLASS}
        />
      );

    return (
      <div key={f.name} className={f.full ? 'md:col-span-full' : undefined}>
        {f.label && f.type !== 'checkbox' && (
          <label className="block text-xs text-tertiary mb-1">
            {f.label}{f.required ? ' *' : ''}
          </label>
        )}
        {input}
        {f.after?.(value)}
      </div>
    );
  };

  // Fields are rendered in declaration order; an ungrouped run forms the
  // main grid, and each named group gets its own heading + grid below it.
  const shown = fields.filter(f => !f.hidden);
  const ungrouped = shown.filter(f => !f.group);
  const groupNames = [...new Set(shown.filter(f => f.group).map(f => f.group!))];

  return (
    <div className="surface-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">{icon} {title}</h2>
      {description && <p className="text-sm text-secondary mb-4">{description}</p>}

      <div className="surface-inner p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          {editing
            ? <><Pencil className="w-3.5 h-3.5" /> Edit {singular}</>
            : <><Plus className="w-3.5 h-3.5" /> Add {singular}</>}
        </h3>

        {ungrouped.length > 0 && (
          <div className={`grid grid-cols-1 ${GRID_COLS[cols]} gap-3 mb-3`}>
            {ungrouped.map(renderField)}
          </div>
        )}

        {groupNames.map(name => {
          const g = groups?.[name];
          return (
            <div key={name} className="mb-3">
              <p className="text-xs text-tertiary mb-2">{g?.note ?? name}</p>
              <div className={`grid ${BASE_COLS[g?.baseCols ?? 2]} ${GRID_COLS[g?.cols ?? cols]} gap-3`}>
                {shown.filter(f => f.group === name).map(renderField)}
              </div>
            </div>
          );
        })}

        <div className="flex space-x-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-semibold"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
          >
            {editing
              ? <><Save className="w-3.5 h-3.5" /> Update {singular}</>
              : <><Plus className="w-3.5 h-3.5" /> Add {singular}</>}
          </button>
          {editing && (
            <button onClick={reset} className="px-4 py-2 rounded-lg text-sm transition surface-inner">
              Cancel
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-secondary text-center py-4">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-secondary text-center py-4">
          {emptyMessage ?? `No ${singular.toLowerCase()} defined yet. Add your first one above.`}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                {columns.map(c => <th key={c.header} className="pb-3">{c.header}</th>)}
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {rows.map(row => (
                <tr key={row.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                  {columns.map(c => (
                    <td key={c.header} className={c.primary ? 'py-3 font-medium' : 'py-3'}
                        style={c.primary ? { color: 'var(--text-primary)' } : undefined}>
                      {c.render(row)}
                    </td>
                  ))}
                  <td className="py-3">
                    <button onClick={() => handleEdit(row)} className="mr-2"
                      style={{ color: 'var(--accent)' }} aria-label={`Edit ${labelFor(row)}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteTarget(row.id)}
                      style={{ color: 'var(--danger)' }} aria-label={`Delete ${labelFor(row)}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget != null && (
        <ConfirmDialog
          title={`Delete ${singular.toLowerCase()}?`}
          message={deleteMessage ?? `Delete this ${singular.toLowerCase()}?`}
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
