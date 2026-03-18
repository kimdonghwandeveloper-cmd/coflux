import { createClient } from '@supabase/supabase-js';

// Vite 환경 변수에서 Supabase 설정 정보를 읽어옵니다.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface UserProfile {
  id: string;
  email?: string;
  tier: string;
  stripe_customer_id?: string;
  created_at?: string;
}
