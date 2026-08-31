// app/api/safety-incidents/[id]/route.ts
// Server-side, role-scoped triage update for a single safety incident —
// the 5x5 ICAO risk matrix, corrective action, assignment, and status
// (open/in-progress/resolved/closed). See add-safety-incident-workflow.sql
// and add-safety-incident-numbering-and-maintenance-routing.sql.
//
// Three tiers of write access, per explicit user decision (2026-08-31):
//  - INCIDENT_MANAGE_ROLES (operations/safety_officer/admin/super_admin):
//    full access — risk rating, corrective action, assignment, any status.
//  - INCIDENT_RESOLVE_ROLES (maintenance): narrow — resolutionNote + status
//    RESOLVED only. Can't risk-rate, reassign, or close.
//  - Anyone else in INCIDENT_REPORT_ROLES: narrower still — can only set
//    status CLOSED, and only on an incident they themselves reported
//    (reported_by must match their session name/email).
// All three are auth'd against the broad INCIDENT_REPORT_ROLES first (so
// everyone who can see an incident gets a real 403 instead of a 401), then
// gated further by which fields the request body actually touches.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { INCIDENT_REPORT_ROLES, INCIDENT_MANAGE_ROLES, INCIDENT_RESOLVE_ROLES } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { session, error } = await requireRole(INCIDENT_REPORT_ROLES);
  if (error) return error;

  const role = session.user.role || '';
  const isManager = INCIDENT_MANAGE_ROLES.includes(role);
  const isResolver = !isManager && INCIDENT_RESOLVE_ROLES.includes(role);

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { riskSeverity, riskLikelihood, status, correctiveAction, assignedTo, resolutionNote } = body;
  const provided = (v: unknown) => v !== undefined;

  // Field-level gate: reject up front if the request touches anything the
  // caller's tier isn't allowed to touch, rather than silently ignoring it.
  const managerOnlyFieldsTouched = provided(riskSeverity) || provided(riskLikelihood) || provided(correctiveAction) || provided(assignedTo);
  if (!isManager && managerOnlyFieldsTouched) {
    return NextResponse.json({ error: 'Only a safety manager can set risk rating, corrective action, or assignment.' }, { status: 403 });
  }
  if (isResolver && provided(status) && status !== 'RESOLVED') {
    return NextResponse.json({ error: 'Maintenance can only mark an incident RESOLVED.' }, { status: 403 });
  }
  if (!isManager && !isResolver && provided(status) && status !== 'CLOSED') {
    return NextResponse.json({ error: 'You can only close an incident you reported.' }, { status: 403 });
  }
  if (!isManager && provided(resolutionNote) && !isResolver) {
    return NextResponse.json({ error: 'Only Maintenance can set a resolution note.' }, { status: 403 });
  }

  // Reporter-close path: verify this session actually reported it.
  if (!isManager && !isResolver && status === 'CLOSED') {
    const { data: incRow } = await supabaseAdmin.from('safety_incidents').select('reported_by').eq('id', id).single();
    const who = session.user.name || session.user.email || '';
    if (!incRow || incRow.reported_by !== who) {
      return NextResponse.json({ error: 'Only the original reporter or a safety manager can close this incident.' }, { status: 403 });
    }
  }

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

  if (resolutionNote !== undefined) {
    dbUpdates.resolution_note = typeof resolutionNote === 'string' ? resolutionNote : null;
  }

  if (status !== undefined) {
    const allowedStatus = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
    if (typeof status !== 'string' || !allowedStatus.includes(status)) {
      return NextResponse.json({ error: 'status must be OPEN, IN_PROGRESS, RESOLVED, or CLOSED.' }, { status: 400 });
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

    // Same for resolved_by/resolved_at — stamp on RESOLVED, clear only on
    // a genuine reopen (OPEN/IN_PROGRESS); a later CLOSED keeps the record
    // of who did the technical resolution.
    if (status === 'RESOLVED') {
      dbUpdates.resolved_by = session.user.name || session.user.email || 'Unknown';
      dbUpdates.resolved_at = new Date().toISOString();
    } else if (status === 'OPEN' || status === 'IN_PROGRESS') {
      dbUpdates.resolved_by = null;
      dbUpdates.resolved_at = null;
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
