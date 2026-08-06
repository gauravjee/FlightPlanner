// app/dashboard/fuel/page.tsx
'use client';
import Header from '@/components/ui/Header';
import ProtectedRoute from '@/components/ui/ProtectedRoute';

import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import FuelLogForm from '@/components/fuel/FuelLogForm';
import Link from 'next/link';
import RoleGate from '@/components/ui/RoleGate';

export default function FuelPage() {
  const { aircraft, fuelRecords, loadingFuel, loadFuelRecords, loadAircraft } = useFlightStore();
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadAircraft();
    loadFuelRecords();
  }, [loadAircraft, loadFuelRecords]);

  const totalFuelAdded = fuelRecords.reduce((sum, r) => sum + r.fuelAddedLiters, 0);
  const totalCost = fuelRecords.reduce((sum, r) => sum + r.totalCost, 0);
  const avgCost = totalFuelAdded > 0 ? totalCost / totalFuelAdded : 0;
  const totalCurrentFuel = aircraft.reduce((sum, a) => sum + a.currentFuel, 0);
  const totalCapacity = aircraft.reduce((sum, a) => sum + a.fuelCapacity, 0);

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['admin', 'instructor', 'super_admin']}>
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Header 
        title="Fuel Management" 
        subtitle="Track refueling & consumption" 
        action={
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition cursor-pointer font-bold">
            ⛽ Log Refueling
          </button>
        }
      />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Current Fuel', value: `${totalCurrentFuel}L`, color: 'text-blue-400' },
            { label: 'Total Refueled', value: `${totalFuelAdded}L`, color: 'text-green-400' },
            { label: 'Total Cost', value: `₹${totalCost.toLocaleString('en-IN')}`, color: 'text-orange-400' },
            { label: 'Avg Cost', value: `₹${avgCost.toFixed(2)}/L`, color: 'text-purple-400' },
          ].map((stat, i) => (
            <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-400">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">🛩️ Fleet Fuel Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aircraft.map(ac => {
              const pct = ac.fuelCapacity > 0 ? (ac.currentFuel / ac.fuelCapacity) * 100 : 0;
              return (
                <div key={ac.id} className="bg-slate-900/50 rounded-lg p-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-white font-medium">{ac.registration} ({ac.type})</span>
                    <span className={`text-sm font-bold ${pct < 30 ? 'text-red-400' : pct < 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {ac.currentFuel}L / {ac.fuelCapacity}L
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-3">
                    <div className={`h-3 rounded-full ${pct < 30 ? 'bg-red-500' : pct < 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">📋 Refueling History</h2>
          {loadingFuel ? (
            <p className="text-slate-400 text-center py-8">Loading...</p>
          ) : fuelRecords.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No records yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Aircraft</th>
                    <th className="pb-3">Added</th>
                    <th className="pb-3">Cost/L</th>
                    <th className="pb-3">Total</th>
                    <th className="pb-3">Level Change</th>
                    <th className="pb-3">By</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {fuelRecords.map(record => (
                    <tr key={record.id} className="border-b border-slate-700/50">
                      <td className="py-3 text-white text-xs">
                        {new Date(record.refuelingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 text-white text-xs">{record.aircraftReg}</td>
                      <td className="py-3 text-green-400 font-medium">{record.fuelAddedLiters}L</td>
                      <td className="py-3 text-xs">₹{record.fuelCostPerLiter}</td>
                      <td className="py-3 text-orange-400 font-medium">₹{record.totalCost.toLocaleString('en-IN')}</td>
                      <td className="py-3 text-xs">{record.fuelLevelBefore}L → {record.fuelLevelAfter}L</td>
                      <td className="py-3 text-xs text-slate-400">{record.refueledBy}</td>
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