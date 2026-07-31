// components/aircraft/AircraftCard.tsx
'use client';

import { Aircraft } from '@/types';

interface Props {
  aircraft: Aircraft;
  onEdit: (aircraft: Aircraft) => void;
  onDelete: (id: string) => void;
}

export default function AircraftCard({ aircraft, onEdit, onDelete }: Props) {
  const fuelPercent = (aircraft.currentFuel / aircraft.fuelCapacity) * 100;
  const maintenanceDue = new Date(aircraft.nextMaintenance);
  const daysUntilMx = Math.ceil((maintenanceDue.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${
            aircraft.status === 'ACTIVE' ? 'bg-green-400' : 
            aircraft.status === 'MAINTENANCE' ? 'bg-yellow-400' : 'bg-red-400'
          }`} />
          <div>
            <h3 className="text-lg font-bold text-white">{aircraft.registration}</h3>
            <p className="text-sm text-slate-400">{aircraft.model}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          aircraft.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
          aircraft.status === 'MAINTENANCE' ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-red-500/20 text-red-400'
        }`}>
          {aircraft.status}
        </span>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Type</p>
          <p className="text-sm font-medium text-white">{aircraft.type}</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Year</p>
          <p className="text-sm font-medium text-white">{aircraft.year}</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Hobbs Time</p>
          <p className="text-sm font-medium text-white">{aircraft.hobbsTime} hrs</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Next Maintenance</p>
          <p className={`text-sm font-medium ${
            daysUntilMx < 7 ? 'text-red-400' : 
            daysUntilMx < 30 ? 'text-yellow-400' : 'text-white'
          }`}>
            {aircraft.nextMaintenance}
            {daysUntilMx < 7 && <span className="text-xs ml-1">({daysUntilMx}d)</span>}
          </p>
        </div>
      </div>

      {/* Fuel Bar */}
      <div className="mb-4">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-slate-400">Fuel</span>
          <span className={`text-xs font-medium ${
            fuelPercent < 30 ? 'text-red-400' : 
            fuelPercent < 60 ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {aircraft.currentFuel}L / {aircraft.fuelCapacity}L ({Math.round(fuelPercent)}%)
          </span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all ${
              fuelPercent < 30 ? 'bg-red-500' : 
              fuelPercent < 60 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${fuelPercent}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex space-x-2">
        <button 
          onClick={() => onEdit(aircraft)}
          className="flex-1 px-3 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30 transition cursor-pointer"
        >
          ✏️ Edit
        </button>
        <button 
          onClick={() => onDelete(aircraft.id)}
          className="flex-1 px-3 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition cursor-pointer"
        >
          🗑️ Remove
        </button>
      </div>
    </div>
  );
}