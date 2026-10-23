// components/ui/CommandPalette.tsx — "Go to anything" (UI plan Phase 2a, 23 Oct; operator: "search bar ... to go to a
// specific function or task", shortcut Ctrl K only). Pages come from the role-filtered menu, tasks and help are
// filtered by role too, so a result never points at a page the user's menu doesn't offer.
'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Search } from 'lucide-react';
import { useVisibleNavGroups } from './Sidebar';
import { useMyPermissionOverrides } from '@/lib/useMyPermissionOverrides';
import { canWriteModule } from '@/lib/permissions';
import { useEscapeToClose } from '@/lib/useEscapeToClose';
import { searchHelp } from '@/lib/help';
import { searchEntries, PAGE_KEYWORDS, SEARCH_TASKS, SETUP_TABS, type SearchEntry } from '@/lib/search';

export default function SearchButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search (Ctrl K)"
        className="flex items-center gap-2 rounded-lg px-2 lg:px-3 py-1.5 text-sm text-secondary cursor-pointer hover:bg-[var(--accent-soft)] transition lg:min-w-48"
        style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface-muted)' }}>
        <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="hidden lg:inline flex-1 text-left">Search…</span>
        <kbd className="hidden lg:inline text-[10px] text-tertiary font-sans">Ctrl K</kbd>
      </button>
      {open && <Palette onClose={() => setOpen(false)} />}
    </>
  );
}

function useEntries(): { entries: SearchEntry[]; role: string } {
  const { data: session } = useSession();
  const role = session?.user?.role ?? '';
  const overrides = useMyPermissionOverrides();
  const groups = useVisibleNavGroups();
  const pages: SearchEntry[] = groups.flatMap(g => g.items.map(i => ({
    kind: 'Pages' as const, label: i.label, href: i.href, hint: g.items.length > 1 ? g.label : 'Menu',
    keywords: PAGE_KEYWORDS[i.href.split('?')[0]] ?? '',
  })));
  if (role === 'super_admin') {
    pages.push(...SETUP_TABS.map(([id, label, kw]) => ({ kind: 'Pages' as const, label: `Admin Setup › ${label}`, href: `/dashboard/admin/setup?tab=${id}`, hint: 'Admin Setup', keywords: kw })));
  }
  const tasks: SearchEntry[] = SEARCH_TASKS
    .filter(t => t.roles.includes(role) || (t.moduleKey ? canWriteModule(role, overrides, t.moduleKey) : false))
    .map(t => ({ kind: 'Tasks' as const, label: t.label, href: t.href, hint: t.hint, keywords: t.keywords }));
  return { entries: [...tasks, ...pages], role };
}

function Palette({ onClose }: { onClose: () => void }) {
  useEscapeToClose(onClose);
  const router = useRouter();
  const { entries, role } = useEntries();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const help: SearchEntry[] = query.trim()
    ? searchHelp(query, role).slice(0, 3).map(a => ({ kind: 'Help' as const, label: a.title, href: `/dashboard/help?q=${encodeURIComponent(a.title)}`, hint: a.topic }))
    : [];
  // With nothing typed, offer this role's tasks as a starting point.
  const results = query.trim() ? [...searchEntries(entries, query), ...help] : entries.filter(e => e.kind === 'Tasks').slice(0, 6);
  const current = Math.min(active, Math.max(results.length - 1, 0));

  const go = (e: SearchEntry) => { onClose(); router.push(e.href); };
  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive((current + 1) % Math.max(results.length, 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive((current - 1 + results.length) % Math.max(results.length, 1)); }
    else if (ev.key === 'Enter' && results[current]) { ev.preventDefault(); go(results[current]); }
  };

  if (typeof document === 'undefined') return null;
  // Portaled to <body>: the header's backdrop-blur would otherwise contain this fixed overlay (see MobileNavPanel).
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div role="dialog" aria-label="Search" className="relative w-full max-w-xl self-start rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
        <label className="flex items-center gap-3 px-4 py-3 border-b divider">
          <Search className="w-5 h-5 text-secondary" aria-hidden="true" />
          <span className="sr-only">Search pages, tasks and help</span>
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKeyDown}
            placeholder="Search pages, tasks and help — e.g. pay, squawk, leave, GST"
            role="combobox" aria-expanded="true" aria-controls="search-results" aria-activedescendant={results[current] ? `sr-${current}` : undefined}
            className="flex-1 bg-transparent outline-none text-base" />
          <kbd className="text-[10px] text-tertiary font-sans">Esc</kbd>
        </label>
        <ul id="search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {!query.trim() && <li className="px-3 pt-1 pb-2 text-xs font-semibold uppercase tracking-wider text-tertiary">Suggested tasks</li>}
          {query.trim() && results.length === 0 && (
            <li className="px-3 py-6 text-sm text-secondary">Nothing found for “{query}”. Try a page or task name, such as “book”, “payment” or “leave”.</li>
          )}
          {results.map((r, i) => (
            <li key={r.kind + r.href + r.label} id={`sr-${i}`} role="option" aria-selected={i === current}
              onMouseEnter={() => setActive(i)} onClick={() => go(r)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer"
              style={i === current ? { backgroundColor: 'var(--accent-soft)' } : undefined}>
              <span className="badge badge-neutral shrink-0 w-12 justify-center">{r.kind === 'Pages' ? 'Page' : r.kind === 'Tasks' ? 'Task' : 'Help'}</span>
              <span className="flex-1 min-w-0 truncate text-sm font-medium">{r.label}</span>
              <span className="text-xs text-tertiary truncate max-w-[45%]">{r.hint}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-4 px-4 py-2 text-[11px] text-tertiary border-t divider">
          <span>↑ ↓ to move</span><span>Enter to open</span><span>Ctrl K to search from any page</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
