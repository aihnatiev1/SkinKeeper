'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { motion } from 'framer-motion';
import { Loader2, Check, AlertCircle, Backpack, Receipt, ArrowLeftRight } from 'lucide-react';

const STORAGE_KEY = 'sk_initial_sync_done';

type StepStatus = 'waiting' | 'syncing' | 'done' | 'error';

interface SyncStep {
  key: string;
  label: string;
  icon: React.ReactNode;
  status: StepStatus;
}

export function InitialSync() {
  const [visible, setVisible] = useState(false);
  const [steps, setSteps] = useState<SyncStep[]>([
    { key: 'inventory', label: 'Syncing inventory...', icon: <Backpack size={18} />, status: 'waiting' },
    { key: 'transactions', label: 'Syncing transactions...', icon: <Receipt size={18} />, status: 'waiting' },
    { key: 'trades', label: 'Syncing trades...', icon: <ArrowLeftRight size={18} />, status: 'waiting' },
  ]);
  const [done, setDone] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const synced = localStorage.getItem(STORAGE_KEY);
    if (!synced) {
      setVisible(true);
      runSync();
    }
  }, []);

  const updateStep = (key: string, status: StepStatus) => {
    setSteps((prev) => prev.map((s) => s.key === key ? { ...s, status } : s));
  };

  const runSync = async () => {
    // 1. Inventory
    updateStep('inventory', 'syncing');
    try {
      await api.post('/inventory/refresh');
      updateStep('inventory', 'done');
    } catch {
      updateStep('inventory', 'error');
    }

    // 2. Transactions
    updateStep('transactions', 'syncing');
    try {
      await api.post('/transactions/sync');
      updateStep('transactions', 'done');
    } catch {
      updateStep('transactions', 'error');
    }

    // 3. Trades
    updateStep('trades', 'syncing');
    try {
      await api.post('/trades/sync');
      updateStep('trades', 'done');
    } catch {
      updateStep('trades', 'error');
    }

    // Invalidate all queries to refresh UI
    qc.invalidateQueries();
    localStorage.setItem(STORAGE_KEY, '1');
    setDone(true);

    // Auto-dismiss after 1.5s
    setTimeout(() => setVisible(false), 1500);
  };

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm glass-strong rounded-2xl p-8 text-center"
      >
        <div className="text-2xl font-bold text-gradient mx-auto mb-6">
          SkinKeeper
        </div>

        <h2 className="text-lg font-bold mb-2">
          {done ? 'All synced!' : 'Setting up your account...'}
        </h2>
        <p className="text-xs text-muted mb-6">
          {done ? 'Your data is ready.' : 'Loading your inventory and history from Steam.'}
        </p>

        <div className="space-y-3 text-left">
          {steps.map((step, i) => (
            <motion.div
              key={step.key}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-lg glass flex items-center justify-center shrink-0">
                {step.status === 'waiting' && <span className="text-muted">{step.icon}</span>}
                {step.status === 'syncing' && <Loader2 size={16} className="animate-spin text-primary" />}
                {step.status === 'done' && <Check size={16} className="text-profit" />}
                {step.status === 'error' && <AlertCircle size={16} className="text-loss" />}
              </div>
              <span className={`text-sm ${
                step.status === 'done' ? 'text-profit' :
                step.status === 'error' ? 'text-loss' :
                step.status === 'syncing' ? 'text-foreground' :
                'text-muted'
              }`}>
                {step.status === 'done' ? step.label.replace('Syncing', 'Synced').replace('...', '') :
                 step.status === 'error' ? step.label.replace('Syncing', 'Failed to sync').replace('...', '') :
                 step.label}
              </span>
            </motion.div>
          ))}
        </div>

        {done && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-xs text-muted"
          >
            Redirecting to dashboard...
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
