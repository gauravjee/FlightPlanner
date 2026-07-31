// app/dashboard/schedule/page.tsx
'use client';
import Header from '@/components/ui/Header';
import ScheduleBoard from '@/components/schedule/ScheduleBoard';
import Link from 'next/link';

export default function SchedulePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Header title="Flight Schedule" subtitle="Operations Board - Gantt View" />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <ScheduleBoard />
      </div>
    </main>
  );
}