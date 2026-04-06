export default function DashboardLoading() {
  return (
    <div className="p-4 lg:p-6 space-y-4 animate-pulse">
      {/* Header skeleton */}
      <div className="h-16 glass rounded-xl" />

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass rounded-xl p-4 space-y-3">
            <div className="h-3 w-20 bg-surface-light rounded" />
            <div className="h-7 w-28 bg-surface-light rounded" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="h-12 border-b border-border/30 flex items-center px-4 gap-4">
          <div className="h-3 w-32 bg-surface-light rounded" />
          <div className="h-3 w-20 bg-surface-light rounded" />
          <div className="h-3 w-16 bg-surface-light rounded ml-auto" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 border-b border-border/10 flex items-center px-4 gap-4">
            <div className="w-10 h-7 bg-surface-light rounded" />
            <div className="h-3 w-40 bg-surface-light rounded" />
            <div className="h-3 w-16 bg-surface-light rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
