// app/dashboard/admin/setup/GroundSchoolTab.tsx
// Super Admin: Manage ground school subjects

'use client';

import ConfigTable, { type ConfigField, type ConfigColumn } from '@/components/admin/ConfigTable';
import { School } from 'lucide-react';

interface Subject {
  id: number;
  subject_name: string;
  subject_code: string;
  validity_years: number | null;
  required_before_hours: number | null;
  is_mandatory: boolean;
  sort_order: number;
  is_active: boolean;
}

const FIELDS: ConfigField[] = [
  { name: 'subject_name', type: 'text', default: '', placeholder: 'Subject Name', required: true },
  { name: 'subject_code', type: 'text', default: '', placeholder: 'Subject Code', required: true, uppercase: true },
  { name: 'validity_years', type: 'number', default: null, placeholder: 'Validity (Years)', step: '0.5', nullable: true },
  { name: 'required_before_hours', type: 'number', default: null, placeholder: 'Required Before (Hours)', integer: true, nullable: true },
  // Never had form inputs — carried hidden so an edit round-trips the
  // stored values instead of resetting them to these defaults.
  { name: 'is_mandatory', type: 'checkbox', default: true, hidden: true },
  { name: 'sort_order', type: 'number', default: 99, integer: true, hidden: true },
];

const COLUMNS: ConfigColumn<Subject>[] = [
  { header: 'Subject', render: s => s.subject_name, primary: true },
  { header: 'Code', render: s => <span className="badge badge-accent">{s.subject_code}</span> },
  { header: 'Validity', render: s => <span className="text-xs">{s.validity_years ? `${s.validity_years} yrs` : '—'}</span> },
  { header: 'Before Hours', render: s => <span className="text-xs">{s.required_before_hours ? `${s.required_before_hours}h` : '—'}</span> },
];

export default function GroundSchoolTab() {
  return (
    <ConfigTable<Subject>
      title="Ground School Subjects"
      singular="Subject"
      icon={<School className="w-4 h-4 text-secondary" />}
      description="Configure the theoretical subjects for ground school training."
      table="ground_school_subjects"
      endpoint="ground-school-subjects"
      orderBy="sort_order"
      fields={FIELDS}
      columns={COLUMNS}
      emptyMessage="No subjects defined."
      labelFor={s => s.subject_name}
    />
  );
}
