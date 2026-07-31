// app/dashboard/schedule/page.tsx
'use client';
import ScheduleBoard from '@/components/schedule/ScheduleBoard';
import Link from 'next/link';

export default function SchedulePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="text-slate-400 hover:text-white transition">
                ← Back to Dashboard
              </Link>
              <div className="flex items-center space-x-3">
                <span className="text-2xl">✈️</span>
                <div>
                  <h1 className="text-xl font-bold text-white">Flight Schedule</h1>
                  <p className="text-xs text-slate-400">Operations Board - Gantt View</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <ScheduleBoard />
      </div>
    </main>
  );
}