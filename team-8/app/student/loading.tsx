import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-9 w-16" />
          <Skeleton className="mt-4 h-3 w-32" />
        </div>
        <div className="rounded-xl border bg-card p-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-9 w-16" />
          <Skeleton className="mt-4 h-3 w-20" />
        </div>
        <div className="rounded-xl border bg-card p-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-9 w-20" />
          <Skeleton className="mt-4 h-3 w-28" />
        </div>
      </div>
    </div>
  );
}
