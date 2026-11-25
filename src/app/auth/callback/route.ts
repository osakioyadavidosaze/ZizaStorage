import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient({ cookieWrites: true });
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Supabase auth callback failed:", error.message);
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "auth_callback_failed");
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "auth_callback_missing_code");
  return NextResponse.redirect(loginUrl);
}
