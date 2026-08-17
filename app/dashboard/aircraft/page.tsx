// app/dashboard/aircraft/page.tsx
'use client';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import { useSetHeader } from '@/components/ui/HeaderContext';
import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import { Aircraft } from '@/types';
import AircraftCard from '@/components/aircraft/AircraftCard';
import AircraftFormModal from '@/components/aircraft/AircraftFormModal';
import RoleGate from '@/components/ui/RoleGate';
import { Plus, Search, Plane } from 'lucide-react';

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

  useSetHeader({
    title: 'Aircraft Fleet',
    subtitle: 'Manage your aircraft',
    action: (
      <button
        onClick={handleAdd}
        className="px-4 py-2 rounded-lg transition cursor-pointer font-semibold text-sm flex items-center gap-1.5"
        style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
      >
        <Plus className="w-4 h-4" /> Add Aircraft
      </button>
    ),
  });

  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={['admin', 'instructor', 'super_admin']}>
        <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loadingAircraft ? (
          <div className="text-center py-20">
            <p className="text-secondary text-lg">Loading aircraft...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
              {[
                { label: 'Total', value: stats.total, color: 'var(--text-primary)' },
                { label: 'Active', value: stats.active, color: 'var(--success)' },
                { label: 'Maintenance', value: stats.maintenance, color: 'var(--warning-text)' },
                { label: 'Grounded', value: stats.grounded, color: 'var(--danger)' },
                { label: 'Fuel', value: `${stats.totalFuel}L`, color: 'var(--accent)' },
                { label: 'Capacity', value: `${stats.totalCapacity}L`, color: 'var(--accent-strong)' },
              ].map((stat, i) => (
                <div key={i} className="surface-inner p-3 text-center">
                  <p className="text-xs text-tertiary">{stat.label}</p>
                  <p className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-tertiary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by registration, model, or type..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full surface-inner rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="surface-inner rounded-lg px-4 py-2 focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="GROUNDED">Grounded</option>
              </select>
            </div>

            {filteredAircraft.length === 0 ? (
              <div className="text-center py-20">
                <Plane className="w-10 h-10 text-tertiary mx-auto mb-4" />
                <p className="text-secondary text-lg">No aircraft found</p>
                <p className="text-tertiary text-sm mt-2">Try adjusting your search or add a new aircraft</p>
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
  </RoleGate>
</ProtectedRoute>
  );
}
