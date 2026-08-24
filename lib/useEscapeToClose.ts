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
// Usage: call this at the top of any modal component, passing the same
// `onClose` the modal already receives as a prop.
//
//   export default function SomeModal({ onClose }: Props) {
//     useEscapeToClose(onClose);
//     ...
//   }
// ---------------------------------------------------------------------------

import { useEffect } from 'react';

export function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
}
