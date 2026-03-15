'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { useInventory, useRefreshInventory } from '@/lib/hooks';
import { formatPrice, getItemIconUrl, getWearShort, cn } from '@/lib/utils';
import { RARITY_COLORS } from '@/lib/constants';
import { Search, RefreshCw, Filter, Grid3X3, List, SlidersHorizontal } from 'lucide-react';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type SortOption = 'price-desc' | 'price-asc' | 'name' | 'rarity';
type ViewMode = 'grid' | 'list';

export default function InventoryPage() {
  const { data: items, isLoading } = useInventory();
  const refreshInventory = useRefreshInventory();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('price-desc');
  const [view, setView] = useState<ViewMode>('grid');
  const [tradableOnly, setTradableOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    if (!items) return [];
    let result = [...items];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((i) =>
        i.market_hash_name.toLowerCase().includes(q)
      );
    }
    if (tradableOnly) {
      result = result.filter((i) => i.tradable);
    }

    result.sort((a, b) => {
      const priceA = a.prices?.steam || a.prices?.skinport || 0;
      const priceB = b.prices?.steam || b.prices?.skinport || 0;
      switch (sort) {
        case 'price-desc': return priceB - priceA;
        case 'price-asc': return priceA - priceB;
        case 'name': return a.market_hash_name.localeCompare(b.market_hash_name);
        case 'rarity': return (b.rarity || '').localeCompare(a.rarity || '');
        default: return 0;
      }
    });

    return result;
  }, [items, search, sort, tradableOnly]);

  const totalValue = useMemo(() => {
    return filtered.reduce((sum, i) => sum + (i.prices?.steam || i.prices?.skinport || 0), 0);
  }, [filtered]);

  return (
    <div>
      <Header title="Inventory" />
      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
          >
            <option value="price-desc">Price: High to Low</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="name">Name</option>
            <option value="rarity">Rarity</option>
          </select>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'p-2 rounded-lg border transition-colors',
              showFilters ? 'bg-primary/10 border-primary text-primary' : 'bg-surface border-border text-muted hover:text-foreground'
            )}
          >
            <SlidersHorizontal size={18} />
          </button>

          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setView('grid')}
              className={cn('p-2 transition-colors', view === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground')}
            >
              <Grid3X3 size={18} />
            </button>
            <button
              onClick={() => setView('list')}
              className={cn('p-2 transition-colors', view === 'list' ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground')}
            >
              <List size={18} />
            </button>
          </div>

          <button
            onClick={() => refreshInventory.mutate()}
            disabled={refreshInventory.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshInventory.isPending ? 'animate-spin' : ''} />
            Refresh
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
              <div className="flex flex-wrap gap-3 p-4 bg-surface rounded-lg border border-border">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tradableOnly}
                    onChange={(e) => setTradableOnly(e.target.checked)}
                    className="rounded border-border"
                  />
                  Tradable only
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Summary bar */}
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{filtered.length} items</span>
          <span>Total: {formatPrice(totalValue)}</span>
        </div>

        {/* Content */}
        {isLoading ? (
          <PageLoader />
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filtered.map((item) => {
              const price = item.prices?.steam || item.prices?.skinport || 0;
              const rarityColor = (item.rarity && RARITY_COLORS[item.rarity]) || '#64748B';
              return (
                <motion.div
                  key={item.asset_id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-surface rounded-xl border border-border overflow-hidden hover:border-primary/30 transition-colors cursor-pointer group"
                >
                  <div
                    className="relative p-3 flex items-center justify-center h-32"
                    style={{
                      background: `linear-gradient(135deg, ${rarityColor}08, ${rarityColor}15)`,
                    }}
                  >
                    <img
                      src={getItemIconUrl(item.icon_url)}
                      alt={item.market_hash_name}
                      className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform"
                    />
                    {!item.tradable && (
                      <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 bg-loss/20 text-loss rounded">
                        Locked
                      </span>
                    )}
                    {item.wear && (
                      <span className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 bg-black/50 text-foreground rounded">
                        {getWearShort(item.wear)}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-xs truncate mb-1">{item.market_hash_name}</p>
                    <p className="text-sm font-semibold">
                      {price > 0 ? formatPrice(price) : '—'}
                    </p>
                  </div>
                  {/* Rarity bar */}
                  <div className="h-0.5" style={{ backgroundColor: rarityColor }} />
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-border">
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Wear</th>
                  <th className="px-4 py-3 font-medium text-right">Price</th>
                  <th className="px-4 py-3 font-medium text-center">Tradable</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const price = item.prices?.steam || item.prices?.skinport || 0;
                  return (
                    <tr
                      key={item.asset_id}
                      className="border-b border-border/50 hover:bg-surface-light transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          <img
                            src={getItemIconUrl(item.icon_url)}
                            alt=""
                            className="w-10 h-7 object-contain"
                          />
                          <span className="truncate max-w-[250px]">
                            {item.market_hash_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-muted">
                        {getWearShort(item.wear) || '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {price > 0 ? formatPrice(price) : '—'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span
                          className={cn(
                            'inline-block w-2 h-2 rounded-full',
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
      </div>
    </div>
  );
}
