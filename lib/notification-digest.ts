// lib/notification-digest.ts
// Pure helpers for the twice-daily digest emails sent by
// app/api/cron/check-notifications (operator decision, 28 Sep 2026):
//   1. Maintenance digest: one email to admin, super admin and maintenance
//      users. Sections: Overdue (red), Due in 7 days (amber), Open defects and
//      records (red), Upcoming 8–30 days (green), Closed in the last 15 days
//      (green). Every open task is listed in exactly one section.
//   2. People digest: one email to admin and super admin, listing student
//      medical / SPL and instructor CPL items that are expired (red) or expire
//      within 30 days (amber). Each person also gets their own email.
// No DB or network here, so lib/notification-digest.test.ts can run it.

export type Flag = 'red' | 'amber' | 'green';

export type MxRow = {
  id: number;
  aircraft_id: number;
  maintenance_type: string;
  description: string | null;
  scheduled_date: string;
  completed_date: string | null;
  status: string;
  is_squawk: boolean;
  ticket_number: string | null;
  ame_name: string | null;
};

export type Section<T> = { title: string; flag: Flag; rows: T[] };

// Whole days from a to b, both 'YYYY-MM-DD'.
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// open = SCHEDULED / IN_PROGRESS records; closed = COMPLETED in the last 15
// days (baseline rows already excluded by the caller).
export function classifyMaintenance(open: MxRow[], closed: MxRow[], today: string): Section<MxRow>[] {
  const overdue: MxRow[] = [], due7: MxRow[] = [], defects: MxRow[] = [], upcoming: MxRow[] = [];
  for (const r of open) {
    const days = daysBetween(today, r.scheduled_date);
    if (r.is_squawk) defects.push(r);
    else if (days < 0) overdue.push(r);
    else if (r.status === 'IN_PROGRESS') defects.push(r);
    else if (days <= 7) due7.push(r);
    else if (days <= 30) upcoming.push(r);
  }
  const byDate = (a: MxRow, b: MxRow) => a.scheduled_date.localeCompare(b.scheduled_date);
  return [
    { title: 'Overdue', flag: 'red', rows: overdue.sort(byDate) },
    { title: 'Due in the next 7 days', flag: 'amber', rows: due7.sort(byDate) },
    { title: 'Open defects and records', flag: 'red', rows: defects.sort(byDate) },
    { title: 'Upcoming (8–30 days)', flag: 'green', rows: upcoming.sort(byDate) },
    { title: 'Closed in the last 15 days', flag: 'green',
      rows: [...closed].sort((a, b) => (b.completed_date ?? '').localeCompare(a.completed_date ?? '')) },
  ];
}

export type ExpiryItem = {
  person: string;       // "Name (INI)"
  kind: 'Student' | 'Instructor' | 'Staff';
  document: string;     // "Medical", "SPL", "CPL"
  expiry: string;       // 'YYYY-MM-DD'
  days: number;         // negative = expired
  email: string | null; // the person's own address, if any
};

// null when the date is blank or more than 30 days away.
export function expiryItem(base: Omit<ExpiryItem, 'expiry' | 'days'>, expiry: string | null | undefined, today: string): ExpiryItem | null {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return null;
  const days = daysBetween(today, expiry);
  return days <= 30 ? { ...base, expiry, days } : null;
}

// Personal reminder schedule (operator, 4 Oct): 30 and 15 days before
// expiry, then every day from 7 days before until it is renewed — including
// every day after it has expired. A missed run must not lose a reminder
// (operator, 7 Oct), so this works from the most recent reminder day that
// has come round and the date this reminder was last sent (digest_sends):
// e.g. the 30-day reminder missed on day 30 goes out on day 29.
export function reminderDue(expiry: string, today: string, lastSent: string | undefined): boolean {
  const days = daysBetween(today, expiry);
  if (days > 30) return false;
  const milestone = days <= 7 ? today : addDays(expiry, days <= 15 ? -15 : -30);
  return !lastSent || lastSent < milestone;
}

export function splitExpiry(items: ExpiryItem[]): Section<ExpiryItem>[] {
  const sorted = [...items].sort((a, b) => a.days - b.days);
  return [
    { title: 'Expired', flag: 'red', rows: sorted.filter(i => i.days < 0) },
    { title: 'Expiring within 30 days', flag: 'amber', rows: sorted.filter(i => i.days >= 0) },
  ];
}

