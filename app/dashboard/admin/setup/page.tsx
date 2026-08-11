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
import Header from '@/components/ui/Header';
import TrainingProgramsTab from './TrainingProgramsTab';
import SortieTypesTab from './SortieTypesTab';
import ExercisesTab from './ExercisesTab';
import RequirementsTab from './RequirementsTab';
import RolesTab from './RolesTab';
import SettingsTab from './SettingsTab';
import AircraftSetupTab from './AircraftSetupTab';
import UserManagementTab from './UserManagementTab';
import GroundSchoolTab from './GroundSchoolTab';

// ============================================================
// TAB CONFIGURATION
// ============================================================
const TABS = [
  { id: 'programs', label: '📚 Training Programs', component: TrainingProgramsTab },
  { id: 'aircraft', label: '🛩️ Aircraft Fleet', component: AircraftSetupTab },
  { id: 'sorties', label: '🎯 Sortie Types', component: SortieTypesTab },
  { id: 'exercises', label: '📋 Exercises', component: ExercisesTab },
  { id: 'requirements', label: '✅ Requirements', component: RequirementsTab },
  { id: 'roles', label: '👨‍🏫 Instructor Roles', component: RolesTab },
  { id: 'users', label: '👥 User Management', component: UserManagementTab },
  { id: 'settings', label: '⚙️ FTO Settings', component: SettingsTab },
  { id: 'groundschool', label: '🏫 Ground School', component: GroundSchoolTab },
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
  }, [activeTab]);

  // Calculate progress percentage
  const progressPercent = Math.round((completedTabs.length / TABS.length) * 100);

  // Get progress color based on percentage
  const getProgressColor = (percent: number): string => {
    if (percent >= 100) return 'bg-green-500';
    if (percent >= 66) return 'bg-blue-500';
    if (percent >= 33) return 'bg-yellow-500';
    return 'bg-orange-500';
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

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['super_admin']}>
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
          <Header
            title="🔧 Flight School Setup Wizard"
            subtitle="Configure your FTO settings"
            backUrl="/dashboard"
          />

          <div className="max-w-7xl mx-auto px-4 py-6">

            {/* ============================================================ */}
            {/* SETUP PROGRESS BAR */}
            {/* ============================================================ */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-white">📊 Setup Progress</h3>
                <span className="text-sm text-slate-400 font-medium">{progressPercent}% Complete</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-700 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${getProgressColor(progressPercent)}`}
                  style={{ width: `${progressPercent}%` }}
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
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                          isActive
                            ? 'bg-blue-500 text-white'
                            : isCompleted
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-slate-700 text-slate-500'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold">
                          {isCompleted ? '✓' : index + 1}
                        </span>
                        <span className="hidden sm:inline">{tab.label.split(' ')[1] || tab.label}</span>
                      </button>
                      {/* Arrow between steps */}
                      {index < TABS.length - 1 && (
                        <span className="text-slate-600 mx-1">→</span>
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
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg text-sm transition ${
                    activeTab === tab.id
                      ? 'bg-blue-500 text-white font-medium'
                      : completedTabs.includes(tab.id)
                      ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                      : 'bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700'
                  }`}
                >
                  {completedTabs.includes(tab.id) && '✅ '}
                  {tab.label}
                </button>
              ))}
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
            <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              {/* Back Button — hidden on first tab */}
              {isFirstTab ? (
                <div /> // Empty placeholder to keep Next button right-aligned
              ) : (
                <button
                  onClick={goToPrevTab}
                  className="flex items-center space-x-2 px-5 py-2.5 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-600 transition"
                >
                  <span>←</span>
                  <span>Back: {TABS[currentIndex - 1]?.label}</span>
                </button>
              )}

              {/* Progress indicator between buttons */}
              <span className="text-xs text-slate-500">
                Step {currentIndex + 1} of {TABS.length}
              </span>

              {/* Next / Finish Button */}
              {isLastTab ? (
                <button
                  onClick={() => window.location.href = '/dashboard'}
                  className="flex items-center space-x-2 px-5 py-2.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition"
                >
                  <span>✅ Finish Setup</span>
                </button>
              ) : (
                <button
                  onClick={goToNextTab}
                  className="flex items-center space-x-2 px-5 py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition"
                >
                  <span>Next: {TABS[currentIndex + 1]?.label}</span>
                  <span>→</span>
                </button>
              )}
            </div>

          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}