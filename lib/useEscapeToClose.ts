// lib/useEscapeToClose.ts
// ---------------------------------------------------------------------------
// 2026-08-21 (accessibility round): keyboard-only users had no way to
// dismiss any of this app's modal dialogs — the whole-frontend review's
// UI/UX findings flagged "no modal closes on Escape" across the app. A grep
// across every custom modal (`fixed inset-0` overlay pattern) confirmed all
// 15 had no Escape handling at all, not just a handful — this shared hook
// closes that gap in one place rather than pasting the same
// addEventListener/removeEventListener block into 15 files independently
// (and having it drift the next time a 16th modal is added).
//
// 2026-09-10 (accessibility verification pass): the claim above was not
// actually true — ConfirmDialog, the destructive-action confirmation used
// across the app, never called this hook. Adding it there exposed a second
// problem: a ConfirmDialog can be open on top of another modal, and with
// every modal listening on `document` independently, one Escape fired both
// handlers — cancelling the confirmation AND closing the form underneath it.
// So the hook now keeps a stack and only the TOPMOST (most recently mounted)
// modal reacts. One listener, mounted with the first modal, torn down with
// the last.
//
// Usage: call this at the top of any modal component, passing the same
// `onClose` the modal already receives as a prop.
//
//   export default function SomeModal({ onClose }: Props) {
//     useEscapeToClose(onClose);
//     ...
//   }
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react';

// Module-level, not context: modals here are rendered ad hoc by whatever
// page needs them, with no shared provider to hang state off, and there is
// exactly one document to listen to.
const stack: Array<{ current: () => void }> = [];

function handleKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  stack[stack.length - 1]?.current();
}

export function useEscapeToClose(onClose: () => void) {
  // Held in a ref so a modal re-rendering with a fresh inline arrow prop
  // does not churn the stack (which would reorder it and break "topmost").
  const ref = useRef(onClose);

  // Synced in an effect, not assigned during render: react-hooks/refs bans
  // the latter, and there is nothing to gain from being earlier — the only
  // reader is a keydown handler, which cannot fire mid-render.
  useEffect(() => { ref.current = onClose; });

  useEffect(() => {
    if (stack.length === 0) document.addEventListener('keydown', handleKeyDown);
    stack.push(ref);
    return () => {
      stack.splice(stack.indexOf(ref), 1);
      if (stack.length === 0) document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