// ---- HTML -----------------------------------------------------------------

const COLORS: Record<Flag, { bar: string; bg: string; label: string }> = {
  red: { bar: '#dc2626', bg: '#fef2f2', label: 'RED' },
  amber: { bar: '#d97706', bg: '#fffbeb', label: 'AMBER' },
  green: { bar: '#16a34a', bg: '#f0fdf4', label: 'GREEN' },
};

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function table(headers: string[], rows: string[][]): string {
  const th = headers.map(h => `<th style="text-align:left;padding:6px 8px;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0">${esc(h)}</th>`).join('');
  const tr = rows.map(r => `<tr>${r.map(c => `<td style="padding:6px 8px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;vertical-align:top">${c}</td>`).join('')}</tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse">${th ? `<tr>${th}</tr>` : ''}${tr}</table>`;
}

function section(title: string, flag: Flag, count: number, body: string): string {
  const c = COLORS[flag];
  return `<div style="border-left:4px solid ${c.bar};background:${c.bg};border-radius:6px;padding:12px;margin:14px 0">` +
    `<h3 style="margin:0 0 8px;font-size:15px;color:${c.bar}">${c.label} · ${esc(title)} (${count})</h3>` +
    (count ? body : '<p style="margin:0;font-size:13px;color:#64748b">None.</p>') + '</div>';
}

export function wrapEmail(heading: string, intro: string, body: string, dashboardUrl: string): string {
  return '<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:20px">' +
    '<h1 style="color:#1e40af;margin:0;font-size:22px">✈️ FlightPro Manager</h1>' +
    `<h2 style="color:#1e293b;font-size:18px;margin:16px 0 4px">${esc(heading)}</h2>` +
    `<p style="color:#475569;font-size:13px;margin:0 0 8px">${esc(intro)}</p>` + body +
    `<p style="text-align:center;margin:24px 0"><a href="${esc(dashboardUrl)}" style="background:#2563eb;color:#fff;padding:10px 24px;text-decoration:none;border-radius:6px;font-weight:bold">Open FlightPro →</a></p>` +
    '<p style="color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0;padding-top:12px">Automated notification from FlightPro Manager. Please do not reply.</p></div>';
}

export function maintenanceHtml(sections: Section<MxRow>[], aircraftReg: (id: number) => string, today: string): string {
  return sections.map(s => {
    const closed = s.title.startsWith('Closed');
    const rows = s.rows.map(r => {
      const d = daysBetween(today, r.scheduled_date);
      const when = closed ? `Closed ${esc(r.completed_date)}`
        : d < 0 ? `${esc(r.scheduled_date)} (${-d} day${d === -1 ? '' : 's'} overdue)`
        : `${esc(r.scheduled_date)} (in ${d} day${d === 1 ? '' : 's'})`;
      const task = esc(r.maintenance_type) + (r.description ? `<br><span style="color:#64748b;font-size:12px">${esc(r.description)}</span>` : '');
      return [esc(aircraftReg(r.aircraft_id)), esc(r.ticket_number ?? '—'), task, when, r.ame_name ? esc(r.ame_name) : '<i style="color:#94a3b8">Unassigned</i>'];
    });
    return section(s.title, s.flag, s.rows.length, table(['Aircraft', 'Ticket', 'Task', closed ? 'Closed' : 'Due', 'AME'], rows));
  }).join('');
}

const whenText = (i: ExpiryItem) => i.days < 0 ? `Expired ${esc(i.expiry)} (${-i.days} day${i.days === -1 ? '' : 's'} ago)`
  : i.days === 0 ? `Expires today (${esc(i.expiry)})` : `Expires ${esc(i.expiry)} (in ${i.days} day${i.days === 1 ? '' : 's'})`;

export function expiryHtml(sections: Section<ExpiryItem>[], withPerson: boolean): string {
  return sections.map(s => section(s.title, s.flag, s.rows.length, table(
    withPerson ? ['Name', 'Type', 'Document', 'Status'] : ['Document', 'Status'],
    s.rows.map(i => withPerson ? [esc(i.person), i.kind, esc(i.document), whenText(i)] : [esc(i.document), whenText(i)]),
  ))).join('');
}
