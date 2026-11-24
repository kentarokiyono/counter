/**
 * フロントエンド用Supabaseクライアント。
 * anonキーのみ使用（service_role_keyはbackendのみで保持し、フロントには絶対に置かない）。
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です（frontend/.env.local を確認）"
    );
  }

  client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
}
