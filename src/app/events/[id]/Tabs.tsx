"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useOptimistic, useRef, useState, useTransition } from "react";

type Tab = { id: string; label: string; badge: number };

/**
 * The section tabs. The underline slides to the tab you picked straight away and
 * the old panel dims while the server renders the new one, so a slow query
 * still feels like the click landed.
 */
export function Tabs({ tabs, active, children }: { tabs: Tab[]; active: string; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, select] = useOptimistic(active);
  const nav = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = nav.current?.querySelector<HTMLElement>(`[data-tab="${selected}"]`);
      if (!el) return;
      setBar({ left: el.offsetLeft, width: el.offsetWidth });
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [selected]);

  return (
    <>
      <nav ref={nav} className="relative -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 [scrollbar-width:none]" aria-label="Sections">
        {tabs.map((t) => {
          const on = t.id === selected;
          return (
            <Link
              key={t.id}
              href={`?tab=${t.id}`}
              data-tab={t.id}
              aria-current={t.id === active ? "page" : undefined}
              scroll={false}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                start(() => {
                  select(t.id);
                  router.push(`?tab=${t.id}`, { scroll: false });
                });
              }}
              className={`flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 pt-2 pb-2.5 text-sm font-medium transition-colors duration-150 ${
                on ? "text-brand-700" : "text-slate-500 hover:bg-slate-900/[0.03] hover:text-ink"
              }`}
            >
              {t.label}
              {t.badge > 0 && (
                <span key={t.badge} className="badge tabular animate-pop bg-amber-100 text-amber-800">
                  {t.badge}
                </span>
              )}
            </Link>
          );
        })}
        <span
          aria-hidden
          className={`pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-brand-600 ${bar ? "transition-[left,width] duration-300 ease-out-soft" : "opacity-0"}`}
          style={bar ?? undefined}
        />
      </nav>
      <div className={`transition-opacity duration-200 ${pending ? "pointer-events-none opacity-50" : ""}`} aria-busy={pending}>
        <div key={active} className="animate-enter">
          {children}
        </div>
      </div>
    </>
  );
}
