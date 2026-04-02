export default function StudentPracticeLoading() {
  return (
    <div className="space-y-6 pb-10">
      <div className="space-y-2">
        <div className="h-5 w-24 animate-pulse rounded bg-zinc-100" />
        <div className="h-8 w-72 animate-pulse rounded bg-zinc-200" />
        <div className="h-4 w-64 animate-pulse rounded bg-zinc-100" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="h-5 w-32 animate-pulse rounded bg-zinc-200" />
          <div className="mt-4 grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-lg bg-zinc-100" />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="h-6 w-28 animate-pulse rounded bg-zinc-200" />
          <div className="mt-4 h-28 animate-pulse rounded-xl bg-zinc-100" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-zinc-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
