import { Suspense } from "react";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { createClient } from "@/utils/supabase/server";

async function DashboardContent() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Could not load your account: ${error.message}`);
  }

  if (!user) {
    redirect("/login");
  }

  return <DashboardClient userId={user.id} userEmail={user.email ?? ""} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f7f8fa]" />}>
      <DashboardContent />
    </Suspense>
  );
}
