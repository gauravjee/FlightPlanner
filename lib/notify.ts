// lib/notify.ts
// On-page replacement for alert() (2026-10-08): native dialogs are silently
// blocked in some embedded browsers. Plain DOM on document.body, so the
// message survives the calling modal closing or the page re-rendering.
// Browser-only: call it from event handlers, never during render.

const COLORS = { error: 'var(--danger)', success: 'var(--success)', warning: '#b45309' } as const;

export function notify(message: string, kind: keyof typeof COLORS = 'error'): void {
  let box = document.getElementById('fp-notify');
  if (!box) {
    box = document.createElement('div');
    box.id = 'fp-notify';
    box.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:min(440px,calc(100vw - 32px))';
    document.body.appendChild(box);
  }
  const toast = document.createElement('div');
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  toast.style.cssText = `position:relative;background:${COLORS[kind]};color:#fff;padding:12px 40px 12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.3);white-space:pre-line;font-size:14px;line-height:1.4`;
  toast.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Dismiss message');
  close.style.cssText = 'position:absolute;top:6px;right:10px;background:none;border:none;color:#fff;font-size:20px;line-height:1;cursor:pointer';
  close.onclick = () => toast.remove();
  toast.appendChild(close);
  box.appendChild(toast);
  // Long messages (e.g. a list of bookings) stay until dismissed.
  if (message.length <= 200) setTimeout(() => toast.remove(), 8000);
}
