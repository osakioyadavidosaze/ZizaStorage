"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function signOut() {
  const supabase = await createClient({ cookieWrites: true });
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(`Could not sign out: ${error.message}`);
  }

  redirect("/login");
}
