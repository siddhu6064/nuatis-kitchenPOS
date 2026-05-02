"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SignUpRequestSchema } from "@nuatis/pos-shared";
import type { SignUpResponse } from "@nuatis/pos-shared";

const VERTICALS = [
  { value: "cafe", label: "Cafe" },
  { value: "restaurant", label: "Restaurant" },
] as const;

export default function SignUpPage() {
  const router = useRouter();

  const [fields, setFields] = useState({
    business_name: "",
    vertical: "cafe" as "cafe" | "restaurant",
    full_name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set(key: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (fields.password !== fields.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!termsAccepted) {
      setError("You must accept the terms to continue");
      return;
    }

    const validation = SignUpRequestSchema.safeParse({
      business_name: fields.business_name,
      vertical: fields.vertical,
      full_name: fields.full_name,
      email: fields.email,
      password: fields.password,
      terms_accepted: termsAccepted,
    });

    if (!validation.success) {
      setError(validation.error.errors[0]?.message ?? "Invalid input");
      return;
    }

    setLoading(true);
    try {
      // POST through the Next.js proxy → pos-api (server-to-server)
      const signUpRes = await fetch("/api/v1/onboarding/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });
      if (!signUpRes.ok) {
        const body = (await signUpRes.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        throw new Error(body?.error?.message ?? `HTTP ${signUpRes.status}`);
      }
      await signUpRes.json() as SignUpResponse;

      const result = await signIn("credentials", {
        email: fields.email,
        password: fields.password,
        redirect: false,
      });

      if (result?.error) {
        setError("Account created, but sign-in failed. Please try signing in manually.");
        router.push("/sign-in");
        return;
      }

      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("email_taken")) {
        setError("An account with this email already exists. Try signing in.");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Sign-up failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="font-serif text-3xl font-bold text-slate-900">
            Nuatis POS
          </span>
          <p className="mt-1 text-sm text-slate-500">Create your account</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h1 className="font-serif text-2xl font-bold text-slate-900 mb-1">
            Get started
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            Set up your business in under a minute
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Business name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Business name
              </label>
              <input
                type="text"
                required
                value={fields.business_name}
                onChange={(e) => set("business_name", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
                placeholder="Blue Bottle Cafe"
              />
            </div>

            {/* Vertical */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Business type
              </label>
              <div className="flex gap-3">
                {VERTICALS.map(({ value, label }) => (
                  <label
                    key={value}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium cursor-pointer transition ${
                      fields.vertical === value
                        ? "border-brand bg-brand/5 text-brand"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="vertical"
                      value={value}
                      checked={fields.vertical === value}
                      onChange={() => set("vertical", value)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Full name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Your full name
              </label>
              <input
                type="text"
                required
                value={fields.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
                placeholder="Alice Smith"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Work email
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={fields.email}
                onChange={(e) => set("email", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
                placeholder="alice@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={fields.password}
                onChange={(e) => set("password", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
                placeholder="At least 8 characters"
              />
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Confirm password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={fields.confirmPassword}
                onChange={(e) => set("confirmPassword", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
                placeholder="••••••••"
              />
            </div>

            {/* Terms */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/30"
              />
              <span className="text-sm text-slate-500 leading-relaxed">
                I agree to the{" "}
                <span className="text-brand font-medium">Terms of Service</span>
                {" "}and{" "}
                <span className="text-brand font-medium">Privacy Policy</span>
              </span>
            </label>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-brand hover:underline"
          >
            Sign in →
          </Link>
        </p>
      </div>
    </div>
  );
}
