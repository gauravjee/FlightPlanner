// app/dashboard/admin/setup/HolidaysTab.tsx
// Super Admin: Manage the FTO Holiday Calendar.
//
// Holidays are FTO-wide blackout dates — flight bookings and ground-school
// classes cannot be scheduled on them (see findHolidayForDate/
// getSchedulingBlockReason in lib/store.ts, enforced in BookingForm,
// ScheduleBoard, and GroundSchoolCalendar). Each holiday is either a
// one-time date, or a recurring annual holiday (e.g. a national holiday)
// that's matched by month/day every future year without needing to be
// re-added.
//
// Adding a holiday that lands on a date with flights/ground-school classes
// already scheduled does NOT touch those bookings — it flags the count for
// the admin to review manually (see addHoliday/addHolidaysBulk in the store).

'use client';

import { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { useFlightStore } from '@/lib/store';
import { CalendarDays, Plus, Trash2, Upload, Download, LoaderCircle, RefreshCw } from 'lucide-react';

interface CsvImportResult {
  added: number;
  skipped: { row: number; name: string; reason: string }[];
  conflictingFlights: number;
  conflictingClasses: number;
}

export default function HolidaysTab() {
  const holidays = useFlightStore(s => s.holidays);
  const loadingHolidays = useFlightStore(s => s.loadingHolidays);
  const loadHolidays = useFlightStore(s => s.loadHolidays);
  const addHoliday = useFlightStore(s => s.addHoliday);
  const addHolidaysBulk = useFlightStore(s => s.addHolidaysBulk);
  const removeHoliday = useFlightStore(s => s.removeHoliday);

  const [form, setForm] = useState({
    holidayName: '',
    date: '',
    isRecurring: false,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadHolidays();
  }, [loadHolidays]);

  const handleSave = async () => {
    if (!form.holidayName || !form.date) return;
    setSaving(true);
    setSaveMessage('');
    const result = await addHoliday(form);
    setSaveMessage(result.message);
    if (result.success) {
      setForm({ holidayName: '', date: '', isRecurring: false, notes: '' });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this holiday? Scheduling will re-open for this date.')) {
      await removeHoliday(id);
    }
  };

  const downloadTemplate = () => {
    const csv = 'holiday_name,date,is_recurring,notes\nRepublic Day,2027-01-26,true,National holiday\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'holidays_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // "Append + skip duplicates" — a CSV row is a duplicate if a holiday
  // already exists (in the DB, or earlier in this same batch) with the same
  // date + recurring combination; the store's addHolidaysBulk enforces this.
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvUploading(true);
    setCsvResult(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as Record<string, string>[];
        const toAdd: { holidayName: string; date: string; isRecurring: boolean; notes: string }[] = [];
        const invalid: CsvImportResult['skipped'] = [];

        rows.forEach((row, idx) => {
          const rowNum = idx + 2;
          const holidayName = (row.holiday_name || '').trim();
          const date = (row.date || '').trim();
          if (!holidayName || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            invalid.push({ row: rowNum, name: holidayName || '(blank)', reason: 'Missing holiday_name or date is not in YYYY-MM-DD format' });
            return;
          }
          toAdd.push({
            holidayName,
            date,
            isRecurring: /^(true|1|yes)$/i.test((row.is_recurring || '').trim()),
            notes: (row.notes || '').trim(),
          });
        });

        const bulkResult = await addHolidaysBulk(toAdd);
        setCsvResult({
          added: bulkResult.added,
          skipped: [
            ...invalid,
            ...bulkResult.skippedNames.map(name => ({ row: -1, name, reason: 'Duplicate date — already on the calendar' })),
          ],
          conflictingFlights: bulkResult.conflictingFlights,
          conflictingClasses: bulkResult.conflictingClasses,
        });
        setCsvUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (err) => {
        console.error('Error parsing CSV:', err);
        setCsvResult({ added: 0, skipped: [{ row: 0, name: '', reason: 'Failed to parse CSV file: ' + err.message }], conflictingFlights: 0, conflictingClasses: 0 });
        setCsvUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
    });
  };

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]";

  // Sorted for display: soonest upcoming month/day first is overkill here —
  // simple chronological by stored date is clear enough and matches the
  // store's own loadHolidays ordering.
  const sortedHolidays = [...holidays].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="surface-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-secondary" /> Holiday Calendar
      </h2>
      <p className="text-sm text-secondary mb-4">
        Dates the FTO is closed — flight bookings and ground-school classes cannot be scheduled on these days.
        Mark national/annual holidays as &quot;Recurring&quot; so they automatically block that date every future
        year; leave one-off holidays unmarked and add them per-year as needed.
      </p>

      {/* Add Form */}
      <div className="surface-inner p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Holiday
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs text-tertiary mb-1">Holiday Name *</label>
            <input
              type="text"
              placeholder="e.g., Republic Day"
              value={form.holidayName}
              onChange={e => setForm(p => ({ ...p, holidayName: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-tertiary mb-1">Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-secondary">
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={e => setForm(p => ({ ...p, isRecurring: e.target.checked }))}
                className="w-4 h-4"
              />
              Recurring every year (e.g. national holiday)
            </label>
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-xs text-tertiary mb-1">Notes</label>
          <input
            type="text"
            placeholder="Optional notes"
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            className={inputClass}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !form.holidayName || !form.date}
          className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-semibold disabled:opacity-50"
          style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
        >
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add Holiday
        </button>

        {saveMessage && <p className="text-xs mt-2 text-secondary">{saveMessage}</p>}
      </div>

      {/* Bulk Import (CSV) */}
      <div className="surface-inner p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          <Upload className="w-3.5 h-3.5" /> Bulk Import (CSV)
        </h3>
        <p className="text-xs text-tertiary mb-3">
          Upload a CSV with columns <code>holiday_name, date (YYYY-MM-DD), is_recurring, notes</code>.
          Rows with a date that&apos;s already on the calendar are skipped and reported below.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <label
            className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-semibold cursor-pointer surface-muted"
            style={{ color: 'var(--text-primary)' }}
          >
            {csvUploading ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {csvUploading ? 'Importing...' : 'Upload CSV'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              disabled={csvUploading}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={downloadTemplate}
            className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5 surface-inner"
          >
            <Download className="w-3.5 h-3.5" /> Download Template
          </button>
        </div>

        {csvResult && (
          <div className="mt-3 text-sm">
            <p style={{ color: 'var(--accent)' }}>
              ✅ Added {csvResult.added} holiday{csvResult.added === 1 ? '' : 's'}.
              {csvResult.skipped.length > 0 && ` Skipped ${csvResult.skipped.length}.`}
            </p>
            {(csvResult.conflictingFlights > 0 || csvResult.conflictingClasses > 0) && (
              <p className="mt-1" style={{ color: 'var(--warning-text)' }}>
                ⚠️ {csvResult.conflictingFlights} flight(s) and {csvResult.conflictingClasses} ground-school
                class(es) were already scheduled on the added dates — please review manually, nothing was changed.
              </p>
            )}
            {csvResult.skipped.length > 0 && (
              <ul className="mt-2 text-xs text-tertiary space-y-0.5 max-h-40 overflow-y-auto">
                {csvResult.skipped.map((s, i) => (
                  <li key={i}>{s.row > 0 ? `Row ${s.row}` : ''} {s.name}: {s.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Holidays List */}
      {loadingHolidays ? (
        <p className="text-secondary text-center py-4">Loading...</p>
      ) : sortedHolidays.length === 0 ? (
        <p className="text-secondary text-center py-4">No holidays defined yet. Add your first one above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="pb-3">Date</th>
                <th className="pb-3">Holiday</th>
                <th className="pb-3">Recurs</th>
                <th className="pb-3">Notes</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {sortedHolidays.map(h => (
                <tr key={h.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                  <td className="py-3" style={{ color: 'var(--text-primary)' }}>{h.date}</td>
                  <td className="py-3" style={{ color: 'var(--text-primary)' }}>{h.holidayName}</td>
                  <td className="py-3">
                    <span className={`badge ${h.isRecurring ? 'badge-success' : ''}`}>
                      {h.isRecurring ? 'Every year' : 'One-time'}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-tertiary max-w-[300px] truncate">{h.notes || '—'}</td>
                  <td className="py-3">
                    <button onClick={() => handleDelete(h.id)} style={{ color: 'var(--danger)' }} aria-label={`Delete ${h.holidayName}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-xs text-tertiary">
        Showing {sortedHolidays.length} holiday{sortedHolidays.length === 1 ? '' : 's'}
      </div>
    </div>
  );
}
