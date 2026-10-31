import Link from "next/link";
import type { RosterStatus, VerificationStatus } from "@prisma/client";

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5 font-display text-lg font-extrabold tracking-tight text-ink">
      <span
        className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand-600 pt-1 text-[15px] leading-none text-white shadow-[inset_0_-3px_0_var(--color-haldi-400)] transition-transform duration-200 group-hover:-rotate-6"
        aria-hidden
      >
        हि
      </span>
      <span>Hisaab</span>
    </Link>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "good" | "warn" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-ink";
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`tabular mt-1 font-display text-2xl leading-tight font-extrabold ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** Fills from empty on first paint: the one moment on the overview worth watching. */
export function Progress({ value, tone = "paid" }: { value: number; tone?: "paid" | "brand" }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full transition-[width] duration-700 ease-out-soft" style={{ width: `${pct}%` }}>
        <div className={`h-full origin-left animate-fill rounded-full ${tone === "paid" ? "bg-emerald-500" : "bg-brand-500"}`} />
      </div>
    </div>
  );
}

const VERIFICATION: Record<VerificationStatus, [string, string]> = {
  VERIFIED: ["AI verified", "bg-emerald-50 text-emerald-700"],
  APPROVED: ["Approved", "bg-emerald-50 text-emerald-700"],
  NEEDS_REVIEW: ["Needs review", "bg-amber-50 text-amber-700"],
  UNVERIFIED: ["Unverified", "bg-slate-100 text-slate-600"],
  REJECTED: ["Rejected", "bg-rose-50 text-rose-700"],
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const [text, cls] = VERIFICATION[status];
  return <span className={`badge ${cls}`}>{text}</span>;
}

const ROSTER: Record<RosterStatus, [string, string]> = {
  MATCHED: ["Paid", "bg-emerald-50 text-emerald-700"],
  SUGGESTED: ["Likely paid", "bg-sky-50 text-sky-700"],
  PENDING: ["Not paid", "bg-amber-50 text-amber-700"],
  EXCLUDED: ["Excluded", "bg-slate-100 text-slate-500"],
};

export function RosterBadge({ status }: { status: RosterStatus }) {
  const [text, cls] = ROSTER[status];
  return <span className={`badge ${cls}`}>{text}</span>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-6 py-8 text-center">
      <div className="font-display font-semibold text-ink">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export type Outcome = "confirmed" | "rejected" | "waiting";

const OUTCOME_ICON: Record<Outcome, string> = {
  confirmed: "bg-emerald-600 text-white",
  rejected: "bg-rose-600 text-white",
  waiting: "bg-amber-400 text-amber-950",
};

/** A tick that draws itself, a cross, or a clock with a slow "still listening" ring. */
export function OutcomeIcon({ outcome, size = 48 }: { outcome: Outcome; size?: number }) {
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }} aria-hidden>
      {outcome === "waiting" && <span className="absolute inset-0 animate-ring rounded-full bg-amber-300" />}
      <span className={`relative grid h-full w-full animate-pop place-items-center rounded-full ${OUTCOME_ICON[outcome]}`}>
        <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          {outcome === "confirmed" && <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} strokeDasharray={1} className="animate-draw" />}
          {outcome === "rejected" && <path d="M7 7l10 10M17 7L7 17" />}
          {outcome === "waiting" && (
            <>
              <circle cx="12" cy="12" r="8" />
              <path d="M12 8v4.5l3 1.8" />
            </>
          )}
        </svg>
      </span>
    </span>
  );
}

/** The rubber stamp from a paper receipt book. */
export function Stamp({ children, tone = "paid" }: { children: React.ReactNode; tone?: "paid" | "void" }) {
  const color = tone === "paid" ? "border-emerald-700 text-emerald-700" : "border-rose-700 text-rose-700";
  return (
    <span
      className={`inline-block animate-stamp rounded-lg border-[3px] px-4 pt-2 pb-1 font-display text-3xl leading-none font-extrabold tracking-wide outline-2 outline-offset-2 outline-current/40 outline-dashed ${color}`}
    >
      {children}
    </span>
  );
}
