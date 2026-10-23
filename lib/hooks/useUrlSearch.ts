// lib/hooks/useUrlSearch.ts — a page's search box that starts from ?q= (UI plan Step 2b: a record found with Ctrl K
// opens its page filtered to it). A new ?q= while the page is open replaces the box, like typing it.
'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export function useUrlSearch(): [string, (value: string) => void] {
  const q = useSearchParams()?.get('q') ?? '';
  const [value, setValue] = useState(q);
  const [seen, setSeen] = useState(q);
  if (q !== seen) { setSeen(q); setValue(q); } // adjust state while rendering, not in an effect
  return [value, setValue];
}
