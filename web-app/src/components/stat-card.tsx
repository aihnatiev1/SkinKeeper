'use client';

import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  positive?: boolean;
  icon?: ReactNode;
}

export function StatCard({ label, value, change, positive, icon }: StatCardProps) {
  return (
    <div className="bg-surface rounded-xl p-5 border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted">{label}</span>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <p className="text-2xl font-semibold mb-1">{value}</p>
      {change && (
        <p
          className={cn(
            'text-sm font-medium',
            positive === true && 'text-profit',
            positive === false && 'text-loss',
            positive === undefined && 'text-muted'
          )}
        >
          {change}
        </p>
      )}
    </div>
  );
}
