import { createServerClient } from "@supabase/ssr";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/utils/supabase/config";

function redirectToLogin(request: NextRequest, errorCode: string) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("error", errorCode);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const { url, publishableKey } = getSupabaseConfig();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user && (!error || isAuthSessionMissingError(error))) {
    return redirectToLogin(request, "sign_in_required");
  }

  if (error) {
    console.error("Could not verify the Supabase session:", error.message);
    return redirectToLogin(request, "session_check_failed");
  }

  if (!user) {
    return redirectToLogin(request, "sign_in_required");
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
