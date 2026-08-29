// app/dashboard/fuel/page.tsx
'use client';
import { useSetHeader } from '@/components/ui/HeaderContext';
import ProtectedRoute from '@/components/ui/ProtectedRoute';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useAircraft } from '@/lib/hooks/useAircraft';
import { useFuelRecords } from '@/lib/hooks/useFuelRecords';
import FuelLogForm from '@/components/fuel/FuelLogForm';
import RoleGate from '@/components/ui/RoleGate';
import { FUEL_VIEW_ROLES, canWriteModule } from '@/lib/permissions';
import { useMyPermissionOverrides } from '@/lib/useMyPermissionOverrides';
import { Fuel, Plane, ClipboardList, Eye } from 'lucide-react';

export default function FuelPage() {
  const { data: session } = useSession();
  const overrides = useMyPermissionOverrides();
  // maintenance keeps full read/write here by default; instructor/
  // operations are view-only (2026-08-17 role/tab matrix) unless a
  // super_admin has granted a per-user override. Server-side enforcement
  // lives in app/api/fuel-records/route.ts (requireModuleAccess('fuel')).
  const canWrite = canWriteModule(session?.user?.role, overrides, 'fuel');
  const { aircraft } = useAircraft();
  const { fuelRecords, isLoading: loadingFuel } = useFuelRecords();
  const [showForm, setShowForm] = useState(false);

  const totalFuelAdded = fuelRecords.reduce((sum, r) => sum + r.fuelAddedLiters, 0);
  const totalCost = fuelRecords.reduce((sum, r) => sum + r.totalCost, 0);
  const avgCost = totalFuelAdded > 0 ? totalCost / totalFuelAdded : 0;
  const totalCurrentFuel = aircraft.reduce((sum, a) => sum + a.currentFuel, 0);

  useSetHeader({
    title: 'Fuel Management',
    subtitle: 'Track refueling & consumption',
    action: canWrite ? (
      <button
        onClick={() => setShowForm(true)}
        className="px-4 py-2 rounded-lg transition cursor-pointer font-semibold text-sm flex items-center gap-1.5"
        style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
      >
        <Fuel className="w-4 h-4" /> Log Refueling
      </button>
    ) : (
      <span className="px-3 py-2 surface-inner text-tertiary rounded-lg text-xs flex items-center gap-1.5">
        <Eye className="w-3.5 h-3.5" /> View only
      </span>
    ),
  });

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={FUEL_VIEW_ROLES} moduleKey="fuel">
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Current Fuel', value: `${totalCurrentFuel}L`, color: 'var(--accent)' },
            { label: 'Total Refueled', value: `${totalFuelAdded}L`, color: 'var(--success)' },
            { label: 'Total Cost', value: `₹${totalCost.toLocaleString('en-IN')}`, color: 'var(--warning-text)' },
            { label: 'Avg Cost', value: `₹${avgCost.toFixed(2)}/L`, color: 'var(--accent-strong)' },
          ].map((stat, i) => (
            <div key={i} className="surface-inner p-4">
              <p className="text-xs text-tertiary">{stat.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: stat.color }}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="surface-card p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Plane className="w-4 h-4 text-secondary" /> Fleet Fuel Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aircraft.map(ac => {
              const pct = ac.fuelCapacity > 0 ? (ac.currentFuel / ac.fuelCapacity) * 100 : 0;
              const fuelColor = pct < 30 ? 'var(--danger)' : pct < 60 ? 'var(--warning-text)' : 'var(--success)';
              return (
                <div key={ac.id} className="surface-inner p-4">
                  <div className="flex justify-between mb-2">
                    <span className="font-medium">{ac.registration} ({ac.type})</span>
                    <span className="text-sm font-bold" style={{ color: fuelColor }}>
                      {ac.currentFuel}L / {ac.fuelCapacity}L
                    </span>
                  </div>
                  <div className="w-full rounded-full h-3" style={{ backgroundColor: 'var(--border)' }}>
                    <div className="h-3 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: fuelColor }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="surface-card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-secondary" /> Refueling History
          </h2>
          {loadingFuel ? (
            <p className="text-secondary text-center py-8">Loading...</p>
          ) : fuelRecords.length === 0 ? (
            <p className="text-secondary text-center py-8">No records yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-tertiary border-b" style={{ borderColor: 'var(--border)' }}>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Aircraft</th>
                    <th className="pb-3">Added</th>
                    <th className="pb-3">Cost/L</th>
                    <th className="pb-3">Total</th>
                    <th className="pb-3">Level Change</th>
                    <th className="pb-3">By</th>
                  </tr>
                </thead>
                <tbody className="text-secondary">
                  {fuelRecords.map(record => (
                    <tr key={record.id} className="border-b" style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                      <td className="py-3 text-xs" style={{ color: 'var(--text-primary)' }}>
                        {new Date(record.refuelingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 text-xs" style={{ color: 'var(--text-primary)' }}>{record.aircraftReg}</td>
                      <td className="py-3 font-medium" style={{ color: 'var(--success)' }}>{record.fuelAddedLiters}L</td>
                      <td className="py-3 text-xs">₹{record.fuelCostPerLiter}</td>
                      <td className="py-3 font-medium" style={{ color: 'var(--warning-text)' }}>₹{record.totalCost.toLocaleString('en-IN')}</td>
                      <td className="py-3 text-xs">{record.fuelLevelBefore}L → {record.fuelLevelAfter}L</td>
                      <td className="py-3 text-xs text-tertiary">{record.refueledBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showForm && <FuelLogForm onClose={() => setShowForm(false)} />}
    </main>
    </RoleGate>
    </ProtectedRoute>
  );
}
