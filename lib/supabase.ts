// lib/supabase.ts
// Supabase client — safe for both server and client rendering
import { createClient } from '@supabase/supabase-js';

// Use a lazy initialization pattern to avoid SSR issues
let supabaseInstance: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (typeof window === 'undefined') {
    // Server-side: return a minimal client (won't use hooks)
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );
  }
  
  // Client-side: reuse the same instance
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return supabaseInstance;
}

export const supabase = getSupabase();