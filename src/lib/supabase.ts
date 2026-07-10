import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://sb.alhijaz.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'missing-supabase-anon-key';

if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('[supabase] VITE_SUPABASE_ANON_KEY is missing; public Supabase reads will fail.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
