// app/dashboard/admin/setup/RolesTab.tsx
// Manage Instructor Roles (FI, AFI, CFI, MEI, IRI, etc.)

'use client';

import ConfigTable, { type ConfigField, type ConfigColumn } from '@/components/admin/ConfigTable';
import { GraduationCap } from 'lucide-react';

interface InstructorRole {
  id: number;
  role_name: string;
  role_code: string;
  description: string;
  is_active: boolean;
}

const FIELDS: ConfigField[] = [
  { name: 'role_name', type: 'text', default: '', label: 'Role Name', required: true, placeholder: 'e.g., Chief Flight Instructor' },
  { name: 'role_code', type: 'text', default: '', label: 'Role Code', required: true, placeholder: 'e.g., CFI', uppercase: true, maxLength: 5 },
  { name: 'description', type: 'text', default: '', label: 'Description', placeholder: 'Brief description of this role', full: true },
  { name: 'is_active', type: 'checkbox', default: true, label: 'Active', full: true },
];

const COLUMNS: ConfigColumn<InstructorRole>[] = [
  { header: 'Role', render: r => r.role_name, primary: true },
  { header: 'Code', render: r => <span className="badge badge-accent">{r.role_code}</span> },
  { header: 'Description', render: r => r.description || '—' },
  {
    header: 'Status',
    render: r => (
      <span className={`badge ${r.is_active ? 'badge-success' : 'badge-danger'}`}>
        {r.is_active ? 'Active' : 'Inactive'}
      </span>
    ),
  },
];

export default function RolesTab() {
  return (
    <ConfigTable<InstructorRole>
      title="Instructor Roles"
      singular="Role"
      icon={<GraduationCap className="w-4 h-4 text-secondary" />}
      description="Define the instructor roles used in your FTO. These codes appear in instructor profiles and help categorize your teaching staff."
      table="instructor_roles"
      endpoint="instructor-roles"
      fields={FIELDS}
      columns={COLUMNS}
      labelFor={r => r.role_name}
    />
  );
}
