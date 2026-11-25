import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";

type ServerClientOptions = {
  cookieWrites?: boolean;
};

export async function createClient({ cookieWrites = false }: ServerClientOptions = {}) {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseConfig();

  if (!cookieWrites) {
    return createServerClient(url, publishableKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    });
  }

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}
