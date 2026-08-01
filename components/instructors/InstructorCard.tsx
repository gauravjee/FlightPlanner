// components/instructors/InstructorCard.tsx
// Card component displaying instructor details with edit/delete actions
'use client';

import { Instructor } from '@/types';

interface Props {
  instructor: Instructor;
  onEdit: (instructor: Instructor) => void;
  onDelete: (id: string) => void;
}

export default function InstructorCard({ instructor, onEdit, onDelete }: Props) {
  // Parse ratings - stored as comma-separated string in database
  const ratingsList = (instructor.ratings as string).split(',').map(r => r.trim());
  
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-all">
      {/* Header with initials avatar and status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            instructor.status === 'AVAILABLE' ? 'bg-green-500/20' :
            instructor.status === 'FLYING' ? 'bg-blue-500/20' : 'bg-slate-500/20'
          }`}>
            <span className={`font-bold ${
              instructor.status === 'AVAILABLE' ? 'text-green-400' :
              instructor.status === 'FLYING' ? 'text-blue-400' : 'text-slate-400'
            }`}>{instructor.initials}</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{instructor.name}</h3>
            <p className="text-xs text-slate-400">{instructor.licenseNumber}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          instructor.status === 'AVAILABLE' ? 'bg-green-500/20 text-green-400' :
          instructor.status === 'FLYING' ? 'bg-blue-500/20 text-blue-400' :
          'bg-slate-500/20 text-slate-400'
        }`}>
          {instructor.status.replace('_', ' ')}
        </span>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Max Daily Hours</p>
          <p className="text-lg font-bold text-white">{instructor.maxDailyHours}h</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-400">Contact</p>
          <p className="text-sm text-white truncate">{instructor.email || 'N/A'}</p>
          <p className="text-xs text-slate-400">{instructor.phone || ''}</p>
        </div>
      </div>

      {/* Ratings badges */}
      <div className="mb-4">
        <p className="text-xs text-slate-400 mb-2">Ratings</p>
        <div className="flex flex-wrap gap-1">
          {ratingsList.map((rating, i) => (
            <span key={i} className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs font-medium">
              {rating}
            </span>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex space-x-2">
        <button onClick={() => onEdit(instructor)}
          className="flex-1 px-3 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30 transition cursor-pointer">
          ✏️ Edit
        </button>
        <button onClick={() => onDelete(instructor.id)}
          className="flex-1 px-3 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition cursor-pointer">
          🗑️ Remove
        </button>
      </div>
    </div>
  );
}