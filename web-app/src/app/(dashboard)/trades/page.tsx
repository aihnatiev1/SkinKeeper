'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { useTrades, useSyncTrades } from '@/lib/hooks';
import { formatPrice, formatRelativeTime, getItemIconUrl, cn } from '@/lib/utils';
import { RefreshCw, ArrowRight, ArrowDown, ArrowUp, Clock, CheckCircle2, XCircle, Ban, Plus } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'framer-motion';

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

export default function TradesPage() {
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useTrades(activeTab, 20, offset);
  const syncTrades = useSyncTrades();

  const trades = data?.trades || [];
  const total = data?.total || 0;

  return (
    <div>
      <Header title="Trades" />
      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-surface rounded-lg p-1 border border-border">
            {TABS.map((tab) => (
              <button
                key={tab.label}
                onClick={() => { setActiveTab(tab.key); setOffset(0); }}
                className={cn(
                  'px-4 py-1.5 text-sm rounded-md transition-colors',
                  activeTab === tab.key
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => syncTrades.mutate()}
              disabled={syncTrades.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-surface border border-border hover:bg-surface-light text-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncTrades.isPending ? 'animate-spin' : ''} />
              Sync
            </button>
            <a
              href="/trades/new"
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors"
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
          <div className="text-center text-muted py-20">
            <ArrowLeftRight size={40} className="mx-auto mb-3 opacity-50" />
            <p>No trades found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {trades.map((trade) => (
              <motion.div
                key={trade.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface rounded-xl border border-border p-4 hover:border-primary/20 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={trade.partner_avatar}
                      alt=""
                      className="w-8 h-8 rounded-full"
                    />
                    <div>
                      <span className="text-sm font-medium">{trade.partner_name}</span>
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        {STATUS_ICONS[trade.status]}
                        <span className="capitalize">{trade.status.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted">
                    {formatRelativeTime(trade.created_at)}
                  </span>
                </div>

                {/* Items */}
                <div className="flex items-center gap-4">
                  {/* Giving */}
                  <div className="flex-1">
                    <div className="text-xs text-muted mb-2 flex items-center gap-1">
                      <ArrowUp size={12} className="text-loss" /> Giving
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {trade.items_to_give.slice(0, 6).map((item, i) => (
                        <img
                          key={i}
                          src={getItemIconUrl(item.icon_url)}
                          alt={item.market_hash_name}
                          title={item.market_hash_name}
                          className="w-12 h-9 object-contain bg-surface-light rounded p-1"
                        />
                      ))}
                      {trade.items_to_give.length > 6 && (
                        <span className="flex items-center justify-center w-12 h-9 bg-surface-light rounded text-xs text-muted">
                          +{trade.items_to_give.length - 6}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-loss mt-1">
                      {formatPrice(trade.give_value)}
                    </p>
                  </div>

                  <ArrowRight size={20} className="text-muted shrink-0" />

                  {/* Receiving */}
                  <div className="flex-1">
                    <div className="text-xs text-muted mb-2 flex items-center gap-1">
                      <ArrowDown size={12} className="text-profit" /> Receiving
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {trade.items_to_receive.slice(0, 6).map((item, i) => (
                        <img
                          key={i}
                          src={getItemIconUrl(item.icon_url)}
                          alt={item.market_hash_name}
                          title={item.market_hash_name}
                          className="w-12 h-9 object-contain bg-surface-light rounded p-1"
                        />
                      ))}
                      {trade.items_to_receive.length > 6 && (
                        <span className="flex items-center justify-center w-12 h-9 bg-surface-light rounded text-xs text-muted">
                          +{trade.items_to_receive.length - 6}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-profit mt-1">
                      {formatPrice(trade.receive_value)}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {trades.length > 0 && total > 20 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - 20))}
              disabled={offset === 0}
              className="px-4 py-2 text-sm bg-surface border border-border rounded-lg disabled:opacity-30 hover:bg-surface-light transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-muted">
              {offset + 1}–{Math.min(offset + 20, total)} of {total}
            </span>
            <button
              onClick={() => setOffset(offset + 20)}
              disabled={offset + 20 >= total}
              className="px-4 py-2 text-sm bg-surface border border-border rounded-lg disabled:opacity-30 hover:bg-surface-light transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ArrowLeftRight({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 3L4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" />
    </svg>
  );
}
