import { createClient } from '@supabase/supabase-js';

// Supabase (Postgres) replaces Firebase Firestore.
// Keys are inlined at build time from .env.local — they are safe for client use
// because Postgres Row-Level Security policies guard the data.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Guard against missing env vars at build time (static export prerender).
// Event handlers check for null and surface a friendly error.
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
