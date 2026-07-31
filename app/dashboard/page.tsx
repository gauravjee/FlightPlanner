// ============================================================
// app/dashboard/page.tsx - MAIN DASHBOARD
// ============================================================
// Purpose: Central operations dashboard showing:
//          - Key stats (aircraft, flights, students, fuel)
//          - LIVE weather briefing from AVWX API
//          - Today's flight schedule table
//          - Active NOTAM alerts
//          - Quick action navigation buttons
//          - Fleet fuel status bars
//          - Live IST clock in header
// ============================================================

'use client';

import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import Header from '@/components/ui/Header';

export default function DashboardPage() {
  // ----- Get data and actions from store -----
  const store = useFlightStore();
  const weather = store.weather;
  const aircraft = store.aircraft;
  const fetchWeather = store.fetchWeather;
  
  // ----- Fetch live weather on page load -----
  // Auto-refresh weather on METAR schedule
  useEffect(() => {
  // Import dynamically to get the helper function
    import('@/lib/weather').then(({ getTimeUntilNextMetar }) => {
      
      // Fetch immediately on page load
      fetchWeather('VOBL');
      
      // Calculate time until next METAR
      const timeUntil = getTimeUntilNextMetar();
      console.log(`⏰ Next METAR in ${Math.round(timeUntil / 60000)} minutes`);
      
      // Set timeout for next METAR
      const timeout = setTimeout(() => {
        fetchWeather('VOBL');
        // Then set interval for every 30 minutes after
        setInterval(() => fetchWeather('VOBL'), 30 * 60 * 1000);
      }, timeUntil);
      
      return () => clearTimeout(timeout);
    });
  }, [fetchWeather]);
  
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      
      {/* Shared Header with live clock */}
      <Header 
        title="FlightPro Manager" 
        subtitle="Horizon Flight Training Academy" 
        backUrl="/" 
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        
        {/* ===== STATS CARDS ROW ===== */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Active Aircraft', value: `${aircraft.filter(a => a.status === 'ACTIVE').length}/${aircraft.length}`, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
            { label: "Today's Flights", value: '12', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
            { label: 'Available Slots', value: '8', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
            { label: 'Students Flying', value: '3', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
            { label: 'Fuel Available', value: `${aircraft.reduce((s, a) => s + a.currentFuel, 0)}L`, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
          ].map((stat, i) => (
            <div key={i} className={`${stat.bg} ${stat.border} border rounded-xl p-4 backdrop-blur-sm hover:scale-105 transition`}>
              <p className="text-xs text-slate-400">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* ===== TWO-COLUMN LAYOUT ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT COLUMN - Weather & Schedule */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* ----- LIVE WEATHER BRIEFING ----- */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  🌤️ Weather Briefing
                  {weather.isLoading && (
                    <span className="text-xs text-slate-400 ml-2 animate-pulse">Loading...</span>
                  )}
                </h2>
                {/* Flight Rules Badge - color based on conditions */}
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  weather.flightRules === 'VFR' ? 'bg-green-500/20 text-green-400' :
                  weather.flightRules === 'MVFR' ? 'bg-yellow-500/20 text-yellow-400' :
                  weather.flightRules === 'IFR' ? 'bg-red-500/20 text-red-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {weather.flightRules}
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* METAR & TAF Text */}
                <div className="space-y-2">
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">METAR</p>
                    <p className="text-sm font-mono text-green-400">{weather.metar}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">TAF</p>
                    <p className="text-sm font-mono text-green-400">{weather.taf}</p>
                  </div>
                </div>
                
                {/* Weather Parameters Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400">Wind</p>
                    <p className="text-lg font-bold text-white">{weather.windDirection}°/{weather.windSpeed}kt</p>
                    <p className="text-xs text-slate-500">RWY 09 OK</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400">Temperature</p>
                    <p className="text-lg font-bold text-white">{weather.temperature}°C</p>
                    <p className="text-xs text-slate-500">Dew: {weather.dewpoint}°C</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400">Visibility</p>
                    <p className="text-lg font-bold text-white">
                      {weather.visibility >= 9999 ? '10km+' : `${weather.visibility}m`}
                    </p>
                    <p className="text-xs text-slate-500">
                      {weather.visibility >= 5000 ? 'Good' : 'Reduced'}
                    </p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400">QNH</p>
                    <p className="text-lg font-bold text-white">{weather.qnh} hPa</p>
                    <p className="text-xs text-slate-500">{weather.altimeter} inHg</p>
                  </div>
                </div>
              </div>
              
              {/* Weather Warnings */}
              {weather.warnings.length > 0 && (
                <div className="mt-4 space-y-1">
                  {weather.warnings.map((warning, i) => (
                    <div key={i} className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2">
                      <p className="text-xs text-yellow-400">{warning}</p>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Refresh Weather Button */}
                <div className="mt-4 flex justify-end">
                  <button 
                    onClick={async () => {
                      await fetchWeather('VOBL');
                    }}
                    className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs hover:bg-blue-500/30 transition"
                  >
                    🔄 Refresh Weather
                  </button>
                </div>
            </div>

            {/* ----- TODAY'S FLIGHT SCHEDULE ----- */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">📅 Today's Flight Schedule</h2>
                <a href="/dashboard/schedule" className="text-sm text-blue-400 hover:text-blue-300">View All →</a>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-3 font-medium">Time</th>
                      <th className="pb-3 font-medium">Aircraft</th>
                      <th className="pb-3 font-medium">Student/Inst</th>
                      <th className="pb-3 font-medium">Sortie</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {[
                      { time: '06:00-08:00', aircraft: 'N789EF (DA40)', pilot: 'Check Ride / SM', sortie: 'CHECK RIDE', status: 'SCHEDULED', color: 'text-blue-400 bg-blue-500/20' },
                      { time: '08:00-10:00', aircraft: 'N123AB (C172S)', pilot: 'JD / SM', sortie: 'Circuit Solo', status: 'IN PROGRESS', color: 'text-green-400 bg-green-500/20' },
                      { time: '10:30-12:30', aircraft: 'N456CD (PA28)', pilot: 'MB / SM', sortie: 'Nav Exercise', status: 'SCHEDULED', color: 'text-blue-400 bg-blue-500/20' },
                      { time: '14:00-16:00', aircraft: 'N789EF (DA40)', pilot: 'EW / MK', sortie: 'Stall & Recovery', status: 'SCHEDULED', color: 'text-blue-400 bg-blue-500/20' },
                      { time: '16:30-19:00', aircraft: 'N123AB (C172S)', pilot: 'MB / SM', sortie: 'Cross Country', status: 'SCHEDULED', color: 'text-blue-400 bg-blue-500/20' },
                    ].map((flight, i) => (
                      <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition">
                        <td className="py-3 text-white font-medium">{flight.time}</td>
                        <td className="py-3">{flight.aircraft}</td>
                        <td className="py-3">{flight.pilot}</td>
                        <td className="py-3">{flight.sortie}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${flight.color}`}>
                            {flight.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ===== RIGHT COLUMN ===== */}
          <div className="space-y-6">
            
            {/* ----- ACTIVE NOTAMS ----- */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">⚠️ Active NOTAMs</h2>
              <div className="space-y-3">
                {[
                  { text: 'TWY B CLOSED. Use TWY A.', priority: 'HIGH', color: 'border-red-500/20 bg-red-500/10' },
                  { text: 'Bird activity near runway.', priority: 'MODERATE', color: 'border-yellow-500/20 bg-yellow-500/10' },
                  { text: 'NDB BL unserviceable.', priority: 'LOW', color: 'border-slate-600 bg-slate-900/50' },
                  { text: 'Crane ops 2NM NE of AD.', priority: 'MODERATE', color: 'border-yellow-500/20 bg-yellow-500/10' },
                ].map((notam, i) => (
                  <div key={i} className={`${notam.color} border rounded-lg p-3`}>
                    <p className="text-xs text-slate-300">{notam.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ----- QUICK ACTIONS ----- */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">⚡ Quick Actions</h2>
              <div className="grid grid-cols-2 gap-2">
                <a href="/dashboard/schedule" className="bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg p-3 hover:scale-105 transition text-center cursor-pointer no-underline block">
                  <p className="text-xl mb-1">📅</p><p className="text-xs">Schedule</p>
                </a>
                <a href="/dashboard/aircraft" className="bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg p-3 hover:scale-105 transition text-center cursor-pointer no-underline block">
                  <p className="text-xl mb-1">🛩️</p><p className="text-xs">Aircraft</p>
                </a>
                <a href="/dashboard/students" className="bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg p-3 hover:scale-105 transition text-center cursor-pointer no-underline block">
                  <p className="text-xl mb-1">👨‍✈️</p><p className="text-xs">Students</p>
                </a>
                <a href="/dashboard/fuel" className="bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-lg p-3 hover:scale-105 transition text-center cursor-pointer no-underline block">
                  <p className="text-xl mb-1">⛽</p><p className="text-xs">Fuel</p>
                </a>
                <a href="/dashboard/flights" className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-lg p-3 hover:scale-105 transition text-center cursor-pointer no-underline block">
                  <p className="text-xl mb-1">📝</p><p className="text-xs">Flights</p>
                </a>
                <a href="/dashboard/maintenance" className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg p-3 hover:scale-105 transition text-center cursor-pointer no-underline block">
                  <p className="text-xl mb-1">🔧</p><p className="text-xs">Maintenance</p>
                </a>
                <a href="/dashboard/instructors" className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-lg p-3 hover:scale-105 transition text-center cursor-pointer no-underline block">
                  <p className="text-xl mb-1">👨‍🏫</p><p className="text-xs">Instructors</p>
                </a>
              </div>
            </div>

            {/* ----- FLEET FUEL STATUS ----- */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">⛽ Fleet Fuel Status</h2>
              <div className="space-y-3">
                {aircraft.slice(0, 4).map((ac) => {
                  const pct = ac.fuelCapacity > 0 ? (ac.currentFuel / ac.fuelCapacity) * 100 : 0;
                  return (
                    <div key={ac.id} className="bg-slate-900/50 rounded-lg p-3">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm text-white">{ac.registration} ({ac.type})</span>
                        <span className={`text-xs ${pct < 30 ? 'text-red-400' : pct < 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                          {ac.currentFuel}L / {ac.fuelCapacity}L
                        </span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div className={`h-2 rounded-full ${pct < 30 ? 'bg-red-500' : pct < 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(pct, 100)}%` }} />
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
  );
}