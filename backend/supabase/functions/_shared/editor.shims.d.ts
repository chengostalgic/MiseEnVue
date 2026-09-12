// Editor-only shims. Cursor's TypeScript language service does not understand
// Deno `npm:` specifiers or the `Deno` namespace. The Edge Runtime and
// `deno check` resolve both natively, so this file is excluded from Deno.

declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
  }
}

interface Request {
  readonly headers: Headers;
}

declare module "npm:@supabase/supabase-js@2" {
  export interface SupabaseClientOptions {
    auth?: {
      persistSession?: boolean;
      autoRefreshToken?: boolean;
    };
    global?: {
      headers?: Record<string, string>;
    };
  }

  export interface SupabaseClient<Database = unknown> {
    readonly __database?: Database;
  }

  export function createClient<Database = unknown>(
    supabaseUrl: string,
    supabaseKey: string,
    options?: SupabaseClientOptions,
  ): SupabaseClient<Database>;
}
