import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let _serviceClient: SupabaseClient | null = null;

/** Server-only client (full access). Never expose to the browser. */
export function supabaseServer(): SupabaseClient {
  if (!_serviceClient) {
    _serviceClient = createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _serviceClient;
}

let _browserClient: SupabaseClient | null = null;

/**
 * Browser/anon client. Singleton — Realtime keeps a long-lived WebSocket and
 * we want one connection per page, not one per component mount.
 */
export function supabaseBrowser(): SupabaseClient {
  if (!_browserClient) {
    _browserClient = createClient(env.publicSupabaseUrl(), env.publicSupabaseAnonKey());
  }
  return _browserClient;
}
