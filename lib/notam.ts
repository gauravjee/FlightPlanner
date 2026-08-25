// lib/notam.ts
// Live NOTAM service using FAA Aviation Weather Center
import { NOTAM } from '@/types';

// Shape of a single entry in the FAA Aviation Weather Center NOTAM
// response, as proxied through /api/notam — only the fields we actually
// read below.
interface FaaNotamEntry {
  id?: string;
  notamNumber?: string;
  icaoId?: string;
  text?: string;
  rawNotam?: string;
  priority?: string;
  category?: string;
  startTime?: string;
  effectiveStart?: string;
  endTime?: string;
  effectiveEnd?: string;
  isActive?: boolean;
}

/**
 * Fetch live NOTAMs for an airport via our proxy API
 * Falls back to empty array if API fails
 */
export async function fetchNOTAMs(airportCode: string = 'VOBL'): Promise<NOTAM[]> {
  try {
    console.log('🛫 Fetching live NOTAMs for', airportCode);
    const res = await fetch(`/api/notam?station=${airportCode}`);
    const data = await res.json();

    if (!Array.isArray(data)) {
      console.warn('⚠️ Invalid NOTAM response');
      return [];
    }

    // Map FAA response to our NOTAM type
    return data.map((n: FaaNotamEntry) => ({
      id: n.id || String(Math.random()),
      notamNumber: n.notamNumber || n.id || 'N/A',
      airportCode: n.icaoId || airportCode,
      text: n.text || n.rawNotam || '',
      priority: mapPriority(n.priority || ''),
      category: n.category || 'OTHER',
      startTime: n.startTime || n.effectiveStart || new Date().toISOString(),
      endTime: n.endTime || n.effectiveEnd || new Date().toISOString(),
      isActive: n.isActive !== false,
    }));
  } catch (error) {
    console.error('❌ Error fetching NOTAMs:', error);
    return [];
  }
}

function mapPriority(priority: string): NOTAM['priority'] {
  const p = priority.toUpperCase();
  if (p.includes('CRITICAL') || p.includes('EMERGENCY')) return 'CRITICAL';
  if (p.includes('HIGH')) return 'HIGH';
  if (p.includes('LOW')) return 'LOW';
  return 'MODERATE';
}