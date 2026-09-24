// app/dashboard/admin/setup/AMEsTab.tsx
// Manage the Certifying Engineers (AME) roster (2026-09-18, P0 #4 —
// maintenance certification). Mirrors RolesTab.tsx's shape exactly — a
// simple named/coded reference list, nothing bespoke needed.
// Read by lib/hooks/useAMEs.ts for the dropdown in MaintenanceForm.tsx and
// MaintenanceDueSection.tsx's "Log Completion" modal.
// 2026-09-24 (B2 S3a): every engineer belongs to a staff record (school AMEs
// a regular staff ID, contract AMEs a SUB one) — add them on the Staff page
// first, then pick them here. One AME entry per staff record (DB unique index).

'use client';

import useSWR from 'swr';
import ConfigTable, { type ConfigField, type ConfigColumn } from '@/components/admin/ConfigTable';
import type { StaffMember } from '@/lib/staff-id';
import { UserCheck } from 'lucide-react';

interface AME {
  id: number;
  name: string;
  license_no: string;
  is_active: boolean;
  staff_member_id: number | null;
}

async function fetchStaff(url: string): Promise<StaffMember[]> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  return res.ok ? body.staff : [];
}

export default function AMEsTab() {
  const { data: staff = [] } = useSWR('/api/staff', fetchStaff);
  const staffIdOf = (id: number | null) => staff.find(s => s.id === id)?.staffId;

  const fields: ConfigField[] = [
    {
      name: 'staff_member_id', type: 'select', default: '', label: 'Staff member', required: true, full: true,
      options: [
        { label: '— Pick a staff member (add them on the Staff page first) —', value: '' },
        ...staff.map(s => ({ label: `${s.name} · ${s.staffId}${s.ameId !== null ? ' (already an AME)' : ''}`, value: String(s.id) })),
      ],
    },
    { name: 'name', type: 'text', default: '', label: 'Name', required: true, placeholder: 'e.g., Rajesh Kumar' },
    { name: 'license_no', type: 'text', default: '', label: 'Licence No. & Category', required: true, placeholder: 'e.g., AME-1234 / Cat A' },
    { name: 'is_active', type: 'checkbox', default: true, label: 'Active', full: true },
  ];

  const columns: ConfigColumn<AME>[] = [
    { header: 'Name', render: a => a.name, primary: true },
    { header: 'Staff ID', render: a => <span className="font-mono text-xs">{staffIdOf(a.staff_member_id) ?? '—'}</span> },
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

  return (
    <ConfigTable<AME>
      title="Certifying Engineers"
      singular="Engineer"
      icon={<UserCheck className="w-4 h-4 text-secondary" />}
      description="Approved Maintenance Engineers (AME) who certify maintenance as complete. Selectable from Maintenance's completion forms — marking a record Completed requires picking one from here plus a CRS reference. Each engineer must have a staff record (Staff page): school AMEs get a regular staff ID, contract AMEs a SUB ID."
      table="ames"
      endpoint="ames"
      fields={fields}
      columns={columns}
      labelFor={a => a.name}
    />
  );
}
