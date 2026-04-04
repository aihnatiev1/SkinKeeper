'use client';

import { Package, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';

interface StorageUnit {
  id: string;
  name: string;
  item_count: number;
}

interface StorageUnitSelectorProps {
  units: StorageUnit[];
  selected: string | null;
  onSelect: (id: string) => void;
  label?: string;
  loading?: boolean;
}

export function StorageUnitSelector({ units, selected, onSelect, label = 'Storage Unit', loading }: StorageUnitSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedUnit = units.find((u) => u.id === selected);

  return (
    <div ref={ref} className="relative">
      <span className="text-xs text-muted font-medium mb-1.5 block">{label}</span>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading || units.length === 0}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl glass border transition-all text-left',
          open ? 'border-primary/30' : 'border-border/50 hover:border-border',
          (loading || units.length === 0) && 'opacity-50 cursor-not-allowed'
        )}
      >
        <Package size={16} className="text-muted shrink-0" />
        <span className="flex-1 text-sm truncate">
          {selectedUnit ? selectedUnit.name : 'Select storage unit...'}
        </span>
        {selectedUnit && (
          <span className="text-xs text-muted tabular-nums">{selectedUnit.item_count} items</span>
        )}
        <ChevronDown size={14} className={cn('text-muted transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-30 top-full mt-1 left-0 right-0 glass-strong rounded-xl border border-border/50 shadow-2xl overflow-hidden max-h-60 overflow-y-auto"
          >
            {units.map((unit) => (
              <button
                key={unit.id}
                onClick={() => {
                  onSelect(unit.id);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors text-sm',
                  unit.id === selected
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-surface-light text-foreground'
                )}
              >
                <Package size={14} className="shrink-0 text-muted" />
                <span className="flex-1 truncate">{unit.name}</span>
                <span className="text-xs text-muted tabular-nums">{unit.item_count}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
