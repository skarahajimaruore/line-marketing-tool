import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * サーバー専用（Route Handler / Server Actions / Webhook など）
 *
 * キーの優先順位:
 * 1. SUPABASE_SERVICE_ROLE_KEY … RLS をバイパスする管理者用（秘密は絶対にクライアントに載せない）
 * 2. SUPABASE_ANON_KEY または NEXT_PUBLIC_SUPABASE_ANON_KEY … RLS 前提の通常利用
 */
export function createSupabaseServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL が未設定です。");
  }

  const key = serviceRoleKey ?? anonKey;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY または SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です。",
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
