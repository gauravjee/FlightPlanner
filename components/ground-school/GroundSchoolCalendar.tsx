// components/ground-school/GroundSchoolCalendar.tsx
// ---------------------------------------------------------------------------
// Ground School Calendar – Weekly & Monthly views (like Outlook)
// ---------------------------------------------------------------------------
// Purpose:
//   - Display ground school theory classes in either a weekly time‑grid or
//     a traditional monthly calendar.
//   - Allow instructors / admins to create, edit and delete classes directly
//     from the calendar (click to add, click event to edit).
//   - Show different colours for different subjects.
//   - Automatically pre‑fill start time when clicking on the weekly grid.
//   - Validate that the end time is after the start time.
//
// Data sources:
//   - `ground_school_subjects` table (loaded once on mount)
//   - `ground_school_classes` table (loaded for the visible date range)
//   - `instructors` from the global Zustand store
//
// Notes for developers:
//   - The component manages its own `subjects` and `classes` state.
//   - Instructors are read from `useFlightStore`; if they haven't been loaded
//     yet, `loadInstructors()` is called automatically.
//   - All date calculations are done without external libraries to keep the
//     bundle small.
//   - The weekly grid uses absolute positioning for event blocks.
//
// 🔧 Flickering Fix (2026-08-10):
//   - Added `useRef` guards (subjectsLoaded, instructorsChecked, initialLoadDone)
//     to prevent `loadData` from re‑running in a loop when `subjects` or
//     `instructors` state changes during initialisation.
//   - The `loadData` callback still depends on `subjects` and `instructors` for
//     enrichment, but the `useEffect` that calls it now waits until both are ready.
//
// 🔧 Grid alignment fix (2026-08-14):
//   - The weekly view's day-name header row and the scrollable hour grid used
//     to be two separate flex containers stacked on top of each other. Once the
//     grid's content was tall enough to need a vertical scrollbar, the
//     scrollbar's width ate into the grid's available width but NOT the
//     header's (which never scrolled), so the day columns silently drifted out
//     of alignment with the header above them by however wide the scrollbar was.
//   - Fixed by merging the header and the hour grid into a single scrollable
//     container, with the header row set to `position: sticky; top: 0` instead
//     of living outside the scroll area. Both rows now share the same box, so
//     they always compute identical column widths — no more drift, and the
//     header still stays pinned while the grid scrolls.
// ---------------------------------------------------------------------------

'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useFlightStore, getSchedulingBlockReason, parseWeeklyOffDays } from '@/lib/store';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Save, CircleCheck, X } from 'lucide-react';
import { useEscapeToClose } from '@/lib/useEscapeToClose';

// ============================================================
// Type definitions
// ============================================================
interface Subject {
  id: number;
  subject_name: string;
  subject_code: string;
}

interface GroundClass {
  id: number;
  subject_id: number;
  instructor_id: string;
  class_date: string;       // 'YYYY-MM-DD' (stored in UTC, displayed as local)
  start_time: string;       // 'HH:MM' (24h)
  end_time: string;
  topic: string;
  notes: string;
  status: string;
  subject_name?: string;    // enriched client‑side
  instructor_initials?: string;
}

// ============================================================
// Colour palette – one colour per subject (cycles if > 8 subjects)
// These are deliberately solid, saturated colour chips (with white text)
// rather than design-token colours: they're categorical event tags, not
// surface/text chrome, so they stay legible over both the dark and light
// themes without needing a per-theme variant.
// ============================================================
const SUBJECT_COLORS = [
  'bg-sky-700/80 border-sky-400',          // soft blue
  'bg-emerald-700/80 border-emerald-500', // deep green
  'bg-cyan-700/80 border-cyan-500',       // teal‑cyan
  'bg-amber-700/80 border-amber-500',     // warm gold
  'bg-indigo-700/80 border-indigo-400',   // soft indigo
  'bg-rose-700/80 border-rose-400',       // muted rose (replaces bright pink)
  'bg-violet-700/80 border-violet-400',   // subdued violet
  'bg-teal-700/80 border-teal-400',        // dark teal
];

// ============================================================
// Date helpers (all pure functions, no external libs)
// ============================================================

