import { Skeleton } from "@/components/ui/skeleton";

/** Shown the instant Home is clicked, while the server renders it. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy aria-label="Loading Home">
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Skeleton className="h-56 rounded-lg" />
        <Skeleton className="h-56 rounded-lg" />
      </div>
      <Skeleton className="h-6 w-40" />
      <div className="grid gap-3 md:grid-cols-3">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  );
}
