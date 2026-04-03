'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { useTrades, useSyncTrades } from '@/lib/hooks';
import { formatPrice, formatRelativeTime, getItemIconUrl, cn } from '@/lib/utils';
import { RefreshCw, ArrowRight, ArrowDown, ArrowUp, Clock, CheckCircle2, XCircle, Ban, Plus, ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const TABS = [
  { key: undefined, label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
] as const;

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock size={14} className="text-warning" />,
  awaiting_confirmation: <Clock size={14} className="text-warning" />,
  accepted: <CheckCircle2 size={14} className="text-profit" />,
  declined: <XCircle size={14} className="text-loss" />,
  canceled: <Ban size={14} className="text-muted" />,
};

function cents(v: number) { return v / 100; }

export default function TradesPage() {
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useTrades(activeTab, 20, offset);
  const syncTrades = useSyncTrades();

  const trades = data?.offers || [];
  const total = data?.total || 0;

  const giveItems = (trade: typeof trades[0]) => trade.items.filter((i) => i.side === 'give');
  const recvItems = (trade: typeof trades[0]) => trade.items.filter((i) => i.side === 'receive');

  const handleSync = () => {
    syncTrades.mutate(undefined, {
      onSuccess: () => toast.success('Trades synced'),
      onError: () => toast.error('Failed to sync trades'),
    });
  };

  return (
    <div>
      <Header title="Trades" />
      <div className="p-4 lg:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex gap-1 glass rounded-xl p-1">
            {TABS.map((tab) => (
              <button
                key={tab.label}
                onClick={() => { setActiveTab(tab.key); setOffset(0); }}
                className={cn(
                  'px-4 py-1.5 text-sm rounded-lg transition-all',
                  activeTab === tab.key
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncTrades.isPending}
              className="flex items-center gap-2 px-4 py-2 glass hover:bg-surface-light text-foreground rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncTrades.isPending ? 'animate-spin' : ''} />
              Sync
            </button>
            <a
              href="/trades/new"
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]"
            >
              <Plus size={14} />
              New Trade
            </a>
          </div>
        </div>

        {/* Trades list */}
        {isLoading ? (
          <PageLoader />
        ) : trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted py-20">
            <ArrowLeftRight size={48} className="mb-3 opacity-30" />
            <p className="text-sm">No trades found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {trades.map((trade, i) => {
              const give = giveItems(trade);
              const recv = recvItems(trade);
              return (
                <motion.div
                  key={trade.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="glass rounded-2xl border border-border/30 p-4 hover:border-primary/15 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-sm font-semibold">{trade.partnerName || trade.partnerSteamId}</span>
                        <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
                          {STATUS_ICONS[trade.status]}
                          <span className="capitalize">{trade.status.replace(/_/g, ' ')}</span>
                          {trade.isInternal && (
                            <span className="text-accent ml-1 font-medium">internal</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-muted">
                      {formatRelativeTime(trade.createdAt)}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted mb-2 flex items-center gap-1">
                        <ArrowUp size={12} className="text-loss" /> Giving
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {give.slice(0, 6).map((item) => {
                          const url = getItemIconUrl(item.iconUrl);
                          return url ? (
                            <img key={item.id} src={url} alt={item.marketHashName || ''} title={item.marketHashName || ''} className="w-12 h-9 object-contain glass rounded-lg p-1" />
                          ) : null;
                        })}
                        {give.length > 6 && (
                          <span className="flex items-center justify-center w-12 h-9 glass rounded-lg text-xs text-muted font-medium">+{give.length - 6}</span>
                        )}
                      </div>
                      <p className="text-xs text-loss font-medium mt-1">{formatPrice(cents(trade.valueGiveCents))}</p>
                    </div>

                    <ArrowRight size={20} className="text-muted shrink-0" />

                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted mb-2 flex items-center gap-1">
                        <ArrowDown size={12} className="text-profit" /> Receiving
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {recv.slice(0, 6).map((item) => {
                          const url = getItemIconUrl(item.iconUrl);
                          return url ? (
                            <img key={item.id} src={url} alt={item.marketHashName || ''} title={item.marketHashName || ''} className="w-12 h-9 object-contain glass rounded-lg p-1" />
                          ) : null;
                        })}
                        {recv.length > 6 && (
                          <span className="flex items-center justify-center w-12 h-9 glass rounded-lg text-xs text-muted font-medium">+{recv.length - 6}</span>
                        )}
                      </div>
                      <p className="text-xs text-profit font-medium mt-1">{formatPrice(cents(trade.valueRecvCents))}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {trades.length > 0 && total > 20 && (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setOffset(Math.max(0, offset - 20))}
              disabled={offset === 0}
              className="px-4 py-2 text-sm glass rounded-xl disabled:opacity-30 hover:bg-surface-light transition-colors font-medium"
            >
              Previous
            </button>
            <span className="text-sm text-muted">
              {offset + 1}–{Math.min(offset + 20, total)} of {total}
            </span>
            <button
              onClick={() => setOffset(offset + 20)}
              disabled={offset + 20 >= total}
              className="px-4 py-2 text-sm glass rounded-xl disabled:opacity-30 hover:bg-surface-light transition-colors font-medium"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
