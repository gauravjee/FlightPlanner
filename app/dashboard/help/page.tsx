// app/dashboard/help/page.tsx — Help centre (UI plan Phase 1, 23 Oct; operator: "self help for a new user").
// Every role; articles are filtered to the reader's role (lib/help.ts).
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Search } from 'lucide-react';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import { useSetHeader } from '@/components/ui/HeaderContext';
import { HELP_TOPICS, searchHelp } from '@/lib/help';

export default function HelpPage() {
  useSetHeader({ title: 'Help', subtitle: 'How to use FlightPro' });
  const { data: session } = useSession();
  const [query, setQuery] = useState('');
  const articles = searchHelp(query, session?.user?.role ?? '');

  return (
    <ProtectedRoute>
      <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-5">
          <h1 className="text-2xl font-bold">How can we help?</h1>
          <label className="surface-card flex items-center gap-3 px-4 py-3">
            <Search className="w-5 h-5 text-secondary" aria-hidden="true" />
            <span className="sr-only">Search help</span>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. cancel a booking, record a payment, GST"
              className="flex-1 bg-transparent outline-none text-base" />
          </label>
          {articles.length === 0 && <p className="text-secondary">Nothing found for “{query}”. Try fewer words, or ask your school admin.</p>}
          {HELP_TOPICS.map(topic => {
            const inTopic = articles.filter(a => a.topic === topic);
            if (!inTopic.length) return null;
            return (
              <section key={topic} className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-tertiary">{topic}</h2>
                {inTopic.map(a => (
                  // key includes the query so articles open while searching and close again when it is cleared
                  <details key={a.id + (query ? ':q' : '')} id={a.id} open={!!query} className="surface-card px-4 py-3">
                    <summary className="cursor-pointer font-semibold">{a.title}</summary>
                    <ul className="list-disc pl-5 mt-2 space-y-1.5 text-sm text-secondary">
                      {a.body.map(line => <li key={line}>{line}</li>)}
                    </ul>
                  </details>
                ))}
              </section>
            );
          })}
          <p className="text-sm text-tertiary">Can’t find it? Ask your school admin. Tip: the “?” at the top of any page shows help for that page.</p>
        </div>
      </main>
    </ProtectedRoute>
  );
}
