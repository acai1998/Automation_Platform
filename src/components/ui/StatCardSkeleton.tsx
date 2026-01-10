import { Skeleton } from "./skeleton";

export function StatCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl p-6 border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark shadow-sm">
      <div className="flex justify-between items-start">
        {/* Icon skeleton */}
        <Skeleton className="h-10 w-10 rounded-lg" />

        {/* Help icon skeleton */}
        <Skeleton className="h-6 w-6 rounded" />
      </div>

      {/* Value skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>

      {/* Trend skeleton */}
      <div className="flex items-center gap-1">
        <Skeleton className="h-3 w-3" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}