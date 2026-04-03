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
    <div className="stat-card glass rounded-xl p-5 border border-border/50">
      <div className="relative flex items-center justify-between mb-3">
        <span className="text-sm text-muted">{label}</span>
        {icon && (
          <span className={cn(
            'p-1.5 rounded-lg',
            positive === true && 'bg-profit/10 text-profit',
            positive === false && 'bg-loss/10 text-loss',
            positive === undefined && 'bg-surface-light text-muted',
          )}>
            {icon}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold mb-1 tracking-tight">{value}</p>
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
