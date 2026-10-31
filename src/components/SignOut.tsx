"use client";

import { signOut } from "next-auth/react";

export function SignOut() {
  return (
    <button className="btn-ghost" onClick={() => signOut({ callbackUrl: "/" })}>
      Sign out
    </button>
  );
}
