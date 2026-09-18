// app/dashboard/admin/setup/AMEsTab.tsx
// Manage the Certifying Engineers (AME) roster (2026-09-18, P0 #4 —
// maintenance certification). Mirrors RolesTab.tsx's shape exactly — a
// simple named/coded reference list, nothing bespoke needed.
// Read by lib/hooks/useAMEs.ts for the dropdown in MaintenanceForm.tsx and
// MaintenanceDueSection.tsx's "Log Completion" modal.

'use client';

import ConfigTable, { type ConfigField, type ConfigColumn } from '@/components/admin/ConfigTable';
import { UserCheck } from 'lucide-react';

interface AME {
  id: number;
  name: string;
  license_no: string;
  is_active: boolean;
}

const FIELDS: ConfigField[] = [
  { name: 'name', type: 'text', default: '', label: 'Name', required: true, placeholder: 'e.g., Rajesh Kumar' },
  { name: 'license_no', type: 'text', default: '', label: 'Licence No. & Category', required: true, placeholder: 'e.g., AME-1234 / Cat A' },
  { name: 'is_active', type: 'checkbox', default: true, label: 'Active', full: true },
];

const COLUMNS: ConfigColumn<AME>[] = [
  { header: 'Name', render: a => a.name, primary: true },
  { header: 'Licence No.', render: a => <span className="badge badge-accent">{a.license_no}</span> },
  {
    header: 'Status',
    render: a => (
      <span className={`badge ${a.is_active ? 'badge-success' : 'badge-danger'}`}>
        {a.is_active ? 'Active' : 'Inactive'}
      </span>
    ),
  },
];

export default function AMEsTab() {
  return (
    <ConfigTable<AME>
      title="Certifying Engineers"
      singular="Engineer"
      icon={<UserCheck className="w-4 h-4 text-secondary" />}
      description="Approved Maintenance Engineers (AME) who certify maintenance as complete. Selectable from Maintenance's completion forms — marking a record Completed requires picking one from here plus a CRS reference."
      table="ames"
      endpoint="ames"
      fields={FIELDS}
      columns={COLUMNS}
      labelFor={a => a.name}
    />
  );
}
