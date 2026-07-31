// ============================================================
// app/page.tsx - LANDING PAGE
// ============================================================
// Purpose: The first page visitors see at http://localhost:3000/
// Shows app overview, key stats, feature highlights, and navigation
// ============================================================

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
      <div className="text-center px-4">
        
        {/* Hero Section */}
        <div className="text-6xl mb-6">✈️</div>
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
          FlightPro Manager
        </h1>
        <p className="text-slate-400 text-lg md:text-xl mb-8 max-w-2xl">
          Complete Flight Training Organization Management System
        </p>
        
        {/* Navigation Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a 
            href="/dashboard" 
            className="px-8 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-lg font-semibold min-w-[200px] text-center"
          >
            🛩️ Dashboard
          </a>
          <a 
            href="/dashboard/schedule" 
            className="px-8 py-4 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition text-lg font-semibold min-w-[200px] text-center"
          >
            📅 Schedule
          </a>
          <a 
            href="/login" 
            className="px-8 py-4 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-lg font-semibold min-w-[200px] text-center"
          >
            🔐 Login
          </a>
        </div>
        
        {/* Quick Stats */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
          <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-xl border border-slate-700">
            <p className="text-slate-400 text-sm">Active Aircraft</p>
            <p className="text-3xl font-bold text-blue-400 mt-2">5/7</p>
            <p className="text-xs text-green-400 mt-1">● Operational</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-xl border border-slate-700">
            <p className="text-slate-400 text-sm">Today's Flights</p>
            <p className="text-3xl font-bold text-green-400 mt-2">12</p>
            <p className="text-xs text-slate-400 mt-1">3 In Progress</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-xl border border-slate-700">
            <p className="text-slate-400 text-sm">Students Flying</p>
            <p className="text-3xl font-bold text-purple-400 mt-2">3</p>
            <p className="text-xs text-slate-400 mt-1">8 Scheduled Today</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-xl border border-slate-700">
            <p className="text-slate-400 text-sm">Fuel Available</p>
            <p className="text-3xl font-bold text-orange-400 mt-2">607L</p>
            <p className="text-xs text-yellow-400 mt-1">⚠ 2 Aircraft Low</p>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto text-left">
          <div className="bg-slate-800/30 p-6 rounded-xl border border-slate-700/50">
            <div className="text-3xl mb-3">📊</div>
            <h3 className="text-white font-semibold mb-2">Schedule Management</h3>
            <p className="text-slate-400 text-sm">Visual Gantt chart with aircraft, instructor, and student allocation. Conflict detection and weather integration.</p>
          </div>
          <div className="bg-slate-800/30 p-6 rounded-xl border border-slate-700/50">
            <div className="text-3xl mb-3">⛽</div>
            <h3 className="text-white font-semibold mb-2">Fuel Planning</h3>
            <p className="text-slate-400 text-sm">Track consumption, predict needs, manage costs. Low fuel alerts and bulk order optimization.</p>
          </div>
          <div className="bg-slate-800/30 p-6 rounded-xl border border-slate-700/50">
            <div className="text-3xl mb-3">📝</div>
            <h3 className="text-white font-semibold mb-2">Digital Logbook</h3>
            <p className="text-slate-400 text-sm">Student flight records, progress tracking, endorsements. Export to PDF for CAA/DGCA compliance.</p>
          </div>
        </div>
        
      </div>
    </main>
  );
}