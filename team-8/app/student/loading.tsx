import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40 max-w-full" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="rounded-xl border bg-card p-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-9 w-16" />
            <Skeleton className="mt-4 h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, idx) => (
          <div key={idx} className="rounded-xl border bg-card">
            <div className="flex items-start justify-between gap-4 border-b p-4 sm:p-5">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-full max-w-xs" />
              </div>
              <Skeleton className="h-8 w-24" />
            </div>
            <div className="space-y-3 p-4 sm:p-5">
              {Array.from({ length: 3 }).map((__, rowIdx) => (
                <div
                  key={rowIdx}
                  className="flex items-start justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48 max-w-full" />
                    <Skeleton className="h-3 w-32 max-w-full" />
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Skeleton className="h-5 w-12" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