/**
 * Returns the Monday of the week that contains the given date.
 * (Monday is considered the first day of the week)
 */
const getMonday = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();                 // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // shift to Monday
  return new Date(d.setDate(diff));
};

/**
 * Adds a number of days to a Date and returns a new Date.
 */
const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/**
 * Converts a Date to a 'YYYY-MM-DD' string (used for Supabase queries and comparisons).
 */
const formatDateStr = (date: Date): string => date.toISOString().split('T')[0];

/**
 * Checks if two Dates fall on the same calendar day.
 */
const sameDay = (d1: Date, d2: Date): boolean =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

/**
 * Returns the first day of the month for a given date.
 */
const startOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1);

/**
 * Returns the last day of the month for a given date.
 */
const endOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0);

// ============================================================
// Component
// ============================================================
export default function GroundSchoolCalendar() {
  // ----- Global store access -----
  // We read instructors from the central store so the list is always up‑to‑date.
  const instructors = useFlightStore((s) => s.instructors);
  const loadInstructors = useFlightStore((s) => s.loadInstructors);

  // FTO-wide blackout dates — flight bookings and ground-school classes
  // cannot be scheduled on a holiday or the FTO's weekly off day.
  const holidays = useFlightStore((s) => s.holidays);
  const loadHolidays = useFlightStore((s) => s.loadHolidays);
  const ftoSettings = useFlightStore((s) => s.ftoSettings);
  const weeklyOffDays = parseWeeklyOffDays(ftoSettings['weekly_off_days']);

  // ----- Local state -----

  // List of active ground school subjects (fetched once on mount)
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // The classes currently displayed (filtered by date range and optional subject/instructor)
  const [classes, setClasses] = useState<GroundClass[]>([]);

  // Loading flag
  const [loading, setLoading] = useState(true);
  const [initialRender, setInitialRender] = useState(true); // Track first render

  // View mode: 'week' or 'month'
  const [view, setView] = useState<'week' | 'month'>('week');

  // Reference date for navigation
  const today = new Date();

  // In week view: the Monday of the displayed week
  const [currentWeekStart, setCurrentWeekStart] = useState(getMonday(today));

  // In month view: the first day of the displayed month
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(today));

  // Filter values
  const [filterSubject, setFilterSubject] = useState('');
  const [filterInstructor, setFilterInstructor] = useState('');

  // Toast message (success feedback)
  const [toastMessage, setToastMessage] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);

  // 2026-08-21 (accessibility round) — see lib/useEscapeToClose.ts.
  useEscapeToClose(() => {
    if (showModal) setShowModal(false);
  });

  // When editing an existing class, this stores that class data.
  const [editingClass, setEditingClass] = useState<GroundClass | null>(null);

  // Form data (used for both creating and editing)
  const [form, setForm] = useState({
    subject_id: 0,
    instructor_id: '',
    class_date: '',
    start_time: '09:00',
    end_time: '10:30',
    topic: '',
    notes: '',
    status: 'SCHEDULED',
  });

  // ============================================================
  // 🔧 FLICKERING FIX — Refs to prevent re‑fetch loops
  // ============================================================
  // These refs track whether data has already been loaded, so the
  // useEffect hooks don't trigger `loadData` multiple times during
  // the initial mount cycle.
  const subjectsLoaded = useRef(false);
  const instructorsChecked = useRef(false);
  const initialLoadDone = useRef(false);

  // ============================================================
  // Effects – load initial data
  // ============================================================

  // 1. Ensure instructors are loaded (if the store is empty, e.g., page reload)
  useEffect(() => {
    if (instructorsChecked.current) return; // Already checked — skip
    if (instructors.length === 0) {
      loadInstructors();
    }
    instructorsChecked.current = true;
  }, [instructors.length, loadInstructors]);

  // 1b. Ensure the holiday calendar is loaded (same "if empty" guard as
  // instructors above — holidays rarely change, and re-running loadHolidays
  // whenever the store re-renders would be wasteful).
  useEffect(() => {
    if (holidays.length === 0) loadHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Load subjects once on mount (they rarely change)
  useEffect(() => {
    if (subjectsLoaded.current) return; // Already loaded — skip

    const loadSubjects = async () => {
      const { data } = await supabase
        .from('ground_school_subjects')
        .select('id, subject_name, subject_code')
        .eq('is_active', true)
        .order('sort_order');
      if (data) {
        setSubjects(data);
        subjectsLoaded.current = true;
      }
    };
    loadSubjects();
  }, []);

  // ============================================================
  // Main data loader (classes for the current view range)
  // ============================================================
  const loadData = useCallback(async () => {
    // 🔧 FLICKERING FIX: Don't fetch if subjects aren't loaded yet.
    // This prevents a re‑fetch when `subjects` state updates from the
    // useEffect above.
    if (subjects.length === 0) return;

    setLoading(true);

    // Determine date range depending on the active view
    let startDate: string, endDate: string;
    if (view === 'week') {
      const weekEnd = addDays(currentWeekStart, 6);
      startDate = formatDateStr(currentWeekStart);
      endDate = formatDateStr(weekEnd);
    } else {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      startDate = formatDateStr(monthStart);
      endDate = formatDateStr(monthEnd);
    }

    // Build Supabase query for classes in the date range
    let query = supabase
      .from('ground_school_classes')
      .select('*')
      .gte('class_date', startDate)
      .lte('class_date', endDate)
      .order('class_date', { ascending: true })
      .order('start_time', { ascending: true });

    // Apply filters if any
    if (filterSubject) query = query.eq('subject_id', parseInt(filterSubject));
    if (filterInstructor) query = query.eq('instructor_id', filterInstructor);

    const { data: classData, error } = await query;
    if (error) {
      console.error('Error loading classes:', error);
      setClasses([]);
      setLoading(false);
      return;
    }

    // Enrich each class with human‑readable subject name and instructor initials.
    const enriched: GroundClass[] = (classData || []).map((c: any) => {
      const sub = subjects.find((s) => s.id === c.subject_id);
      const inst = instructors.find((i) => i.id === c.instructor_id);
      return {
        ...c,
        subject_name: sub ? sub.subject_name : 'Unknown Subject',
        instructor_initials: inst ? inst.initials : '—',
      };
    });

    setClasses(enriched);
    setInitialRender(false); // ← Marks that data has loaded at least once
    setLoading(false);
  }, [currentWeekStart, currentMonth, view, filterSubject, filterInstructor, subjects, instructors]);

  // Reload classes whenever the dependencies change
  useEffect(() => {
    // 🔧 FLICKERING FIX: Only call loadData once both subjects and
    // instructors are available. This prevents the function from
    // running on every state update during mount.
    if (subjects.length === 0 && !initialLoadDone.current) return;

    loadData();
    initialLoadDone.current = true;
  }, [loadData, subjects.length]);

  // ============================================================
  // Navigation handlers
  // ============================================================

  // Week navigation
  const goPrevWeek = () => setCurrentWeekStart(addDays(currentWeekStart, -7));
  const goNextWeek = () => setCurrentWeekStart(addDays(currentWeekStart, 7));

  // Month navigation
  const goPrevMonth = () =>
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const goNextMonth = () =>
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  // Jump to today (resets both week and month to the current period)
  const goToday = () => {
    setCurrentWeekStart(getMonday(today));
    setCurrentMonth(startOfMonth(today));
  };

  // ============================================================
  // Helper: get colour class for a subject
  // ============================================================
  const getSubjectColor = (subjectId: number): string => {
    const idx = subjects.findIndex((s) => s.id === subjectId);
    return idx >= 0 ? SUBJECT_COLORS[idx % SUBJECT_COLORS.length] : SUBJECT_COLORS[0];
  };

  // ============================================================
  // Helper: calculate default end time (start + 1.5 hours)
  // ============================================================
  const addTimeSpan = (time: string): string => {
    const [h, m] = time.split(':').map(Number);
    let endHour = h + 1;
    let endMin = m + 30;
    if (endMin >= 60) {
      endHour++;
      endMin -= 60;
    }
    // Clamp to 8 PM (20:00) so it stays within the displayed grid
    if (endHour > 20) {
      endHour = 20;
      endMin = 0;
    }
    return `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
  };

  // ============================================================
  // Weekly grid: convert a click position to a start time
  // ============================================================
  /**
   * Calculates the time corresponding to a click on the weekly time grid.
   * It uses the Y coordinate relative to the day column, snaps to the
   * nearest 15‑minute interval, and rounds to the displayed hours (08:00‑20:00).
   */
  const getTimeFromClick = (e: React.MouseEvent<HTMLDivElement>): string => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;               // pixels from top of the column
    const rowHeight = 64;                          // h-16 = 4rem = 64px (our hour rows)
    const hourFloat = y / rowHeight + 8;           // start hour is 08:00
    const hour = Math.floor(hourFloat);
    const minutesDecimal = (hourFloat - hour) * 60;
    const minutes = Math.round(minutesDecimal / 15) * 15; // snap to 0, 15, 30, 45
    let snappedHour = hour + Math.floor(minutes / 60);
    const finalMinutes = minutes % 60;
    if (snappedHour > 20) snappedHour = 20;       // max displayed hour
    return `${String(snappedHour).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}`;
  };

  // ============================================================
  // Modal open helpers
  // ============================================================

  /**
   * Opens the modal for creating a new class.
   * @param date  'YYYY-MM-DD'
   * @param startTime  'HH:MM' (defaults to '09:00')
   */
  const openNewClass = (date: string, startTime = '09:00') => {
    // Single insertion point for both the weekly-grid day-column click and
    // the monthly-view day-cell click — reject before the modal even opens
    // if the FTO is closed (holiday or weekly off day) on this date.
    const blockReason = getSchedulingBlockReason(date, holidays, weeklyOffDays);
    if (blockReason) {
      alert(`FTO is closed on this date (${blockReason.label}) — ground school classes cannot be scheduled.`);
      return;
    }
    setEditingClass(null);  // we are creating, not editing
    setForm({
      subject_id: subjects[0]?.id || 0,
      instructor_id: '',
      class_date: date,
      start_time: startTime,
      end_time: addTimeSpan(startTime),   // auto‑calculated end time
      topic: '',
      notes: '',
      status: 'SCHEDULED',
    });
    setShowModal(true);
  };

  /**
   * Opens the modal for editing an existing class.
   */
  const openEditClass = (cls: GroundClass) => {
    setEditingClass(cls);
    setForm({
      subject_id: cls.subject_id,
      instructor_id: cls.instructor_id,
      class_date: cls.class_date,
      start_time: cls.start_time,
      end_time: cls.end_time,
      topic: cls.topic,
      notes: cls.notes,
      status: cls.status,
    });
    setShowModal(true);
  };

  // ============================================================
  // Save handler (create or update)
  // ============================================================
  const handleSave = async () => {
    // Basic validation
    if (!form.subject_id || !form.instructor_id || !form.class_date) {
      alert('Please fill Subject, Instructor, and Date.');
      return;
    }
    // End time must be after start time
    if (form.end_time <= form.start_time) {
      alert('End time must be after start time.');
      return;
    }
    // Defense-in-depth: openNewClass already blocks the initial date choice,
    // but the modal's own Date field (used for both new classes and when
    // editing an existing one) can still be changed to a closed date before
    // Save is clicked.
    const blockReason = getSchedulingBlockReason(form.class_date, holidays, weeklyOffDays);
    if (blockReason) {
      alert(`FTO is closed on ${form.class_date} (${blockReason.label}) — ground school classes cannot be scheduled on this date.`);
      return;
    }

    const payload = { ...form };
    let error;
    if (editingClass) {
      // Update existing record
      ({ error } = await supabase
        .from('ground_school_classes')
        .update(payload)
        .eq('id', editingClass.id));
    } else {
      // Insert new record
      ({ error } = await supabase
        .from('ground_school_classes')
        .insert([payload]));
    }

    if (error) {
      alert('Error: ' + error.message);
    } else {
      // Success: close modal, show toast, reset filters so new class is visible
      setShowModal(false);
      setToastMessage(editingClass ? 'Class updated!' : 'Class created!');
      setTimeout(() => setToastMessage(''), 3000);
      setFilterSubject('');
      setFilterInstructor('');
      loadData(); // refresh the calendar
    }
  };

  // ============================================================
  // Delete handler
  // ============================================================
  const handleDelete = async () => {
    if (!editingClass) return;
    if (!confirm('Delete this class and all enrollments?')) return;
    // Delete enrollments first (foreign key)
    await supabase.from('ground_school_enrollment').delete().eq('class_id', editingClass.id);
    const { error } = await supabase
      .from('ground_school_classes')
      .delete()
      .eq('id', editingClass.id);
    if (error) {
      alert('Error: ' + error.message);
    } else {
      setShowModal(false);
      loadData();
    }
  };

  // ============================================================
  // Derived data: week days array
  // ============================================================
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(currentWeekStart, i);
      days.push({
        dateStr: formatDateStr(day),
        dayName: day.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: day.getDate(),
        isToday: sameDay(day, today),
      });
    }
    return days;
  }, [currentWeekStart]);

  // ----- Weekly time grid constants -----
  const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 08:00 - 18:00
  const totalHours = 11;

  /**
   * Computes absolute positioning style for an event block in the weekly view.
   * Returns an object with `top` and `height` percentages.
   * If the event duration is zero or negative, returns `{ display: 'none' }`.
   */
  const getWeeklyEventStyle = (cls: GroundClass) => {
    const [sh, sm] = cls.start_time.split(':').map(Number);
    const [eh, em] = cls.end_time.split(':').map(Number);
    const startHour = sh + sm / 60;
    const endHour = eh + em / 60;
    const duration = endHour - startHour;
    if (duration <= 0) return { display: 'none' };
    const top = ((startHour - HOURS[0]) / totalHours) * 100;
    const height = (duration / totalHours) * 100;
    return {
      top: `${Math.max(0, top)}%`,
      height: `${Math.max(0, height)}%`,
      left: '4px',
      right: '4px',
    };
  };

  // ============================================================
  // Derived data: month view weeks
  // ============================================================
  const monthDays = useMemo(() => {
    const firstDay = startOfMonth(currentMonth);
    const lastDay = endOfMonth(currentMonth);
    // Start from the Sunday before the first day
    const start = new Date(firstDay);
    start.setDate(start.getDate() - start.getDay());
    // End on the Saturday after the last day
    const end = new Date(lastDay);
    end.setDate(end.getDate() + (6 - end.getDay()));

    const weeks: {
      dateStr: string;
      day: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }[][] = [];

    const current = new Date(start);
    while (current <= end) {
      const week: any[] = [];
      for (let i = 0; i < 7; i++) {
        week.push({
          dateStr: formatDateStr(current),
          day: current.getDate(),
          isCurrentMonth: current.getMonth() === currentMonth.getMonth(),
          isToday: sameDay(current, today),
        });
        current.setDate(current.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  }, [currentMonth]);

  // Group classes by date for quick lookup in the monthly view
  const classesByDate = useMemo(() => {
    const map: Record<string, GroundClass[]> = {};
    classes.forEach((c) => {
      if (!map[c.class_date]) map[c.class_date] = [];
      map[c.class_date].push(c);
    });
    return map;
  }, [classes]);

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="flex flex-col h-full">
      {/* ----- Header with navigation & filters ----- */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        {/* Navigation buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={view === 'week' ? goPrevWeek : goPrevMonth}
            className="p-1.5 rounded transition hover:opacity-80 surface-inner"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1 rounded text-sm transition font-semibold"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
          >
            Today
          </button>
          <button
            onClick={view === 'week' ? goNextWeek : goNextMonth}
            className="p-1.5 rounded transition hover:opacity-80 surface-inner"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-semibold ml-2">
            {view === 'week'
              ? `${currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${addDays(currentWeekStart, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
        </div>

        {/* View toggle (Week / Month) */}
        <div className="flex items-center space-x-2 rounded-lg p-1" style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <button
            onClick={() => setView('week')}
            className="px-3 py-1 rounded text-sm transition"
            style={view === 'week'
              ? { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }
              : { color: 'var(--text-secondary)' }}
          >
            Week
          </button>
          <button
            onClick={() => setView('month')}
            className="px-3 py-1 rounded text-sm transition"
            style={view === 'month'
              ? { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }
              : { color: 'var(--text-secondary)' }}
          >
            Month
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-2">
          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="surface-inner rounded px-3 py-1 text-sm focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.subject_name}
              </option>
            ))}
          </select>
          <select
            value={filterInstructor}
            onChange={(e) => setFilterInstructor(e.target.value)}
            className="surface-inner rounded px-3 py-1 text-sm focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="">All Instructors</option>
            {instructors.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.initials} - {inst.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setFilterSubject('');
              setFilterInstructor('');
            }}
            className="px-2 py-1 rounded text-xs transition hover:opacity-80 surface-inner text-secondary"
          >
            Clear
          </button>
        </div>
      </div>

            {/* Subtle loading indicator — only shown on first load */}
      {loading && initialRender && (
        <div className="text-center py-2">
          <span className="text-xs text-tertiary animate-pulse">Loading classes...</span>
        </div>
      )}


        <>
          {/* ===== WEEKLY VIEW ===== */}
          {view === 'week' && (
            <div className="flex-1 surface-card overflow-hidden">
              {/* Header row and hour grid share one scroll container so their
                  column widths always match — see the grid-alignment-fix note
                  at the top of this file for why. */}
              <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
                {/* Day name headers (Mon‑Sun) — sticky so it stays pinned while
                    the grid below scrolls, without living in a separate box. */}
                <div className="flex border-b sticky top-0 z-10" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
                  {/* Time gutter – empty column for hour labels */}
                  <div className="w-20 flex-shrink-0" />
                  {weekDays.map((day) => (
                    <div
                      key={day.dateStr}
                      className="flex-1 text-center py-2 border-l"
                      style={{ borderColor: 'var(--border)', backgroundColor: day.isToday ? 'var(--accent-soft)' : undefined }}
                    >
                      <div className="text-xs text-tertiary">{day.dayName}</div>
                      <div
                        className="text-sm font-semibold"
                        style={{ color: day.isToday ? 'var(--accent)' : 'var(--text-primary)' }}
                      >
                        {day.dayNum}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Time grid (rows = hours, columns = days) */}
                <div className="flex">
                  {/* Hour labels on the left */}
                  <div className="w-20 flex-shrink-0">
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="h-16 border-b text-xs text-tertiary px-1"
                        style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}
                      >
                        {hour.toString().padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>

                  {/* One column per day */}
                  {weekDays.map((day) => {
                    const dayClasses = classes.filter(
                      (c) => c.class_date === day.dateStr
                    );
                    return (
                      <div
                        key={day.dateStr}
                        className="flex-1 relative border-l"
                        style={{ borderColor: 'var(--border)' }}
                        onClick={(e) => {
                          // Only open new class if we didn't click on an event block
                          const target = e.target as HTMLElement;
                          if (target.classList.contains('event-block')) return;
                          const time = getTimeFromClick(e);
                          openNewClass(day.dateStr, time);
                        }}
                      >
                        {/* Hour lines (visual only) */}
                        {HOURS.map((hour) => (
                          <div
                            key={hour}
                            className="h-16 border-b"
                            style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}
                          />
                        ))}

                        {/* Event blocks */}
                        {dayClasses.map((cls) => {
                          const style = getWeeklyEventStyle(cls);
                          const colorClasses = getSubjectColor(cls.subject_id);
                          return (
                            <div
                              key={cls.id}
                              className={`event-block absolute ${colorClasses} rounded px-2 py-1 text-white text-xs overflow-hidden cursor-pointer hover:z-10 hover:ring-2 hover:ring-white/50`}
                              style={style}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditClass(cls);
                              }}
                            >
                              <div className="font-semibold truncate">
                                {cls.subject_name}
                              </div>
                              <div className="truncate opacity-80">
                                {cls.instructor_initials} ·{' '}
                                {cls.topic || cls.start_time?.slice(0, 5)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ===== MONTHLY VIEW ===== */}
          {view === 'month' && (
            <div className="flex-1 surface-card overflow-hidden">
              {/* Day of week headers */}
              <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--border)' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div
                    key={d}
                    className="py-2 text-center text-xs text-tertiary font-medium"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Weeks */}
              {monthDays.map((week, wi) => (
                <div
                  key={wi}
                  className="grid grid-cols-7 border-b"
                  style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}
                >
                  {week.map((day) => {
                    const dayClasses = classesByDate[day.dateStr] || [];
                    const isToday = day.isToday;
                    return (
                      <div
                        key={day.dateStr}
                        className={`min-h-[80px] p-1 border-r cursor-pointer transition hover:opacity-80 ${
                          !day.isCurrentMonth ? 'opacity-40' : ''
                        }`}
                        style={{
                          borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)',
                          backgroundColor: isToday ? 'var(--accent-soft)' : undefined,
                        }}
                        onClick={() => openNewClass(day.dateStr)}
                      >
                        <div
                          className="text-xs font-semibold mb-1"
                          style={{ color: isToday ? 'var(--accent)' : 'var(--text-primary)' }}
                        >
                          {day.day}
                        </div>
                        {dayClasses.map((cls) => (
                          <div
                            key={cls.id}
                            className={`text-[10px] ${getSubjectColor(
                              cls.subject_id
                            )} text-white rounded px-1 mb-0.5 truncate cursor-pointer hover:ring-1 hover:ring-white/50`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditClass(cls);
                            }}
                          >
                            {cls.start_time?.slice(0, 5)}{' '}
                            {cls.subject_name?.substring(0, 12)}{' '}
                            {cls.instructor_initials}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </>


      {/* ----- Toast message (shown after create/update) ----- */}
      {toastMessage && (
        <div
          className="fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 animate-bounce flex items-center gap-2"
          style={{ backgroundColor: 'var(--success)', color: '#ffffff' }}
        >
          <CircleCheck className="w-4 h-4" />
          {toastMessage}
          <button
            onClick={() => setToastMessage('')}
            className="ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ----- Modal (Add / Edit class) ----- */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="surface-card p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              {editingClass ? <><Pencil className="w-4 h-4" /> Edit Class</> : <><Plus className="w-4 h-4" /> New Ground Class</>}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {/* Subject */}
              <div>
                <label className="text-xs text-tertiary">Subject *</label>
                <select
                  value={form.subject_id}
                  onChange={(e) =>
                    setForm({ ...form, subject_id: parseInt(e.target.value) })
                  }
                  className="w-full surface-inner rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Select...</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.subject_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Instructor */}
              <div>
                <label className="text-xs text-tertiary">Instructor *</label>
                <select
                  value={form.instructor_id}
                  onChange={(e) =>
                    setForm({ ...form, instructor_id: e.target.value })
                  }
                  className="w-full surface-inner rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Select...</option>
                  {instructors.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.initials} - {inst.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="text-xs text-tertiary">Date *</label>
                <input
                  type="date"
                  value={form.class_date}
                  onChange={(e) =>
                    setForm({ ...form, class_date: e.target.value })
                  }
                  className="w-full surface-inner rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              {/* Start Time */}
              <div>
                <label className="text-xs text-tertiary">Start Time</label>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={(e) =>
                    setForm({ ...form, start_time: e.target.value })
                  }
                  className="w-full surface-inner rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              {/* End Time */}
              <div>
                <label className="text-xs text-tertiary">End Time</label>
                <input
                  type="time"
                  value={form.end_time}
                  onChange={(e) =>
                    setForm({ ...form, end_time: e.target.value })
                  }
                  className="w-full surface-inner rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              {/* Topic */}
              <div>
                <label className="text-xs text-tertiary">Topic</label>
                <input
                  type="text"
                  value={form.topic}
                  onChange={(e) =>
                    setForm({ ...form, topic: e.target.value })
                  }
                  className="w-full surface-inner rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-[var(--accent)]"
                  placeholder="e.g., Chapter 5"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-4 flex justify-end space-x-2">
              {editingClass && (
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 rounded text-sm transition flex items-center gap-1.5"
                  style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )}
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded text-sm transition surface-inner"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded text-sm transition flex items-center gap-1.5 font-semibold"
                style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
              >
                <Save className="w-3.5 h-3.5" /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
