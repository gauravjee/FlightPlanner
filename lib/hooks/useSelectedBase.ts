// lib/hooks/useSelectedBase.ts — multi-base M3: the base chosen in the header ("All bases" or one base).
// Remembered per user in this browser. With one active base it is always "All bases", so nothing filters.
'use client';

import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { useBases } from '@/lib/hooks/useBases';
import { resolveSelectedBase, ALL_BASES, type SelectedBase } from '@/lib/bases';

// Keyed by home base too: when someone's home base changes, their old choice no longer applies.
const storageKey = (email: string, home: number | null) => `fp-selected-base:${email}:${home ?? 'none'}`;
const readStored = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };

export function useSelectedBase() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? '';
  const { activeBases, multiBase } = useBases();
  const { data: me } = useSWR(email && multiBase ? '/api/me/base' : null, (u: string) => fetch(u).then(r => r.json()));
  // SWR as a tiny shared store, so every component sees a change from the header at once.
  const home: number | null = me?.homeBaseId ?? null;
  const { data: stored, mutate } = useSWR(email ? ['selectedBase', email, home] : null, () => readStored(storageKey(email, home)));

  const selected: SelectedBase = resolveSelectedBase(
    stored ?? null, activeBases.map(b => b.id), session?.user?.role, home,
  );
  const setSelected = (value: SelectedBase) => {
    try { localStorage.setItem(storageKey(email, home), String(value)); } catch { /* private mode: not remembered */ }
    mutate(String(value), { revalidate: false });
  };
  const selectedBase = selected === ALL_BASES ? null : activeBases.find(b => b.id === selected) ?? null;
  return { selected, setSelected, selectedBase, activeBases, multiBase, homeBaseId: home };
}
