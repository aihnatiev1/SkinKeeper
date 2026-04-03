'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, TrendingUp, TrendingDown } from 'lucide-react';
import { useCreateAlert } from '@/lib/hooks';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

interface CreateAlertModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateAlertModal({ open, onClose }: CreateAlertModalProps) {
  const [itemName, setItemName] = useState('');
  const [condition, setCondition] = useState<'above' | 'below'>('below');
  const [threshold, setThreshold] = useState('');
  const [source, setSource] = useState('steam');
  const createAlert = useCreateAlert();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !threshold) return;

    try {
      await createAlert.mutateAsync({
        market_hash_name: itemName.trim(),
        condition,
        threshold: Math.round(parseFloat(threshold) * 100),
        source,
      });
      toast.success('Alert created');
      setItemName('');
      setThreshold('');
      onClose();
    } catch {
      toast.error('Failed to create alert');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md glass-strong rounded-2xl p-6"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Bell size={20} className="text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Create Price Alert</h2>
                <p className="text-xs text-muted">Get notified when a price target is hit</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-muted mb-1.5 block">Item Name</label>
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="AK-47 | Redline (Field-Tested)"
                  className="w-full px-4 py-2.5 glass rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-muted mb-1.5 block">Condition</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCondition('below')}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      condition === 'below'
                        ? 'bg-profit/10 text-profit ring-1 ring-profit/30'
                        : 'glass text-muted hover:text-foreground'
                    }`}
                  >
                    <TrendingDown size={16} />
                    Below
                  </button>
                  <button
                    type="button"
                    onClick={() => setCondition('above')}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      condition === 'above'
                        ? 'bg-loss/10 text-loss ring-1 ring-loss/30'
                        : 'glass text-muted hover:text-foreground'
                    }`}
                  >
                    <TrendingUp size={16} />
                    Above
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted mb-1.5 block">Price Threshold ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder="10.00"
                  className="w-full px-4 py-2.5 glass rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-muted mb-1.5 block">Price Source</label>
                <div className="grid grid-cols-3 gap-2">
                  {['steam', 'skinport', 'csfloat'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSource(s)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium capitalize transition-all ${
                        source === s
                          ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                          : 'glass text-muted hover:text-foreground'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={createAlert.isPending || !itemName.trim() || !threshold}
                className="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-bold transition-all hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 active:scale-[0.98]"
              >
                {createAlert.isPending ? 'Creating...' : 'Create Alert'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
