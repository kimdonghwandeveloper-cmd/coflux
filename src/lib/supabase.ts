import { createClient } from '@supabase/supabase-js';

// Vite 환경 변수에서 Supabase 설정 정보를 읽어옵니다.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// API 키가 없을 경우 앱이 크래시(백화 현상)되지 않도록 방어 로직 추가
let supabaseInstance;
try {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase URL or Anon Key is missing. Check your environment variables.');
  }
  supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.error('[Supabase] 클라이언트 초기화 실패:', e);
  // 최소한의 인터페이스를 유지하는 Mock 객체 반환 (앱 크래시 방지)
  supabaseInstance = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ error: new Error('Supabase not configured') }),
      signUp: async () => ({ error: new Error('Supabase not configured') }),
    }
  } as any;
}

export const supabase = supabaseInstance;

export interface UserProfile {
  id: string;
  email?: string;
  tier: string;
  stripe_customer_id?: string;
  created_at?: string;
}
