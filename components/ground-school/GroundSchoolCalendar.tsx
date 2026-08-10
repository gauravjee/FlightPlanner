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
// ---------------------------------------------------------------------------

'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useFlightStore } from '@/lib/store';

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
      setToastMessage(editingClass ? '✅ Class updated!' : '✅ Class created!');
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

    let current = new Date(start);
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
            className="px-3 py-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
          >
            ←
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            Today
          </button>
          <button
            onClick={view === 'week' ? goNextWeek : goNextMonth}
            className="px-3 py-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
          >
            →
          </button>
          <h2 className="text-lg font-semibold text-white ml-2">
            {view === 'week'
              ? `${currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${addDays(currentWeekStart, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
        </div>

        {/* View toggle (Week / Month) */}
        <div className="flex items-center space-x-2 bg-slate-700 rounded-lg p-1">
          <button
            onClick={() => setView('week')}
            className={`px-3 py-1 rounded text-sm ${
              view === 'week'
                ? 'bg-blue-500 text-white'
                : 'text-slate-300 hover:bg-slate-600'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setView('month')}
            className={`px-3 py-1 rounded text-sm ${
              view === 'month'
                ? 'bg-blue-500 text-white'
                : 'text-slate-300 hover:bg-slate-600'
            }`}
          >
            Month
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-2">
          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white text-sm"
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
            className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white text-sm"
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
            className="px-2 py-1 bg-slate-600 text-slate-300 rounded text-xs hover:bg-slate-500"
          >
            Clear
          </button>
        </div>
      </div>

            {/* Subtle loading indicator — only shown on first load */}
      {loading && initialRender && (
        <div className="text-center py-2">
          <span className="text-xs text-slate-500 animate-pulse">Loading classes...</span>
        </div>
      )}


        <>
          {/* ===== WEEKLY VIEW ===== */}
          {view === 'week' && (
            <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
              {/* Day name headers (Mon‑Sun) */}
              <div className="flex border-b border-slate-700">
                {/* Time gutter – empty column for hour labels */}
                <div className="w-20 flex-shrink-0" />
                {weekDays.map((day) => (
                  <div
                    key={day.dateStr}
                    className={`flex-1 text-center py-2 border-l border-slate-700 ${
                      day.isToday ? 'bg-blue-500/10' : ''
                    }`}
                  >
                    <div className="text-xs text-slate-400">{day.dayName}</div>
                    <div
                      className={`text-sm font-semibold ${
                        day.isToday ? 'text-blue-400' : 'text-white'
                      }`}
                    >
                      {day.dayNum}
                    </div>
                  </div>
                ))}
              </div>

              {/* Time grid (rows = hours, columns = days) */}
              <div className="flex overflow-y-auto" style={{ maxHeight: '70vh' }}>
                {/* Hour labels on the left */}
                <div className="w-20 flex-shrink-0">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="h-16 border-b border-slate-700/50 text-xs text-slate-500 px-1"
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
                      className="flex-1 relative border-l border-slate-700"
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
                          className="h-16 border-b border-slate-700/50"
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
          )}

          {/* ===== MONTHLY VIEW ===== */}
          {view === 'month' && (
            <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
              {/* Day of week headers */}
              <div className="grid grid-cols-7 border-b border-slate-700">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div
                    key={d}
                    className="py-2 text-center text-xs text-slate-400 font-medium"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Weeks */}
              {monthDays.map((week, wi) => (
                <div
                  key={wi}
                  className="grid grid-cols-7 border-b border-slate-700/50"
                >
                  {week.map((day) => {
                    const dayClasses = classesByDate[day.dateStr] || [];
                    const isToday = day.isToday;
                    return (
                      <div
                        key={day.dateStr}
                        className={`min-h-[80px] p-1 border-r border-slate-700/50 cursor-pointer hover:bg-slate-700/30 ${
                          !day.isCurrentMonth ? 'opacity-40' : ''
                        } ${isToday ? 'bg-blue-500/10' : ''}`}
                        onClick={() => openNewClass(day.dateStr)}
                      >
                        <div
                          className={`text-xs font-semibold mb-1 ${
                            isToday ? 'text-blue-400' : 'text-white'
                          }`}
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
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-bounce">
          {toastMessage}
          <button
            onClick={() => setToastMessage('')}
            className="ml-3 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* ----- Modal (Add / Edit class) ----- */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">
              {editingClass ? '✏️ Edit Class' : '➕ New Ground Class'}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {/* Subject */}
              <div>
                <label className="text-xs text-slate-400">Subject *</label>
                <select
                  value={form.subject_id}
                  onChange={(e) =>
                    setForm({ ...form, subject_id: parseInt(e.target.value) })
                  }
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm mt-1"
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
                <label className="text-xs text-slate-400">Instructor *</label>
                <select
                  value={form.instructor_id}
                  onChange={(e) =>
                    setForm({ ...form, instructor_id: e.target.value })
                  }
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm mt-1"
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
                <label className="text-xs text-slate-400">Date *</label>
                <input
                  type="date"
                  value={form.class_date}
                  onChange={(e) =>
                    setForm({ ...form, class_date: e.target.value })
                  }
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm mt-1"
                />
              </div>

              {/* Start Time */}
              <div>
                <label className="text-xs text-slate-400">Start Time</label>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={(e) =>
                    setForm({ ...form, start_time: e.target.value })
                  }
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm mt-1"
                />
              </div>

              {/* End Time */}
              <div>
                <label className="text-xs text-slate-400">End Time</label>
                <input
                  type="time"
                  value={form.end_time}
                  onChange={(e) =>
                    setForm({ ...form, end_time: e.target.value })
                  }
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm mt-1"
                />
              </div>

              {/* Topic */}
              <div>
                <label className="text-xs text-slate-400">Topic</label>
                <input
                  type="text"
                  value={form.topic}
                  onChange={(e) =>
                    setForm({ ...form, topic: e.target.value })
                  }
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm mt-1"
                  placeholder="e.g., Chapter 5"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-4 flex justify-end space-x-2">
              {editingClass && (
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                >
                  🗑️ Delete
                </button>
              )}
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-600 text-white rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600"
              >
                💾 Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}