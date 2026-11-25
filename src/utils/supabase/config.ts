function cleanEnvValue(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "").trim() ?? "";
}

function normalizeSupabaseUrl(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(withProtocol);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase project URL, such as https://<project-ref>.supabase.co.",
    );
  }

  const isLocalhost = ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);
  const isSecureOrigin =
    parsedUrl.protocol === "https:" ||
    (parsedUrl.protocol === "http:" && isLocalhost);

  if (
    !isSecureOrigin ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be an HTTPS project origin without a path, query, or fragment.",
    );
  }

  return parsedUrl.origin;
}

export function getSupabaseConfig() {
  const rawUrl = cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey =
    cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
    cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!rawUrl || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return {
    url: normalizeSupabaseUrl(rawUrl),
    publishableKey,
  };
}
