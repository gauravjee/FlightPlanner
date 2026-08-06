'use client';

// app/dashboard/admin/setup/page.tsx
// Super Admin Setup Wizard - Main Hub
// Only accessible to super_admin role

import { useState } from 'react';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import RoleGate from '@/components/ui/RoleGate';
import Header from '@/components/ui/Header';
import TrainingProgramsTab from './TrainingProgramsTab';
import SortieTypesTab from './SortieTypesTab';
import ExercisesTab from './ExercisesTab';
import RequirementsTab from './RequirementsTab';
import RolesTab from './RolesTab';
import SettingsTab from './SettingsTab';

const TABS = [
  { id: 'programs', label: '📚 Training Programs', component: TrainingProgramsTab },
  { id: 'sorties', label: '🎯 Sortie Types', component: SortieTypesTab },
  { id: 'exercises', label: '📋 Exercises', component: ExercisesTab },
  { id: 'requirements', label: '✅ Requirements', component: RequirementsTab },
  { id: 'roles', label: '👨‍🏫 Instructor Roles', component: RolesTab },
  { id: 'settings', label: '⚙️ FTO Settings', component: SettingsTab },
];

export default function SetupWizardPage() {
  const [activeTab, setActiveTab] = useState('programs');

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
            <div className="flex flex-wrap gap-2 mb-6">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg text-sm transition ${
                    activeTab === tab.id
                      ? 'bg-blue-500 text-white font-medium'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {ActiveComponent && <ActiveComponent />}
          </div>
        </main>
      </RoleGate>
    </ProtectedRoute>
  );
}