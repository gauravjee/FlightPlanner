// GET /api/aircraft/[id]/maintenance-block — Maintenance Phase 2 (19 Oct): the aircraft's overdue
// "blocks booking" items, so the booking form can warn before submit. The booking routes re-check.
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { overdueBlockingItems } from '@/lib/maintenance-block';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await context.params;
  return NextResponse.json({ items: await overdueBlockingItems(id) });
}
