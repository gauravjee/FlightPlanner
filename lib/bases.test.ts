// lib/bases.test.ts — run: npx tsx lib/bases.test.ts
import assert from 'node:assert/strict';
import { baseRowError, settingToBaseValue, baseToSettingValue, isBaseSettingKey, resolveSelectedBase, inSelectedBase, overlayBaseSettings, ALL_BASES, type BaseRow } from './bases';

const ok = {
  name: 'Shirpur Airport', code: 'B1', time_slot_start: '06:00', time_slot_end: '20:00', time_slot_interval: 15,
  weekly_off_days: '0', partial_weekly_off_days: '{"day":6,"occurrences":[1,3,5]}', latitude: '21.324', longitude: '74.9567',
};
assert.equal(baseRowError(ok, true), null);
assert.equal(baseRowError({ ...ok, name: ' ' }, true), 'Base name is required.');
assert.equal(baseRowError({ is_active: true }, false), null); // an update need not resend name / code
assert.match(baseRowError({ ...ok, time_slot_start: '6:00' }, true)!, /HH:MM/);
assert.match(baseRowError({ ...ok, time_slot_end: '05:00' }, true)!, /after opening/);
assert.match(baseRowError({ ...ok, time_slot_interval: 3 }, true)!, /5 to 120/);
assert.match(baseRowError({ ...ok, latitude: '95' }, true)!, /Latitude/);
assert.equal(baseRowError({ ...ok, latitude: '' }, true), null);
assert.match(baseRowError({ ...ok, weekly_off_days: '7' }, true)!, /invalid/);
assert.match(baseRowError({ ...ok, partial_weekly_off_days: '{"day":6,"occurrences":[]}' }, true)!, /at least one week/);
assert.match(baseRowError({ ...ok, weekly_off_days: '0,6' }, true)!, /both a full and a partial/);

assert.equal(settingToBaseValue('airport_code', ''), null);
assert.equal(settingToBaseValue('latitude', ' 21.324 '), '21.324');
assert.equal(settingToBaseValue('time_slot_interval', '30'), 30);
assert.equal(settingToBaseValue('weekly_off_days', ''), '');
assert.equal(baseToSettingValue(null), '');
assert.equal(baseToSettingValue(15), '15');
assert.ok(isBaseSettingKey('weekly_off_days') && !isBaseSettingKey('school_name'));

// M3: header base selection
assert.equal(resolveSelectedBase('3', [1], 'instructor', 1), ALL_BASES); // one base: nothing to choose
assert.equal(resolveSelectedBase(null, [1, 3], 'admin', 1), ALL_BASES); // admins start on all bases
assert.equal(resolveSelectedBase(null, [1, 3], 'instructor', 3), 3); // others on their home base
assert.equal(resolveSelectedBase('1', [1, 3], 'instructor', 3), 1); // a stored choice wins
assert.equal(resolveSelectedBase('7', [1, 3], 'student', 3), 3); // a stale stored base is ignored
assert.equal(resolveSelectedBase(null, [1, 3], 'student', 9), ALL_BASES); // home base inactive
assert.ok(inSelectedBase(ALL_BASES, 3) && inSelectedBase(1, undefined) && inSelectedBase(3, '3') && !inSelectedBase(3, 1));

const b2 = { id: 3, name: 'B2', code: 'B2', airport_code: null, location_name: 'Test', latitude: '19.1', longitude: '72.8',
  time_slot_start: '07:00', time_slot_end: '18:00', time_slot_interval: 30, weekly_off_days: '1', partial_weekly_off_days: '', is_active: true } as BaseRow;
const over = overlayBaseSettings({ school_name: 'Horizon', airport_code: 'VOBL', time_slot_start: '06:00', buffer_minutes: '30' }, b2);
assert.deepEqual([over.school_name, over.buffer_minutes, over.airport_code, over.latitude, over.time_slot_start, over.time_slot_interval, over.weekly_off_days],
  ['Horizon', '30', '', '19.1', '07:00', '30', '1']); // school-wide keys untouched, per-base keys replaced
assert.equal(overlayBaseSettings({ a: '1' }, null).a, '1');

console.log('bases: all checks passed');
