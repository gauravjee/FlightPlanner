// app/dashboard/aircraft/page.tsx
'use client';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import Header from '@/components/ui/Header';
import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import { Aircraft } from '@/types';
import AircraftCard from '@/components/aircraft/AircraftCard';
import AircraftFormModal from '@/components/aircraft/AircraftFormModal';
import Link from 'next/link';

export default function AircraftPage() {
  const { aircraft, loadingAircraft, loadAircraft, addAircraft, updateAircraft, removeAircraft } = useFlightStore();
  const [showForm, setShowForm] = useState(false);
  const [editingAircraft, setEditingAircraft] = useState<Aircraft | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    loadAircraft();
  }, [loadAircraft]);

  const filteredAircraft = aircraft.filter(ac => {
    const matchesSearch = ac.registration.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          ac.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          ac.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || ac.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: aircraft.length,
    active: aircraft.filter(a => a.status === 'ACTIVE').length,
    maintenance: aircraft.filter(a => a.status === 'MAINTENANCE').length,
    grounded: aircraft.filter(a => a.status === 'GROUNDED').length,
    totalFuel: aircraft.reduce((sum, a) => sum + a.currentFuel, 0),
    totalCapacity: aircraft.reduce((sum, a) => sum + a.fuelCapacity, 0),
  };

  const handleAdd = () => {
    setEditingAircraft(null);
    setShowForm(true);
  };

  const handleEdit = (ac: Aircraft) => {
    setEditingAircraft(ac);
    setShowForm(true);
  };

  const handleSave = (ac: Aircraft) => {
    if (editingAircraft) {
      updateAircraft(ac.id, ac);
    } else {
      addAircraft(ac);
    }
    setShowForm(false);
    setEditingAircraft(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to remove this aircraft?')) {
      removeAircraft(id);
    }
  };

  return (
    <ProtectedRoute>
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
<Header 
  title="Aircraft Fleet" 
  subtitle="Manage your aircraft" 
  action={
    <button onClick={handleAdd} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer font-bold">
      ➕ Add Aircraft
    </button>
  }
/>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-20">
            <p className="text-slate-400 text-lg">Loading aircraft...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
              {[
                { label: 'Total', value: stats.total, color: 'text-white' },
                { label: 'Active', value: stats.active, color: 'text-green-400' },
                { label: 'Maintenance', value: stats.maintenance, color: 'text-yellow-400' },
                { label: 'Grounded', value: stats.grounded, color: 'text-red-400' },
                { label: 'Fuel', value: `${stats.totalFuel}L`, color: 'text-blue-400' },
                { label: 'Capacity', value: `${stats.totalCapacity}L`, color: 'text-purple-400' },
              ].map((stat, i) => (
                <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400">{stat.label}</p>
                  <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <input
                type="text"
                placeholder="🔍 Search by registration, model, or type..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="GROUNDED">Grounded</option>
              </select>
            </div>

            {filteredAircraft.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-6xl mb-4">🛩️</p>
                <p className="text-slate-400 text-lg">No aircraft found</p>
                <p className="text-slate-500 text-sm mt-2">Try adjusting your search or add a new aircraft</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAircraft.map(ac => (
                  <AircraftCard
                    key={ac.id}
                    aircraft={ac}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showForm && (
        <AircraftFormModal
          aircraft={editingAircraft}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false);
            setEditingAircraft(null);
          }}
        />
      )}
    </main>
    </ProtectedRoute>
  );
}