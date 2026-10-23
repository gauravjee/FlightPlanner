import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatDateTime, formatDayDate } from './ist';

test('formatDate gives "23 Oct 2026" for calendar days and IST timestamps', () => {
  assert.equal(formatDate('2026-10-23'), '23 Oct 2026');
  assert.equal(formatDate('2026-09-04'), '4 Sep 2026'); // not "Sept"
  assert.equal(formatDate('2026-10-22T20:00:00Z'), '23 Oct 2026'); // 01:30 IST next day
  assert.equal(formatDate(new Date('2026-01-05T06:00:00Z')), '5 Jan 2026');
  assert.equal(formatDate(''), '');
  assert.equal(formatDate(null), '');
  assert.equal(formatDate('not a date'), 'not a date');
});

test('formatDateTime adds the IST time', () => {
  assert.equal(formatDateTime('2026-10-23T04:00:00Z'), '23 Oct 2026, 09:30 IST');
  assert.equal(formatDateTime(undefined), '');
});

test('formatDayDate adds the weekday', () => {
  assert.equal(formatDayDate('2026-10-23'), 'Friday, 23 Oct 2026');
  assert.equal(formatDayDate('2026-10-09', 'short'), 'Fri, 9 Oct 2026');
});
