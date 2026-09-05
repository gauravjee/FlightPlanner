// app/dashboard/admin/setup/TrainingProgramsTab.tsx
// Manage Training Programs (PPL, CPL, IR, etc.)

'use client';

import ConfigTable, { type ConfigField, type ConfigColumn } from '@/components/admin/ConfigTable';
import { BookOpen } from 'lucide-react';

interface TrainingProgram {
  id: number;
  program_name: string;
  program_code: string;
  required_hours: number;
  // Per-metric hour/count minimums, used by the Progress page instead of
  // its old hardcoded PPL/CPL constants — see add-training-program-requirement-columns.sql.
  // Nullable: an unset value falls back to a built-in default on the
  // Progress page rather than showing 0/blocking that metric's progress bar.
  solo_hours: number | null;
  cross_country_hours: number | null;
  instrument_hours: number | null;
  night_hours: number | null;
  landings_required: number | null;
  // 2026-08-19: unlike the five fields above, these two have NO built-in
  // fallback on the Progress page — they're CPL-specific (or whichever
  // programs an admin sets them on), not universal like Solo/Cross-Country/
  // Instrument/Night. Leaving them blank hides that metric's card entirely
  // on the Progress page instead of applying a number that may not even
  // apply to the program. See add-multi-engine-simulator-hours-to-training-programs.sql.
  multi_engine_hours: number | null;
  simulator_hours: number | null;
  description: string;
  is_active: boolean;
  sort_order: number;
}

const target = (name: string, label: string, placeholder: string, integer = false): ConfigField =>
  ({ name, type: 'number', default: null, label, placeholder, nullable: true, integer, group: 'targets' });

const FIELDS: ConfigField[] = [
  { name: 'program_name', type: 'text', default: '', placeholder: 'Program Name (e.g., Private Pilot License)', required: true },
  { name: 'program_code', type: 'text', default: '', placeholder: 'Code (e.g., PPL)', required: true },
  { name: 'required_hours', type: 'number', default: 40, placeholder: 'Required Hours', integer: true },

  target('solo_hours', 'Solo Hours', 'e.g., 10'),
  target('cross_country_hours', 'Cross-Country Hours', 'e.g., 5'),
  target('instrument_hours', 'Instrument Hours', 'e.g., 3'),
  target('night_hours', 'Night Hours', 'e.g., 3'),
  target('landings_required', 'Landings', 'e.g., 20', true),
  target('multi_engine_hours', 'Multi Engine Hours', 'e.g., 15'),
  target('simulator_hours', 'Simulator Hours', 'e.g., 20'),

  // Never had form inputs — carried hidden so an edit round-trips the
  // stored values instead of resetting them to these defaults.
  { name: 'description', type: 'text', default: '', hidden: true },
  { name: 'is_active', type: 'checkbox', default: true, hidden: true },
  { name: 'sort_order', type: 'number', default: 99, integer: true, hidden: true },
];

const COLUMNS: ConfigColumn<TrainingProgram>[] = [
  { header: 'Program', render: p => p.program_name, primary: true },
  { header: 'Code', render: p => <span className="badge badge-accent">{p.program_code}</span> },
  { header: 'Hours', render: p => `${p.required_hours}h` },
  {
    header: 'Progress Targets',
    render: p => (
      <span className="text-xs text-tertiary">
        {[
          p.solo_hours != null ? `Solo ${p.solo_hours}h` : null,
          p.cross_country_hours != null ? `X-Ctry ${p.cross_country_hours}h` : null,
          p.instrument_hours != null ? `Instr ${p.instrument_hours}h` : null,
          p.night_hours != null ? `Night ${p.night_hours}h` : null,
          p.landings_required != null ? `${p.landings_required} landings` : null,
          p.multi_engine_hours != null ? `Multi ${p.multi_engine_hours}h` : null,
          p.simulator_hours != null ? `Sim ${p.simulator_hours}h` : null,
        ].filter(Boolean).join(' · ') || '— (using defaults)'}
      </span>
    ),
  },
  {
    header: 'Status',
    render: p => (
      <span className={`badge ${p.is_active ? 'badge-success' : 'badge-danger'}`}>
        {p.is_active ? 'Active' : 'Inactive'}
      </span>
    ),
  },
];

export default function TrainingProgramsTab() {
  return (
    <ConfigTable<TrainingProgram>
      title="Training Programs"
      singular="Program"
      icon={<BookOpen className="w-4 h-4 text-secondary" />}
      table="training_programs"
      endpoint="training-programs"
      orderBy="sort_order"
      cols={3}
      fields={FIELDS}
      columns={COLUMNS}
      groups={{
        targets: {
          note: 'Progress tracking minimums (used on the Progress page — leave blank to use a built-in default)',
          cols: 5,
        },
      }}
      labelFor={p => p.program_name}
    />
  );
}
