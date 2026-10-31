"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-renders the page from the server every few seconds while it's on screen,
 * and as soon as the tab comes back into view. Used while a payment waits for
 * the organizer, so their decision shows up without a manual refresh.
 */
export function AutoRefresh({ everyMs = 10_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, everyMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, everyMs]);
  return null;
}

export function PrintButton({ children }: { children: React.ReactNode }) {
  return (
    <button type="button" className="btn-primary print:hidden" onClick={() => window.print()}>
      {children}
    </button>
  );
}
