"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ブラウザ（Client Component）用。anon キーのみ使用。
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です。",
    );
  }

  return createClient(url, anonKey);
}
