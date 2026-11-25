import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

async function LoginContent({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const errorCode = Array.isArray(params.error) ? params.error[0] : params.error;

  return <AuthForm mode="login" initialErrorCode={errorCode} />;
}

export default function LoginPage(props: LoginPageProps) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f7f8fa]" />}>
      <LoginContent {...props} />
    </Suspense>
  );
}
