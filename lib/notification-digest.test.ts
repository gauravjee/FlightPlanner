// lib/notification-digest.test.ts — run: npx tsx lib/notification-digest.test.ts
import assert from 'node:assert/strict';
import { classifyMaintenance, expiryItem, splitExpiry, maintenanceHtml, esc, addDays, remindToday, type MxRow } from './notification-digest';

const T = '2026-09-28';
const mx = (id: number, scheduled: string, extra: Partial<MxRow> = {}): MxRow => ({
  id, aircraft_id: 8, maintenance_type: `Task ${id}`, description: null, scheduled_date: scheduled,
  completed_date: null, status: 'SCHEDULED', is_squawk: false, ticket_number: null, ame_name: null, ...extra,
});

assert.equal(addDays(T, 7), '2026-10-05');
assert.equal(addDays(T, -15), '2026-09-13');

const open = [
  mx(1, '2026-09-27'),                                   // overdue
  mx(2, '2026-09-28'),                                   // due today → 7 days
  mx(3, '2026-10-05'),                                   // day 7 → 7 days
  mx(4, '2026-10-06'),                                   // day 8 → upcoming
  mx(5, '2026-10-28'),                                   // day 30 → upcoming
  mx(6, '2026-10-29'),                                   // day 31 → not listed
  mx(7, '2026-09-01', { is_squawk: true }),              // old squawk → defects, not overdue
  mx(8, '2026-10-01', { status: 'IN_PROGRESS' }),        // in work → defects
  mx(9, '2026-09-20', { status: 'IN_PROGRESS' }),        // in work but past date → overdue
];
const closed = [mx(10, '2026-09-10', { status: 'COMPLETED', completed_date: '2026-09-15' }),
  mx(11, '2026-09-10', { status: 'COMPLETED', completed_date: '2026-09-20' })];
const s = classifyMaintenance(open, closed, T);
const ids = s.map(x => x.rows.map(r => r.id));
assert.deepEqual(s.map(x => x.flag), ['red', 'amber', 'red', 'green', 'green']);
assert.deepEqual(ids, [[9, 1], [2, 3], [7, 8], [4, 5], [11, 10]]);

// pilot-written text is escaped; AME shows or "Unassigned"
const html = maintenanceHtml(classifyMaintenance([mx(1, T, { description: '<script>x</script>', ame_name: 'R. Kumar' }), mx(2, T)], [], T), () => 'VT-ABC', T);
assert.ok(!html.includes('<script>') && html.includes('&lt;script&gt;'));
assert.ok(html.includes('R. Kumar') && html.includes('Unassigned'));
assert.equal(esc(`a&"'`), 'a&amp;&quot;&#39;');

const base = { person: 'A (AA)', kind: 'Student' as const, document: 'Medical', email: null };
assert.equal(expiryItem(base, '', T), null);
assert.equal(expiryItem(base, null, T), null);
assert.equal(expiryItem(base, '2026-10-29', T), null);           // 31 days
assert.equal(expiryItem(base, '2026-10-28', T)?.days, 30);
assert.equal(expiryItem(base, '2026-09-27', T)?.days, -1);
const split = splitExpiry([expiryItem(base, '2026-10-01', T)!, expiryItem(base, '2026-09-01', T)!, expiryItem(base, T, T)!]);
assert.deepEqual(split.map(x => x.rows.map(r => r.days)), [[-27], [0, 3]]);

// personal reminders: 30, 15, then daily from 7 days out, and daily once expired
assert.deepEqual([31, 30, 29, 16, 15, 14, 8, 7, 1, 0, -1, -40].map(remindToday),
  [false, true, false, false, true, false, false, true, true, true, true, true]);

console.log('notification-digest: all checks passed');
