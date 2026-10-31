import { Logo } from "@/components/ui";
import { demoLoginEnabled } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

// The demo provider depends on runtime env (Cloud Run), not build-time env.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <Logo />
      <div className="card">
        <LoginForm demo={demoLoginEnabled} />
      </div>
    </main>
  );
}
