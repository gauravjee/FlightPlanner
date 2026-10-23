import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchEntries, SEARCH_TASKS, SETUP_TABS, type SearchEntry } from './search';

const E: SearchEntry[] = [
  { kind: 'Pages', label: 'Statements', href: '/s', hint: 'Finance', keywords: 'statement ledger pdf' },
  { kind: 'Pages', label: 'Report a Defect', href: '/d', hint: 'Fleet & Engineering', keywords: 'squawk snag' },
  { kind: 'Tasks', label: 'Record a payment', href: '/a', hint: 'Accounts › Record payment', keywords: 'pay receipt' },
  { kind: 'Pages', label: 'Accounts', href: '/a2', hint: 'Finance', keywords: 'payment money' },
  { kind: 'Help', label: 'How charges and GST work', href: '/h', hint: 'Billing' },
];

test('matches name, menu group and extra words; all words must match', () => {
  assert.deepEqual(searchEntries(E, 'squawk').map(e => e.href), ['/d']);
  assert.deepEqual(searchEntries(E, 'finance ledger').map(e => e.href), ['/s']);
  assert.deepEqual(searchEntries(E, 'gst').map(e => e.href), ['/h']);
  assert.deepEqual(searchEntries(E, 'squawk payment'), []);
  assert.deepEqual(searchEntries(E, '   '), []);
});

test('ranks a label that starts with the query first, tasks before pages on a tie', () => {
  assert.deepEqual(searchEntries(E, 'pay').map(e => e.href), ['/a', '/a2']);
  assert.equal(searchEntries(E, 'acc')[0].href, '/a2'); // "Accounts" starts with it
  assert.equal(searchEntries(E, 'payment', 1).length, 1); // limit
});

test('task and setup lists are well formed', () => {
  for (const t of SEARCH_TASKS) assert.ok(t.href.startsWith('/') && t.roles.length > 0, t.label);
  assert.equal(new Set(SETUP_TABS.map(t => t[0])).size, SETUP_TABS.length);
});
