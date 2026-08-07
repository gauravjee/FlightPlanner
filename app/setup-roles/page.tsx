// app/setup-roles/page.tsx
// TEMPORARY: Create maintenance & operations users, then delete this file
'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SetupRolesPage() {
  const [status, setStatus] = useState('');

  const setupRoles = async () => {
    setStatus('Creating users...');
    
    try {
      const hash = await bcrypt.hash('FlightPro@2024', 10);
      
      // Create maintenance user
      await supabase.from('users').upsert({
        email: 'maintenance@flightpro.com',
        password_hash: hash,
        name: 'Maintenance Team',
        role: 'maintenance',
        is_active: true,
      }, { onConflict: 'email' });

      // Create operations user
      await supabase.from('users').upsert({
        email: 'operations@flightpro.com',
        password_hash: hash,
        name: 'Operations Team',
        role: 'operations',
        is_active: true,
      }, { onConflict: 'email' });
      
      setStatus('✅ Users created!\n\nMaintenance: maintenance@flightpro.com / FlightPro@2024\nOperations: operations@flightpro.com / FlightPro@2024');
    } catch (err: any) {
      setStatus('❌ Error: ' + err.message);
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="bg-slate-800 p-8 rounded-xl text-center">
        <h1 className="text-white text-2xl mb-4">👥 Setup New Roles</h1>
        <button onClick={setupRoles} className="px-6 py-3 bg-blue-500 text-white rounded-lg">
          Create Maintenance & Operations Users
        </button>
        {status && <p className="text-slate-300 mt-4 whitespace-pre-line">{status}</p>}
      </div>
    </main>
  );
}