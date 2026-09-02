// components/ui/ConfirmDialog.tsx
// Themed replacement for window.confirm() on destructive actions.
// Native confirm() is unstyled browser chrome, blocks the whole tab, and
// — the immediate reason this exists — can't be driven at all by
// automated/remote browser tooling (it gets auto-suppressed). This is a
// plain controlled component, same "render only while open" pattern as
// the other modals in this app (see MaintenanceDueSection.tsx's
// LogMaintenanceItemModal) — no portal, no context, nothing global.
'use client';

import { TriangleAlert } from 'lucide-react';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;       // red confirm button + warning icon; false for a neutral confirmation
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel }: Props) {
  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div className="surface-card w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-5 space-y-2">
          <h3 className="text-base font-semibold flex items-center gap-2">
            {danger && <TriangleAlert className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--danger)' }} />}
            {title}
          </h3>
          <p className="text-sm text-secondary">{message}</p>
        </div>
        <div className="flex gap-3 p-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer surface-inner">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer font-semibold"
            style={danger
              ? { backgroundColor: 'var(--danger)', color: '#fff' }
              : { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
