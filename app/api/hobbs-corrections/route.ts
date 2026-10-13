// app/api/hobbs-corrections/route.ts
// Hobbs correction history (hobbs_corrections, written only by correct_hobbs_end / set_aircraft_hobbs).
// Admin-only, matching who can make corrections; it names who corrected what and why.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const { error } = await requireRole(['admin', 'super_admin']);
  if (error) return error;

  const { data, error: dbError } = await supabaseAdmin
    .from('hobbs_corrections')
    .select('*, aircraft(registration)')
    .order('corrected_at', { ascending: false })
    .limit(200); // shortcut: newest 200 only, add paging if an FTO ever needs more on screen

  if (dbError) {
    console.error('Error loading Hobbs corrections:', dbError);
    return NextResponse.json({ error: 'Failed to load Hobbs corrections.' }, { status: 500 });
  }
  return NextResponse.json({ corrections: data });
}
