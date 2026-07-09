import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

const invalidUrl = !supabaseUrl
  || supabaseUrl.includes('placeholder')
  || supabaseUrl.includes('cole-sua-url-aqui')
  || supabaseUrl.includes('SEU-PROJETO')
  || supabaseUrl.includes('seu-id-real');
const invalidKey = !supabaseAnonKey
  || supabaseAnonKey.includes('placeholder')
  || supabaseAnonKey.includes('SUA_CHAVE_ANON_PUBLICA');

if (invalidUrl || invalidKey) {
  console.warn('Atencao: configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY validos no .env.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
export const isSupabaseConfigured = !invalidUrl && !invalidKey;
