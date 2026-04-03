'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { StatCard } from '@/components/stat-card';
import { useTransactions, useTransactionStats, useSyncTransactions } from '@/lib/hooks';
import { formatPrice, formatDate, getItemIconUrl, cn } from '@/lib/utils';
import { RefreshCw, ShoppingCart, Tag, Search, Receipt } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

type TxFilter = 'all' | 'buy' | 'sell';

function cents(v: number) { return v / 100; }

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function TransactionsPage() {
  const [typeFilter, setTypeFilter] = useState<TxFilter>('all');
  const [search, setSearch] = useState('');
  const { data: stats } = useTransactionStats();
  const { data: transactions, isLoading } = useTransactions({
    type: typeFilter === 'all' ? undefined : typeFilter,
    item: search || undefined,
  });
  const syncTx = useSyncTransactions();

  const handleSync = () => {
    syncTx.mutate(undefined, {
      onSuccess: () => toast.success('Transactions synced'),
      onError: () => toast.error('Failed to sync'),
    });
  };

  return (
    <div>
      <Header title="Transaction History" />
      <div className="p-4 lg:p-6 space-y-4">
        {/* Stats */}
        {stats && (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4"
          >
            <motion.div variants={fadeUp}><StatCard label="Spent" value={formatPrice(cents(stats.spentCents))} icon={<ShoppingCart size={18} />} /></motion.div>
            <motion.div variants={fadeUp}><StatCard label="Earned" value={formatPrice(cents(stats.earnedCents))} icon={<Tag size={18} />} positive /></motion.div>
            <motion.div variants={fadeUp}><StatCard label="Buy Txns" value={String(stats.totalBought)} /></motion.div>
            <motion.div variants={fadeUp}><StatCard label="Sell Txns" value={String(stats.totalSold)} /></motion.div>
          </motion.div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex gap-1 glass rounded-xl p-1">
            {(['all', 'buy', 'sell'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  'px-4 py-1.5 text-sm rounded-lg transition-all',
                  typeFilter === t
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted hover:text-foreground'
                )}
              >
                {t === 'all' ? 'All' : t === 'buy' ? 'Buys' : 'Sells'}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Filter by item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 glass rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
            />
          </div>

          <button
            onClick={handleSync}
            disabled={syncTx.isPending}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 ml-auto active:scale-[0.98]"
          >
            <RefreshCw size={14} className={syncTx.isPending ? 'animate-spin' : ''} />
            Sync
          </button>
        </div>

        {/* Table */}
        {isLoading ? (
          <PageLoader />
        ) : !transactions || transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted py-20">
            <Receipt size={48} className="mb-3 opacity-30" />
            <p className="text-sm">No transactions found</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl border border-border/50 overflow-hidden"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-border/30">
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Type</th>
                  <th className="px-4 py-3 font-medium text-right">Price</th>
                  <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, i) => {
                  const iconUrl = getItemIconUrl(tx.icon_url);
                  return (
                    <motion.tr
                      key={tx.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-border/20 hover:bg-surface-light/30 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          {iconUrl && (
                            <img src={iconUrl} alt="" className="w-10 h-7 object-contain" />
                          )}
                          <div className="min-w-0">
                            <span className="truncate block max-w-[200px] lg:max-w-[300px]">{tx.market_hash_name}</span>
                            <span className="text-xs text-muted sm:hidden">{formatDate(tx.date)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full',
                            tx.type === 'buy' ? 'bg-profit/10 text-profit'
                              : tx.type === 'sell' ? 'bg-loss/10 text-loss'
                              : 'bg-accent/10 text-accent'
                          )}
                        >
                          {tx.type === 'buy' ? 'Buy' : tx.type === 'sell' ? 'Sell' : 'Trade'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">
                        {formatPrice(cents(tx.price))}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted hidden sm:table-cell">
                        {formatDate(tx.date)}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </motion.div>
        )}
      </div>
    </div>
  );
}
