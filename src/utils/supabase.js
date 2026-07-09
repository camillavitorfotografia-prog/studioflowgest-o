import { createClient } from '@supabase/supabase-js';

// Se não achar o .env, usa um texto padrão temporário para não quebrar o React
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.warn('⚠️ Atenção: Arquivo .env não detectado ou chaves faltando na raiz do projeto.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);