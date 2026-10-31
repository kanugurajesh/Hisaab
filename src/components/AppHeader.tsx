import Link from "next/link";
import { SignOut } from "./SignOut";
import { Logo } from "./ui";

export function AppHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Logo />
        <nav className="flex items-center gap-1">
          <Link href="/events" className="btn-ghost">
            Collections
          </Link>
          <SignOut />
        </nav>
      </div>
    </header>
  );
}
