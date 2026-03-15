'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { StatCard } from '@/components/stat-card';
import { useTransactions, useTransactionStats, useSyncTransactions } from '@/lib/hooks';
import { formatPrice, formatDate, getItemIconUrl, cn } from '@/lib/utils';
import { RefreshCw, ShoppingCart, Tag, Search } from 'lucide-react';
import { useState } from 'react';

type TxFilter = 'all' | 'buy' | 'sell';

function cents(v: number) { return v / 100; }

export default function TransactionsPage() {
  const [typeFilter, setTypeFilter] = useState<TxFilter>('all');
  const [search, setSearch] = useState('');
  const { data: stats } = useTransactionStats();
  const { data: transactions, isLoading } = useTransactions({
    type: typeFilter === 'all' ? undefined : typeFilter,
    item: search || undefined,
  });
  const syncTx = useSyncTransactions();

  return (
    <div>
      <Header title="Transaction History" />
      <div className="p-6 space-y-4">
        {/* Stats — camelCase, cents */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Spent" value={formatPrice(cents(stats.spentCents))} icon={<ShoppingCart size={18} />} />
            <StatCard label="Earned" value={formatPrice(cents(stats.earnedCents))} icon={<Tag size={18} />} />
            <StatCard label="Buy Txns" value={String(stats.totalBought)} />
            <StatCard label="Sell Txns" value={String(stats.totalSold)} />
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-surface rounded-lg p-1 border border-border">
            {(['all', 'buy', 'sell'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  'px-4 py-1.5 text-sm rounded-md transition-colors capitalize',
                  typeFilter === t
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted hover:text-foreground'
                )}
              >
                {t === 'all' ? 'All' : t === 'buy' ? 'Buys' : 'Sells'}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Filter by item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <button
            onClick={() => syncTx.mutate()}
            disabled={syncTx.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ml-auto"
          >
            <RefreshCw size={14} className={syncTx.isPending ? 'animate-spin' : ''} />
            Sync
          </button>
        </div>

        {/* Table */}
        {isLoading ? (
          <PageLoader />
        ) : !transactions || transactions.length === 0 ? (
          <div className="text-center text-muted py-20">
            <p>No transactions found</p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-border">
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium text-right">Price</th>
                  <th className="px-4 py-3 font-medium text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const iconUrl = getItemIconUrl(tx.icon_url);
                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-border/50 hover:bg-surface-light transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          {iconUrl && (
                            <img src={iconUrl} alt="" className="w-10 h-7 object-contain" />
                          )}
                          <span className="truncate max-w-[250px]">{tx.market_hash_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full',
                            tx.type === 'buy' ? 'bg-profit/10 text-profit'
                              : tx.type === 'sell' ? 'bg-loss/10 text-loss'
                              : 'bg-accent/10 text-accent'
                          )}
                        >
                          {tx.type === 'buy' ? 'Buy' : tx.type === 'sell' ? 'Sell' : 'Trade'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">
                        {formatPrice(cents(tx.price))}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted">
                        {formatDate(tx.date)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
