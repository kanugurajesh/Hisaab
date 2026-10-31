import { AppHeader } from "@/components/AppHeader";

export default function Loading() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6" aria-busy aria-label="Loading collections">
        <div className="skeleton h-8 w-52" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="card space-y-3">
              <div className="skeleton h-5 w-44" />
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
