// app/dashboard/reports/page.tsx
// Reports landing page (2026-08-18) — the new Reports section, built
// against the DGCA report set the FTO listed: flying logs, maintenance
// logs, breath analyser test reports, incident reports. Only the Daily
// Flying Report is live so far — everything else is listed as a
// placeholder so the section reads as a real roadmap, not something that
// silently vanishes until it's built.

'use client';

import Link from 'next/link';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { REPORTS_VIEW_ROLES } from '@/lib/permissions';
import { ClipboardList, Wrench, Wind, TriangleAlert, ArrowRight, BookOpen } from 'lucide-react';

const REPORT_CARDS = [
  {
    href: '/dashboard/reports/daily-flying',
    icon: ClipboardList,
    title: 'Daily Flying Report',
    description: "Per-day flight log (Aircraft/Student/Instructor/Sortie/Hours) plus day-level totals — hours flown, cancellations, aircraft grounded, safety incidents.",
    status: 'live' as const,
  },
  {
    href: '/dashboard/reports/daily-flying',
    icon: TriangleAlert,
    title: 'Safety Incident Log',
    description: 'Log a safety incident from the Daily Flying Report page — feeds this report\'s incident count today; the full DGCA-format Incident Report is a separate, larger piece not yet built.',
    status: 'live' as const,
  },
  {
    icon: BookOpen,
    title: 'Student Flying / Training Log',
    description: "Per-student cumulative flight log for license-application/DGCA-audit purposes — chronological flight history with hour-category breakdowns.",
    status: 'planned' as const,
  },
  {
    icon: Wrench,
    title: 'Maintenance Log',
    description: 'Aircraft maintenance/work record (CA Form 19-10 style) — not yet built.',
    status: 'planned' as const,
  },
  {
    href: '/dashboard/reports/breath-analyser',
    icon: Wind,
    title: 'Breath Analyser Register',
    description: 'Pre-flight breath analyser test log per CAR Section 5, Series F, Part III — Aircraft, Safety Officer, Student/Instructor, License Number, BA Time/Percentage/Equipment.',
    status: 'live' as const,
  },
  {
    icon: TriangleAlert,
    title: 'DGCA Incident Report',
    description: "The full DGCA-format report — not yet built; needs the actual prescribed format confirmed before building.",
    status: 'planned' as const,
  },
];

export default function ReportsPage() {
  useSetHeader({
    title: 'Reports',
    subtitle: 'DGCA-facing compliance & operations reports',
  });

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={REPORTS_VIEW_ROLES}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-5xl mx-auto px-4 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {REPORT_CARDS.map((card, i) => {
                const Icon = card.icon;
                const body = (
                  <div className="surface-card p-5 h-full flex flex-col transition-all hover:opacity-90">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-soft)' }}>
                        <Icon className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                      </div>
                      {card.status === 'live' ? (
                        <span className="badge badge-success">Available</span>
                      ) : (
                        <span className="badge badge-neutral">Coming soon</span>
                      )}
                    </div>
                    <h3 className="text-base font-bold mb-1.5">{card.title}</h3>
                    <p className="text-sm text-secondary flex-1">{card.description}</p>
                    {card.href && (
                      <div className="mt-3 flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--accent)' }}>
                        Open <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                );
                return card.href ? (
                  <Link key={i} href={card.href}>{body}</Link>
                ) : (
                  <div key={i}>{body}</div>
                );
              })}
            </div>
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
