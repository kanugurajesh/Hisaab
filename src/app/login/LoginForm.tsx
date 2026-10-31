"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signUp } from "./actions";

export function LoginForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const signingUp = mode === "signup";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setError(undefined);
    startTransition(async () => {
      if (signingUp) {
        const res = await signUp({ name: String(form.get("name") ?? ""), email, password });
        if (!res.ok) return setError(res.error);
      }
      const res = await signIn("password", { email, password, redirect: false });
      if (!res?.ok) return setError(res?.error && res.error !== "CredentialsSignin" ? res.error : "Incorrect email or password.");
      router.replace("/events");
      router.refresh();
    });
  }

  return (
    <>
      <h1 className="text-lg font-semibold">{signingUp ? "Create an organizer account" : "Sign in as an organizer"}</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">Contributors don&apos;t need an account — they register from your invite link.</p>

      <form onSubmit={submit} className="space-y-3">
        {signingUp && (
          <div>
            <label className="label" htmlFor="name">Your name</label>
            <input id="name" name="name" className="input" autoComplete="name" required />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete={signingUp ? "new-password" : "current-password"}
            minLength={signingUp ? 8 : undefined}
            required
          />
          {signingUp && <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>}
        </div>
        {error && (
          <p className="text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full py-2.5" disabled={pending}>
          {pending ? (signingUp ? "Creating account…" : "Signing in…") : signingUp ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-3 text-center text-sm text-slate-500">
        {signingUp ? "Already have an account?" : "New to Hisaab?"}{" "}
        <button
          type="button"
          className="font-medium text-brand-600 hover:underline"
          onClick={() => {
            setMode(signingUp ? "signin" : "signup");
            setError(undefined);
          }}
        >
          {signingUp ? "Sign in" : "Create an account"}
        </button>
      </p>

      {demo && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            or
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <button className="btn-secondary w-full py-2.5" onClick={() => signIn("demo", { callbackUrl: "/events" })}>
            Try the demo organizer account
          </button>
        </>
      )}
    </>
  );
}
