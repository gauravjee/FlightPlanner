// app/dashboard/admin/setup/page.tsx
// Super Admin Setup Wizard - Main Hub
// Only accessible to super_admin role
//
// 🔧 WIZARD NAVIGATION (2026-08-11):
//   - Added Back/Next buttons below each tab's content
//   - First tab hides the Back button, last tab shows "Finish" instead of Next
//   - Clicking Next/Back auto-selects the adjacent tab
//   - Tab completion is still tracked by visiting each tab

'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import { useSetHeader } from '@/components/ui/HeaderContext';
import TrainingProgramsTab from './TrainingProgramsTab';
import SortieTypesTab from './SortieTypesTab';
import ExercisesTab from './ExercisesTab';
import RequirementsTab from './RequirementsTab';
import RolesTab from './RolesTab';
import SettingsTab from './SettingsTab';
import AircraftSetupTab from './AircraftSetupTab';
import UserManagementTab from './UserManagementTab';
import GroundSchoolTab from './GroundSchoolTab';
import HolidaysTab from './HolidaysTab';
import {
  BookOpen, Plane, Target, ClipboardList, CircleCheck,
  GraduationCap, Users, Settings, School, CalendarDays,
  ChevronLeft, ChevronRight, BarChart3,
} from 'lucide-react';

// ============================================================
// TAB CONFIGURATION
// Each tab keeps an explicit `shortLabel` (used in the compact step
// indicator) alongside the full `label` — previously the short form was
// derived by splitting the emoji-prefixed label string on spaces
// (`label.split(' ')[1]`); now that the icon is a real component instead
// of a text-embedded emoji, that trick no longer applies, so the exact
// same short-label text each tab produced before is spelled out here.
// ============================================================
const TABS = [
  { id: 'programs', label: 'Training Programs', shortLabel: 'Training', icon: BookOpen, component: TrainingProgramsTab },
  { id: 'aircraft', label: 'Aircraft Fleet', shortLabel: 'Aircraft', icon: Plane, component: AircraftSetupTab },
  { id: 'sorties', label: 'Sortie Types', shortLabel: 'Sortie', icon: Target, component: SortieTypesTab },
  { id: 'exercises', label: 'Exercises', shortLabel: 'Exercises', icon: ClipboardList, component: ExercisesTab },
  // Label expanded 2026-08-19 (was just "Requirements") — this tab is where
  // blocking rules like Solo Release actually get configured and synced to
  // students, but nothing about the plain "Requirements" label signals
  // that; a user looking for it went to the Exercises tab first instead.
  // shortLabel stays short for the compact step indicator.
  { id: 'requirements', label: 'Requirements & Solo Release', shortLabel: 'Requirements', icon: CircleCheck, component: RequirementsTab },
  { id: 'roles', label: 'Instructor Roles', shortLabel: 'Instructor', icon: GraduationCap, component: RolesTab },
  { id: 'users', label: 'User Management', shortLabel: 'User', icon: Users, component: UserManagementTab },
  { id: 'settings', label: 'FTO Settings', shortLabel: 'FTO', icon: Settings, component: SettingsTab },
  { id: 'groundschool', label: 'Ground School', shortLabel: 'Ground', icon: School, component: GroundSchoolTab },
  { id: 'holidays', label: 'Holiday Calendar', shortLabel: 'Holidays', icon: CalendarDays, component: HolidaysTab },
];

