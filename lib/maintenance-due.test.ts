// lib/maintenance-due.test.ts
// Run: npx tsx lib/maintenance-due.test.ts
// Covers the due status the booking block (lib/maintenance-block.ts) relies on: only OVERDUE blocks.

import assert from 'node:assert/strict';
import { computeMaintenanceDueItems } from './maintenance-due';
import type { MaintenanceScheduleTemplate } from '@/types';

const t = (id: number, itemName: string, intervalType: MaintenanceScheduleTemplate['intervalType'], intervalValue: number): MaintenanceScheduleTemplate =>
  ({ id, aircraftModel: 'C172', itemName, intervalType, intervalValue, notes: null, isActive: true, engineType: null });
const done = (name: string, completedDate: string, hobbsAtCompletion: number | null) =>
  ({ aircraftId: 'A1', status: 'COMPLETED' as const, completedDate, maintenanceType: name, description: '', hobbsAtCompletion });

const items = computeMaintenanceDueItems('A1', 1120, [
  t(1, '100 Hr Inspection', 'HOBBS_HOURS', 100),   // last at 1000 -> due 1100 -> overdue at 1120
  t(2, 'Oil Change', 'HOBBS_HOURS', 50),           // last at 1100 -> due 1150 -> 30 left, window 10 -> OK
  t(3, 'Annual', 'CALENDAR_MONTHS', 12),           // done 2 years ago -> overdue
  t(4, 'ELT Battery', 'CALENDAR_MONTHS', 24),      // never done -> no baseline (doesn't block)
], [
  done('100 hr inspection', '2026-01-01', 1000),   // name match is case-insensitive
  done('Oil Change', '2026-06-01', 1100),
  done('Annual', '2024-01-01', 900),
]);
const status = Object.fromEntries(items.map(i => [i.template.itemName, i.status]));
assert.deepEqual(status, { '100 Hr Inspection': 'OVERDUE', 'Oil Change': 'OK', Annual: 'OVERDUE', 'ELT Battery': 'NO_BASELINE' });

// Another aircraft's records are ignored.
assert.equal(computeMaintenanceDueItems('A2', 1120, [t(1, 'Annual', 'CALENDAR_MONTHS', 12)], [done('Annual', '2024-01-01', 900)])[0].status, 'NO_BASELINE');

console.log('maintenance-due tests passed');
