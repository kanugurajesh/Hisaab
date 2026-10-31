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

export default async function Home() {
  if (await getServerSession(authOptions)) redirect("/events");
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/login" className="btn-primary">
          Organizer sign in
        </Link>
      </header>
      <section className="py-14 text-center sm:py-20">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
          Collect from everyone.
          <br />
          <span className="text-brand-600">Chase no one.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-600">
          See who <em>hasn&apos;t</em> paid, nudge them on WhatsApp, and verify every UPI screenshot automatically.
        </p>
        <Link href="/login" className="btn-primary mt-8 px-6 py-3 text-base">
          Start a collection
        </Link>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card">
            <h2 className="font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
