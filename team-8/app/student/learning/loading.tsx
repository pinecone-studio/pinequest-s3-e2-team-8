export default function StudentLearningLoading() {
  return (
    <div className="space-y-6 pb-10">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
        <div className="h-4 w-72 animate-pulse rounded bg-zinc-100" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="space-y-3">
              <div className="h-5 w-32 animate-pulse rounded bg-zinc-200" />
              <div className="h-4 w-24 animate-pulse rounded bg-zinc-100" />
              <div className="h-2 w-full animate-pulse rounded-full bg-zinc-100" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-5">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="h-6 w-56 animate-pulse rounded bg-zinc-200" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-xl border p-4">
                  <div className="h-4 w-40 animate-pulse rounded bg-zinc-200" />
                  <div className="mt-3 h-2 w-full animate-pulse rounded-full bg-zinc-100" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="h-6 w-48 animate-pulse rounded bg-zinc-200" />
            <div className="mt-4 h-24 animate-pulse rounded-xl bg-zinc-100" />
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="h-6 w-56 animate-pulse rounded bg-zinc-200" />
          <div className="mt-4 h-40 animate-pulse rounded-xl bg-zinc-100" />
        </div>
      </div>
    </div>
  );
}
