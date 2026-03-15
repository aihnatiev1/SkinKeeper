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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
      </svg>
    </motion.div>
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <LoadingSpinner size={40} />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="animate-pulse bg-surface rounded-xl p-6">
      <div className="h-4 bg-surface-light rounded w-1/3 mb-4" />
      <div className="h-8 bg-surface-light rounded w-2/3 mb-2" />
      <div className="h-3 bg-surface-light rounded w-1/2" />
    </div>
  );
}
