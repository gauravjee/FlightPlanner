// lib/notification-digest.test.ts — run: npx tsx lib/notification-digest.test.ts
import assert from 'node:assert/strict';
import { classifyMaintenance, expiryItem, splitExpiry, maintenanceHtml, esc, addDays, reminderDue, type MxRow } from './notification-digest';

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

// personal reminders: 30, 15, then daily from 7 days out and after expiry; missed days catch up
const E = '2026-11-30';                      // expiry; 'd(n)' = the date n days before it
const d = (n: number) => addDays(E, -n);
assert.equal(reminderDue(E, d(31), undefined), false); // too early
assert.equal(reminderDue(E, d(30), undefined), true);  // 30-day reminder
assert.equal(reminderDue(E, d(30), d(30)), false);     // already sent today (second run)
assert.equal(reminderDue(E, d(29), undefined), true);  // day 30 was missed -> catch up
assert.equal(reminderDue(E, d(29), d(30)), false);     // sent on day 30 -> quiet
assert.equal(reminderDue(E, d(16), d(30)), false);
assert.equal(reminderDue(E, d(15), d(30)), true);      // 15-day reminder
assert.equal(reminderDue(E, d(12), d(16)), true);      // day 15 missed -> catch up
assert.equal(reminderDue(E, d(8), d(15)), false);
assert.equal(reminderDue(E, d(7), d(15)), true);       // daily from 7 days out
assert.equal(reminderDue(E, d(7), d(7)), false);       // once a day
assert.equal(reminderDue(E, d(6), d(7)), true);
assert.equal(reminderDue(E, d(-3), d(-2)), true);      // expired: still daily
assert.equal(reminderDue(E, d(-3), d(-3)), false);

console.log('notification-digest: all checks passed');
