'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { CreateAlertModal } from '@/components/create-alert-modal';
import { useAlerts, useDeleteAlert } from '@/lib/hooks';
import { formatPrice } from '@/lib/utils';
import { Bell, Trash2, TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { toast } from 'sonner';

export default function AlertsPage() {
  const { data: alerts, isLoading } = useAlerts();
  const deleteAlert = useDeleteAlert();
  const [showCreate, setShowCreate] = useState(false);

  const handleDelete = (id: number) => {
    deleteAlert.mutate(id, {
      onSuccess: () => toast.success('Alert deleted'),
      onError: () => toast.error('Failed to delete alert'),
    });
  };

  return (
    <div>
      <Header title="Price Alerts" />
      <div className="p-4 lg:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            {alerts?.length || 0} alert{(alerts?.length || 0) !== 1 ? 's' : ''} active
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]"
          >
            <Plus size={14} />
            New Alert
          </button>
        </div>

        {isLoading ? (
          <PageLoader />
        ) : !alerts || alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted py-20">
            <Bell size={48} className="mb-3 opacity-30" />
            <p className="text-sm">No alerts set</p>
            <p className="text-xs mt-1">Create alerts to get notified when prices change</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25"
            >
              Create your first alert
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert, i) => (
              <motion.div
                key={alert.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass rounded-2xl border border-border/30 p-4 flex items-center gap-4 hover:border-primary/15 transition-all"
              >
                <div className={`p-2.5 rounded-xl shrink-0 ${
                  alert.condition === 'above' ? 'bg-loss/10' : 'bg-profit/10'
                }`}>
                  {alert.condition === 'above' ? (
                    <TrendingUp size={18} className="text-loss" />
                  ) : (
                    <TrendingDown size={18} className="text-profit" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {alert.market_hash_name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
                    <span>
                      {alert.condition === 'above' ? 'Above' : 'Below'}{' '}
                      <span className="font-medium text-foreground">{formatPrice(alert.threshold / 100)}</span>
                    </span>
                    <span className="w-1 h-1 rounded-full bg-muted" />
                    <span className="capitalize">{alert.source}</span>
                  </div>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${
                    alert.is_active
                      ? 'bg-profit/10 text-profit'
                      : 'bg-muted/10 text-muted'
                  }`}
                >
                  {alert.is_active ? 'Active' : 'Triggered'}
                </span>
                <button
                  onClick={() => handleDelete(alert.id)}
                  className="text-muted hover:text-loss transition-colors p-2 rounded-lg hover:bg-loss/10 shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <CreateAlertModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
