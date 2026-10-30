import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ykhsbwclewixebafftky.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_0wF7Ax8xD0RTaXj8dCZsCA_4UnIFRic';

if (!supabaseUrl || !supabaseKey) {
  console.warn('Thiếu thông tin môi trường VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
