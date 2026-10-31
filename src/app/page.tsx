import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { authOptions } from "@/lib/auth";

const FEATURES = [
  {
    title: "See who hasn't paid",
    body: "Import your WhatsApp group. AI matches every member to the people who registered: \"Ravi K\", \"Ravi Kumar 302\" and his UPI name all become one person.",
  },
  {
    title: "Nudge them in one tap",
    body: "Personal reminders in English, Hindi or Telugu, each with their own link. Open WhatsApp, hit send. The tone escalates politely.",
  },
  {
    title: "Stop checking screenshots",
    body: "AI reads each UPI screenshot; plain rules check the amount, receiver, date and reused UTRs. You only review the ones that look off.",
  },
];

// The hero plays one collection filling up: four people pay, one gets a reminder.
const DEMO: { name: string; note: string; after: "Paid" | "Reminder sent" }[] = [
  { name: "Ravi Kumar 302", note: "UPI screenshot verified", after: "Paid" },
  { name: "Priya S", note: "matched to “Priya Sharma”", after: "Paid" },
  { name: "Anil Varma", note: "reminded in Telugu", after: "Reminder sent" },
  { name: "Kiran (B-1104)", note: "UPI screenshot verified", after: "Paid" },
  { name: "Meera Iyer", note: "approved by you", after: "Paid" },
];
const STEP_MS = 650;
const FIRST_MS = 500;

export default async function Home() {
  if (await getServerSession(authOptions)) redirect("/events");
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/login" className="btn-ghost">
          Organizer sign in
        </Link>
      </header>

      <section className="grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div className="animate-enter">
          <h1 className="text-[2.6rem] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl">
            Collect from everyone. Chase no one.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-600">
            For whoever ends up holding the money for the Diwali party, the trip or the society fund. See who hasn&apos;t paid, nudge them on WhatsApp,
            and let Hisaab check every UPI screenshot.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/login" className="btn-primary px-6 py-3 text-base">
              Start a collection
            </Link>
            <span className="text-sm text-slate-500">Free. Contributors don&apos;t need an account.</span>
          </div>
        </div>

        <LedgerDemo />
      </section>

      <section className="grid gap-x-10 gap-y-8 border-t border-slate-200 pt-10 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title}>
            <h2 className="text-lg font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
          </div>
        ))}
      </section>
      <p className="mt-16 text-center text-xs text-slate-400">Hisaab never holds money. People pay the organizer directly by UPI.</p>
    </main>
  );
}

function LedgerDemo() {
  const paid = DEMO.filter((d) => d.after === "Paid").length;
  return (
    <div
      role="img"
      aria-label={`Example collection: ${paid} of ${DEMO.length} people paid, one reminder sent on WhatsApp`}
      className="relative mx-auto w-full max-w-md animate-enter [animation-delay:120ms]"
    >
      <div className="absolute inset-0 translate-x-2.5 translate-y-2.5 rotate-[1.5deg] rounded-3xl bg-brand-600" aria-hidden />
      <div className="relative rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-28px_rgb(29_27_87/0.45)]">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="font-display text-lg font-semibold">Diwali 2026 · Tower B</div>
            <div className="text-xs text-slate-500">₹1,500 per head · 5 in the group</div>
          </div>
          <div className="tabular animate-pop text-right font-display text-xl font-extrabold" style={{ animationDelay: `${FIRST_MS + DEMO.length * STEP_MS}ms` }}>
            <span className="text-emerald-700">{paid}</span>
            <span className="text-slate-300">/{DEMO.length}</span>
          </div>
        </div>
        {/* One notch per person, filled the moment their row turns to Paid. */}
        <div className="mt-3 flex gap-1" aria-hidden>
          {DEMO.map((d, i) => (
            <span key={d.name} className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              {d.after === "Paid" && (
                <span className="block h-full origin-left animate-fill bg-emerald-500" style={{ animationDelay: `${FIRST_MS + i * STEP_MS + 120}ms` }} />
              )}
            </span>
          ))}
        </div>
        <ul className="mt-4 divide-y divide-slate-100">
          {DEMO.map((d, i) => {
            const delay = FIRST_MS + i * STEP_MS;
            const paidRow = d.after === "Paid";
            return (
              <li key={d.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{d.name}</span>
                  <span className="block truncate text-xs text-slate-400 animate-enter" style={{ animationDelay: `${delay}ms` }}>
                    {d.note}
                  </span>
                </span>
                <span className="grid shrink-0 place-items-end">
                  <span className="badge col-start-1 row-start-1 bg-amber-50 text-amber-700" style={{ animation: `fade-out 180ms ease ${delay}ms both` }}>
                    Not paid
                  </span>
                  <span
                    className={`badge col-start-1 row-start-1 animate-pop ${paidRow ? "bg-emerald-50 text-emerald-700" : "bg-[#25d366]/15 text-[#128c4a]"}`}
                    style={{ animationDelay: `${delay + 120}ms` }}
                  >
                    {paidRow && (
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    )}
                    {d.after}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
