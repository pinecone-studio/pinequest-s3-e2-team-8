import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="rounded-xl border bg-card p-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-9 w-16" />
            <Skeleton className="mt-4 h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
