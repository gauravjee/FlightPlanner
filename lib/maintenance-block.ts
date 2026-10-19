// lib/maintenance-block.ts
// Maintenance Phase 2 (19 Oct, operator): an aircraft with an OVERDUE schedule item that is marked
// "blocks booking" can't be booked. Only admin / super_admin may override, with a reason; the booking
// keeps the reason (scheduled_flights.maintenance_override_reason). Items with no baseline don't block.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { computeMaintenanceDueItems } from '@/lib/maintenance-due';

// Names of the aircraft's overdue blocking items (empty = bookable).
export async function overdueBlockingItems(aircraftId: string): Promise<string[]> {
  const { data: ac } = await supabaseAdmin.from('aircraft').select('model, hobbs_time').eq('id', aircraftId).maybeSingle();
  if (!ac) return [];
  const { data: templates } = await supabaseAdmin.from('aircraft_maintenance_schedule_templates')
    .select('id, aircraft_model, item_name, interval_type, interval_value')
    .eq('aircraft_model', ac.model).eq('is_active', true).eq('blocks_booking', true);
  if (!templates?.length) return [];
  const { data: records } = await supabaseAdmin.from('maintenance_records')
    .select('status, completed_date, maintenance_type, description, hobbs_at_completion')
    .eq('aircraft_id', aircraftId).eq('status', 'COMPLETED');
  return computeMaintenanceDueItems(
    aircraftId,
    Number(ac.hobbs_time ?? 0),
    templates.map(t => ({
      id: t.id, aircraftModel: t.aircraft_model, itemName: t.item_name, intervalType: t.interval_type,
      intervalValue: Number(t.interval_value), notes: null, isActive: true, engineType: null,
    })),
    (records ?? []).map(r => ({
      aircraftId, status: r.status, completedDate: r.completed_date ?? null, maintenanceType: r.maintenance_type ?? '',
      description: r.description ?? '', hobbsAtCompletion: r.hobbs_at_completion ?? null,
    })),
  ).filter(i => i.status === 'OVERDUE').map(i => i.template.itemName);
}

export function maintenanceBlockMessage(items: string[]): string {
  return `This aircraft is overdue for ${items.join(', ')} and can't be booked until the maintenance is logged.`;
}

// The override reason a request carries, or null when it has none worth keeping.
export function overrideReasonFrom(body: Record<string, unknown>): string | null {
  const r = typeof body.maintenanceOverrideReason === 'string' ? body.maintenanceOverrideReason.trim() : '';
  return r.length >= 5 ? r.slice(0, 500) : null;
}
