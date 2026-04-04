'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { CurrencyBanner } from '@/components/currency-banner';
import { ItemDetailModal } from '@/components/item-detail-modal';
import { useInventory, useRefreshInventory } from '@/lib/hooks';
import { formatPrice, getItemIconUrl, getWearShort, cn } from '@/lib/utils';
import { RARITY_COLORS } from '@/lib/constants';
import type { InventoryItem } from '@/lib/types';
import { Search, RefreshCw, Grid3X3, List, SlidersHorizontal, Loader2, Package } from 'lucide-react';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { EcosystemTip } from '@/components/ecosystem-tip';

type SortOption = 'price-desc' | 'price-asc' | 'name' | 'rarity';
type ViewMode = 'grid' | 'list';

export default function InventoryPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('price-desc');
  const [view, setView] = useState<ViewMode>('grid');
  const [tradableOnly, setTradableOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const refreshInventory = useRefreshInventory();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInventory({ sort, search: debouncedSearch, tradableOnly });

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data]
  );
  const total = data?.pages[0]?.total ?? 0;
  const totalValue = data?.pages[0]?.totalValue ?? 0;

  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastItemRef = useCallback(
    (node: HTMLElement | null) => {
      if (isFetchingNextPage) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting && hasNextPage) {
          fetchNextPage();
        }
      });
      if (node) observerRef.current.observe(node);
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage]
  );

  const handleRefresh = () => {
    refreshInventory.mutate(undefined, {
      onSuccess: () => toast.success('Inventory refreshed'),
      onError: () => toast.error('Failed to refresh'),
    });
  };

  return (
    <div>
      <Header title="Inventory" />
      <CurrencyBanner />
      <div className="p-4 lg:p-6 space-y-4">
        <EcosystemTip
          id="inventory-extension"
          icon="\ud83e\udde9"
          message="Quick sell & price overlay on Steam — get the browser extension"
          ctaText="Get Extension"
          ctaUrl="https://chromewebstore.google.com/detail/skinkeeper/placeholder"
        />
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 glass rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="px-3 py-2.5 glass rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="price-desc">Price: High to Low</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="name">Name</option>
            <option value="rarity">Rarity</option>
          </select>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'p-2.5 rounded-xl transition-all',
              showFilters ? 'bg-primary/10 text-primary ring-1 ring-primary/30' : 'glass text-muted hover:text-foreground'
            )}
          >
            <SlidersHorizontal size={18} />
          </button>

          <div className="flex glass rounded-xl overflow-hidden">
            <button
              onClick={() => setView('grid')}
              className={cn('p-2.5 transition-colors', view === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground')}
            >
              <Grid3X3 size={18} />
            </button>
            <button
              onClick={() => setView('list')}
              className={cn('p-2.5 transition-colors', view === 'list' ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground')}
            >
              <List size={18} />
            </button>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshInventory.isPending}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 active:scale-[0.98]"
          >
            <RefreshCw size={14} className={refreshInventory.isPending ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-3 p-4 glass rounded-xl">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tradableOnly}
                    onChange={(e) => setTradableOnly(e.target.checked)}
                    className="rounded border-border accent-primary"
                  />
                  Tradable only
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Summary bar */}
        <div className="flex items-center justify-between text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <Package size={14} />
            {total} items
          </span>
          <span className="font-medium text-foreground">Total: {formatPrice(totalValue)}</span>
        </div>

        {/* Content */}
        {isLoading ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted">
            <Package size={48} className="mb-3 opacity-30" />
            <p className="text-sm">No items found</p>
            {search && <p className="text-xs mt-1">Try a different search term</p>}
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {items.map((item, idx) => {
              const price = item.prices?.steam || item.prices?.skinport || 0;
              const rarityColor = (item.rarity && RARITY_COLORS[item.rarity]) || '#64748B';
              const isLast = idx === items.length - 1;
              return (
                <motion.div
                  key={item.asset_id}
                  ref={isLast ? lastItemRef : undefined}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => setSelectedItem(item)}
                  className="item-card glass rounded-xl border border-border/30 overflow-hidden cursor-pointer group"
                >
                  <div
                    className="relative p-3 flex items-center justify-center h-32"
                    style={{
                      background: `linear-gradient(135deg, ${rarityColor}08, ${rarityColor}18)`,
                    }}
                  >
                    <img
                      src={getItemIconUrl(item.icon_url)}
                      alt={item.market_hash_name}
                      className="max-h-full max-w-full object-contain group-hover:scale-110 transition-transform duration-300"
                    />
                    {!item.tradable && (
                      <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 bg-loss/20 text-loss rounded-md font-medium">
                        Locked
                      </span>
                    )}
                    {item.wear && (
                      <span className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 bg-black/60 text-foreground rounded-md backdrop-blur-sm font-medium">
                        {getWearShort(item.wear)}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-xs truncate mb-1 text-muted">{item.market_hash_name}</p>
                    <p className="text-sm font-bold">
                      {price > 0 ? formatPrice(price) : '—'}
                    </p>
                  </div>
                  {/* Rarity bar */}
                  <div className="h-[2px]" style={{ backgroundColor: rarityColor }} />
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="glass rounded-2xl border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-border/30">
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Wear</th>
                  <th className="px-4 py-3 font-medium text-right">Price</th>
                  <th className="px-4 py-3 font-medium text-center hidden sm:table-cell">Tradable</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const price = item.prices?.steam || item.prices?.skinport || 0;
                  const isLast = idx === items.length - 1;
                  return (
                    <tr
                      key={item.asset_id}
                      ref={isLast ? lastItemRef : undefined}
                      onClick={() => setSelectedItem(item)}
                      className="border-b border-border/20 hover:bg-surface-light/30 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <img
                            src={getItemIconUrl(item.icon_url)}
                            alt=""
                            className="w-10 h-7 object-contain"
                          />
                          <span className="truncate max-w-[200px] lg:max-w-[300px]">
                            {item.market_hash_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted hidden sm:table-cell">
                        {getWearShort(item.wear) || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">
                        {price > 0 ? formatPrice(price) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                        <span
                          className={cn(
                            'inline-block w-2.5 h-2.5 rounded-full',
                            item.tradable ? 'bg-profit' : 'bg-loss'
                          )}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Loading indicator for next page */}
        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}

        {/* End of list */}
        {!hasNextPage && items.length > 0 && (
          <p className="text-center text-xs text-muted py-4">All items loaded</p>
        )}
      </div>

      {/* Item detail modal */}
      <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}
