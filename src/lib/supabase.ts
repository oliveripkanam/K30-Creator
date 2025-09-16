import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Create a single shared client for the whole app
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Basic startup diagnostic
try {
  const masked = supabaseAnonKey ? supabaseAnonKey.slice(0, 6) + '...' : 'missing';
  // eslint-disable-next-line no-console
  console.log('[supabase] config', { url: supabaseUrl || 'missing', anonKeyPrefix: masked });
} catch {}


