'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Loader2, Check, AlertTriangle, XCircle, Clock,
  RefreshCw, HelpCircle,
} from 'lucide-react';
import { useSellOperationStatus, useCancelSellOperation } from '@/lib/hooks';
import { toast } from 'sonner';

interface SellProgressModalProps {
  operationId: string;
  onClose: () => void;
  onRetry?: (failedAssetIds: string[]) => void;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  queued: {
    icon: <Clock size={14} />,
    color: 'text-muted',
    label: 'Queued',
  },
  listing: {
    icon: <Loader2 size={14} className="animate-spin" />,
    color: 'text-primary',
    label: 'Listing...',
  },
  listed: {
    icon: <Check size={14} />,
    color: 'text-profit',
    label: 'Listed',
  },
  failed: {
    icon: <XCircle size={14} />,
    color: 'text-loss',
    label: 'Failed',
  },
  uncertain: {
    icon: <HelpCircle size={14} />,
    color: 'text-warning',
    label: 'Uncertain',
  },
  cancelled: {
    icon: <X size={14} />,
    color: 'text-muted',
    label: 'Cancelled',
  },
};

export function SellProgressModal({ operationId, onClose, onRetry }: SellProgressModalProps) {
  const { data: operation } = useSellOperationStatus(operationId);
  const cancelOp = useCancelSellOperation();

  const isActive = operation?.status === 'pending' || operation?.status === 'in_progress';
  const isDone = operation?.status === 'completed' || operation?.status === 'cancelled';

  const summary = useMemo(() => {
    if (!operation?.items) return { listed: 0, failed: 0, uncertain: 0, needsConfirmation: 0 };
    return {
      listed: operation.items.filter(i => i.status === 'listed').length,
      failed: operation.items.filter(i => i.status === 'failed').length,
      uncertain: operation.items.filter(i => i.status === 'uncertain').length,
      needsConfirmation: operation.items.filter(i => i.requiresConfirmation).length,
    };
  }, [operation?.items]);

  const failedItems = useMemo(
    () => (operation?.items ?? []).filter(i => i.status === 'failed'),
    [operation?.items]
  );

  const handleCancel = () => {
    cancelOp.mutate(operationId, {
      onSuccess: () => toast.info('Operation cancelled'),
      onError: () => toast.error('Failed to cancel'),
    });
  };

  const handleRetry = () => {
    if (onRetry && failedItems.length > 0) {
      onRetry(failedItems.map(i => i.assetId));
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={isDone ? onClose : undefined}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full sm:max-w-lg glass-strong sm:rounded-2xl rounded-t-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/30">
            <div className="flex items-center gap-3">
              {isActive ? (
                <Loader2 size={20} className="animate-spin text-primary" />
              ) : isDone && summary.failed === 0 ? (
                <Check size={20} className="text-profit" />
              ) : (
                <AlertTriangle size={20} className="text-warning" />
              )}
              <div>
                <h2 className="text-base font-bold">
                  {isActive ? 'Listing Items...' : 'Sell Complete'}
                </h2>
                <p className="text-xs text-muted">
                  {operation ? `${(operation.completedItems ?? 0) + (operation.failedItems ?? 0)}/${operation.totalItems} processed` : 'Starting...'}
                </p>
              </div>
            </div>
            {isDone && (
              <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors">
                <X size={18} />
              </button>
            )}
          </div>

          {/* Progress bar */}
          {operation && (
            <div className="h-1 bg-surface-light">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{
                  width: `${Math.round(((operation.completedItems ?? 0) + (operation.failedItems ?? 0)) / operation.totalItems * 100)}%`,
                }}
              />
            </div>
          )}

          {/* Items list */}
          <div className="p-4 space-y-1.5 max-h-[50vh] overflow-y-auto">
            {(operation?.items ?? []).map((item) => {
              const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.queued;
              return (
                <div key={item.assetId} className="flex items-center gap-3 p-2.5 glass rounded-xl">
                  <div className={`shrink-0 ${config.color}`}>
                    {config.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.marketHashName}</p>
                    {item.error && (
                      <p className="text-[10px] text-loss truncate">{item.error}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {item.priceCents > 0 && (
                      <span className="text-xs font-mono text-muted">
                        ${(item.priceCents / 100).toFixed(2)}
                      </span>
                    )}
                    <span className={`text-[10px] font-medium ${config.color}`}>
                      {config.label}
                    </span>
                    {item.requiresConfirmation && item.status === 'listed' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-medium">
                        Confirm
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          {isDone && (
            <div className="p-4 border-t border-border/30 space-y-3">
              <div className="flex items-center gap-4 text-xs">
                {summary.listed > 0 && (
                  <span className="text-profit font-medium">{summary.listed} listed</span>
                )}
                {summary.failed > 0 && (
                  <span className="text-loss font-medium">{summary.failed} failed</span>
                )}
                {summary.uncertain > 0 && (
                  <span className="text-warning font-medium">{summary.uncertain} uncertain</span>
                )}
              </div>

              {summary.needsConfirmation > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20">
                  <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                  <p className="text-xs text-warning">
                    {summary.needsConfirmation} item{summary.needsConfirmation > 1 ? 's' : ''} need confirmation in Steam mobile app.
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                {failedItems.length > 0 && onRetry && (
                  <button
                    onClick={handleRetry}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 glass rounded-xl text-sm font-medium hover:bg-surface-light transition-colors"
                  >
                    <RefreshCw size={14} />
                    Retry Failed ({failedItems.length})
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Cancel button during operation */}
          {isActive && (
            <div className="p-4 border-t border-border/30">
              <button
                onClick={handleCancel}
                disabled={cancelOp.isPending}
                className="w-full px-4 py-2.5 glass rounded-xl text-sm font-medium text-muted hover:text-loss hover:bg-loss/10 transition-colors disabled:opacity-50"
              >
                {cancelOp.isPending ? 'Cancelling...' : 'Cancel Operation'}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
