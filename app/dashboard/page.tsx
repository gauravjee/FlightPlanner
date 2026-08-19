// ============================================================
// app/dashboard/page.tsx - MAIN DASHBOARD
// ============================================================
// Purpose: Central operations dashboard showing:
//          - Key stats (aircraft, flights, students, fuel)
//          - LIVE weather briefing from FAA API
//          - Today's flight schedule table
//          - LIVE Active NOTAM alerts from FAA API
//          - Quick action navigation buttons
//          - Fleet fuel status bars
//          - Live IST clock in header
// ============================================================

'use client';

import ProtectedRoute from '@/components/ui/ProtectedRoute';
import { useState, useEffect, useMemo } from 'react';
import {
  useFlightStore, getAircraftBufferMinutes, parseTurnaroundBufferSetting, MIN_FLIGHT_DURATION_MIN,
  getAircraftFuelBurnRate, getProjectedFuelAfter,
} from '@/lib/store';
import { useSetHeader } from '@/components/ui/HeaderContext';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import StudentProgressWidget from '@/components/dashboard/StudentProgressWidget';
import NotificationWidget from '@/components/dashboard/NotificationWidget';
import {
  Plane, Calendar, ChevronRight, Users, Fuel, Cloud, Wind, Thermometer, Eye, Activity,
  RefreshCw, Inbox, TriangleAlert, FileText, Wrench, GraduationCap, UserRound, Umbrella,
  ChartColumnIncreasing, BookOpen,
} from 'lucide-react';

