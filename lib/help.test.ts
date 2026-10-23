import { test } from 'node:test';
import assert from 'node:assert/strict';
import { helpForPath, searchHelp, HELP_ARTICLES, HELP_TOPICS } from './help';

test('the page help picks the longest matching path and respects roles', () => {
  assert.deepEqual(helpForPath('/dashboard/reports/statements', 'accounts').map(a => a.id), ['statements']);
  assert.deepEqual(helpForPath('/dashboard/reports/daily-flying', 'operations').map(a => a.id), ['dgca-reports']);
  assert.deepEqual(helpForPath('/dashboard/reports/breath-analyser', 'safety_officer').map(a => a.id), ['ba']);
  assert.deepEqual(helpForPath('/dashboard/schedule', 'student').map(a => a.id), ['book', 'cant-book', 'cancel']);
  assert.deepEqual(helpForPath('/dashboard/admin/setup', 'admin'), []); // not their page
  assert.deepEqual(helpForPath('/dashboard/students', 'admin').map(a => a.id), ['students']); // not '/dashboard/student'
  assert.deepEqual(helpForPath('/dashboard', 'admin'), []);
});

test('search matches all words in any order and hides other roles\' articles', () => {
  assert.ok(searchHelp('cancel booking', 'operations').some(a => a.id === 'cancel'));
  assert.ok(!searchHelp('GSTIN', 'maintenance').length);
  assert.equal(searchHelp('', 'student').length, HELP_ARTICLES.filter(a => !a.roles || a.roles.includes('student')).length);
});

test('every article has a known topic and a unique id', () => {
  assert.equal(new Set(HELP_ARTICLES.map(a => a.id)).size, HELP_ARTICLES.length);
  for (const a of HELP_ARTICLES) assert.ok(HELP_TOPICS.includes(a.topic), a.id);
});
