// app/dashboard/admin/setup/SortieTypesTab.tsx
// Manage Sortie Types (Dual, Solo, Maintenance Flight)
// Controls instructor/student requirements and display colors

'use client';

import { mutate } from 'swr';
import ConfigTable, { type ConfigField, type ConfigColumn } from '@/components/admin/ConfigTable';
import { sortieTypesKey } from '@/lib/hooks/useSortieTypes';
import { Target, CircleCheck } from 'lucide-react';

interface SortieType {
  id: number;
  type_name: string;
  type_code: string;
  color_hex: string;
  requires_instructor: boolean;
  requires_student: boolean;
  is_active: boolean;
}

// Predefined color options for the Gantt chart
const COLOR_OPTIONS = [
  { label: 'Blue (#2563eb)', value: '#2563eb' },
  { label: 'Green (#16a34a)', value: '#16a34a' },
  { label: 'Yellow (#ca8a04)', value: '#ca8a04' },
  { label: 'Red (#dc2626)', value: '#dc2626' },
  { label: 'Purple (#7c3aed)', value: '#7c3aed' },
  { label: 'Orange (#ea580c)', value: '#ea580c' },
  { label: 'Cyan (#0891b2)', value: '#0891b2' },
  { label: 'Pink (#db2777)', value: '#db2777' },
  { label: 'Teal (#0d9488)', value: '#0d9488' },
  { label: 'Indigo (#4f46e5)', value: '#4f46e5' },
];

const FIELDS: ConfigField[] = [
  { name: 'type_name', type: 'text', default: '', placeholder: 'Display Name (e.g., Dual)', required: true, full: true },
  { name: 'type_code', type: 'text', default: '', placeholder: 'Code (e.g., DUAL)', required: true, uppercase: true, full: true },
  {
    name: 'color_hex', type: 'select', default: '#2563eb', label: 'Gantt Chart Color',
    options: COLOR_OPTIONS, group: 'options',
    after: value => (
      <div className="mt-1 flex items-center space-x-2">
        <div className="w-6 h-6 rounded" style={{ backgroundColor: String(value), border: '1px solid var(--border)' }} />
        <span className="text-xs text-tertiary">{String(value)}</span>
      </div>
    ),
  },
  { name: 'requires_instructor', type: 'checkbox', default: true, label: 'Requires Instructor', group: 'options' },
  { name: 'requires_student', type: 'checkbox', default: true, label: 'Requires Student', group: 'options' },
  { name: 'is_active', type: 'checkbox', default: true, hidden: true },
];

const required = (yes: boolean) =>
  yes ? (
    <span className="flex items-center gap-1" style={{ color: 'var(--success)' }}>
      <CircleCheck className="w-3.5 h-3.5" /> Required
    </span>
  ) : (
    <span className="text-tertiary">— Not Required</span>
  );

const COLUMNS: ConfigColumn<SortieType>[] = [
  { header: 'Type', render: s => s.type_name, primary: true },
  {
    header: 'Code',
    render: s => (
      <span className="px-2 py-0.5 rounded text-xs text-white font-medium" style={{ backgroundColor: s.color_hex }}>
        {s.type_code}
      </span>
    ),
  },
  {
    header: 'Color',
    render: s => (
      <div className="flex items-center space-x-2">
        <div className="w-4 h-4 rounded" style={{ backgroundColor: s.color_hex }} />
        <span className="text-xs">{s.color_hex}</span>
      </div>
    ),
  },
  { header: 'Instructor', render: s => required(s.requires_instructor) },
  { header: 'Student', render: s => required(s.requires_student) },
  {
    header: 'Status',
    render: s => (
      <span className={`badge ${s.is_active ? 'badge-success' : 'badge-danger'}`}>
        {s.is_active ? 'Active' : 'Inactive'}
      </span>
    ),
  },
];

export default function SortieTypesTab() {
  return (
    <ConfigTable<SortieType>
      title="Sortie Types"
      singular="Sortie Type"
      icon={<Target className="w-4 h-4 text-secondary" />}
      description="Configure the types of flights your FTO offers. Each type can have its own color, and you can specify whether an instructor or student is required."
      table="sortie_types"
      endpoint="sortie-types"
      fields={FIELDS}
      columns={COLUMNS}
      groups={{ options: { note: 'Display and crew requirements', cols: 3, baseCols: 1 } }}
      deleteMessage="Delete this sortie type? This may affect existing bookings."
      labelFor={s => s.type_name}
      // This tab's list is unfiltered (it includes inactive rows, for
      // management) so it can't be spliced into the shared active-only
      // `sortieTypesKey` cache — revalidate it instead, so FlightRecordForm
      // and the Flights page pick up an add/edit/delete made here without a
      // manual reload.
      onChanged={() => mutate(sortieTypesKey)}
    />
  );
}
