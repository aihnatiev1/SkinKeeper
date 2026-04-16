'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { ExtensionGate } from '@/components/extension-gate';
import { useMarketListings, useSellVolume } from '@/lib/hooks';
import { useFormatPrice, getItemIconUrl, cn } from '@/lib/utils';
import type { MarketListing } from '@/lib/types';
import { Store, Package, AlertTriangle, RefreshCw, ExternalLink, Trash2, CheckSquare, Square } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { EcosystemTip } from '@/components/ecosystem-tip';
import { FeeCalculator } from '@/components/fee-calculator';

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'text-profit' },
  to_confirm: { label: 'Confirm', color: 'text-warning' },
  on_hold: { label: 'On Hold', color: 'text-muted' },
};

export default function MarketPage() {
  const formatPrice = useFormatPrice();
  const { data, isLoading, refetch, isFetching } = useMarketListings();
  const { data: volume } = useSellVolume();
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const toggleSelect = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(l => l.listingId)));

  const handleCancelSelected = async () => {
    if (selected.size === 0) return;
    setCancelling(true);
    try {
      const res = await api.post<{ cancelled: number; failed: number }>('/market/listings/cancel-bulk', {
        listingIds: Array.from(selected),
      });
      toast.success(`Cancelled ${res.cancelled} listing${res.cancelled !== 1 ? 's' : ''}${res.failed > 0 ? `, ${res.failed} failed` : ''}`);
      setSelected(new Set());
      refetch();
    } catch {
      toast.error('Failed to cancel listings');
    }
    setCancelling(false);
  };

  const handleCancelOne = async (listingId: string) => {
    if (confirmCancelId === listingId) {
      setConfirmCancelId(null);
      try {
        await api.delete(`/market/listings/${listingId}`);
        toast.success('Listing cancelled');
        refetch();
      } catch {
        toast.error('Failed to cancel listing');
      }
    } else {
      setConfirmCancelId(listingId);
      setTimeout(() => setConfirmCancelId(null), 3000);
    }
  };

  const listings = data?.listings ?? [];
  const filtered = stateFilter ? listings.filter((l) => l.state === stateFilter) : listings;
  const totalValue = listings.reduce((sum, l) => sum + l.sellerPrice, 0) / 100;

  const stateCounts = listings.reduce(
    (acc, l) => {
      acc[l.state] = (acc[l.state] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <ExtensionGate>
    <div>
      <Header title="Market" />
      <div className="p-4 lg:p-6 space-y-4">
        <EcosystemTip
          id="market-desktop"
          icon="🖥️"
          message="List items faster with Quick Sell in the desktop app. Automatic re-pricing and bulk operations."
          ctaText="Get Desktop App"
          ctaUrl="https://skinkeeper.store"
        />
        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted mb-1">Active Listings</p>
            <p className="text-2xl font-bold">{listings.length}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted mb-1">Total Value</p>
            <p className="text-2xl font-bold">{formatPrice(totalValue)}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted mb-1">Sold Today</p>
            <p className="text-2xl font-bold">{volume?.today ?? 0}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted mb-1">Daily Limit</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{volume?.remaining ?? '—'}</p>
              <span className="text-xs text-muted">/ {volume?.limit ?? '—'}</span>
            </div>
            {volume && volume.today >= volume.warningAt && (
              <p className="text-xs text-warning flex items-center gap-1 mt-1">
                <AlertTriangle size={10} /> Approaching limit
              </p>
            )}
          </div>
        </div>

        {/* Fee Calculator */}
        <div className="max-w-sm">
          <FeeCalculator />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide">
          <div className="flex glass rounded-xl overflow-hidden shrink-0">
            <button
              onClick={() => setStateFilter(null)}
              className={cn('px-3 py-2 text-sm transition-colors', !stateFilter ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground')}
            >
              All ({listings.length})
            </button>
            {Object.entries(STATE_LABELS).map(([state, { label }]) => (
              <button
                key={state}
                onClick={() => setStateFilter(stateFilter === state ? null : state)}
                className={cn(
                  'px-3 py-2 text-sm transition-colors',
                  stateFilter === state ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground'
                )}
              >
                {label} ({stateCounts[state] || 0})
              </button>
            ))}
          </div>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <PageLoader />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted">
            <Store size={48} className="mb-3 opacity-30" />
            <p className="text-sm">No market listings</p>
            <p className="text-xs mt-1">Items you list on Steam Market will appear here</p>
          </div>
        ) : (
          <div className="glass rounded-2xl border border-border/50 overflow-hidden">
            {/* Bulk action toolbar */}
            {selected.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-b border-primary/10">
                <span className="text-sm font-medium">{selected.size} selected</span>
                <button
                  onClick={handleCancelSelected}
                  disabled={cancelling}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-loss/10 text-loss hover:bg-loss/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  {cancelling ? 'Cancelling...' : 'Cancel selected'}
                </button>
                <button onClick={() => setSelected(new Set())} className="text-xs text-muted hover:text-foreground ml-auto">
                  Clear
                </button>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-border/30">
                  <th className="px-3 py-3 w-8">
                    <button onClick={toggleAll} className="text-muted hover:text-foreground transition-colors">
                      {selected.size === filtered.length && filtered.length > 0
                        ? <CheckSquare size={15} className="text-primary" />
                        : <Square size={15} />}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Account</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Seller Gets</th>
                  <th className="px-4 py-3 font-medium text-right">Buyer Pays</th>
                  <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Listed</th>
                  <th className="px-4 py-3 font-medium w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((listing) => {
                  const stateInfo = STATE_LABELS[listing.state] || { label: listing.state, color: 'text-muted' };
                  const isSel = selected.has(listing.listingId);
                  return (
                    <tr
                      key={listing.listingId}
                      className={cn('border-b border-border/20 hover:bg-surface-light/30 transition-colors', isSel && 'bg-primary/5')}
                    >
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggleSelect(listing.listingId)} className="text-muted hover:text-primary transition-colors">
                          {isSel ? <CheckSquare size={15} className="text-primary" /> : <Square size={15} />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          {listing.iconUrl && (
                            <img
                              src={getItemIconUrl(listing.iconUrl)}
                              alt=""
                              className="w-10 h-7 object-contain"
                            />
                          )}
                          <span className="truncate max-w-[200px] lg:max-w-[300px]">
                            {listing.marketHashName || listing.name || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted text-xs hidden sm:table-cell">
                        {listing.accountName || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={cn('text-xs font-medium', stateInfo.color)}>
                          {stateInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">
                        {formatPrice(listing.sellerPrice / 100)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted">
                        {formatPrice(listing.buyerPrice / 100)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted text-xs hidden sm:table-cell">
                        {listing.timeCreated > 0
                          ? new Date(listing.timeCreated * 1000).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 justify-end">
                          {confirmCancelId === listing.listingId ? (
                            <>
                              <button
                                onClick={() => handleCancelOne(listing.listingId)}
                                className="px-2 py-0.5 text-[11px] font-semibold text-white bg-loss rounded-lg hover:bg-loss/80 transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmCancelId(null)}
                                className="text-[11px] text-muted hover:text-foreground transition-colors"
                              >
                                No
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleCancelOne(listing.listingId)}
                              className="text-muted hover:text-loss transition-colors"
                              title="Cancel listing"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          <a
                            href={`https://steamcommunity.com/market/listings/730/${encodeURIComponent(listing.marketHashName || '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted hover:text-foreground transition-colors"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
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
    </ExtensionGate>
  );
}
