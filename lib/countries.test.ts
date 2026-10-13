// lib/countries.test.ts — run: npx tsx lib/countries.test.ts
import assert from 'node:assert/strict';
import { COUNTRIES, splitPhone, joinPhone, countryForDial, dialForCountry } from './countries';

assert.ok(COUNTRIES.length > 230);
assert.equal(COUNTRIES.find(c => c.code === 'IN')?.name, 'India');
assert.equal(new Set(COUNTRIES.map(c => c.code)).size, COUNTRIES.length); // no duplicate countries

assert.deepEqual(splitPhone('7200077720'), { dial: '91', number: '7200077720' }); // saved before the selector: +91
assert.deepEqual(splitPhone('+971 501234567'), { dial: '971', number: '501234567' });
assert.deepEqual(splitPhone('+1684 6331234'), { dial: '1684', number: '6331234' }); // longest code wins
assert.deepEqual(splitPhone(''), { dial: '91', number: '' });
assert.equal(joinPhone('91', ' 98765 43210 '), '+91 98765 43210');
assert.equal(joinPhone('91', '  '), '');
assert.equal(countryForDial('1'), 'US');
assert.equal(countryForDial('44'), 'GB');
assert.equal(dialForCountry('CA'), '1');

console.log('countries: all checks passed');
