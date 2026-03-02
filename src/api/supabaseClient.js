import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_FF_JS_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_FF_JS_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_FF_JS_SUPABASE_URL or VITE_FF_JS_SUPABASE_ANON_KEY env vars');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
