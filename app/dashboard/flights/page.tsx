// app/dashboard/flights/page.tsx
// Flight Records & Digital Logbook page
'use client';
import Header from '@/components/ui/Header';

import { useState, useEffect } from 'react';
import { useFlightStore } from '@/lib/store';
import FlightRecordForm from '@/components/flights/FlightRecordForm';
import Link from 'next/link';

export default function FlightsPage() {
  const { flightRecords, students, loadingFlights, loadFlightRecords, loadStudents } = useFlightStore();
  const [showForm, setShowForm] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('ALL');

  useEffect(() => {
    loadStudents();
    loadFlightRecords();
  }, []);

  const filteredRecords = selectedStudent === 'ALL' 
    ? flightRecords 
    : flightRecords.filter(r => r.studentId === selectedStudent);

  const totalHours = flightRecords.reduce((s, r) => s + r.totalHours, 0);
  const totalFlights = flightRecords.length;
  const totalLandings = flightRecords.reduce((s, r) => s + r.landings, 0);

  const getPerformanceStars = (rating: number) => {
    return '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Header 
        title="Flight Records" 
        subtitle="Digital Logbook" 
        action={
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition cursor-pointer font-bold">
            📝 Log Flight
          </button>
        }
      />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Flights', value: totalFlights, color: 'text-blue-400' },
            { label: 'Total Hours', value: `${totalHours.toFixed(1)}h`, color: 'text-green-400' },
            { label: 'Total Landings', value: totalLandings, color: 'text-purple-400' },
            { label: 'Students Flown', value: [...new Set(flightRecords.map(r => r.studentId))].length, color: 'text-orange-400' },
          ].map((stat, i) => (
            <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-400">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filter & Records */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">📋 Flight Log</h2>
            <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
              <option value="ALL">All Students</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {loadingFlights ? (
            <p className="text-slate-400 text-center py-8">Loading records...</p>
          ) : filteredRecords.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No flight records found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Student</th>
                    <th className="pb-3">Aircraft</th>
                    <th className="pb-3">Time</th>
                    <th className="pb-3">Hrs</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Landings</th>
                    <th className="pb-3">Performance</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {filteredRecords.map(record => (
                    <tr key={record.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 text-white text-xs">
                        {new Date(record.flightDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="py-3 text-white text-xs font-medium">{record.studentName}</td>
                      <td className="py-3 text-xs">{record.aircraftReg}</td>
                      <td className="py-3 text-xs">{record.departureTime?.slice(0,5)}-{record.arrivalTime?.slice(0,5)}</td>
                      <td className="py-3 text-green-400 font-medium">{record.totalHours}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          record.flightType === 'SOLO' ? 'bg-green-500/20 text-green-400' :
                          record.flightType === 'DUAL' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>{record.flightType}</span>
                      </td>
                      <td className="py-3 text-xs">{record.landings}</td>
                      <td className="py-3 text-xs">{getPerformanceStars(record.studentPerformance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showForm && <FlightRecordForm onClose={() => setShowForm(false)} />}
    </main>
  );
}