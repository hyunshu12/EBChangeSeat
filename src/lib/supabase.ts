import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** 서버 전용. service-role 키는 절대 클라이언트 번들에 노출 금지. */
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경 변수가 없습니다')
  return createClient(url, key, { auth: { persistSession: false } })
}
