export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-cream-200 ${className}`} />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between rounded-2xl border border-cream-200 bg-white p-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Dish-card skeletons for the menu loading state (image + two text lines + ADD pill). */
export function SkeletonMenu({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-cream-200 overflow-hidden rounded-2xl border border-cream-200 bg-white">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-7 w-16 rounded-full" />
          </div>
          <Skeleton className="h-20 w-20 rounded-xl" />
        </div>
      ))}
    </div>
  );
}