"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type AuthFormProps = {
  mode: "login" | "signup";
  initialErrorCode?: string;
};

const authErrorMessages: Record<string, string> = {
  session_check_failed: "We couldn't verify your session. Please try signing in again.",
  sign_in_required: "Sign in to continue to your vault.",
  auth_callback_failed: "We couldn't finish email verification. Please try signing in.",
  auth_callback_missing_code: "The email verification link is incomplete. Request a new one.",
};

export function AuthForm({ mode, initialErrorCode }: AuthFormProps) {
  const router = useRouter();
  const isSignup = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    authErrorMessages[initialErrorCode ?? ""] ?? "",
  );
  const [notice, setNotice] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setNotice("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = isSignup
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          })
        : await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (isSignup && !data.session) {
        setNotice("Check your inbox for a confirmation link to finish creating your account.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="pointer-events-none absolute -left-36 -top-40 h-96 w-96 rounded-full bg-indigo-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-32 h-[32rem] w-[32rem] rounded-full bg-sky-100 blur-3xl" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white bg-white shadow-[0_30px_100px_-45px_rgba(29,43,76,0.35)] lg:min-h-[650px] lg:grid-cols-[1fr_0.95fr]">
        <section className="hidden flex-col justify-between bg-[#17213a] p-12 text-white lg:flex">
          <Link href="/login" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10">
              <ShieldCheck className="h-5 w-5 text-indigo-200" />
            </span>
            <span className="text-lg">Ziza Storage</span>
          </Link>

          <div className="max-w-sm">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-200">
              Your space, protected
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              Keep your files close and your privacy closer.
            </h1>
            <p className="mt-5 leading-7 text-slate-300">
              A calm, private home for the images, videos, and files you want to keep.
            </p>
          </div>

          <p className="text-sm text-slate-400">Private by design. Yours to organize.</p>
        </section>

        <section className="flex items-center justify-center px-6 py-10 sm:px-12 lg:px-14">
          <div className="w-full max-w-md">
            <Link
              href="/login"
              className="mb-10 inline-flex items-center gap-2 font-semibold tracking-tight text-slate-900 lg:hidden"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                <ShieldCheck className="h-5 w-5" />
              </span>
              Ziza Storage
            </Link>

            <div className="mb-8">
              <p className="mb-3 text-sm font-medium text-indigo-700">
                {isSignup ? "Start your private collection" : "Welcome back"}
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
                {isSignup ? "Create your account" : "Sign in to your vault"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {isSignup
                  ? "Create an account to start organizing your files."
                  : "Enter your details to access your personal collection."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                    Password
                  </label>
                  {isSignup && <span className="text-xs text-slate-400">At least 8 characters</span>}
                </div>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    minLength={isSignup ? 8 : undefined}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {errorMessage && (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-700"
                >
                  {errorMessage}
                </p>
              )}
              {notice && (
                <p
                  role="status"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-800"
                >
                  {notice}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    {isSignup ? "Creating account..." : "Signing in..."}
                  </>
                ) : (
                  <>
                    {isSignup ? "Create account" : "Sign in"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-slate-500">
              {isSignup ? "Already have an account?" : "New to Ziza Storage?"}{" "}
              <Link
                href={isSignup ? "/login" : "/signup"}
                className="font-semibold text-indigo-700 hover:text-indigo-900"
              >
                {isSignup ? "Sign in" : "Create an account"}
              </Link>
            </p>

            <p className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
              <LockKeyhole className="h-3.5 w-3.5" />
              Your account is protected with secure authentication.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
