// ============================================================
// app/page.tsx - LANDING PAGE
// ============================================================
// Purpose: The first page visitors see. Shows app overview,
//          key stats, feature highlights, and navigation.
//          This is a SERVER COMPONENT (no state needed).
// ============================================================

export default function Home() {
  return (
    // Full-screen dark gradient background, centered content
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
      <div className="text-center px-4">
        
        {/* ----- Hero Section ----- */}
        <div className="text-6xl mb-6">✈️</div>
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
          FlightPro Manager
        </h1>
        <p className="text-slate-400 text-lg md:text-xl mb-8 max-w-2xl">
          Complete Flight Training Organization Management System
        </p>
        
        {/* ----- Call-to-Action Buttons ----- */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {/* Primary CTA: Go to Dashboard */}
          <a 
            href="/dashboard" 
            className="px-8 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-lg font-semibold"
          >
            🛩️ Go to Dashboard
          </a>
          {/* Secondary CTA: View Schedule */}
          <a 
            href="/dashboard/schedule" 
            className="px-8 py-4 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition text-lg font-semibold"
          >
            📅 View Schedule
          </a>
        </div>
        
        {/* ----- Quick Stats Cards ----- */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {[
            // Each stat card: label, value, color, subtext
            { label: 'Active Aircraft', value: '5/7', color: 'text-blue-400', sub: '● Operational', subColor: 'text-green-400' },
            { label: "Today's Flights", value: '12', color: 'text-green-400', sub: '3 In Progress', subColor: 'text-slate-400' },
            { label: 'Students Flying', value: '3', color: 'text-purple-400', sub: '8 Scheduled Today', subColor: 'text-slate-400' },
            { label: 'Fuel Available', value: '607L', color: 'text-orange-400', sub: '⚠ 2 Aircraft Low', subColor: 'text-yellow-400' },
          ].map((stat, i) => (
            <div key={i} className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-xl border border-slate-700">
              <p className="text-slate-400 text-sm">{stat.label}</p>
              <p className={`text-3xl font-bold ${stat.color} mt-2`}>{stat.value}</p>
              <p className={`text-xs ${stat.subColor} mt-1`}>{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* ----- Feature Highlights ----- */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto text-left">
          {[
            {
              icon: '📊',
              title: 'Schedule Management',
              description: 'Visual Gantt chart with aircraft, instructor, and student allocation. Conflict detection and weather integration.',
            },
            {
              icon: '⛽',
              title: 'Fuel Planning',
              description: 'Track consumption, predict needs, manage costs. Low fuel alerts and bulk order optimization.',
            },
            {
              icon: '📝',
              title: 'Digital Logbook',
              description: 'Student flight records, progress tracking, endorsements. Export to PDF for CAA/DGCA compliance.',
            },
          ].map((feature, i) => (
            <div key={i} className="bg-slate-800/30 p-6 rounded-xl border border-slate-700/50">
              <div className="text-3xl mb-3">{feature.icon}</div>
              <h3 className="text-white font-semibold mb-2">{feature.title}</h3>
              <p className="text-slate-400 text-sm">{feature.description}</p>
            </div>
          ))}
        </div>
        
      </div>
    </main>
  );
}