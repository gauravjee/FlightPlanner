// components/schedule/FlightDetailModal.tsx
'use client';

import { useFlightStore } from '@/lib/store';
import { FlightSlot } from '@/types';

interface Props {
  slot: FlightSlot;
  onClose: () => void;
  onEdit?: (slot: FlightSlot) => void;   // new prop for editing
}

export default function FlightDetailModal({ slot, onClose, onEdit }: Props) {
  const { getAircraftById, getInstructorById, getStudentById, weather, notams, cancelFlight, loadScheduledFlights } = useFlightStore();

  const aircraft = getAircraftById(slot.aircraftId);
  const instructor = getInstructorById(slot.instructorId);
  const student = slot.studentId ? getStudentById(slot.studentId) : undefined;

  const duration = (new Date(slot.endTime).getTime() - new Date(slot.startTime).getTime()) / 3600000;

  
const handleCancel = async () => {
  if (window.confirm('Cancel this flight?')) {
    await cancelFlight(slot.id);
    await loadScheduledFlights();   // ← Refresh the schedule data
    onClose();
  }
};

  const handlePrint = () => {
    window.print();
  };

  const handleEdit = () => {
    if (onEdit) onEdit(slot);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-800 rounded-t-xl">
          <h3 className="text-lg font-semibold text-white">✈️ Flight Details</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg cursor-pointer">
            <span className="text-slate-400 text-xl">✕</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              slot.status === 'IN_PROGRESS' ? 'bg-green-500/20 text-green-400' :
              slot.status === 'COMPLETED' ? 'bg-blue-500/20 text-blue-400' :
              slot.status === 'CANCELLED' ? 'bg-red-500/20 text-red-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {slot.status.replace('_', ' ')}
            </span>
            <span className="text-sm text-slate-400">{duration.toFixed(1)} hours</span>
          </div>

          {/* Aircraft */}
          {aircraft && (
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-2">🛩️ AIRCRAFT</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold">{aircraft.registration}</p>
                  <p className="text-sm text-slate-400">{aircraft.model}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-300">Hobbs: {aircraft.hobbsTime}h</p>
                  <p className="text-sm text-slate-300">Fuel: {aircraft.currentFuel}L / {aircraft.fuelCapacity}L</p>
                </div>
              </div>
            </div>
          )}

          {/* Time & Sortie */}
          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-2">⏰ SCHEDULE</p>
            <p className="text-white font-medium">
              {new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {' → '}
              {new Date(slot.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            <span className="inline-block mt-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">
              {slot.sortieType.replace(/_/g, ' ')}
            </span>
          </div>

          {/* Personnel */}
          <div className="grid grid-cols-2 gap-3">
            {instructor && (
              <div className="bg-slate-700/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">👨‍🏫 INSTRUCTOR</p>
                <p className="text-white font-medium">{instructor.name}</p>
                <p className="text-xs text-slate-400">{instructor.initials}</p>
                <p className="text-xs text-slate-500">{instructor.licenseNumber}</p>
              </div>
            )}
            {student ? (
              <div className="bg-slate-700/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">👨‍✈️ STUDENT</p>
                <p className="text-white font-medium">{student.name}</p>
                <p className="text-xs text-slate-400">{student.initials} | {student.trainingStage}</p>
                <p className="text-xs text-slate-500">{student.totalHours}h total</p>
              </div>
            ) : (
              <div className="bg-slate-700/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">🔧 PURPOSE</p>
                <p className="text-white font-medium">Check Flight</p>
                <p className="text-xs text-slate-400">Maintenance / CofA</p>
              </div>
            )}
          </div>

          {/* Weather */}
          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-2">🌤️ WEATHER</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-xs text-slate-500">Wind</p>
                <p className="text-sm text-white font-medium">{weather.windDirection}°/{weather.windSpeed}kt</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Visibility</p>
                <p className="text-sm text-white font-medium">{weather.visibility}m</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Ceiling</p>
                <p className="text-sm text-white font-medium">{weather.ceiling}ft</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Flight Rules</p>
                <p className="text-sm text-green-400 font-medium">{weather.flightRules}</p>
              </div>
            </div>
          </div>

          {/* NOTAMs */}
          {notams.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-xs text-yellow-400 font-medium mb-2">⚠️ ACTIVE NOTAMS</p>
              {notams.slice(0, 3).map(n => (
                <p key={n.id} className="text-xs text-yellow-300/80 mt-1">
                  <span className="font-medium">{n.notamNumber}</span>: {n.text}
                </p>
              ))}
            </div>
          )}

          {/* Readiness Checklist */}
          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-3">✅ FLIGHT READINESS</p>
            <div className="space-y-2">
              {[
                { label: 'Aircraft Airworthy', ok: aircraft?.status === 'ACTIVE' },
                { label: 'Weather Within Limits', ok: weather.flightRules === 'VFR' || weather.flightRules === 'MVFR' },
                { label: 'Weather Briefed', ok: slot.weatherBriefed },
                { label: 'NOTAMs Briefed', ok: slot.notamBriefed },
                { label: 'Fuel Sufficient', ok: (aircraft?.currentFuel || 0) > 50 },
                { label: 'Student Medical Valid', ok: student ? new Date(student.medicalExpiry) > new Date() : true },
              ].map((item, i) => (
                <div key={i} className="flex items-center space-x-2">
                  <span className={`text-lg ${item.ok ? 'text-green-400' : 'text-red-400'}`}>
                    {item.ok ? '✅' : '❌'}
                  </span>
                  <span className={`text-xs ${item.ok ? 'text-slate-300' : 'text-red-400'}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-2 p-4 border-t border-slate-700 sticky bottom-0 bg-slate-800 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition cursor-pointer">
            Close
          </button>
          {onEdit && (
            <button onClick={handleEdit} className="px-4 py-2 text-sm bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition cursor-pointer">
              ✏️ Edit
            </button>
          )}
          <button onClick={handleCancel} className="px-4 py-2 text-sm bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition cursor-pointer">
            Cancel Flight
          </button>
          <button onClick={handlePrint} className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer">
            📋 Print Brief
          </button>
        </div>
      </div>
    </div>
  );
}