// lib/training-programs.test.ts
// Run: npx tsx lib/training-programs.test.ts   (no test framework needed)
//
// Covers requirementPercent's zero/null handling only — the case that was
// silently rendering "NaN%" on the Progress page and Dashboard widget, and
// poisoning the averaged overall percentage with a single zeroed target.
// matchTrainingProgram is left alone; it has no arithmetic to get wrong.

import assert from 'node:assert/strict';
import { requirementPercent } from './training-programs';

// The bug: 0 required -> 0/0 -> NaN, which passed `!= null` and rendered.
assert.equal(requirementPercent(0, 0), null, '0 of 0 required is "no target", not NaN');
assert.equal(requirementPercent(12, 0), null, 'hours flown against a 0 target is still no target');
assert.equal(requirementPercent(5, null), null);
assert.equal(requirementPercent(5, undefined), null);
assert.equal(requirementPercent(5, -3), null, 'a negative target is nonsense, not 0%');

// Normal arithmetic, unchanged from the inline version it replaced.
assert.equal(requirementPercent(0, 40), 0, '0% must survive as 0, not become null');
assert.equal(requirementPercent(10, 40), 25);
assert.equal(requirementPercent(40, 40), 100);
assert.equal(requirementPercent(60, 40), 100, 'clamped at 100');
assert.equal(requirementPercent(1, 3), 33, 'rounded');

// The reason null and 0 must stay distinguishable: an average over the
// applicable metrics. A null drops out; a 0 drags the average down.
const metrics = [requirementPercent(20, 40), requirementPercent(0, 0), requirementPercent(10, 10)];
const applicable = metrics.filter((p): p is number => p != null);
assert.deepEqual(applicable, [50, 100]);
assert.equal(Math.round(applicable.reduce((a, b) => a + b, 0) / applicable.length), 75);

console.log('requirementPercent: all assertions passed');
