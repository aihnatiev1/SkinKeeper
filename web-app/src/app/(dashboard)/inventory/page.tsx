'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { CurrencyBanner } from '@/components/currency-banner';
import { ItemDetailModal } from '@/components/item-detail-modal';
import { BulkSellBar } from '@/components/bulk-sell-bar';
import { useInventory, useRefreshInventory } from '@/lib/hooks';
import { formatPrice, getItemIconUrl, getWearShort, cn, getDopplerPhase, isDoppler, isFade, isMarbleFade, calculateFadePercent, analyzeMarbleFade, getFloatColor } from '@/lib/utils';
import { RARITY_COLORS } from '@/lib/constants';
import type { InventoryItem } from '@/lib/types';
import { Search, RefreshCw, Grid3X3, List, SlidersHorizontal, Loader2, Package, Lock, CheckSquare } from 'lucide-react';
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
  const [rarityFilter, setRarityFilter] = useState('');
  const [wearFilter, setWearFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [stattrakOnly, setStattrakOnly] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (assetId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

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

  const allItems = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data]
  );

  const items = useMemo(() => {
    let filtered = allItems;
    if (rarityFilter) filtered = filtered.filter((i) => i.rarity === rarityFilter);
    if (wearFilter) filtered = filtered.filter((i) => i.wear === wearFilter);
    if (stattrakOnly) filtered = filtered.filter((i) => i.market_hash_name.includes('StatTrak'));
    if (minPrice) {
      const min = parseFloat(minPrice);
      if (!isNaN(min)) filtered = filtered.filter((i) => {
        const p = i.prices?.steam || i.prices?.buff || i.prices?.skinport || 0;
        return p >= min;
      });
    }
    if (maxPrice) {
      const max = parseFloat(maxPrice);
      if (!isNaN(max)) filtered = filtered.filter((i) => {
        const p = i.prices?.steam || i.prices?.buff || i.prices?.skinport || 0;
        return p <= max;
      });
    }
    return filtered;
  }, [allItems, rarityFilter, wearFilter, stattrakOnly, minPrice, maxPrice]);

  const total = data?.pages[0]?.total ?? 0;
  const totalValue = data?.pages[0]?.totalValue ?? 0;

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.asset_id)),
    [items, selectedIds]
  );

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
          message="One-click sell on Steam. Float overlay. Price tags on every skin. All inside your browser."
          ctaText="Install Extension"
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

          <button
            onClick={() => { setSelectMode(!selectMode); if (selectMode) setSelectedIds(new Set()); }}
            className={cn(
              'p-2.5 rounded-xl transition-all',
              selectMode ? 'bg-primary/10 text-primary ring-1 ring-primary/30' : 'glass text-muted hover:text-foreground'
            )}
            title={selectMode ? 'Cancel selection' : 'Select items to sell'}
          >
            <CheckSquare size={18} />
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
              <div className="flex flex-wrap gap-x-6 gap-y-3 p-4 glass rounded-xl items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tradableOnly}
                    onChange={(e) => setTradableOnly(e.target.checked)}
                    className="rounded border-border accent-primary"
                  />
                  Tradable only
                </label>

                <div>
                  <label className="text-[10px] text-muted block mb-1">Rarity</label>
                  <select
                    value={rarityFilter}
                    onChange={(e) => setRarityFilter(e.target.value)}
                    className="px-2.5 py-1.5 glass rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="">All</option>
                    <option value="Consumer Grade">Consumer</option>
                    <option value="Industrial Grade">Industrial</option>
                    <option value="Mil-Spec Grade">Mil-Spec</option>
                    <option value="Restricted">Restricted</option>
                    <option value="Classified">Classified</option>
                    <option value="Covert">Covert</option>
                    <option value="Contraband">Contraband</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-muted block mb-1">Wear</label>
                  <select
                    value={wearFilter}
                    onChange={(e) => setWearFilter(e.target.value)}
                    className="px-2.5 py-1.5 glass rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="">All</option>
                    <option value="Factory New">Factory New</option>
                    <option value="Minimal Wear">Minimal Wear</option>
                    <option value="Field-Tested">Field-Tested</option>
                    <option value="Well-Worn">Well-Worn</option>
                    <option value="Battle-Scarred">Battle-Scarred</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-muted block mb-1">Min price ($)</label>
                  <input
                    type="number"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    placeholder="0"
                    step="0.01"
                    className="w-20 px-2.5 py-1.5 glass rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-muted block mb-1">Max price ($)</label>
                  <input
                    type="number"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="999999"
                    step="0.01"
                    className="w-20 px-2.5 py-1.5 glass rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stattrakOnly}
                    onChange={(e) => setStattrakOnly(e.target.checked)}
                    className="rounded border-border accent-primary"
                  />
                  StatTrak
                </label>

                {(rarityFilter || wearFilter || minPrice || maxPrice || stattrakOnly) && (
                  <button
                    onClick={() => {
                      setRarityFilter('');
                      setWearFilter('');
                      setMinPrice('');
                      setMaxPrice('');
                      setStattrakOnly(false);
                    }}
                    className="text-xs text-muted hover:text-foreground transition-colors"
                  >
                    Clear filters
                  </button>
                )}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {items.map((item, idx) => {
              const price = item.prices?.steam || item.prices?.buff || item.prices?.skinport || 0;
              const rarityColor = (item.rarity && RARITY_COLORS[item.rarity]) || '#64748B';
              const isLast = idx === items.length - 1;
              const isStatTrak = item.market_hash_name.includes('StatTrak');
              const isSouvenir = item.market_hash_name.includes('Souvenir');

              // Doppler phase
              const dopplerPhase = item.paint_index && isDoppler(item.market_hash_name)
                ? getDopplerPhase(item.paint_index)
                : null;

              // Fade %
              const fadeInfo = item.paint_seed != null && isFade(item.market_hash_name)
                ? calculateFadePercent(item.paint_seed)
                : null;

              // Marble Fade
              const marbleFade = item.paint_seed != null && isMarbleFade(item.market_hash_name)
                ? analyzeMarbleFade(item.paint_seed)
                : null;

              const hasSpecialBadge = dopplerPhase || fadeInfo || marbleFade;

              // Stickers
              const stickers = Array.isArray(item.stickers) ? item.stickers : [];
              const stickerCount = stickers.length;

              // Duplicate count
              const dupCount = allItems.filter(i => i.market_hash_name === item.market_hash_name).length;

              // Wear colors matching extension exactly
              const WEAR_COLORS: Record<string, string> = { FN: '#4ade80', MW: '#22d3ee', FT: '#a78bfa', WW: '#f97316', BS: '#ef4444' };
              const wearShort = getWearShort(item.wear);
              const wearColor = isStatTrak ? '#cf6a32' : isSouvenir ? '#ffd700' : (wearShort && WEAR_COLORS[wearShort]) || '#818cf8';

              // Extension-style text shadow for all overlays
              const txtSh = '0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.7)';

              // Card background: doppler glow > value highlight > rarity tint
              let cardBg = `linear-gradient(135deg, ${rarityColor}10, ${rarityColor}20)`;
              let cardShadow: string | undefined;
              if (dopplerPhase && dopplerPhase.tier === 1) {
                cardBg = `linear-gradient(135deg, ${dopplerPhase.color}55, ${dopplerPhase.color}20)`;
                cardShadow = `inset 0 0 20px ${dopplerPhase.color}30, 0 0 8px ${dopplerPhase.color}40`;
              } else if (price >= 2000) {
                cardBg = 'linear-gradient(135deg, rgba(220,38,38,0.30), rgba(220,38,38,0.10))';
              } else if (price >= 1000) {
                cardBg = 'linear-gradient(135deg, rgba(220,38,38,0.15), rgba(220,38,38,0.05))';
              }

              return (
                <motion.div
                  key={item.asset_id}
                  ref={isLast ? lastItemRef : undefined}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => selectMode ? toggleSelect(item.asset_id) : setSelectedItem(item)}
                  className={cn(
                    'relative overflow-hidden cursor-pointer group rounded-md',
                    selectedIds.has(item.asset_id) && 'ring-2 ring-primary'
                  )}
                  style={{
                    background: cardBg,
                    boxShadow: cardShadow,
                    borderLeft: `3px solid ${rarityColor}`,
                  }}
                >
                  {/* Image area */}
                  <div className="relative" style={{ aspectRatio: '4/3' }}>
                    <img
                      src={getItemIconUrl(item.icon_url)}
                      alt={item.market_hash_name}
                      className="absolute inset-0 w-full h-full object-contain p-3 group-hover:scale-110 transition-transform duration-300"
                    />

                    {/* === TOP-LEFT: Phase / Fade / Marble Fade badge === */}
                    {dopplerPhase && (
                      <div
                        className="absolute top-[3px] left-[3px] text-[10px] px-[5px] py-[2px] rounded-[3px] font-extrabold text-white whitespace-nowrap z-10"
                        style={{
                          ...(dopplerPhase.tier === 1
                            ? { background: `linear-gradient(135deg, ${dopplerPhase.color}ee, ${dopplerPhase.color}99)`, textShadow: `0 0 8px ${dopplerPhase.color}` }
                            : { background: dopplerPhase.color + 'cc' }),
                          lineHeight: '1.4',
                        }}
                      >
                        {dopplerPhase.tier === 1 ? dopplerPhase.phase : dopplerPhase.phase.replace('Phase ', 'P').replace('Gamma ', 'G')}
                      </div>
                    )}
                    {fadeInfo && !dopplerPhase && (
                      <div
                        className="absolute top-[3px] left-[3px] text-[10px] px-[5px] py-[2px] rounded-[3px] font-extrabold text-black whitespace-nowrap z-10"
                        style={{ background: 'linear-gradient(135deg, #ff6b35, #f7c948, #6dd5ed)', textShadow: '0 0 3px rgba(255,255,255,0.4)', lineHeight: '1.4' }}
                      >
                        {fadeInfo.percentage}%
                      </div>
                    )}
                    {marbleFade && !dopplerPhase && !fadeInfo && (
                      <div
                        className="absolute top-[3px] left-[3px] text-[10px] px-[5px] py-[2px] rounded-[3px] font-extrabold text-white whitespace-nowrap z-10"
                        style={{ background: marbleFade.color + 'cc', lineHeight: '1.4' }}
                      >
                        {marbleFade.pattern === 'Fire & Ice' ? '\ud83d\udd25\u2744\ufe0f' : marbleFade.pattern.substring(0, 3)}
                      </div>
                    )}

                    {/* === TOP-RIGHT: Wear badge (ST/SV + FN/MW/FT/WW/BS) === */}
                    {(item.wear || isStatTrak || isSouvenir) && (
                      <div
                        className="absolute top-[3px] right-[3px] text-[10px] px-[5px] py-[2px] rounded-[3px] font-extrabold z-10"
                        style={{ background: 'rgba(0,0,0,0.6)', color: wearColor, letterSpacing: '0.3px', lineHeight: '1.4' }}
                      >
                        {isStatTrak ? 'ST ' : ''}{isSouvenir ? 'SV ' : ''}{wearShort || ''}
                      </div>
                    )}

                    {/* === Trade lock (below phase or top-left row 2) === */}
                    {!item.tradable && (
                      <div
                        className="absolute left-[3px] px-[4px] py-[1px] rounded-[3px] text-white text-[8px] font-bold z-10"
                        style={{ top: hasSpecialBadge ? '20px' : '3px', background: 'rgba(239,68,68,0.85)' }}
                      >
                        {item.trade_ban_until ? (() => {
                          const days = Math.ceil((new Date(item.trade_ban_until).getTime() - Date.now()) / 86400000);
                          return days > 0 ? `${days}d` : '\ud83d\udd12';
                        })() : '\ud83d\udd12'}
                      </div>
                    )}

                    {/* === RIGHT SIDE: Sticker value (row 1, below wear) === */}
                    {item.sticker_value != null && item.sticker_value > 1 && (
                      <div
                        className="absolute right-[3px] z-10"
                        style={{ top: '18px', color: '#fbbf24', fontSize: '9px', fontWeight: 700, textShadow: txtSh }}
                      >
                        {formatPrice(item.sticker_value)}
                      </div>
                    )}

                    {/* === RIGHT SIDE: Paint seed (row 2) === */}
                    {item.paint_seed != null && (dopplerPhase || fadeInfo || marbleFade) && (
                      <div
                        className="absolute right-[3px] font-mono z-10"
                        style={{ top: '32px', color: '#94a3b8', fontSize: '9px', fontWeight: 600, textShadow: txtSh }}
                      >
                        {item.paint_seed}
                      </div>
                    )}

                    {/* === BOTTOM-LEFT: Float value === */}
                    {item.float_value != null && (
                      <div
                        className="absolute left-[4px] font-mono z-10"
                        style={{ bottom: '19px', fontSize: '9px', fontWeight: 500, color: 'rgba(255,255,255,0.85)', textShadow: txtSh }}
                      >
                        {item.float_value.toFixed(item.float_value < 0.01 ? 6 : 4)}
                      </div>
                    )}

                    {/* === BOTTOM-LEFT: Price (bright yellow) === */}
                    {price > 0 && (
                      <div
                        className="absolute left-[4px] z-10"
                        style={{ bottom: '3px', color: '#fde047', fontSize: '12px', fontWeight: 800, textShadow: txtSh }}
                      >
                        {formatPrice(price)}
                      </div>
                    )}

                    {/* === BOTTOM-RIGHT: Duplicate count === */}
                    {dupCount > 1 && (
                      <div
                        className="absolute z-10 text-center text-white"
                        style={{
                          bottom: '16px', right: '2px',
                          minWidth: '14px', height: '14px', padding: '0 3px',
                          borderRadius: '7px', lineHeight: '14px',
                          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          fontSize: '8px', fontWeight: 800,
                          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                        }}
                      >
                        x{dupCount}
                      </div>
                    )}

                    {/* === BOTTOM: Float bar (full width gradient) === */}
                    {item.float_value != null && (
                      <div
                        className="absolute bottom-0 left-0 right-0 z-10"
                        style={{
                          height: '3px',
                          background: 'linear-gradient(to right, #4ade80 0%, #86efac 7%, #facc15 15%, #f97316 38%, #ef4444 60%, #991b1b 100%)',
                          opacity: 0.9,
                          borderRadius: '0 0 4px 4px',
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: '-2px',
                          width: '3px', height: '7px',
                          background: '#fff', borderRadius: '1px',
                          left: `${item.float_value * 100}%`,
                          transform: 'translateX(-50%)',
                          boxShadow: '0 0 3px rgba(0,0,0,0.8)',
                        }} />
                      </div>
                    )}
                  </div>
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
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Float</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Wear</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Extra</th>
                  <th className="px-4 py-3 font-medium text-right">Price</th>
                  <th className="px-4 py-3 font-medium text-center hidden sm:table-cell">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const price = item.prices?.steam || item.prices?.buff || item.prices?.skinport || 0;
                  const isLast = idx === items.length - 1;
                  const isStatTrak = item.market_hash_name.includes('StatTrak');
                  const isSouvenir = item.market_hash_name.includes('Souvenir');
                  const dopplerPhase = item.paint_index && isDoppler(item.market_hash_name)
                    ? getDopplerPhase(item.paint_index)
                    : null;
                  const fadeInfo = item.paint_seed != null && isFade(item.market_hash_name)
                    ? calculateFadePercent(item.paint_seed)
                    : null;
                  const marbleFade = item.paint_seed != null && isMarbleFade(item.market_hash_name)
                    ? analyzeMarbleFade(item.paint_seed)
                    : null;
                  const stickerCount = Array.isArray(item.stickers) ? item.stickers.length : 0;
                  const wearShort = getWearShort(item.wear);
                  const wearColors: Record<string, string> = { FN: '#4ade80', MW: '#22d3ee', FT: '#a78bfa', WW: '#f97316', BS: '#ef4444' };
                  const wearColor = isStatTrak ? '#cf6a32' : isSouvenir ? '#ffd700' : (wearShort && wearColors[wearShort]) || '#818cf8';
                  const rarityColor = (item.rarity && RARITY_COLORS[item.rarity]) || '#64748B';

                  return (
                    <tr
                      key={item.asset_id}
                      ref={isLast ? lastItemRef : undefined}
                      onClick={() => setSelectedItem(item)}
                      className="border-b border-border/20 hover:bg-surface-light/30 transition-colors cursor-pointer"
                      style={{ borderLeft: `3px solid ${rarityColor}` }}
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
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        {item.float_value != null ? (
                          <span className="text-xs font-mono text-muted">
                            {item.float_value.toFixed(item.float_value < 0.01 ? 6 : 4)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell">
                        {(item.wear || isStatTrak || isSouvenir) ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-black/30" style={{ color: wearColor }}>
                            {isStatTrak ? 'ST ' : ''}{isSouvenir ? 'SV ' : ''}{wearShort || ''}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {dopplerPhase && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white"
                              style={dopplerPhase.tier === 1
                                ? { background: `linear-gradient(135deg, ${dopplerPhase.color}ee, ${dopplerPhase.color}99)`, textShadow: `0 0 8px ${dopplerPhase.color}` }
                                : { backgroundColor: dopplerPhase.color + 'cc' }
                              }
                            >
                              {dopplerPhase.phase}
                            </span>
                          )}
                          {fadeInfo && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-black"
                              style={{ background: 'linear-gradient(135deg, #ff6b35, #f7c948, #6dd5ed)' }}
                            >
                              {fadeInfo.percentage}%
                            </span>
                          )}
                          {marbleFade && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white"
                              style={{ backgroundColor: marbleFade.color + 'cc' }}
                            >
                              {marbleFade.pattern === 'Fire & Ice' ? '\ud83d\udd25\u2744\ufe0f' : marbleFade.pattern}
                            </span>
                          )}
                          {item.paint_seed != null && (dopplerPhase || fadeInfo || marbleFade) && (
                            <span className="text-[10px] font-mono text-slate-400">#{item.paint_seed}</span>
                          )}
                          {stickerCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-accent/20 text-accent rounded font-medium">
                              x{stickerCount}
                            </span>
                          )}
                          {item.sticker_value != null && item.sticker_value > 1 && (
                            <span className="text-[10px] text-amber-400 font-bold">
                              {formatPrice(item.sticker_value)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold" style={{ color: '#fde047' }}>
                        {price > 0 ? formatPrice(price) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                        {!item.tradable ? (
                          <Lock size={12} className="inline text-loss" />
                        ) : (
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-profit" />
                        )}
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

      {/* Bulk sell bar */}
      {selectMode && (
        <BulkSellBar
          selectedItems={selectedItems}
          onClear={() => { setSelectedIds(new Set()); setSelectMode(false); }}
        />
      )}

      {/* Item detail modal */}
      <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}
