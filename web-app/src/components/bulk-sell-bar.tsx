'use client';

import { useState } from 'react';
import { useCreateSellOperation, useSellOperationStatus } from '@/lib/hooks';
import { formatPrice } from '@/lib/utils';
import type { InventoryItem } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, X, Loader2, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface BulkSellBarProps {
  selectedItems: InventoryItem[];
  onClear: () => void;
}

export function BulkSellBar({ selectedItems, onClear }: BulkSellBarProps) {
  const createSell = useCreateSellOperation();
  const [operationId, setOperationId] = useState<string | null>(null);
  const { data: operation } = useSellOperationStatus(operationId);

  const totalValue = selectedItems.reduce((sum, item) => {
    const price = item.prices?.steam || item.prices?.buff || 0;
    return sum + price;
  }, 0);

  // Estimate seller receives (after 13% Steam commission)
  const sellerReceives = totalValue * 0.87;

  const handleSell = () => {
    const items = selectedItems
      .filter((item) => item.tradable && item.prices?.steam)
      .map((item) => ({
        assetId: item.asset_id,
        marketHashName: item.market_hash_name,
        priceCents: Math.round((item.prices.steam || 0) * 100),
      }));

    if (items.length === 0) {
      toast.error('No sellable items selected');
      return;
    }

    createSell.mutate(items, {
      onSuccess: (data) => {
        setOperationId(data.operationId);
        toast.success(`Listing ${items.length} items on Steam Market`);
      },
      onError: (err: any) => {
        toast.error(err?.message || 'Failed to create sell operation');
      },
    });
  };

  if (selectedItems.length === 0) return null;

  const isRunning = operationId && operation && (operation.status === 'pending' || operation.status === 'in_progress');
  const isDone = operationId && operation && operation.status === 'completed';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        className="fixed bottom-0 left-0 right-0 z-40 lg:left-[72px]"
      >
        <div className="max-w-5xl mx-auto px-4 pb-4">
          <div className="glass-strong rounded-2xl border border-border/50 p-4 flex items-center gap-4 shadow-2xl">
            {/* Item count */}
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShoppingCart size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold">{selectedItems.length} items</p>
                <p className="text-[10px] text-muted">selected</p>
              </div>
            </div>

            {/* Value summary */}
            <div className="flex-1 flex items-center gap-4">
              <div>
                <p className="text-[10px] text-muted">Market Value</p>
                <p className="text-sm font-semibold">{formatPrice(totalValue)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted">You receive (~)</p>
                <p className="text-sm font-semibold text-profit">{formatPrice(sellerReceives)}</p>
              </div>
            </div>

            {/* Operation progress */}
            {isRunning && (
              <div className="flex items-center gap-2 text-xs text-primary">
                <Loader2 size={14} className="animate-spin" />
                <span>Listing {operation.completedItems ?? 0}/{operation.totalItems}...</span>
              </div>
            )}

            {isDone && (
              <div className="flex items-center gap-2 text-xs text-profit">
                <Check size={14} />
                <span>All listed!</span>
              </div>
            )}

            {/* Actions */}
            <button
              onClick={handleSell}
              disabled={createSell.isPending || !!isRunning}
              className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50"
            >
              {createSell.isPending ? 'Creating...' : 'List on Market'}
            </button>

            <button
              onClick={() => { onClear(); setOperationId(null); }}
              className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
