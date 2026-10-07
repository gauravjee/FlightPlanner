// app/api/me/user-id/route.ts
// B1 user ID login (2026-10-08; claude/user-id-login-design-2026-10-08.md).
// The signed-in person's own user ID:
//   GET                → { userId, changedAt } (changedAt null = the one change is still available)
//   GET ?check=<id>    → { available, reason } for the "Check availability" button
//   POST { userId }    → use the one change. Re-checks everything; the
//                        database's case-insensitive unique index has the final say.
// After the change the ID is locked until a super admin allows one more
// (PATCH /api/admin/users/[id] { allowUserIdChange: true }).

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { chosenUserIdProblem, exactIlike } from '@/lib/user-id';

async function me(email: string) {
  const { data } = await supabaseAdmin.from('users').select('id, user_id, user_id_changed_at').eq('email', email).maybeSingle();
  return data;
}

/** null when `id` can be used by user `selfId`, else the reason it can't. */
async function problemWith(id: string, selfId: string): Promise<string | null> {
  const { data: series } = await supabaseAdmin.from('enrollment_series').select('prefix');
  const shape = chosenUserIdProblem(id, (series ?? []).map(s => s.prefix as string));
  if (shape) return shape;
  const { data: taken } = await supabaseAdmin.from('users').select('id').ilike('user_id', exactIlike(id)).neq('id', selfId).limit(1);
  return taken?.length ? `"${id}" is taken.` : null;
}

export async function GET(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const self = await me(session.user.email!);
  if (!self) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  const check = new URL(request.url).searchParams.get('check');
  if (check === null) return NextResponse.json({ userId: self.user_id, changedAt: self.user_id_changed_at });
  const reason = await problemWith(check.trim(), self.id);
  return NextResponse.json({ available: !reason, reason });
}

export async function POST(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const self = await me(session.user.email!);
  if (!self) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  if (self.user_id_changed_at) return NextResponse.json({ error: 'Your user ID has already been changed once. Ask a super admin if it must change again.' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const reason = await problemWith(userId, self.id);
  if (reason) return NextResponse.json({ error: reason }, { status: 400 });

  // `user_id_changed_at is null` in the WHERE makes the one change atomic:
  // two quick submits can't both succeed.
  const { data, error: dbError } = await supabaseAdmin.from('users')
    .update({ user_id: userId, user_id_changed_at: new Date().toISOString() })
    .eq('id', self.id).is('user_id_changed_at', null)
    .select('user_id, user_id_changed_at').maybeSingle();
  if (dbError) {
    if (dbError.code === '23505') return NextResponse.json({ error: `"${userId}" is taken.` }, { status: 400 });
    console.error('Error changing user ID:', dbError.code);
    return NextResponse.json({ error: 'Failed to change your user ID.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Your user ID has already been changed once.' }, { status: 400 });
  return NextResponse.json({ userId: data.user_id, changedAt: data.user_id_changed_at });
}
