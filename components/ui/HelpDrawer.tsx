// components/ui/HelpDrawer.tsx — the header's "?" (UI plan Phase 1, 23 Oct): help for the page you are on, from lib/help.ts.
'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { CircleHelp, X } from 'lucide-react';
import { helpForPath } from '@/lib/help';
import { useEscapeToClose } from '@/lib/useEscapeToClose';

export default function HelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Help for this page" title="Help for this page"
        className="text-secondary hover:text-accent transition cursor-pointer">
        <CircleHelp className="w-5 h-5" />
      </button>
      {open && <HelpPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  useEscapeToClose(onClose);
  const pathname = usePathname() ?? '';
  const { data: session } = useSession();
  const articles = helpForPath(pathname, session?.user?.role ?? '');
  if (typeof document === 'undefined') return null;
  // Portaled to <body>: the header's backdrop-blur would otherwise contain this fixed panel (see MobileNavPanel).
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <aside role="dialog" aria-label="Help for this page"
        className="absolute right-0 top-0 h-full w-[26rem] max-w-[90vw] overflow-y-auto p-5 flex flex-col gap-4"
        style={{ backgroundColor: 'var(--surface)', borderLeft: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-tertiary">Help · this page</p>
          <button type="button" onClick={onClose} aria-label="Close help" className="text-secondary hover:text-accent transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        {articles.length === 0 && <p className="text-sm text-secondary">There is no help written for this page yet.</p>}
        {articles.map(a => (
          <section key={a.id}>
            <h2 className="text-base font-semibold mb-2">{a.title}</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-secondary">
              {a.body.map(line => <li key={line}>{line}</li>)}
            </ul>
          </section>
        ))}
        <Link href="/dashboard/help" onClick={onClose} className="mt-auto text-sm text-accent hover:underline">Open the Help centre</Link>
      </aside>
    </div>,
    document.body,
  );
}
