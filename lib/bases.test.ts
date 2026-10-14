// lib/bases.test.ts — run: npx tsx lib/bases.test.ts
import assert from 'node:assert/strict';
import { baseRowError, settingToBaseValue, baseToSettingValue, isBaseSettingKey } from './bases';

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

console.log('bases: all checks passed');
