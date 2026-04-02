import { Skeleton } from "@/components/ui/skeleton";

function HeaderLoading() {
  return (
    <div className="flex h-30.5 flex-col gap-5 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="h-[49px] w-[344px] min-w-0 space-y-2">
        <Skeleton className="h-7 w-48 rounded-md" />
        <Skeleton className="h-4 w-72 max-w-full rounded-md" />
      </div>

      <div className="flex h-[40px] w-[100px] items-center justify-end gap-[20px] self-end sm:self-auto">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    </div>
  );
}

function ContentLoading() {
  return (
    <div className="space-y-6 pb-8">
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="rounded-xl border bg-card p-6">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="mt-3 h-9 w-16 rounded-md" />
            <Skeleton className="mt-4 h-3 w-32 rounded-md" />
          </div>
        ))}
      </div>

      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <Skeleton className="h-6 w-56 rounded-md" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full rounded-md" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Skeleton key={idx} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>

      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <Skeleton className="h-6 w-40 rounded-md" />
        <div className="mt-6 space-y-4">
          {Array.from({ length: 5 }).map((_, idx) => (
            <Skeleton key={idx} className="h-14 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <main className="flex-1 overflow-y-auto bg-gradient-to-b from-[#e4f3fd] to-[#ffffff] px-16">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col">
        <HeaderLoading />
        <ContentLoading />
      </div>
    </main>
  );
}
