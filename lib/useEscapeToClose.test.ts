// lib/useEscapeToClose.test.ts
// Run: npx tsx lib/useEscapeToClose.test.ts   (no test framework needed)
//
// WHY THIS EXISTS. The hook's stack behaviour — only the TOPMOST modal
// reacts to Escape — was added on 2026-09-10 to fix a real bug: a
// ConfirmDialog open over another modal meant one Escape fired both
// handlers, cancelling the confirmation AND closing the form beneath it.
//
// The 2026-09-11 verification pass then found that this case is NOT
// REACHABLE anywhere in the current UI. Both ConfirmDialog call sites sit
// over a page rather than a modal, and FlightDetailModal's cancel-reason
// picker renders inside the same overlay instead of nesting. So the logic
// that the fix turns on was being exercised by nothing at all — not the
// app, not a test. That is the gap this file closes.
//
// The hook is a React hook, but the part worth testing is not React: it is
// a module-level stack plus one keydown handler. Rather than pull in a
// renderer, this drives the same lifecycle the hook drives — push on
// mount, splice on unmount, listener attached only while the stack is
// non-empty — against a minimal fake document. If the real hook's effect
// bodies change, this file must change with them; that coupling is
// deliberate and cheaper than a DOM test stack for one behaviour.

import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mirror of the hook's module state and effects. Kept structurally identical
// to lib/useEscapeToClose.ts so a divergence is visible side by side.
// ---------------------------------------------------------------------------

const stack: Array<{ current: () => void }> = [];
let listenerAttached = 0;

function handleKeyDown(key: string) {
  if (key !== 'Escape') return;
  stack[stack.length - 1]?.current();
}

/** What the hook's mount effect does. Returns its own cleanup, as the effect does. */
function mountModal(onClose: () => void) {
  const ref = { current: onClose };
  if (stack.length === 0) listenerAttached++;
  stack.push(ref);
  return {
    ref,
    unmount() {
      stack.splice(stack.indexOf(ref), 1);
      if (stack.length === 0) listenerAttached--;
    },
  };
}

const press = (key: string) => handleKeyDown(key);

// ---------------------------------------------------------------------------

const log: string[] = [];
const closer = (name: string) => () => log.push(name);

// One modal: Escape closes it.
const form = mountModal(closer('form'));
assert.equal(listenerAttached, 1, 'listener attached with the first modal');
press('Escape');
assert.deepEqual(log, ['form']);

// THE BUG THIS GUARDS. A confirm dialog opens ON TOP of the form. One
// Escape must close ONLY the confirm — not both. Before the stack, every
// modal listened on document independently and both handlers fired.
log.length = 0;
const confirm = mountModal(closer('confirm'));
assert.equal(listenerAttached, 1, 'still exactly one listener, not one per modal');
press('Escape');
assert.deepEqual(log, ['confirm'], 'only the topmost modal reacts');
assert.equal(log.includes('form'), false, 'the form underneath must survive');

// With the confirm dismissed, the form is topmost again.
confirm.unmount();
log.length = 0;
press('Escape');
assert.deepEqual(log, ['form'], 'closing the top restores the one beneath');

// Non-Escape keys do nothing.
log.length = 0;
press('Enter'); press('a'); press('Tab');
assert.deepEqual(log, [], 'only Escape triggers a close');

// Listener is torn down with the last modal, not the first.
form.unmount();
assert.equal(stack.length, 0);
assert.equal(listenerAttached, 0, 'listener removed only when the last modal unmounts');
log.length = 0;
press('Escape');
assert.deepEqual(log, [], 'no modal open, nothing to close');

// Out-of-order unmount: a modal can be closed by its own button while
// another sits above it. splice-by-identity must remove the right one —
// index-based removal would corrupt the order here.
log.length = 0;
const a = mountModal(closer('a'));
const b = mountModal(closer('b'));
const c = mountModal(closer('c'));
b.unmount();
press('Escape');
assert.deepEqual(log, ['c'], 'removing a middle entry leaves the top intact');
c.unmount();
log.length = 0;
press('Escape');
assert.deepEqual(log, ['a'], 'and the remaining one is now topmost');
a.unmount();
assert.equal(listenerAttached, 0);

// A re-render swapping in a fresh inline arrow must NOT reorder the stack:
// the hook holds onClose in a ref and syncs it in place, precisely so that
// "topmost" survives a parent re-render.
log.length = 0;
const outer = mountModal(closer('outer'));
const inner = mountModal(closer('inner-v1'));
inner.ref.current = closer('inner-v2'); // what the sync effect does
press('Escape');
assert.deepEqual(log, ['inner-v2'], 'ref sync updates the handler without reordering');
inner.unmount(); outer.unmount();

console.log('useEscapeToClose: all assertions passed');
