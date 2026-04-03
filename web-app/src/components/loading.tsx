'use client';

import { motion } from 'framer-motion';

export function LoadingSpinner({ size = 24 }: { size?: number }) {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      className="text-primary"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
      </svg>
    </motion.div>
  );
}

export function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
      <LoadingSpinner size={36} />
      <span className="text-sm text-muted animate-pulse">Loading...</span>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="glass rounded-xl p-5 border border-border/50">
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 bg-surface-light rounded w-1/3 animate-pulse" />
        <div className="h-8 w-8 bg-surface-light rounded-lg animate-pulse" />
      </div>
      <div className="h-8 bg-surface-light rounded w-2/3 mb-2 animate-pulse" />
      <div className="h-3 bg-surface-light rounded w-1/2 animate-pulse" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="glass rounded-xl border border-border/50 overflow-hidden">
      <div className="px-6 py-3 border-b border-border/50">
        <div className="h-4 bg-surface-light rounded w-1/4 animate-pulse" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-3 border-b border-border/30">
          <div className="h-8 w-10 bg-surface-light rounded animate-pulse" />
          <div className="flex-1">
            <div className="h-4 bg-surface-light rounded w-1/3 mb-1 animate-pulse" />
            <div className="h-3 bg-surface-light rounded w-1/5 animate-pulse" />
          </div>
          <div className="h-4 bg-surface-light rounded w-16 animate-pulse" />
        </div>
      ))}
    </div>
  );
}
