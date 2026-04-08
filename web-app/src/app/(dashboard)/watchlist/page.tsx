'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { useWatchlist, useRemoveFromWatchlist, useAddToWatchlist } from '@/lib/hooks';
import { useFormatPrice, getItemIconUrl } from '@/lib/utils';
import { Eye, Trash2, Plus, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EcosystemTip } from '@/components/ecosystem-tip';

export default function WatchlistPage() {
  const formatPrice = useFormatPrice();
  const { data: items, isLoading } = useWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const addToWatchlist = useAddToWatchlist();
  const [showAdd, setShowAdd] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newTargetPrice, setNewTargetPrice] = useState('');

  const handleRemove = (id: number) => {
    removeFromWatchlist.mutate(id, {
      onSuccess: () => toast.success('Removed from watchlist'),
      onError: () => toast.error('Failed to remove'),
    });
  };

  const handleAdd = () => {
    if (!newItemName.trim() || !newTargetPrice) return;
    addToWatchlist.mutate(
      {
        marketHashName: newItemName.trim(),
        targetPrice: parseFloat(newTargetPrice),
      },
      {
        onSuccess: () => {
          toast.success('Added to watchlist');
          setNewItemName('');
          setNewTargetPrice('');
          setShowAdd(false);
        },
        onError: () => toast.error('Failed to add'),
      }
    );
  };

  return (
    <div>
      <Header title="Watchlist" />
      <div className="p-4 lg:p-6 space-y-4">
        <EcosystemTip
          id="watchlist-alerts"
          icon="🔔"
          message="Get push notifications when watchlist items hit your target price. Download the mobile app."
          ctaText="Get the App"
          ctaUrl="https://apps.apple.com/us/app/skinkeeper/id6760600231"
        />
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">{items?.length ?? 0} items tracked</p>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all"
          >
            <Plus size={14} />
            Add Item
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="glass rounded-xl p-4 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-3 border border-primary/20">
            <div className="flex-1 sm:min-w-[200px]">
              <label className="text-xs text-muted mb-1 block">Item Name</label>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="AK-47 | Redline (Field-Tested)"
                className="w-full px-3 py-2 glass rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="sm:w-32">
              <label className="text-xs text-muted mb-1 block">Target Price ($)</label>
              <input
                type="number"
                value={newTargetPrice}
                onChange={(e) => setNewTargetPrice(e.target.value)}
                placeholder="10.00"
                step="0.01"
                className="w-full px-3 py-2 glass rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={addToWatchlist.isPending}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-all"
            >
              {addToWatchlist.isPending ? 'Adding...' : 'Add'}
            </button>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <PageLoader />
        ) : !items || items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted">
            <Eye size={48} className="mb-3 opacity-30" />
            <p className="text-sm">Watchlist is empty</p>
            <p className="text-xs mt-1">Track items to get notified when prices drop</p>
          </div>
        ) : (
          <div className="glass rounded-2xl border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-border/30">
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium text-right">Current Price</th>
                  <th className="px-4 py-3 font-medium text-right">Target Price</th>
                  <th className="px-4 py-3 font-medium text-center hidden sm:table-cell">Status</th>
                  <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Added</th>
                  <th className="px-4 py-3 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const currentPrice = item.current_price ?? 0;
                  const targetPrice = item.threshold;
                  const atTarget = currentPrice > 0 && currentPrice <= targetPrice;
                  const diff = currentPrice > 0 ? ((currentPrice - targetPrice) / targetPrice) * 100 : null;

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-border/20 hover:bg-surface-light/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {item.icon_url && (
                            <img
                              src={getItemIconUrl(item.icon_url)}
                              alt=""
                              className="w-10 h-7 object-contain"
                            />
                          )}
                          <span className="truncate max-w-[200px] lg:max-w-[300px]">
                            {item.market_hash_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {currentPrice > 0 ? formatPrice(currentPrice) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {formatPrice(targetPrice)}
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        {atTarget ? (
                          <span className="inline-flex items-center gap-1 text-xs text-profit font-medium">
                            <TrendingDown size={12} /> At target
                          </span>
                        ) : diff !== null ? (
                          <span className="text-xs text-muted">
                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted hidden sm:table-cell">
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleRemove(item.id)}
                          disabled={removeFromWatchlist.isPending}
                          className="p-1.5 rounded-lg text-muted hover:text-loss hover:bg-loss/10 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
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
