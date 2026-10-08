// components/account/UserIdSection.tsx
// B1 user ID login (2026-10-08): "Your user ID" on the Account page. Shows
// the current user ID; while the one change is unused, lets the person
// check a new one and change it once. Server rules: /api/me/user-id.
'use client';

import { useEffect, useState } from 'react';
import { AtSign, Lock, Check } from 'lucide-react';

type Mine = { userId: string | null; changedAt: string | null };

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default function UserIdSection() {
  const [mine, setMine] = useState<Mine | null>(null);
  const [next, setNext] = useState('');
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Inline confirm: window.confirm is silently blocked in some embedded browsers.
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/me/user-id');
      const body = await res.json().catch(() => ({}));
      if (res.ok) setMine(body); else setError(body.error || 'Failed to load your user ID.');
    })();
  }, []);

  const checkIt = async () => {
    setBusy(true); setCheck(null); setError('');
    const res = await fetch(`/api/me/user-id?check=${encodeURIComponent(next.trim())}`);
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(body.error || 'Could not check that user ID.'); return; }
    setCheck(body.available ? { ok: true, text: `"${next.trim()}" is available.` } : { ok: false, text: body.reason });
  };

  const change = async () => {
    setConfirming(false); setBusy(true); setError('');
    const res = await fetch('/api/me/user-id', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: next.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(body.error || 'Failed to change your user ID.'); return; }
    setMine(body); setNext(''); setCheck(null);
  };

  const inputClass = 'w-full surface-inner rounded-lg px-4 py-3 font-mono focus:outline-none focus:border-[var(--accent)]';

  return (
    <div className="surface-card backdrop-blur-sm p-8 mb-6">
      <h2 className="text-lg font-bold mb-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <AtSign className="w-5 h-5 text-secondary" /> Your user ID
      </h2>
      <p className="text-sm text-secondary mb-4">You can sign in with this or with your email.</p>

      {!mine ? <p className="text-sm text-secondary">{error || 'Loading…'}</p> : (
        <>
          <div className={inputClass} aria-label="Current user ID">{mine.userId ?? <span className="text-tertiary font-sans">Not set yet</span>}</div>

          {mine.changedAt ? (
            <p className="text-xs text-tertiary mt-2 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Changed on {fmt(mine.changedAt)}. It can&apos;t be changed again; ask a super admin if it must be.
            </p>
          ) : (
            <>
              <label htmlFor="new-user-id" className="block text-sm text-secondary mt-4 mb-1">
                {mine.userId ? 'New user ID' : 'Choose your user ID'} (4–20 letters, digits, . _ -)
              </label>
              <div className="flex gap-2">
                <input id="new-user-id" value={next} maxLength={20} autoComplete="off"
                  onChange={e => { setNext(e.target.value); setCheck(null); setConfirming(false); }} className={inputClass} />
                <button type="button" onClick={checkIt} disabled={busy || next.trim().length < 4}
                  className="px-4 rounded-lg text-sm font-semibold whitespace-nowrap cursor-pointer disabled:opacity-50" style={{ backgroundColor: 'var(--surface-muted)' }}>
                  Check availability
                </button>
              </div>
              {check && <p className="text-sm mt-2" role="status" style={{ color: check.ok ? 'var(--success)' : 'var(--danger)' }}>{check.ok ? '✓ ' : '✗ '}{check.text}</p>}
              {confirming ? (
                <div className="mt-4 p-3 rounded-lg surface-inner" role="alert">
                  <p className="text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
                    Change your user ID to <strong className="font-mono">{next.trim()}</strong>? You can only do this once.
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={change} disabled={busy}
                      className="flex-1 py-2 rounded-lg font-bold cursor-pointer disabled:opacity-50"
                      style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>
                      Yes, change it
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} disabled={busy}
                      className="flex-1 py-2 rounded-lg font-semibold cursor-pointer disabled:opacity-50" style={{ backgroundColor: 'var(--surface-muted)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} disabled={busy || !check?.ok}
                  className="w-full mt-4 py-3 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}>
                  <Check className="w-4 h-4" /> Change user ID
                </button>
              )}
              <p className="text-xs mt-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--warning-soft)', color: 'var(--warning-text)' }}>
                You can change your user ID <strong>once</strong>. After that it&apos;s locked; only a super admin can unlock it.
              </p>
            </>
          )}
          {error && <p className="text-sm mt-2" role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
        </>
      )}
    </div>
  );
}
