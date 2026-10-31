import { Logo } from "@/components/ui";
import { demoLoginEnabled } from "@/lib/auth";
import { LoginButtons } from "./LoginButtons";

// Providers depend on runtime env (Cloud Run), not build-time env.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <Logo />
      <div className="card">
        <h1 className="text-lg font-semibold">Sign in as an organizer</h1>
        <p className="mb-4 mt-1 text-sm text-slate-500">Contributors don&apos;t need an account — they register from your invite link.</p>
        <LoginButtons google={!!process.env.GOOGLE_CLIENT_ID} demo={demoLoginEnabled} />
      </div>
    </main>
  );
}
