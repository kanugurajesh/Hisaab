import { AppHeader } from "@/components/AppHeader";

export default function Loading() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6" aria-busy aria-label="Loading collection">
        <div className="skeleton mb-2 h-8 w-64" />
        <div className="skeleton mb-6 h-4 w-80 max-w-full" />
        <div className="-mx-4 mb-5 flex gap-3 border-b border-slate-200 px-4 pb-3">
          {[72, 112, 72, 72, 48, 48].map((w, i) => (
            <div key={i} className="skeleton h-5 shrink-0" style={{ width: w }} />
          ))}
        </div>
        <div className="space-y-5">
          <div className="card space-y-3">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-2.5 w-full rounded-full" />
            <div className="skeleton h-4 w-56" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card space-y-2">
                <div className="skeleton h-4 w-16" />
                <div className="skeleton h-7 w-24" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
