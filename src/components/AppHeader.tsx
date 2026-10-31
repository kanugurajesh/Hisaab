import Link from "next/link";
import { SignOut } from "./SignOut";
import { Logo } from "./ui";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-md print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5">
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
