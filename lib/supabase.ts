import { createClient } from '@supabase/supabase-js';

// 環境変数から Supabase の接続情報を読み込みます
// (.env.local に設定してある値が自動で入ります)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);