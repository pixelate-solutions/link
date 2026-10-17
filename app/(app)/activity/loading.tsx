import { Skeleton } from "@/components/ui/skeleton";

/** Shown the instant Activity is clicked, while the server renders it. */
export default function Loading() {
  return (
    <div aria-busy aria-label="Loading Activity">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Activity</h1>
        <Skeleton className="h-11 rounded-full md:w-80" />
      </div>
      <div className="mt-4 flex gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className={i === 1 ? "h-8 w-28 rounded-full" : "h-8 w-16 rounded-full"} />
        ))}
      </div>
      <div className="mt-5 space-y-5">
        {[4, 3].map((n, g) => (
          <div key={g}>
            <Skeleton className="mb-2 h-3 w-24" />
            <div className="space-y-px overflow-hidden rounded-lg bg-surface">
              {Array.from({ length: n }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
