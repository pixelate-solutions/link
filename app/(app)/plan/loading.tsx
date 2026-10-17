import { Skeleton } from "@/components/ui/skeleton";

/** Shown the instant Plan is clicked, while the server renders it. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy aria-label="Loading Plan">
      <Skeleton className="h-64 rounded-lg" />
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-40 rounded-lg" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  );
}
