'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { useAlerts, useDeleteAlert } from '@/lib/hooks';
import { formatPrice, getItemIconUrl } from '@/lib/utils';
import { Bell, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AlertsPage() {
  const { data: alerts, isLoading } = useAlerts();
  const deleteAlert = useDeleteAlert();

  return (
    <div>
      <Header title="Price Alerts" />
      <div className="p-6 space-y-4">
        {isLoading ? (
          <PageLoader />
        ) : !alerts || alerts.length === 0 ? (
          <div className="text-center text-muted py-20">
            <Bell size={40} className="mx-auto mb-3 opacity-50" />
            <p>No alerts set</p>
            <p className="text-sm mt-1">Create alerts from item detail pages</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <motion.div
                key={alert.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface rounded-xl border border-border p-4 flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {alert.market_hash_name}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
                    {alert.condition === 'above' ? (
                      <TrendingUp size={12} className="text-profit" />
                    ) : (
                      <TrendingDown size={12} className="text-loss" />
                    )}
                    <span>
                      {alert.condition === 'above' ? 'Above' : 'Below'}{' '}
                      {formatPrice(alert.threshold / 100)}
                    </span>
                    <span className="text-muted">({alert.source})</span>
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    alert.is_active
                      ? 'bg-profit/10 text-profit'
                      : 'bg-muted/10 text-muted'
                  }`}
                >
                  {alert.is_active ? 'Active' : 'Triggered'}
                </span>
                <button
                  onClick={() => deleteAlert.mutate(alert.id)}
                  className="text-muted hover:text-loss transition-colors p-1"
                >
                  <Trash2 size={16} />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
