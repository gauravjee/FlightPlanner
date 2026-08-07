// components/fuel/FuelLogForm.tsx
// Modal form for logging aircraft refueling operations
// Features:
//   - Auto-calculates fuel level after refueling
//   - Shows current fuel level and capacity
//   - Prevents over-refueling (capacity limit)
//   - Calculates total cost automatically
//   - Updates aircraft fuel level in database

'use client';

import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';

// ============================================================
// PROPS
// ============================================================
interface Props {
  onClose: () => void;  // Function to close the modal
}

export default function FuelLogForm({ onClose }: Props) {
  // ----- Store access -----
  const { aircraft, addFuelRecord, loadAircraft } = useFlightStore();

  // ----- Load aircraft data if empty -----
  useEffect(() => {
    if (aircraft.length === 0) {
      loadAircraft();
    }
  }, [aircraft.length, loadAircraft]);

  // ----- Form state -----
  const [form, setForm] = useState({
    aircraftId: '',          // Selected aircraft ID
    fuelAddedLiters: 0,      // How many liters added
    fuelCostPerLiter: 145,   // Cost per liter (default ₹145 for AVGAS)
    fuelLevelBefore: 0,      // Fuel level before refueling (auto-filled)
    fuelLevelAfter: 0,       // Fuel level after refueling (auto-calculated)
    fuelType: 'AVGAS 100LL', // Type of fuel
    refueledBy: '',          // Who performed the refueling
    notes: '',               // Optional notes
  });

  // ----- Find the selected aircraft object -----
  const selectedAircraft = aircraft.find(a => String(a.id) === String(form.aircraftId));

  // ============================================================
  // EVENT HANDLERS
  // ============================================================

  /**
   * When user selects an aircraft from the dropdown
   * Auto-fills the current fuel level as the "before" level
   */
  const handleAircraftSelect = (id: string) => {
    const ac = aircraft.find(a => String(a.id) === String(id));
    setForm(prev => ({
      ...prev,
      aircraftId: id,
      fuelLevelBefore: ac?.currentFuel || 0,           // Set current fuel as "before"
      fuelLevelAfter: (ac?.currentFuel || 0) + prev.fuelAddedLiters, // Calculate "after"
    }));
  };

  /**
   * When user enters fuel amount
   * Updates the "after" level automatically
   * Also checks if the amount exceeds aircraft capacity
   */
  const handleFuelAdded = (liters: number) => {
    setForm(prev => ({
      ...prev,
      fuelAddedLiters: liters,
      fuelLevelAfter: prev.fuelLevelBefore + liters,  // Before + Added = After
    }));
  };

  /**
   * Submit the refueling record to Supabase
   * Updates both fuel_records table and aircraft current_fuel
   * BLOCKS submission if fuel exceeds aircraft capacity
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();  // Prevent page reload

    // Validate required fields
    if (!form.aircraftId || form.fuelAddedLiters <= 0) {
      alert('❌ Please select an aircraft and enter fuel amount.');
      return;
    }

    // ===== OVER-REFUELING CHECK =====
    // Prevent adding more fuel than the tank can hold
    if (selectedAircraft && (form.fuelLevelBefore + form.fuelAddedLiters) > selectedAircraft.fuelCapacity) {
      alert(
        `⚠️ Cannot refuel!\n\n` +
        `Current: ${form.fuelLevelBefore}L\n` +
        `Adding: ${form.fuelAddedLiters}L\n` +
        `Total would be: ${form.fuelLevelBefore + form.fuelAddedLiters}L\n` +
        `Capacity: ${selectedAircraft.fuelCapacity}L\n\n` +
        `Maximum you can add: ${selectedAircraft.fuelCapacity - form.fuelLevelBefore}L`
      );
      return;  // Stop submission
    }

    // Save to database via store action
    await addFuelRecord({
      aircraftId: form.aircraftId,
      fuelAddedLiters: form.fuelAddedLiters,
      fuelCostPerLiter: form.fuelCostPerLiter,
      fuelLevelBefore: form.fuelLevelBefore,
      fuelLevelAfter: form.fuelLevelAfter,
      fuelType: form.fuelType,
      refueledBy: form.refueledBy,
      notes: form.notes,
      refuelingDate: new Date().toISOString(),  // Current timestamp
    });

    onClose();  // Close the modal after successful submission
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    // Modal overlay - click background to close
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" 
      onClick={onClose}
    >
      {/* Modal content - stop click propagation to prevent closing when clicking inside */}
      <div 
        className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl" 
        onClick={e => e.stopPropagation()}
      >
        {/* ===== HEADER ===== */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">⛽ Log Fuel Refill</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg cursor-pointer">
            <span className="text-slate-400 text-xl">✕</span>
          </button>
        </div>

        {/* ===== FORM ===== */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          
          {/* ----- AIRCRAFT SELECTION ----- */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Aircraft *</label>
            <select
              value={form.aircraftId}
              onChange={e => handleAircraftSelect(e.target.value)}
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Select Aircraft</option>
              {/* Only show ACTIVE aircraft - can't refuel maintenance/grounded planes */}
              {aircraft.filter(a => a.status === 'ACTIVE').map(ac => (
                <option key={ac.id} value={ac.id}>
                  {ac.registration} ({ac.type}) - Current: {ac.currentFuel}L / {ac.fuelCapacity}L
                </option>
              ))}
            </select>
          </div>

          {/* ----- CURRENT FUEL DISPLAY ----- */}
          {/* Shows when an aircraft is selected */}
          {selectedAircraft && (
            <div className="bg-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-400">Current Fuel Level</p>
              <p className="text-2xl font-bold text-white">{selectedAircraft.currentFuel}L</p>
              <p className="text-xs text-slate-500">
                Capacity: {selectedAircraft.fuelCapacity}L | 
                Available space: {selectedAircraft.fuelCapacity - selectedAircraft.currentFuel}L
              </p>
            </div>
          )}

          {/* ----- FUEL AMOUNT & COST ----- */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Fuel Added (L) *</label>
              <input
                type="number"
                value={form.fuelAddedLiters || ''}
                onChange={e => handleFuelAdded(parseInt(e.target.value) || 0)}
                required
                min={1}
                max={selectedAircraft ? selectedAircraft.fuelCapacity - form.fuelLevelBefore : undefined}
                className={`w-full bg-slate-700 border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 ${
                  // Red border when over capacity
                  selectedAircraft && (form.fuelLevelBefore + form.fuelAddedLiters) > selectedAircraft.fuelCapacity
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-slate-600'
                }`}
              />
              {/* Warning when over capacity */}
              {selectedAircraft && (form.fuelLevelBefore + form.fuelAddedLiters) > selectedAircraft.fuelCapacity && (
                <p className="text-xs text-red-400 mt-1 animate-pulse">
                  ⚠️ Over capacity! Max you can add: {selectedAircraft.fuelCapacity - form.fuelLevelBefore}L
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Cost/Liter (₹)</label>
              <input
                type="number"
                value={form.fuelCostPerLiter || ''}
                onChange={e => setForm(prev => ({ ...prev, fuelCostPerLiter: parseFloat(e.target.value) || 0 }))}
                min={0}
                step="0.01"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* ----- FUEL LEVEL BEFORE / AFTER (Read-only) ----- */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Level Before</label>
              <input
                type="number"
                value={form.fuelLevelBefore}
                readOnly
                className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-slate-300"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Level After</label>
              <input
                type="number"
                value={form.fuelLevelAfter}
                readOnly
                className={`w-full bg-slate-600 border rounded-lg px-3 py-2 font-bold ${
                  // Green when OK, red when over capacity
                  selectedAircraft && form.fuelLevelAfter <= selectedAircraft.fuelCapacity
                    ? 'border-slate-500 text-green-400'
                    : 'border-red-500 text-red-400'
                }`}
              />
            </div>
          </div>

          {/* ----- TOTAL COST DISPLAY ----- */}
          {form.fuelAddedLiters > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
              <p className="text-sm text-blue-400">
                Total Cost: <span className="font-bold text-lg">
                  ₹{(form.fuelAddedLiters * form.fuelCostPerLiter).toLocaleString('en-IN')}
                </span>
              </p>
            </div>
          )}

          {/* ----- FUEL TYPE & REFUELED BY ----- */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Fuel Type</label>
              <select
                value={form.fuelType}
                onChange={e => setForm(prev => ({ ...prev, fuelType: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
              >
                <option value="AVGAS 100LL">AVGAS 100LL</option>
                <option value="Jet A-1">Jet A-1</option>
                <option value="MOGAS">MOGAS</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Refueled By</label>
              <input
                type="text"
                value={form.refueledBy}
                onChange={e => setForm(prev => ({ ...prev, refueledBy: e.target.value }))}
                placeholder="Ground Crew"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500"
              />
            </div>
          </div>

          {/* ----- NOTES ----- */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
              placeholder="Any additional notes..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500"
            />
          </div>

          {/* ===== ACTION BUTTONS ===== */}
          <div className="flex space-x-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition cursor-pointer font-bold"
            >
              ⛽ Log Refueling
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}