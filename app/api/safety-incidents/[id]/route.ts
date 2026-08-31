// app/api/safety-incidents/[id]/route.ts
// Server-side, role-scoped triage update for a single safety incident —
// the 5x5 ICAO risk matrix, corrective action, assignment, and status
// (open/in-progress/closed). See add-safety-incident-workflow.sql.
//
// Gated to INCIDENT_MANAGE_ROLES, deliberately narrower than
// INCIDENT_REPORT_ROLES (GET/POST on the parent route) — anyone on the
// flight line can report an incident, but only the safety-management side
// can rate its risk, assign a corrective action, or close it out.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { INCIDENT_MANAGE_ROLES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { session, error } = await requireRole(INCIDENT_MANAGE_ROLES);
  if (error) return error;

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { riskSeverity, riskLikelihood, status, correctiveAction, assignedTo } = body;

  const dbUpdates: Record<string, unknown> = {};

  if (riskSeverity !== undefined || riskLikelihood !== undefined) {
    const sev = typeof riskSeverity === 'number' ? riskSeverity : null;
    const lik = typeof riskLikelihood === 'number' ? riskLikelihood : null;
    if (sev !== null && (sev < 1 || sev > 5)) {
      return NextResponse.json({ error: 'riskSeverity must be 1-5.' }, { status: 400 });
    }
    if (lik !== null && (lik < 1 || lik > 5)) {
      return NextResponse.json({ error: 'riskLikelihood must be 1-5.' }, { status: 400 });
    }
    dbUpdates.risk_severity = sev;
    dbUpdates.risk_likelihood = lik;
    // Denormalized product — only computable once both axes are set.
    dbUpdates.risk_score = sev !== null && lik !== null ? sev * lik : null;
  }

  if (correctiveAction !== undefined) {
    dbUpdates.corrective_action = typeof correctiveAction === 'string' ? correctiveAction : null;
  }

  if (assignedTo !== undefined) {
    dbUpdates.assigned_to = typeof assignedTo === 'string' ? assignedTo : null;
  }

  if (status !== undefined) {
    const allowedStatus = ['OPEN', 'IN_PROGRESS', 'CLOSED'];
    if (typeof status !== 'string' || !allowedStatus.includes(status)) {
      return NextResponse.json({ error: 'status must be OPEN, IN_PROGRESS, or CLOSED.' }, { status: 400 });
    }
    dbUpdates.status = status;
    // Record who closed it and when; clear both if it's reopened.
    if (status === 'CLOSED') {
      dbUpdates.closed_by = session.user.name || session.user.email || 'Unknown';
      dbUpdates.closed_at = new Date().toISOString();
    } else {
      dbUpdates.closed_by = null;
      dbUpdates.closed_at = null;
    }
  }

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { error: dbError } = await supabaseAdmin.from('safety_incidents').update(dbUpdates).eq('id', id);

  if (dbError) {
    console.error('Error updating safety incident:', dbError);
    return NextResponse.json({ error: 'Failed to update incident.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