export default function SetupWizardPage() {
  const [activeTab, setActiveTab] = useState('programs');

  // Track which tabs have been visited (completed)
  const [completedTabs, setCompletedTabs] = useState<string[]>([]);

  // Mark current tab as completed when it changes
  useEffect(() => {
    if (!completedTabs.includes(activeTab)) {
      setCompletedTabs(prev => [...prev, activeTab]);
    }
  }, [activeTab, completedTabs]);

  // Calculate progress percentage
  const progressPercent = Math.round((completedTabs.length / TABS.length) * 100);

  // Get progress color based on percentage
  const getProgressColor = (percent: number): string => {
    if (percent >= 100) return 'var(--success)';
    if (percent >= 66) return 'var(--accent)';
    if (percent >= 33) return 'var(--warning-text)';
    return 'var(--warning)';
  };

  // ============================================================
  // WIZARD NAVIGATION HELPERS
  // ============================================================
  const currentIndex = TABS.findIndex(t => t.id === activeTab);
  const isFirstTab = currentIndex === 0;
  const isLastTab = currentIndex === TABS.length - 1;

  /**
   * Go to the previous tab in the sequence.
   */
  const goToPrevTab = () => {
    if (!isFirstTab) {
      setActiveTab(TABS[currentIndex - 1].id);
    }
  };

  /**
   * Go to the next tab in the sequence.
   */
  const goToNextTab = () => {
    if (!isLastTab) {
      setActiveTab(TABS[currentIndex + 1].id);
    }
  };

  // Get the active component
  const ActiveComponent = TABS.find(t => t.id === activeTab)?.component;

  useSetHeader({
    title: 'Flight School Setup Wizard',
    subtitle: 'Configure your FTO settings',
    backUrl: '/dashboard',
  });

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['super_admin']}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="max-w-7xl mx-auto px-4 py-6">

            {/* ============================================================ */}
            {/* SETUP PROGRESS BAR */}
            {/* ============================================================ */}
            <div className="surface-card p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-secondary" /> Setup Progress
                </h3>
                <span className="text-sm text-secondary font-medium">{progressPercent}% Complete</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full rounded-full h-2.5" style={{ backgroundColor: 'var(--border)' }}>
                <div
                  className="h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%`, backgroundColor: getProgressColor(progressPercent) }}
                />
              </div>

              {/* Step Indicators (compact circles with arrows) */}
              <div className="flex flex-wrap gap-1 mt-3">
                {TABS.map((tab, index) => {
                  const isCompleted = completedTabs.includes(tab.id);
                  const isActive = activeTab === tab.id;
                  return (
                    <div key={tab.id} className="flex items-center">
                      {/* Step Circle */}
                      <button
                        onClick={() => setActiveTab(tab.id)}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium transition"
                        style={
                          isActive
                            ? { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }
                            : isCompleted
                            ? { backgroundColor: 'var(--success-soft)', color: 'var(--success)' }
                            : { backgroundColor: 'var(--surface-muted)', color: 'var(--text-tertiary)' }
                        }
                      >
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold">
                          {isCompleted ? <CircleCheck className="w-3.5 h-3.5" /> : index + 1}
                        </span>
                        <span className="hidden sm:inline">{tab.shortLabel}</span>
                      </button>
                      {/* Arrow between steps */}
                      {index < TABS.length - 1 && (
                        <span className="text-tertiary mx-1">
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ============================================================ */}
            {/* TAB NAVIGATION (full labels for larger screens) */}
            {/* ============================================================ */}
            <div className="flex flex-wrap gap-2 mb-6">
              {TABS.map(tab => {
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5"
                    style={
                      activeTab === tab.id
                        ? { backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a', fontWeight: 500 }
                        : completedTabs.includes(tab.id)
                        ? { backgroundColor: 'var(--success-soft)', color: 'var(--success)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' }
                        : { backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
                    }
                  >
                    {completedTabs.includes(tab.id) ? <CircleCheck className="w-3.5 h-3.5" /> : <TabIcon className="w-3.5 h-3.5" />}
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* ============================================================ */}
            {/* ACTIVE TAB CONTENT */}
            {/* ============================================================ */}
            <div className="mb-6">
              {ActiveComponent && <ActiveComponent />}
            </div>

            {/* ============================================================ */}
            {/* 🔧 WIZARD NAVIGATION — Back / Next Buttons */}
            {/* ============================================================ */}
            <div className="flex items-center justify-between surface-card p-4">
              {/* Back Button — hidden on first tab */}
              {isFirstTab ? (
                <div /> // Empty placeholder to keep Next button right-aligned
              ) : (
                <button
                  onClick={goToPrevTab}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-lg text-sm font-medium transition surface-inner"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back: {TABS[currentIndex - 1]?.label}</span>
                </button>
              )}

              {/* Progress indicator between buttons */}
              <span className="text-xs text-tertiary">
                Step {currentIndex + 1} of {TABS.length}
              </span>

              {/* Next / Finish Button */}
              {isLastTab ? (
                <button
                  onClick={() => window.location.href = '/dashboard'}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-lg text-sm font-medium transition"
                  style={{ backgroundColor: 'var(--success)', color: '#ffffff' }}
                >
                  <CircleCheck className="w-4 h-4" />
                  <span>Finish Setup</span>
                </button>
              ) : (
                <button
                  onClick={goToNextTab}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-lg text-sm font-medium transition"
                  style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
                >
                  <span>Next: {TABS[currentIndex + 1]?.label}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}
