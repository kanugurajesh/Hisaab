"use client";

import { signIn } from "next-auth/react";

export function LoginButtons({ google, demo }: { google: boolean; demo: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {google && (
        <button className="btn-secondary py-2.5" onClick={() => signIn("google", { callbackUrl: "/events" })}>
          Continue with Google
        </button>
      )}
      {demo && (
        <button className="btn-primary py-2.5" onClick={() => signIn("demo", { callbackUrl: "/events" })}>
          Try the demo organizer account
        </button>
      )}
      {!google && !demo && <p className="text-sm text-rose-600">No sign-in method configured. Set GOOGLE_CLIENT_ID or DEMO_LOGIN.</p>}
    </div>
  );
}
