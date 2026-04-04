import { useEffect, useRef } from 'react';
import { useTransferStore } from '@/lib/transfer-store';
import { toast } from 'sonner';

type MoveFn = (itemIds: string[], unitId: string) => Promise<{ success: boolean; moved: number } | undefined>;

/**
 * Fastmove queue processor.
 * Watches the queue and moves items one at a time.
 * Pass the appropriate move function (moveToUnit or moveFromUnit) and the unit ID.
 */
export function useFastmove(moveFn: MoveFn, unitId: string | null) {
  const {
    fastmove, queue, processingItem,
    setProcessingItem, removeFromQueue, addMovedItem,
  } = useTransferStore();
  const processingRef = useRef(false);

  useEffect(() => {
    if (!fastmove || !unitId || queue.length === 0 || processingRef.current) return;

    const nextItem = queue[0];
    if (!nextItem) return;

    processingRef.current = true;
    setProcessingItem(nextItem);

    moveFn([nextItem], unitId).then((result) => {
      removeFromQueue(nextItem);
      if (result?.success && result.moved > 0) {
        addMovedItem(nextItem);
      } else {
        toast.error('Failed to move item');
      }
      setProcessingItem(null);
      processingRef.current = false;
    }).catch(() => {
      removeFromQueue(nextItem);
      setProcessingItem(null);
      processingRef.current = false;
    });
  }, [fastmove, queue, unitId, processingItem]);

  return {
    queueLength: queue.length,
    isProcessing: !!processingItem,
  };
}
