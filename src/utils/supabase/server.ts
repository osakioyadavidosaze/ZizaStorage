import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type ServerClientOptions = {
  cookieWrites?: boolean;
};

export async function createClient({ cookieWrites = false }: ServerClientOptions = {}) {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

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
