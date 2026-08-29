// components/fuel/FuelLogForm.tsx
// Modal form for logging aircraft refueling operations
// Features:
//   - Auto-calculates fuel level after refueling
//   - Shows current fuel level and capacity
//   - Prevents over-refueling (capacity limit)
//   - Calculates total cost automatically
//   - Updates aircraft fuel level in database

'use client';

import { useState } from 'react';
import { useAircraft } from '@/lib/hooks/useAircraft';
import { addFuelRecord } from '@/lib/hooks/useFuelRecords';
import { Fuel, TriangleAlert, X } from 'lucide-react';
import { useEscapeToClose } from '@/lib/useEscapeToClose';

// ============================================================
// PROPS
// ============================================================
interface Props {
  onClose: () => void;  // Function to close the modal
}

export default function FuelLogForm({ onClose }: Props) {
  useEscapeToClose(onClose);
  // ----- Store access -----
  const { aircraft } = useAircraft();

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
      alert('Please select an aircraft and enter fuel amount.');
      return;
    }

    // ===== OVER-REFUELING CHECK =====
    // Prevent adding more fuel than the tank can hold
    if (selectedAircraft && (form.fuelLevelBefore + form.fuelAddedLiters) > selectedAircraft.fuelCapacity) {
      alert(
        `Cannot refuel!\n\n` +
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

  const inputClass = "w-full surface-inner rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--accent)]";
  const overCapacity = !!(selectedAircraft && (form.fuelLevelBefore + form.fuelAddedLiters) > selectedAircraft.fuelCapacity);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    // Modal overlay - click background to close
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      {/* Modal content - stop click propagation to prevent closing when clicking inside */}
      <div
        className="surface-card w-full max-w-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ===== HEADER ===== */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Fuel className="w-4 h-4" /> Log Fuel Refill
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg cursor-pointer hover:opacity-80" aria-label="Close">
            <X className="w-5 h-5 text-tertiary" />
          </button>
        </div>

        {/* ===== FORM ===== */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">

          {/* ----- AIRCRAFT SELECTION ----- */}
          <div>
            <label className="block text-sm text-secondary mb-1">Aircraft *</label>
            <select
              value={form.aircraftId}
              onChange={e => handleAircraftSelect(e.target.value)}
              required
              className={inputClass}
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
            <div className="surface-inner p-3 text-center">
              <p className="text-xs text-tertiary">Current Fuel Level</p>
              <p className="text-2xl font-bold">{selectedAircraft.currentFuel}L</p>
              <p className="text-xs text-tertiary">
                Capacity: {selectedAircraft.fuelCapacity}L |
                Available space: {selectedAircraft.fuelCapacity - selectedAircraft.currentFuel}L
              </p>
            </div>
          )}

          {/* ----- FUEL AMOUNT & COST ----- */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">Fuel Added (L) *</label>
              <input
                type="number"
                value={form.fuelAddedLiters || ''}
                onChange={e => handleFuelAdded(parseInt(e.target.value) || 0)}
                required
                min={1}
                max={selectedAircraft ? selectedAircraft.fuelCapacity - form.fuelLevelBefore : undefined}
                className={inputClass}
                style={overCapacity ? { borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)' } : undefined}
              />
              {/* Warning when over capacity */}
              {overCapacity && selectedAircraft && (
                <p className="text-xs mt-1 animate-pulse flex items-center gap-1" style={{ color: 'var(--danger)' }}>
                  <TriangleAlert className="w-3 h-3" /> Over capacity! Max you can add: {selectedAircraft.fuelCapacity - form.fuelLevelBefore}L
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Cost/Liter (₹)</label>
              <input
                type="number"
                value={form.fuelCostPerLiter || ''}
                onChange={e => setForm(prev => ({ ...prev, fuelCostPerLiter: parseFloat(e.target.value) || 0 }))}
                min={0}
                step="0.01"
                className={inputClass}
              />
            </div>
          </div>

          {/* ----- FUEL LEVEL BEFORE / AFTER (Read-only) ----- */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">Level Before</label>
              <input
                type="number"
                value={form.fuelLevelBefore}
                readOnly
                className="w-full surface-inner rounded-lg px-3 py-2 text-secondary opacity-75 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Level After</label>
              <input
                type="number"
                value={form.fuelLevelAfter}
                readOnly
                className="w-full surface-inner rounded-lg px-3 py-2 font-bold"
                style={{
                  color: selectedAircraft && form.fuelLevelAfter <= selectedAircraft.fuelCapacity ? 'var(--success)' : 'var(--danger)',
                  borderColor: selectedAircraft && form.fuelLevelAfter <= selectedAircraft.fuelCapacity ? undefined : 'var(--danger)',
                }}
              />
            </div>
          </div>

          {/* ----- TOTAL COST DISPLAY ----- */}
          {form.fuelAddedLiters > 0 && (
            <div className="rounded-lg p-3 text-center" style={{ backgroundColor: 'var(--accent-soft)' }}>
              <p className="text-sm" style={{ color: 'var(--accent)' }}>
                Total Cost: <span className="font-bold text-lg">
                  ₹{(form.fuelAddedLiters * form.fuelCostPerLiter).toLocaleString('en-IN')}
                </span>
              </p>
            </div>
          )}

          {/* ----- FUEL TYPE & REFUELED BY ----- */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-secondary mb-1">Fuel Type</label>
              <select
                value={form.fuelType}
                onChange={e => setForm(prev => ({ ...prev, fuelType: e.target.value }))}
                className={inputClass}
              >
                <option value="AVGAS 100LL">AVGAS 100LL</option>
                <option value="Jet A-1">Jet A-1</option>
                <option value="MOGAS">MOGAS</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Refueled By</label>
              <input
                type="text"
                value={form.refueledBy}
                onChange={e => setForm(prev => ({ ...prev, refueledBy: e.target.value }))}
                placeholder="Ground Crew"
                className={inputClass}
              />
            </div>
          </div>

          {/* ----- NOTES ----- */}
          <div>
            <label className="block text-sm text-secondary mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
              placeholder="Any additional notes..."
              className={inputClass}
            />
          </div>

          {/* ===== ACTION BUTTONS ===== */}
          <div className="flex space-x-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer surface-inner"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-lg transition cursor-pointer font-semibold flex items-center justify-center gap-1.5"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#04141a' }}
            >
              <Fuel className="w-4 h-4" /> Log Refueling
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
