// app/dashboard/page.tsx - MAIN DASHBOARD
'use client';

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">✈️</span>
              <div>
                <h1 className="text-xl font-bold text-white">FlightPro Manager</h1>
                <p className="text-xs text-slate-400">Horizon Flight Training Academy</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm text-white">Wednesday, 15 Jan 2024</p>
                <p className="text-xs text-slate-400">VOBL - Bangalore</p>
              </div>
              <a href="/" className="text-sm text-slate-400 hover:text-white">← Home</a>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
            <p className="text-xs text-slate-400">Active Aircraft</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">5/7</p>
          </div>
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <p className="text-xs text-slate-400">Today's Flights</p>
            <p className="text-2xl font-bold text-green-400 mt-1">12</p>
          </div>
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
            <p className="text-xs text-slate-400">Available Slots</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">8</p>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
            <p className="text-xs text-slate-400">Students Flying</p>
            <p className="text-2xl font-bold text-yellow-400 mt-1">3</p>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
            <p className="text-xs text-slate-400">Fuel Available</p>
            <p className="text-2xl font-bold text-orange-400 mt-1">607L</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Weather */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">🌤️ Weather Briefing</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">METAR</p>
                    <p className="text-sm font-mono text-green-400">VOBL 150730Z 27005KT 8000 FEW020 SCT100 22/15 Q1013 NOSIG</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">TAF</p>
                    <p className="text-sm font-mono text-green-400">1506/1606 27008KT 8000 FEW020 SCT100 TEMPO 1512/1518 5000 TSRA</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400">Wind</p>
                    <p className="text-lg font-bold text-white">270°/5kt</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400">Temperature</p>
                    <p className="text-lg font-bold text-white">22°C</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400">Visibility</p>
                    <p className="text-lg font-bold text-white">8 km</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400">QNH</p>
                    <p className="text-lg font-bold text-white">1013 hPa</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Schedule Table */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">📅 Today's Flight Schedule</h2>
                <a href="/dashboard/schedule" className="text-sm text-blue-400 hover:text-blue-300">View All →</a>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-3">Time</th>
                      <th className="pb-3">Aircraft</th>
                      <th className="pb-3">Pilot</th>
                      <th className="pb-3">Sortie</th>
                      <th className="pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    <tr className="border-b border-slate-700/50">
                      <td className="py-3 text-white">06:00-08:00</td>
                      <td className="py-3">N789EF (DA40)</td>
                      <td className="py-3">Check Ride / SM</td>
                      <td className="py-3">CHECK RIDE</td>
                      <td className="py-3"><span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs">SCHEDULED</span></td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-3 text-white">08:00-10:00</td>
                      <td className="py-3">N123AB (C172S)</td>
                      <td className="py-3">JD / SM</td>
                      <td className="py-3">Circuit Solo</td>
                      <td className="py-3"><span className="px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs">IN PROGRESS</span></td>
                    </tr>
                    <tr className="border-b border-slate-700/50">
                      <td className="py-3 text-white">10:30-12:30</td>
                      <td className="py-3">N456CD (PA28)</td>
                      <td className="py-3">MB / SM</td>
                      <td className="py-3">Nav Exercise</td>
                      <td className="py-3"><span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs">SCHEDULED</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">⚡ Quick Actions</h2>
              <div className="grid grid-cols-2 gap-2">
                <a href="/dashboard/schedule" className="bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg p-3 hover:scale-105 transition text-center no-underline block">
                  <p className="text-xl mb-1">📅</p>
                  <p className="text-xs">Schedule</p>
                </a>
                <a href="/dashboard/aircraft" className="bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg p-3 hover:scale-105 transition text-center no-underline block">
                  <p className="text-xl mb-1">🛩️</p>
                  <p className="text-xs">Aircraft</p>
                </a>
                <a href="/dashboard/students" className="bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg p-3 hover:scale-105 transition text-center no-underline block">
                  <p className="text-xl mb-1">👨‍✈️</p>
                  <p className="text-xs">Students</p>
                </a>
                <a href="/dashboard/fuel" className="bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-lg p-3 hover:scale-105 transition text-center no-underline block">
                  <p className="text-xl mb-1">⛽</p>
                  <p className="text-xs">Fuel</p>
                </a>
                <a href="/dashboard/flights" className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-lg p-3 hover:scale-105 transition text-center no-underline block">
                  <p className="text-xl mb-1">📝</p>
                  <p className="text-xs">Flights</p>
                </a>
                <a href="/dashboard/maintenance" className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg p-3 hover:scale-105 transition text-center cursor-pointer no-underline block">
                  <p className="text-xl mb-1">🔧</p>
                  <p className="text-xs">Maintenance</p>
                </a>
              </div>
            </div>

            {/* NOTAMs */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">⚠️ Active NOTAMs</h2>
              <div className="space-y-2">
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-xs text-slate-300">TWY B CLOSED. Use TWY A.</p>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <p className="text-xs text-slate-300">Bird activity near runway.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}