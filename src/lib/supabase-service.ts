import { createClient } from "@supabase/supabase-js";

// Service client for non-cookie contexts (e.g. Telegram webhook)
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
