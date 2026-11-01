// File: server/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
// Ở Backend (Express), để có quyền admin (bỏ qua RLS), bạn nên dùng SERVICE_ROLE_KEY
// Nếu không có, dùng ANON_KEY tạm nhưng sẽ bị giới hạn bởi RLS
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);
