import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

const invalidUrl = !supabaseUrl || supabaseUrl.includes('placeholder') || supabaseUrl.includes('cole-sua-url-aqui');
const invalidKey = !supabaseAnonKey || supabaseAnonKey.includes('placeholder');

if (invalidUrl || invalidKey) {
  console.warn('Atencao: configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY validos no .env.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const isSupabaseConfigured = !invalidUrl && !invalidKey;
