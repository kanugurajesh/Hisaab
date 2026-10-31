import Link from "next/link";
import type { RosterStatus, VerificationStatus } from "@prisma/client";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-white">H</span>
      <span>Hisaab</span>
    </Link>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "good" | "warn" }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-slate-900";
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
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
    <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
      <div className="font-medium text-slate-700">{title}</div>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}