export default function DashboardPage() {
  const store = useFlightStore();
  const weather = store.weather;
  const generalWeather = store.generalWeather;
  const aircraft = store.aircraft;
  const loadAircraft = store.loadAircraft;
  const fetchWeather = store.fetchWeather;
  const fetchGeneralWeather = store.fetchGeneralWeather;
  const notams = store.notams;
  const loadNOTAMs = store.loadNOTAMs;
  const scheduledFlights = store.scheduledFlights;
  const loadScheduledFlights = store.loadScheduledFlights;
  const students = store.students;
  const loadStudents = store.loadStudents;
  const instructors = store.instructors;
  const loadInstructors = store.loadInstructors;

  const { data: session } = useSession();
  const router = useRouter();

  // Redirect students to their own dashboard
  useEffect(() => {
    if (session?.user && (session.user as any).role === 'student') {
      router.push('/dashboard/student');
    }
  }, [session, router]);

  // Fetch FTO settings on page load
  const { ftoSettings, ftoSettingsLoaded, loadFTOSettings, getFTOSetting } = useFlightStore();

  useEffect(() => {
    loadFTOSettings();
  }, [loadFTOSettings]);

  // The school's configured primary airport (Settings → School Information
  // → "Primary Airport (ICAO)"). This field is optional — a school flying
  // from an airstrip with no ICAO code can leave it blank (or enter a
  // nearby reporting station's code purely to source reference weather).
  // No fallback to a default code here: an empty station means "no live
  // weather configured", handled explicitly below, rather than silently
  // showing another airport's weather.
  const station = getFTOSetting('airport_code');

  // Fallback coordinates for general (non-aviation) weather, used only when
  // there's no ICAO/reference station. Both must be present and parse as
  // finite numbers, otherwise this falls through to "no live weather".
  const latRaw = getFTOSetting('latitude');
  const lonRaw = getFTOSetting('longitude');
  const lat = parseFloat(latRaw);
  const lon = parseFloat(lonRaw);
  const hasValidLatLon = latRaw !== '' && lonRaw !== '' && Number.isFinite(lat) && Number.isFinite(lon);

  // Fetch live weather on page load, and re-fetch if the configured airport
  // changes. Waits for fto_settings to finish loading (ftoSettingsLoaded)
  // so it doesn't fire once for a not-yet-loaded empty station and again
  // for the real one, and skips entirely once loaded if no station is
  // configured — the "no live weather available" UI below handles that
  // case instead of quietly defaulting to some other airport.
  //
  // Bug fix (kept from earlier): the setTimeout/setInterval pair here were
  // previously never cleared on unmount — the `return () => clearTimeout(timeout)`
  // lived inside the async `.then()` callback, where React never sees it
  // (it's just the resolved value of a promise nobody reads). Effect
  // cleanup only runs the function this *outer* effect body returns. Every
  // time this effect re-ran (route re-visits, fast refresh) it left another
  // orphaned 30-minute poller running forever, compounding into duplicate
  // weather fetches over a long session. Both timers are hoisted so the
  // real cleanup below can clear them.
  useEffect(() => {
    if (!ftoSettingsLoaded || !station) return undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    import('@/lib/weather').then(({ getTimeUntilNextMetar }) => {
      if (cancelled) return;
      fetchWeather(station);
      const timeUntil = getTimeUntilNextMetar();
      timeout = setTimeout(() => {
        fetchWeather(station);
        interval = setInterval(() => fetchWeather(station), 30 * 60 * 1000);
      }, timeUntil);
    });
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [fetchWeather, station, ftoSettingsLoaded]);

  // Fetch live NOTAMs — same station, same "only once settings are loaded
  // and a station is actually configured" behavior.
  useEffect(() => {
    if (!ftoSettingsLoaded || !station) return;
    loadNOTAMs(station);
  }, [loadNOTAMs, station, ftoSettingsLoaded]);

  // Fetch general (non-aviation) weather by lat/long — only when there's no
  // ICAO/reference station configured (station takes priority: real METAR
  // beats a general forecast). Refreshed every 30 minutes, same cadence as
  // the METAR poller above, but without METAR's fixed :20/:50 issuance
  // timing since general forecasts don't follow that schedule.
  useEffect(() => {
    if (!ftoSettingsLoaded || station || !hasValidLatLon) return undefined;
    fetchGeneralWeather(lat, lon);
    const interval = setInterval(() => fetchGeneralWeather(lat, lon), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchGeneralWeather, station, lat, lon, hasValidLatLon, ftoSettingsLoaded]);

  // Load fleet/roster + today's bookings for the schedule table and fuel
  // status below. Aircraft/students/instructors are loaded alongside
  // scheduledFlights (not just scheduledFlights alone) because the store
  // resolves aircraft registration / student name / instructor name onto
  // each booking at load time from whatever's already in those three
  // lists — loading them together avoids a first-load flash of
  // "Unknown"/"None" while they're still empty.
  useEffect(() => {
    loadAircraft();
    loadStudents();
    loadInstructors();
    loadScheduledFlights();
  }, [loadAircraft, loadStudents, loadInstructors, loadScheduledFlights]);

  // Today's flights, computed live from scheduled_flights — this used to
  // be a hardcoded placeholder array (bug: it never reflected the real
  // database, so clearing demo/test data didn't change what showed here).
  // Every status is included, not just active ones, so a cancelled
  // booking still shows (with its own badge) instead of silently
  // vanishing from the list.
  const todaysFlights = useMemo(() => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const statusMeta: Record<string, { label: string; badge: string }> = {
      SCHEDULED: { label: 'Scheduled', badge: 'badge-accent' },
      IN_PROGRESS: { label: 'In progress', badge: 'badge-success' },
      COMPLETED: { label: 'Completed', badge: 'badge-neutral' },
      CANCELLED: { label: 'Cancelled', badge: 'badge-danger' },
    };
    const fmtTime = (iso: string) =>
      new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return scheduledFlights
      .filter(f => new Date(f.startTime).toLocaleDateString('en-CA') === todayStr)
      .slice()
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .map(f => {
        const ac = aircraft.find(a => String(a.id) === String(f.aircraftId));
        const student = students.find(s => String(s.id) === String(f.studentId));
        const instructor = instructors.find(i => String(i.id) === String(f.instructorId));
        const meta = statusMeta[f.status] || { label: f.status, badge: 'badge-neutral' };
        return {
          id: f.id,
          time: `${fmtTime(f.startTime)}-${fmtTime(f.endTime)}`,
          aircraft: ac ? `${f.aircraftReg} (${ac.isSimulator ? 'Simulator' : ac.model})` : f.aircraftReg,
          pilot: `${student?.initials || '—'}/${instructor?.initials || '—'}`,
          sortie: f.sortieType,
          status: meta.label,
          badge: meta.badge,
        };
      });
  }, [scheduledFlights, aircraft, students, instructors]);

  // Distinct students with a non-cancelled flight today — same "flying
  // today" definition already used by StudentProgressWidget (excludes
  // CANCELLED, per the earlier fix so a cancelled booking doesn't still
  // count as the student flying).
  const studentsFlyingTodayCount = useMemo(() => {
    const ids = new Set(
      todaysFlights
        .map(tf => scheduledFlights.find(f => f.id === tf.id))
        .filter((f): f is typeof scheduledFlights[number] => !!f && !!f.studentId && f.status !== 'CANCELLED')
        .map(f => f.studentId)
    );
    return ids.size;
  }, [todaysFlights, scheduledFlights]);

  // Remaining bookable slots today, across active aircraft — computed from
  // the FTO's own configured operating window (Settings -> Daily Time
  // Slots -> time_slot_start/_end/_interval, same defaults/keys BookingForm
  // uses) and the same scheduling rules the store's checkConflicts()/
  // bookFlight() apply when actually booking a flight (see lib/store.ts),
  // so this number means the same thing here as it does at booking time:
  //   - A slot only counts if a flight of at least MIN_FLIGHT_DURATION_MIN
  //     could actually start there and finish before the window closes —
  //     not just a bare, duration-less point in time (the old version's
  //     off-by-one bug: it allowed a "slot" at exactly closing time, with
  //     no room left for any flight at all).
  //   - Each existing booking's own turnaround/fueling buffer is asymmetric:
  //     the gap required before it is based on the aircraft's current fuel,
  //     the gap required after it is based on the fuel PROJECTED at the end
  //     of that flight (getProjectedFuelAfter) — same as the store's
  //     checkConflicts()/bookFlight() and BookingForm now compute it, not a
  //     single flat buffer shared by the whole fleet.
  //   - An aircraft with too little fuel left to complete even the shortest
  //     bookable flight (MIN_FLIGHT_DURATION_MIN) contributes zero slots —
  //     it needs refueling before anything more can be booked on it today.
  // Slots already in the past today don't count as "available".
  const availableSlotsToday = useMemo(() => {
    const slotStartStr = getFTOSetting('time_slot_start') || '06:00';
    const slotEndStr = getFTOSetting('time_slot_end') || '22:00';
    const slotIntervalMin = parseInt(getFTOSetting('time_slot_interval'), 10) || 30;
    const [startH, startM] = slotStartStr.split(':').map(Number);
    const [endH, endM] = slotEndStr.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    if (!Number.isFinite(startTotal) || !Number.isFinite(endTotal) || endTotal <= startTotal || slotIntervalMin <= 0) {
      return 0;
    }

    const todayStr = new Date().toLocaleDateString('en-CA');
    const now = new Date();
    const activeAircraft = aircraft.filter(a => a.status === 'ACTIVE');
    const turnaroundMin = parseTurnaroundBufferSetting(getFTOSetting('buffer_minutes'));

    let available = 0;
    for (const ac of activeAircraft) {
      // Not enough fuel on board right now to fly even the shortest bookable
      // flight — nothing on this aircraft is actually bookable today until
      // it's refueled, regardless of how many open time slots the schedule
      // shows.
      const burnRate = getAircraftFuelBurnRate(ac);
      const fuelNeededForMinFlight = burnRate * (MIN_FLIGHT_DURATION_MIN / 60);
      if (ac.currentFuel < fuelNeededForMinFlight) continue;

      const acFlightsToday = scheduledFlights.filter(f =>
        String(f.aircraftId) === String(ac.id) &&
        f.status !== 'CANCELLED' &&
        new Date(f.startTime).toLocaleDateString('en-CA') === todayStr
      );
      // Last valid start is MIN_FLIGHT_DURATION_MIN before closing, so every
      // slot counted here could actually fit the shortest bookable flight.
      for (let t = startTotal; t <= endTotal - MIN_FLIGHT_DURATION_MIN; t += slotIntervalMin) {
        const slotStartDate = new Date();
        slotStartDate.setHours(Math.floor(t / 60), t % 60, 0, 0);
        if (slotStartDate <= now) continue;
        const slotEndDate = new Date(slotStartDate);
        slotEndDate.setMinutes(slotEndDate.getMinutes() + MIN_FLIGHT_DURATION_MIN);
        const hasConflict = acFlightsToday.some(f => {
          const flightDurationMin = Math.round(
            (new Date(f.endTime).getTime() - new Date(f.startTime).getTime()) / 60000
          );
          const bufferBeforeMin = getAircraftBufferMinutes(ac.currentFuel, turnaroundMin);
          const projectedFuelAfter = getProjectedFuelAfter(ac, flightDurationMin);
          const bufferAfterMin = getAircraftBufferMinutes(projectedFuelAfter, turnaroundMin);
          const bufferedStart = new Date(f.startTime);
          bufferedStart.setMinutes(bufferedStart.getMinutes() - bufferBeforeMin);
          const bufferedEnd = new Date(f.endTime);
          bufferedEnd.setMinutes(bufferedEnd.getMinutes() + bufferAfterMin);
          return slotStartDate < bufferedEnd && slotEndDate > bufferedStart;
        });
        if (!hasConflict) available++;
      }
    }
    return available;
  }, [aircraft, scheduledFlights, getFTOSetting]);


  useSetHeader({
    title: 'FlightPro Manager',
    subtitle: 'Horizon Flight Training Academy',
    // Used to point at '/', the old landing page — now that '/' just
    // redirects straight to /login (see app/page.tsx), that would bounce a
    // logged-in user through the login screen. '/dashboard' is this page
    // itself, which BACK_URLS_COVERED_BY_SIDEBAR in Header.tsx already
    // hides at lg+ (Sidebar's own Dashboard link covers it); it still shows
    // below lg, same as every other page that relies on the '/dashboard'
    // default.
    backUrl: '/dashboard',
  });

  return (
    <ProtectedRoute>
      <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 py-6">

          {/* ===== STATS CARDS ROW ===== */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 mb-6">
            {[
              { label: 'Active Aircraft', value: `${aircraft.filter(a => a.status === 'ACTIVE').length}`, suffix: `/${aircraft.length}`, color: 'var(--accent)', icon: Plane },
              { label: "Today's Flights", value: `${todaysFlights.length}`, suffix: '', color: 'var(--success)', icon: Calendar },
              { label: 'Available Slots', value: `${availableSlotsToday}`, suffix: '', color: 'var(--text-secondary)', icon: ChevronRight },
              { label: 'Students Flying', value: `${studentsFlyingTodayCount}`, suffix: '', color: 'var(--accent)', icon: Users },
              { label: 'Fuel Available', value: `${aircraft.reduce((s, a) => s + a.currentFuel, 0)}`, suffix: 'L', color: 'var(--warning)', icon: Fuel },
            ].map((stat, i) => (
              <div key={i} className="surface-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-secondary">{stat.label}</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, ' + stat.color + ' 14%, transparent)' }}>
                    <stat.icon className="w-3.5 h-3.5" style={{ stroke: stat.color }} />
                  </div>
                </div>
                <p className="text-2xl font-bold mt-2" style={{ letterSpacing: '-0.02em' }}>
                  {stat.value}<span className="text-tertiary text-sm font-medium">{stat.suffix}</span>
                </p>
              </div>
            ))}
          </div>

          {/* ===== TWO-COLUMN LAYOUT ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* LEFT COLUMN - Weather & Schedule */}
            <div className="lg:col-span-2 space-y-6">

              {/* ----- LIVE WEATHER BRIEFING ----- */}
              <div className="surface-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-secondary" />
                    Weather Briefing
                    {weather.isLoading && (
                      <span className="text-xs text-tertiary animate-pulse font-normal">Loading...</span>
                    )}
                  </h2>
                  {ftoSettingsLoaded && station && (
                    <span className={`badge ${
                      weather.flightRules === 'VFR' ? 'badge-success' :
                      weather.flightRules === 'MVFR' ? 'badge-warning' :
                      'badge-danger'
                    }`}>
                      {weather.flightRules}
                    </span>
                  )}
                  {ftoSettingsLoaded && !station && hasValidLatLon && (
                    <span className="badge badge-neutral">
                      General (not aviation weather)
                    </span>
                  )}
                </div>

                {!ftoSettingsLoaded ? (
                  <p className="text-secondary text-sm text-center py-8">Loading...</p>
                ) : station ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* METAR & TAF Text */}
                      <div className="space-y-2">
                        <div className="surface-inner p-3">
                          <p className="text-tertiary text-xs mb-1">METAR</p>
                          <p className="text-sm font-mono" style={{ color: 'var(--success)' }}>{weather.metar}</p>
                        </div>
                        <div className="surface-inner p-3">
                          <p className="text-tertiary text-xs mb-1">TAF</p>
                          <p className="text-sm font-mono" style={{ color: 'var(--success)' }}>{weather.taf}</p>
                        </div>
                      </div>

                      {/* Weather Parameters Grid */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="surface-inner p-3">
                          <p className="text-tertiary text-xs flex items-center gap-1"><Wind className="w-3 h-3" />Wind</p>
                          <p className="text-lg font-bold mt-0.5">{weather.windDirection}°/{weather.windSpeed}kt</p>
                          <p className="text-tertiary text-xs">RWY 09 OK</p>
                        </div>
                        <div className="surface-inner p-3">
                          <p className="text-tertiary text-xs flex items-center gap-1"><Thermometer className="w-3 h-3" />Temperature</p>
                          <p className="text-lg font-bold mt-0.5">{weather.temperature}°C</p>
                          <p className="text-tertiary text-xs">Dew: {weather.dewpoint}°C</p>
                        </div>
                        <div className="surface-inner p-3">
                          <p className="text-tertiary text-xs flex items-center gap-1"><Eye className="w-3 h-3" />Visibility</p>
                          <p className="text-lg font-bold mt-0.5">
                            {weather.visibility >= 9999 ? '10km+' : `${weather.visibility}m`}
                          </p>
                          <p className="text-tertiary text-xs">
                            {weather.visibility >= 5000 ? 'Good' : 'Reduced'}
                          </p>
                        </div>
                        <div className="surface-inner p-3">
                          <p className="text-tertiary text-xs flex items-center gap-1"><Activity className="w-3 h-3" />QNH</p>
                          <p className="text-lg font-bold mt-0.5">{weather.qnh} hPa</p>
                          <p className="text-tertiary text-xs">{weather.altimeter} inHg</p>
                        </div>
                      </div>
                    </div>

                    {/* Weather Warnings */}
                    {weather.warnings.length > 0 && (
                      <div className="mt-4 space-y-1">
                        {weather.warnings.map((warning, i) => (
                          <div key={i} className="rounded-lg p-2" style={{ backgroundColor: 'var(--warning-soft)', border: '1px solid var(--warning)' }}>
                            <p className="text-xs" style={{ color: 'var(--warning-text)' }}>{warning}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Refresh Weather Button */}
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={async () => { await fetchWeather(station); }}
                        className="pill-btn-accent px-3 py-1.5 rounded-lg text-xs hover:opacity-80 transition flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3 h-3" /> Refresh Weather
                      </button>
                    </div>
                  </>
                ) : hasValidLatLon ? (
                  <>
                    {/* General (non-aviation) weather for the configured lat/long.
                        No METAR/TAF text and no flight-rules classification —
                        those don't exist for an arbitrary coordinate — so this
                        is laid out and labeled differently from the METAR view
                        above rather than reusing its fields. */}
                    <p className="text-tertiary text-xs -mt-2 mb-3">
                      Sourced from configured coordinates — general conditions only, not an official
                      aviation weather briefing.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <div className="surface-inner p-3">
                        <p className="text-tertiary text-xs">Conditions</p>
                        <p className="text-sm font-bold mt-0.5">{generalWeather?.conditionText || 'Loading...'}</p>
                      </div>
                      <div className="surface-inner p-3">
                        <p className="text-tertiary text-xs">Wind</p>
                        <p className="text-lg font-bold mt-0.5">
                          {generalWeather ? `${generalWeather.windDirection}°/${generalWeather.windSpeed}kt` : '—'}
                        </p>
                      </div>
                      <div className="surface-inner p-3">
                        <p className="text-tertiary text-xs">Temperature</p>
                        <p className="text-lg font-bold mt-0.5">
                          {generalWeather ? `${generalWeather.temperature}°C` : '—'}
                        </p>
                        <p className="text-tertiary text-xs">Dew: {generalWeather ? `${generalWeather.dewpoint}°C` : '—'}</p>
                      </div>
                      <div className="surface-inner p-3">
                        <p className="text-tertiary text-xs">Pressure</p>
                        <p className="text-lg font-bold mt-0.5">
                          {generalWeather ? `${generalWeather.pressure} hPa` : '—'}
                        </p>
                      </div>
                      <div className="surface-inner p-3">
                        <p className="text-tertiary text-xs">Cloud Cover</p>
                        <p className="text-lg font-bold mt-0.5">
                          {generalWeather ? `${generalWeather.cloudCover}%` : '—'}
                        </p>
                      </div>
                    </div>

                    {generalWeather?.error && (
                      <div className="mt-4 rounded-lg p-2" style={{ backgroundColor: 'var(--warning-soft)', border: '1px solid var(--warning)' }}>
                        <p className="text-xs" style={{ color: 'var(--warning-text)' }}>Could not fetch weather for these coordinates</p>
                      </div>
                    )}

                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={async () => { await fetchGeneralWeather(lat, lon); }}
                        className="pill-btn-accent px-3 py-1.5 rounded-lg text-xs hover:opacity-80 transition flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3 h-3" /> Refresh Weather
                      </button>
                    </div>
                  </>
                ) : (
                  /* No ICAO/reference station and no valid lat/long either.
                     Rather than silently showing another airport's weather,
                     say so plainly and point to where it can be fixed. */
                  <div className="text-center py-8">
                    <Inbox className="w-5 h-5 text-tertiary mx-auto mb-2" />
                    <p className="text-secondary text-sm">No live weather available</p>
                    <p className="text-tertiary text-xs mt-1">
                      Add a Primary Airport (ICAO) code in Settings — your own, or the nearest reporting
                      station if your field doesn&apos;t have one — or set Latitude/Longitude for general
                      weather instead.
                    </p>
                  </div>
                )}
              </div>

              {/* ----- TODAY'S FLIGHT SCHEDULE ----- */}
              <div className="surface-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-secondary" />
                    Today&apos;s Flight Schedule
                  </h2>
                  <a href="/dashboard/schedule" className="text-sm text-accent hover:opacity-80 flex items-center gap-0.5">
                    View all <ChevronRight className="w-3.5 h-3.5" />
                  </a>
                </div>
                {todaysFlights.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="w-5 h-5 text-tertiary mx-auto mb-2" />
                    <p className="text-secondary text-sm">No flights scheduled today</p>
                  </div>
                ) : (
                  <>
                    {/* Table — desktop/tablet */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-tertiary divider" style={{ borderBottomWidth: 1, borderBottomStyle: 'solid' }}>
                            <th className="pb-3 font-medium">Time</th>
                            <th className="pb-3 font-medium">Aircraft</th>
                            <th className="pb-3 font-medium">Student/Inst</th>
                            <th className="pb-3 font-medium">Sortie</th>
                            <th className="pb-3 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {todaysFlights.map((flight) => (
                            <tr key={flight.id} className="divider hover:opacity-90 transition" style={{ borderTopWidth: 1, borderTopStyle: 'solid' }}>
                              <td className="py-3 font-medium">{flight.time}</td>
                              <td className="py-3 text-secondary">{flight.aircraft}</td>
                              <td className="py-3 text-secondary">{flight.pilot}</td>
                              <td className="py-3 text-secondary">{flight.sortie}</td>
                              <td className="py-3">
                                <span className={`badge ${flight.badge}`}>{flight.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Card list — mobile, narrower than a 5-column table can read well */}
                    <div className="sm:hidden space-y-2">
                      {todaysFlights.map((flight) => (
                        <div key={flight.id} className="surface-inner p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">{flight.time}</span>
                            <span className={`badge ${flight.badge}`}>{flight.status}</span>
                          </div>
                          <p className="text-secondary text-xs">{flight.aircraft} &middot; {flight.pilot}</p>
                          <p className="text-tertiary text-xs mt-0.5">{flight.sortie}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {/* ----- STUDENT PROGRESS WIDGET ----- */}
              <StudentProgressWidget />
            </div>

            

            {/* ===== RIGHT COLUMN ===== */}
            <div className="space-y-6">

            {/* ----- NOTIFICATION ALERTS ----- */}
            <NotificationWidget />
            
              {/* ----- LIVE ACTIVE NOTAMS ----- */}
              <div className="surface-card p-6">
                <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
                  <TriangleAlert className="w-4 h-4" style={{ stroke: 'var(--warning)' }} />
                  Active NOTAMs
                </h2>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {notams.length === 0 ? (
                    <p className="text-xs text-secondary">Loading NOTAMs...</p>
                  ) : (
                    notams.map((notam, i) => (
                      <div
                        key={i}
                        className="surface-inner p-3"
                        style={{
                          borderLeft: `3px solid ${
                            notam.priority === 'HIGH' || notam.priority === 'CRITICAL' ? 'var(--danger)' :
                            notam.priority === 'MODERATE' ? 'var(--warning)' : 'var(--border)'
                          }`,
                        }}
                      >
                        <p className="text-xs text-secondary">
                          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{notam.notamNumber}</span> — {notam.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ----- QUICK ACTIONS ----- */}
              <div className="surface-card p-6">
                <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
                  <ChevronRight className="w-4 h-4 text-secondary" />
                  Quick Actions
                </h2>
                {(() => {
                  // Each tile's `roles` list matches the `allowedRoles` the
                  // destination page itself enforces via RoleGate — kept in
                  // sync here so operations/maintenance (whose access is
                  // limited to just a couple of modules) no longer see tiles
                  // that only lead to "Not Authorized." Previously this list
                  // wasn't filtered by role at all.
                  const actions = [
                    { href: '/dashboard/schedule', label: 'Schedule', icon: Calendar, accent: false, roles: ['admin', 'instructor', 'super_admin', 'operations'] },
                    { href: '/dashboard/aircraft', label: 'Aircraft', icon: Plane, accent: false, roles: ['admin', 'instructor', 'super_admin'] },
                    { href: '/dashboard/students', label: 'Students', icon: Users, accent: false, roles: ['admin', 'instructor', 'super_admin', 'operations'] },
                    { href: '/dashboard/fuel', label: 'Fuel', icon: Fuel, accent: false, roles: ['admin', 'instructor', 'super_admin', 'maintenance'] },
                    { href: '/dashboard/flights', label: 'Flights', icon: FileText, accent: false, roles: ['admin', 'instructor', 'super_admin'] },
                    { href: '/dashboard/maintenance', label: 'Maintenance', icon: Wrench, accent: true, roles: ['admin', 'instructor', 'super_admin', 'maintenance'] },
                    { href: '/dashboard/instructors', label: 'Instructors', icon: GraduationCap, accent: false, roles: ['admin', 'instructor', 'super_admin'] },
                    { href: '/dashboard/instructor', label: 'My Students', icon: UserRound, accent: false, roles: ['admin', 'instructor', 'super_admin'] },
                    { href: '/dashboard/availability', label: 'Availability', icon: Umbrella, accent: false, roles: ['admin', 'instructor', 'super_admin'] },
                    { href: '/dashboard/progress', label: 'Progress', icon: ChartColumnIncreasing, accent: false, roles: ['admin', 'instructor', 'super_admin'] },
                    { href: '/dashboard/ground-school', label: 'Ground School', icon: BookOpen, accent: false, roles: ['admin', 'instructor', 'super_admin', 'operations'] },
                  ];
                  const userRole = session?.user?.role;
                  const visibleActions = actions.filter(a => !userRole || a.roles.includes(userRole));
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {visibleActions.map((action) => (
                        <a
                          key={action.href}
                          href={action.href}
                          className="surface-muted rounded-lg p-3 flex flex-col gap-2 hover:opacity-80 transition text-left no-underline"
                        >
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: action.accent ? 'var(--danger-soft)' : 'color-mix(in srgb, var(--text-secondary) 14%, transparent)' }}
                          >
                            <action.icon className="w-4 h-4" style={{ stroke: action.accent ? 'var(--danger)' : 'var(--text-secondary)' }} />
                          </div>
                          <span className="text-xs font-medium">{action.label}</span>
                        </a>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* ----- FLEET FUEL STATUS ----- */}
              <div className="surface-card p-6">
                <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
                  <Fuel className="w-4 h-4 text-secondary" />
                  Fleet Fuel Status
                </h2>
                <div className="space-y-3">
                  {aircraft.slice(0, 4).map((ac) => {
                    const pct = ac.fuelCapacity > 0 ? (ac.currentFuel / ac.fuelCapacity) * 100 : 0;
                    const barColor = pct < 30 ? 'var(--danger)' : pct < 60 ? 'var(--warning)' : 'var(--success)';
                    return (
                      <div key={ac.id} className="surface-inner p-3">
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">{ac.registration} ({ac.isSimulator ? 'Simulator' : ac.model})</span>
                          <span className="text-xs" style={{ color: barColor }}>
                            {ac.currentFuel}L / {ac.fuelCapacity}L
                          </span>
                        </div>
                        <div className="w-full rounded-full h-1.5" style={{ backgroundColor: 'var(--border)' }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}