// app/dashboard/admin/setup/AircraftSetupTab.tsx
// Quick aircraft fleet setup for new FTO installations
// Add multiple aircraft with registration, type, fuel capacity

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';

// ============================================================
// TYPE DEFINITIONS
// ============================================================
interface Aircraft {
  id: number;
  registration: string;
  type: string;
  model: string;
  year: number;
  hobbs_time: number;
  fuel_capacity: number;
  current_fuel: number;
  status: string;
  next_maintenance: string;
}

// Common aircraft types for quick selection
const AIRCRAFT_TYPES = [
  'C172S', 'C172R', 'C152', 'C182',
  'PA28', 'PA44', 'DA40', 'DA42',
  'SR20', 'SR22', 'BE76', 'BE58',
];

export default function AircraftSetupTab() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Aircraft | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Form state for adding/editing
  const [form, setForm] = useState({
    registration: '',
    type: 'C172S',
    model: '',
    year: new Date().getFullYear(),
    hobbs_time: 0,
    fuel_capacity: 200,
    current_fuel: 200,
    status: 'ACTIVE',
    next_maintenance: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  // Load aircraft on mount
  useEffect(() => {
    loadAircraft();
  }, []);

  const loadAircraft = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('aircraft')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('Error loading aircraft:', error.message);
    } else {
      setAircraft(data || []);
    }
    setLoading(false);
  };

  // Add or update aircraft
  const handleSave = async () => {
    if (!form.registration) {
      alert('Please enter a registration number.');
      return;
    }

    // Check for duplicate registration
    const exists = aircraft.find(
      a => a.registration.toUpperCase() === form.registration.toUpperCase() && 
      (editing ? a.id !== editing.id : true)
    );
    if (exists) {
      alert('An aircraft with this registration already exists!');
      return;
    }

    if (editing) {
      await supabase.from('aircraft').update({
        registration: form.registration.toUpperCase(),
        type: form.type,
        model: form.model,
        year: form.year,
        hobbs_time: form.hobbs_time,
        fuel_capacity: form.fuel_capacity,
        current_fuel: form.current_fuel,
        status: form.status,
        next_maintenance: form.next_maintenance,
      }).eq('id', editing.id);
      setSuccessMessage('✅ Aircraft updated!');
    } else {
      await supabase.from('aircraft').insert({
        registration: form.registration.toUpperCase(),
        type: form.type,
        model: form.model,
        year: form.year,
        hobbs_time: form.hobbs_time,
        fuel_capacity: form.fuel_capacity,
        current_fuel: form.current_fuel,
        status: form.status,
        next_maintenance: form.next_maintenance,
      });
      setSuccessMessage('✅ Aircraft added!');
    }

    setTimeout(() => setSuccessMessage(''), 3000);
    setEditing(null);
    resetForm();
    loadAircraft();
  };

  // Edit existing aircraft
  const handleEdit = (ac: Aircraft) => {
    setEditing(ac);
    setForm({
      registration: ac.registration,
      type: ac.type,
      model: ac.model,
      year: ac.year,
      hobbs_time: ac.hobbs_time,
      fuel_capacity: ac.fuel_capacity,
      current_fuel: ac.current_fuel,
      status: ac.status,
      next_maintenance: ac.next_maintenance,
    });
  };

  // Delete aircraft
  const handleDelete = async (id: number) => {
    if (window.confirm('Delete this aircraft? This cannot be undone.')) {
      await supabase.from('aircraft').delete().eq('id', id);
      loadAircraft();
      setSuccessMessage('🗑️ Aircraft removed.');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  // Reset form to defaults
  const resetForm = () => {
    setForm({
      registration: '',
      type: 'C172S',
      model: '',
      year: new Date().getFullYear(),
      hobbs_time: 0,
      fuel_capacity: 200,
      current_fuel: 200,
      status: 'ACTIVE',
      next_maintenance: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
  };

  // Stats
  const activeCount = aircraft.filter(a => a.status === 'ACTIVE').length;
  const maintenanceCount = aircraft.filter(a => a.status === 'MAINTENANCE').length;
  const totalFuel = aircraft.reduce((sum, a) => sum + a.current_fuel, 0);
  const totalCapacity = aircraft.reduce((sum, a) => sum + a.fuel_capacity, 0);

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">🛩️ Aircraft Fleet Setup</h2>
      <p className="text-sm text-slate-400 mb-4">
        Quickly add your aircraft fleet. You can also manage aircraft later from the main Aircraft page.
      </p>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 mb-4">
          <p className="text-sm text-green-400">{successMessage}</p>
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-700/50 rounded-lg p-3 text-center">
          <p className="text-xs text-slate-400">Total Aircraft</p>
          <p className="text-xl font-bold text-white">{aircraft.length}</p>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-3 text-center">
          <p className="text-xs text-slate-400">Active</p>
          <p className="text-xl font-bold text-green-400">{activeCount}</p>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-3 text-center">
          <p className="text-xs text-slate-400">Maintenance</p>
          <p className="text-xl font-bold text-yellow-400">{maintenanceCount}</p>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-3 text-center">
          <p className="text-xs text-slate-400">Total Fuel</p>
          <p className="text-xl font-bold text-blue-400">{totalFuel}L</p>
        </div>
      </div>

      {/* Add/Edit Form */}
      <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-white mb-3">
          {editing ? `✏️ Edit ${editing.registration}` : '➕ Add New Aircraft'}
        </h3>

        {/* Row 1: Registration, Type, Model */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Registration *</label>
            <input
              type="text"
              placeholder="e.g., N123AB"
              value={form.registration}
              onChange={e => setForm(p => ({ ...p, registration: e.target.value.toUpperCase() }))}
              maxLength={10}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Type</label>
            <select
              value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            >
              {AIRCRAFT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Model</label>
            <input
              type="text"
              placeholder="e.g., Cessna 172S Skyhawk"
              value={form.model}
              onChange={e => setForm(p => ({ ...p, model: e.target.value }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        </div>

        {/* Row 2: Year, Fuel Capacity, Current Fuel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Year</label>
            <input
              type="number"
              value={form.year}
              onChange={e => setForm(p => ({ ...p, year: parseInt(e.target.value) || 2024 }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Fuel Capacity (L)</label>
            <input
              type="number"
              value={form.fuel_capacity}
              onChange={e => setForm(p => ({ ...p, fuel_capacity: parseInt(e.target.value) || 0 }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Current Fuel (L)</label>
            <input
              type="number"
              value={form.current_fuel}
              onChange={e => setForm(p => ({ ...p, current_fuel: parseInt(e.target.value) || 0 }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        </div>

        {/* Row 3: Hobbs, Status, Maintenance Date */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Hobbs Time (hrs)</label>
            <input
              type="number"
              step="0.1"
              value={form.hobbs_time}
              onChange={e => setForm(p => ({ ...p, hobbs_time: parseFloat(e.target.value) || 0 }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Status</label>
            <select
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="ACTIVE">Active</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="GROUNDED">Grounded</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Next Maintenance</label>
            <input
              type="date"
              value={form.next_maintenance}
              onChange={e => setForm(p => ({ ...p, next_maintenance: e.target.value }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button onClick={handleSave} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
            {editing ? '💾 Update Aircraft' : '➕ Add Aircraft'}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); resetForm(); }}
              className="px-4 py-2 bg-slate-500 text-white rounded-lg text-sm hover:bg-slate-600">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Aircraft List */}
      {loading ? (
        <p className="text-slate-400 text-center py-4">Loading...</p>
      ) : aircraft.length === 0 ? (
        <div className="text-center py-8">
          <span className="text-4xl">🛩️</span>
          <p className="text-slate-400 mt-2">No aircraft in your fleet yet.</p>
          <p className="text-slate-500 text-sm">Add your first aircraft above.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="pb-3">Reg</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Model</th>
                <th className="pb-3">Year</th>
                <th className="pb-3">Hobbs</th>
                <th className="pb-3">Fuel</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Mx Due</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {aircraft.map(ac => (
                <tr key={ac.id} className="border-b border-slate-700/50">
                  <td className="py-3 text-white font-medium">{ac.registration}</td>
                  <td className="py-3">{ac.type}</td>
                  <td className="py-3 text-xs max-w-[150px] truncate">{ac.model || '—'}</td>
                  <td className="py-3">{ac.year}</td>
                  <td className="py-3">{ac.hobbs_time}h</td>
                  <td className="py-3">{ac.current_fuel}L / {ac.fuel_capacity}L</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      ac.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                      ac.status === 'MAINTENANCE' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {ac.status}
                    </span>
                  </td>
                  <td className="py-3 text-xs">{ac.next_maintenance}</td>
                  <td className="py-3">
                    <button onClick={() => handleEdit(ac)} className="text-blue-400 hover:text-blue-300 mr-2">✏️</button>
                    <button onClick={() => handleDelete(ac.id)} className="text-red-400 hover:text-red-300">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}