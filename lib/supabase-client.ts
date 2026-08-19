// lib/supabase-client.ts
// Re-exports the single shared Supabase client from lib/supabase.ts.
//
// This used to call createClient() a second time with the same URL/anon
// key — harmless on the surface, but a second client means a second
// GoTrueClient instance sharing the same browser storage key as the one
// lib/supabase.ts already creates, which is exactly what triggers
// Supabase's "Multiple GoTrueClient instances detected" console warning
// (seen consistently on pages like Progress and the Admin Setup tabs,
// which import from this file rather than lib/supabase.ts directly).
// This app doesn't use Supabase's own auth (NextAuth handles login — see
// lib/auth.ts/lib/auth-options.ts), so the duplicate GoTrueClient was
// never doing real work, just wasted overhead and a confusing warning.
// Re-exporting the existing singleton instead of creating a new one
// means there's exactly one Supabase client in the browser, matching
// what every other part of the app already uses.
export { supabase } from './supabase';