// lib/bases.ts — multi-base (claude/multi-base-design-2026-10-15.md). Pure: used by the config API route and the Bases tab.
import { parseWeeklyOffDays, parsePartialWeeklyOffRule } from '@/lib/store';

/** A bases row as the config route returns it (snake_case, like the other Admin Setup tables). */
export interface BaseRow {
  id: number;
  name: string;
  code: string;
  airport_code: string | null;
  location_name: string | null;
  latitude: string | null;
  longitude: string | null;
  time_slot_start: string;
  time_slot_end: string;
  time_slot_interval: number;
  weekly_off_days: string;
  partial_weekly_off_days: string;
  is_active: boolean;
}

/** Every row created before multi-base points here (the column defaults are 1), so it can't be deactivated. */
export const BASE1_ID = 1;

/**
 * Base 1's copy of these fto_settings keys (same names as the bases columns). Until the app reads
 * bases (step M3), the config route copies every write of one into the other so the two never drift.
 */
export const BASE_SETTING_KEYS = [
  'airport_code', 'location_name', 'latitude', 'longitude',
  'time_slot_start', 'time_slot_end', 'time_slot_interval', 'weekly_off_days', 'partial_weekly_off_days',
] as const;
export const isBaseSettingKey = (k: unknown): k is (typeof BASE_SETTING_KEYS)[number] =>
  (BASE_SETTING_KEYS as readonly unknown[]).includes(k);

const NULLABLE = ['airport_code', 'location_name', 'latitude', 'longitude'];

/** fto_settings text value -> bases column value. */
export function settingToBaseValue(key: string, value: string | null | undefined): string | number | null {
  const v = (value ?? '').trim();
  if (key === 'time_slot_interval') return Number.parseInt(v, 10) || 15;
  return NULLABLE.includes(key) && v === '' ? null : v;
}

/** bases column value -> fto_settings text value. */
export const baseToSettingValue = (value: unknown): string => (value == null ? '' : String(value));

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validates a bases insert / update (only the fields present, except name and code on insert). Returns an error or null. */
export function baseRowError(row: Record<string, unknown>, isNew: boolean): string | null {
  const has = (k: string) => k in row;
  const s = (k: string) => (row[k] == null ? '' : String(row[k]).trim());
  if ((isNew || has('name')) && !s('name')) return 'Base name is required.';
  if ((isNew || has('code')) && !s('code')) return 'Base code is required.';
  for (const k of ['time_slot_start', 'time_slot_end']) {
    if (has(k) && !HHMM.test(s(k))) return 'Opening and closing times must be HH:MM (24-hour).';
  }
  if (has('time_slot_start') && has('time_slot_end') && s('time_slot_start') >= s('time_slot_end')) {
    return 'Closing time must be after opening time.';
  }
  if (has('time_slot_interval')) {
    const n = Number(row.time_slot_interval);
    if (!Number.isInteger(n) || n < 5 || n > 120) return 'Slot interval must be a whole number of minutes, 5 to 120.';
  }
  for (const [k, max] of [['latitude', 90], ['longitude', 180]] as const) {
    if (has(k) && s(k) !== '' && !(Math.abs(Number(s(k))) <= max)) return `${k === 'latitude' ? 'Latitude' : 'Longitude'} must be a number from -${max} to ${max}.`;
  }
  if (has('weekly_off_days') && s('weekly_off_days') !== '' && !/^[0-6](,[0-6])*$/.test(s('weekly_off_days'))) {
    return 'Weekly off days are invalid.';
  }
  if (has('partial_weekly_off_days') && s('partial_weekly_off_days') !== '') {
    const rule = parsePartialWeeklyOffRule(s('partial_weekly_off_days'));
    if (!rule) return 'The partial weekly off needs a day and at least one week of the month.';
    if (parseWeeklyOffDays(s('weekly_off_days')).includes(rule.day)) return 'A day cannot be both a full and a partial weekly off.';
  }
  return null;
}

// ---- Multi-base M3: the base selected in the header ----

export const ALL_BASES = 'all' as const;
export type SelectedBase = number | typeof ALL_BASES;
const VIEW_ALL_ROLES = ['admin', 'super_admin'];

/**
 * Which base the header switcher shows. A stored choice wins if it is still valid; otherwise admins start
 * on all bases and everyone else on their home base. With one active base there is nothing to choose.
 */
export function resolveSelectedBase(
  stored: string | null, activeIds: number[], role: string | undefined, homeBaseId: number | null,
): SelectedBase {
  if (activeIds.length <= 1) return ALL_BASES;
  if (stored === ALL_BASES) return ALL_BASES;
  if (stored && activeIds.includes(Number(stored))) return Number(stored);
  if (VIEW_ALL_ROLES.includes(role ?? '')) return ALL_BASES;
  return homeBaseId && activeIds.includes(homeBaseId) ? homeBaseId : ALL_BASES;
}

/** True when a record (by its base id; missing = Base 1, the column default) belongs in the current view. */
export const inSelectedBase = (selected: SelectedBase, baseId: string | number | null | undefined): boolean =>
  selected === ALL_BASES || Number(baseId ?? BASE1_ID) === selected;

/** fto_settings with the selected base's per-base values laid over it (airport, coordinates, hours, off days). */
export function overlayBaseSettings(settings: Record<string, string>, base: BaseRow | null | undefined): Record<string, string> {
  if (!base) return settings;
  const out = { ...settings };
  for (const key of BASE_SETTING_KEYS) out[key] = baseToSettingValue(base[key]);
  return out;
}

/** Base for a record created from the current view: the selected base, or none (DB default, Base 1) on "All bases". */
export const newRecordBaseId = (selected: SelectedBase): string | undefined => (selected === ALL_BASES ? undefined : String(selected));
