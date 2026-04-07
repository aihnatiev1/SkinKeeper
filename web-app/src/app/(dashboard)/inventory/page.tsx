'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { CurrencyBanner } from '@/components/currency-banner';
import { ItemDetailModal } from '@/components/item-detail-modal';
import { BulkSellBar } from '@/components/bulk-sell-bar';
import { SellModal } from '@/components/sell-modal';
import { SellProgressModal } from '@/components/sell-progress-modal';
import { useInventory, useRefreshInventory, useMarketListings } from '@/lib/hooks';
import { formatPrice, getItemIconUrl, getWearShort, cn, getDopplerPhase, isDoppler, isFade, isMarbleFade, calculateFadePercent, analyzeMarbleFade } from '@/lib/utils';
import { RARITY_COLORS } from '@/lib/constants';
import type { InventoryItem } from '@/lib/types';
import { Search, RefreshCw, Grid3X3, List, Loader2, Package, Lock, X, Tag, Info } from 'lucide-react';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { SessionConnectBanner } from '@/components/session-connect-banner';

type SortOption = 'price-desc' | 'price-asc' | 'name' | 'rarity';
type ViewMode = 'grid' | 'list';
type LocationFilter = 'all' | 'inventory' | 'on_sale';

const WEAR_OPTIONS = [
  { value: 'Factory New', label: 'Factory New', short: 'FN' },
  { value: 'Minimal Wear', label: 'Minimal Wear', short: 'MW' },
  { value: 'Field-Tested', label: 'Field-Tested', short: 'FT' },
  { value: 'Well-Worn', label: 'Well-Worn', short: 'WW' },
  { value: 'Battle-Scarred', label: 'Battle-Scarred', short: 'BS' },
];

const RARITY_OPTIONS = [
  'Consumer Grade', 'Industrial Grade', 'Mil-Spec Grade',
  'Restricted', 'Classified', 'Covert', 'Contraband',
];

export default function InventoryPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('price-desc');
  const [view, setView] = useState<ViewMode>('grid');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sellItems, setSellItems] = useState<InventoryItem[] | null>(null);
  const [sellOperationId, setSellOperationId] = useState<string | null>(null);

  // Filters
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');
  const [wearFilters, setWearFilters] = useState<Set<string>>(new Set());
  const [rarityFilter, setRarityFilter] = useState('');
  const [tradeLockDays, setTradeLockDays] = useState(8); // 8 = all, 0-7 = max days
  const [stattrakOnly, setStattrakOnly] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const toggleWear = (wear: string) => {
    setWearFilters((prev) => {
      const next = new Set(prev);
      if (next.has(wear)) next.delete(wear);
      else next.add(wear);
      return next;
    });
  };

  const toggleSelect = (assetId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const refreshInventory = useRefreshInventory();
  const { data: listingsData } = useMarketListings();

  // Set of asset IDs currently on sale
  const onSaleIds = useMemo(() => {
    const ids = new Set<string>();
    if (listingsData?.listings) {
      for (const l of listingsData.listings) {
        ids.add(l.assetId);
      }
    }
    return ids;
  }, [listingsData]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const tradableOnly = locationFilter !== 'all' ? false : tradeLockDays === 0;
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

    // Location filter
    if (locationFilter === 'on_sale') {
      filtered = filtered.filter((i) => onSaleIds.has(i.asset_id));
    } else if (locationFilter === 'inventory') {
      filtered = filtered.filter((i) => !onSaleIds.has(i.asset_id));
    }

    // Wear checkboxes
    if (wearFilters.size > 0) {
      filtered = filtered.filter((i) => i.wear && wearFilters.has(i.wear));
    }

    if (rarityFilter) filtered = filtered.filter((i) => i.rarity === rarityFilter);
    if (stattrakOnly) filtered = filtered.filter((i) => i.market_hash_name.includes('StatTrak'));

    // Trade lock days slider
    if (tradeLockDays < 8) {
      filtered = filtered.filter((i) => {
        if (tradeLockDays === 0) return i.tradable;
        if (i.tradable) return true;
        if (!i.trade_ban_until) return false;
        const days = Math.ceil((new Date(i.trade_ban_until).getTime() - Date.now()) / 86400000);
        return days <= tradeLockDays;
      });
    }

    // Price range
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
  }, [allItems, locationFilter, onSaleIds, wearFilters, rarityFilter, stattrakOnly, tradeLockDays, minPrice, maxPrice]);

  const total = data?.pages[0]?.total ?? 0;
  const totalValue = data?.pages[0]?.totalValue ?? 0;

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.asset_id)),
    [items, selectedIds]
  );

  const selectedValue = useMemo(
    () => selectedItems.reduce((sum, i) => sum + (i.prices?.steam || i.prices?.buff || 0), 0),
    [selectedItems]
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

  const hasActiveFilters = wearFilters.size > 0 || rarityFilter || stattrakOnly || tradeLockDays < 8 || minPrice || maxPrice || locationFilter !== 'all';

  const clearAllFilters = () => {
    setWearFilters(new Set());
    setRarityFilter('');
    setStattrakOnly(false);
    setTradeLockDays(8);
    setMinPrice('');
    setMaxPrice('');
    setLocationFilter('all');
  };

  return (
    <div>
      <Header title="Inventory" />
      <CurrencyBanner />
      <div className="p-4 lg:p-6">
        <SessionConnectBanner />

        {/* Main layout: sidebar + content */}
        <div className="flex gap-4 mt-4">
          {/* ═══ LEFT SIDEBAR FILTERS ═══ */}
          <aside className="hidden lg:block w-[220px] shrink-0 space-y-4">
            <div className="glass rounded-xl p-4 space-y-5 sticky top-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Filters</h3>
                {hasActiveFilters && (
                  <button onClick={clearAllFilters} className="text-[10px] text-primary hover:underline">
                    Clear all
                  </button>
                )}
              </div>

              {/* Items location */}
              <div>
                <p className="text-xs text-muted font-medium mb-2">Items&apos; Location</p>
                <div className="space-y-1.5">
                  {([
                    { value: 'all', label: 'All' },
                    { value: 'inventory', label: 'In Inventory' },
                    { value: 'on_sale', label: 'On Sale' },
                  ] as const).map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-xs cursor-pointer group">
                      <input
                        type="radio"
                        name="location"
                        checked={locationFilter === opt.value}
                        onChange={() => setLocationFilter(opt.value)}
                        className="accent-primary w-3.5 h-3.5"
                      />
                      <span className="text-muted group-hover:text-foreground transition-colors">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Trade lock slider */}
              <div>
                <p className="text-xs text-muted font-medium mb-2">
                  Trade Lock {tradeLockDays < 8 ? `(≤ ${tradeLockDays}d)` : '(all)'}
                </p>
                <input
                  type="range"
                  min={0}
                  max={8}
                  value={tradeLockDays}
                  onChange={(e) => setTradeLockDays(parseInt(e.target.value))}
                  className="w-full accent-primary h-1.5 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-muted mt-1">
                  <span>0</span>
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                  <span>4</span>
                  <span>5</span>
                  <span>6</span>
                  <span>7</span>
                  <span>All</span>
                </div>
              </div>

              {/* Exterior checkboxes */}
              <div>
                <p className="text-xs text-muted font-medium mb-2">Exterior</p>
                <div className="space-y-1.5">
                  {WEAR_OPTIONS.map((w) => (
                    <label key={w.value} className="flex items-center gap-2 text-xs cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={wearFilters.has(w.value)}
                        onChange={() => toggleWear(w.value)}
                        className="accent-primary rounded w-3.5 h-3.5"
                      />
                      <span className="text-muted group-hover:text-foreground transition-colors">{w.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Rarity */}
              <div>
                <p className="text-xs text-muted font-medium mb-2">Rarity</p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs cursor-pointer group">
                    <input
                      type="radio"
                      name="rarity"
                      checked={!rarityFilter}
                      onChange={() => setRarityFilter('')}
                      className="accent-primary w-3.5 h-3.5"
                    />
                    <span className="text-muted group-hover:text-foreground transition-colors">All</span>
                  </label>
                  {RARITY_OPTIONS.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-xs cursor-pointer group">
                      <input
                        type="radio"
                        name="rarity"
                        checked={rarityFilter === r}
                        onChange={() => setRarityFilter(r)}
                        className="accent-primary w-3.5 h-3.5"
                      />
                      <span className="flex items-center gap-1.5 text-muted group-hover:text-foreground transition-colors">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: RARITY_COLORS[r] || '#64748B' }} />
                        {r.replace(' Grade', '')}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Price range */}
              <div>
                <p className="text-xs text-muted font-medium mb-2">Price ($)</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    placeholder="Min"
                    step="0.01"
                    className="w-full px-2 py-1.5 glass rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="number"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="Max"
                    step="0.01"
                    className="w-full px-2 py-1.5 glass rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* StatTrak */}
              <label className="flex items-center gap-2 text-xs cursor-pointer group">
                <input
                  type="checkbox"
                  checked={stattrakOnly}
                  onChange={(e) => setStattrakOnly(e.target.checked)}
                  className="accent-primary rounded w-3.5 h-3.5"
                />
                <span className="text-muted group-hover:text-foreground transition-colors">StatTrak™ only</span>
              </label>
            </div>
          </aside>

          {/* ═══ RIGHT CONTENT ═══ */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[180px] max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search Inventory..."
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
                <option value="price-desc">Price: High → Low</option>
                <option value="price-asc">Price: Low → High</option>
                <option value="name">Name</option>
                <option value="rarity">Rarity</option>
              </select>

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

            {/* Summary bar */}
            <div className="flex items-center justify-between text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Package size={14} />
                {items.length}{items.length !== total ? ` / ${total}` : ''} items
                {selectedIds.size > 0 && (
                  <span className="text-primary font-medium ml-2">
                    · {selectedIds.size} selected
                  </span>
                )}
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7" style={{ gap: '8px' }}>
                {items.map((item, idx) => {
                  const price = item.prices?.steam || item.prices?.buff || item.prices?.skinport || 0;
                  const rarityColor = (item.rarity && RARITY_COLORS[item.rarity]) || '#64748B';
                  const isLast = idx === items.length - 1;
                  const isST = item.market_hash_name.includes('StatTrak');
                  const isSV = item.market_hash_name.includes('Souvenir');
                  const isSel = selectedIds.has(item.asset_id);
                  const onSale = onSaleIds.has(item.asset_id);
                  const fv = item.float_value != null ? Number(item.float_value) : null;
                  const ps = item.paint_seed != null ? Number(item.paint_seed) : null;
                  const pi = item.paint_index != null ? Number(item.paint_index) : null;
                  const dp = pi && isDoppler(item.market_hash_name) ? getDopplerPhase(pi) : null;
                  const fi = ps != null && isFade(item.market_hash_name) ? calculateFadePercent(ps) : null;
                  const mf = ps != null && isMarbleFade(item.market_hash_name) ? analyzeMarbleFade(ps) : null;
                  const stk = Array.isArray(item.stickers) ? item.stickers : [];
                  const W: Record<string,string> = {FN:'#4ade80',MW:'#22d3ee',FT:'#a78bfa',WW:'#f97316',BS:'#ef4444'};
                  const ws = getWearShort(item.wear);
                  const wc = isST ? '#cf6a32' : isSV ? '#ffd700' : (ws && W[ws]) || '#818cf8';

                  return (
                    <div
                      key={item.asset_id}
                      ref={isLast ? lastItemRef : undefined}
                      onClick={() => toggleSelect(item.asset_id)}
                      onDoubleClick={() => setSelectedItem(item)}
                      className={cn('relative cursor-pointer group', isSel && 'ring-2 ring-primary')}
                      style={{ background: '#1e2028', borderRadius: '8px', border: '1px solid #2a2d38', overflow: 'hidden' }}
                    >
                      {/* ═══ PRICE BAR (top) ═══ */}
                      <div style={{ padding: '7px 8px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span style={{ color: '#facc15', fontSize: '11px', lineHeight: 1 }}>⚡</span>
                          <span style={{ color: price >= 100 ? '#4ade80' : '#facc15', fontSize: '13px', fontWeight: 800 }}>
                            {price > 0 ? formatPrice(price) : '—'}
                          </span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)' }}
                        >
                          <Info size={11} className="text-white/50" />
                        </button>
                      </div>

                      {/* ═══ IMAGE (middle) ═══ */}
                      <div className="relative" style={{ aspectRatio: '4/3', padding: '0 12px' }}>
                        <img
                          src={getItemIconUrl(item.icon_url)}
                          alt={item.market_hash_name}
                          className={cn('w-full h-full object-contain transition-transform duration-200', isSel ? 'scale-[0.85] opacity-50' : 'group-hover:scale-[1.06]')}
                        />
                        {/* Selected */}
                        {isSel && (
                          <div className="absolute inset-0 flex items-center justify-center z-20">
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', padding: '4px 12px', borderRadius: 6 }}>Selected</span>
                          </div>
                        )}
                        {/* On sale */}
                        {onSale && !isSel && (
                          <div className="absolute inset-0 flex items-center justify-center z-20">
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#34d399', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', padding: '3px 8px', borderRadius: 5, display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Tag size={9} /> On sale
                            </span>
                          </div>
                        )}
                        {/* Doppler/Fade/Marble — image overlay */}
                        {dp && <div className="absolute top-1 left-1 text-[9px] px-1 py-px rounded font-extrabold text-white z-10" style={dp.tier===1 ? {background:`linear-gradient(135deg,${dp.color}ee,${dp.color}88)`,textShadow:`0 0 6px ${dp.color}`} : {background:dp.color+'cc'}}>{dp.tier===1?dp.phase:dp.phase.replace('Phase ','P').replace('Gamma ','G')}</div>}
                        {fi && !dp && <div className="absolute top-1 left-1 text-[9px] px-1 py-px rounded font-extrabold text-black z-10" style={{background:'linear-gradient(135deg,#ff6b35,#f7c948,#6dd5ed)'}}>{fi.percentage}%</div>}
                        {mf && !dp && !fi && <div className="absolute top-1 left-1 text-[9px] px-1 py-px rounded font-extrabold text-white z-10" style={{background:mf.color+'cc'}}>{mf.pattern==='Fire & Ice'?'🔥❄️':mf.pattern.substring(0,3)}</div>}
                        {/* Paint seed */}
                        {ps != null && (dp||fi||mf) && <span className="absolute top-1 right-1 text-[8px] font-mono text-slate-500 z-10">{ps}</span>}
                        {/* Stickers — bottom of image */}
                        {stk.length > 0 && (
                          <div className="absolute bottom-0 left-1 flex gap-[2px] z-10">
                            {stk.slice(0,4).map((s,i) => s.icon_url ? <img key={i} src={s.icon_url} alt="" className="w-[15px] h-[11px] object-contain drop-shadow" /> : null)}
                          </div>
                        )}
                        {/* Sticker value */}
                        {item.sticker_value != null && item.sticker_value > 5 && stk.length > 0 && (
                          <span className="absolute bottom-0 right-1 text-[8px] font-bold text-amber-400 z-10">{formatPrice(item.sticker_value)}</span>
                        )}
                      </div>

                      {/* ═══ FOOTER (bottom) ═══ */}
                      <div style={{ padding: '4px 8px 6px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', minHeight: 28, borderTop: '1px solid #2a2d3800' }}>
                        <div>
                          {(item.wear || isST || isSV) && (
                            <div style={{ fontSize: 10, fontWeight: 700, color: wc, lineHeight: 1.2 }}>
                              {isST ? 'ST ' : ''}{isSV ? 'SV ' : ''}{ws || ''}
                            </div>
                          )}
                          {fv != null && (
                            <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#64748b', lineHeight: 1.2, marginTop: 1 }}>
                              {fv.toFixed(fv < 0.001 ? 7 : fv < 0.01 ? 6 : 4)}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          {!item.tradable && <Lock size={11} style={{ color: '#ef4444', opacity: 0.7 }} />}
                          {item.account_avatar_url && (
                            <img src={item.account_avatar_url} alt="" title={item.account_name} style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid #333' }} />
                          )}
                        </div>
                      </div>

                      {/* ═══ RARITY BAR (very bottom) ═══ */}
                      <div style={{ height: 2, background: rarityColor }} />
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ═══ LIST VIEW ═══ */
              <div className="glass rounded-2xl border border-border/50 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted text-left border-b border-border/30">
                      <th className="px-4 py-3 font-medium w-8"></th>
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
                      const isSelected = selectedIds.has(item.asset_id);
                      const isOnSale = onSaleIds.has(item.asset_id);
                      const floatVal = item.float_value != null ? Number(item.float_value) : null;
                      const paintSeed = item.paint_seed != null ? Number(item.paint_seed) : null;
                      const paintIndex = item.paint_index != null ? Number(item.paint_index) : null;
                      const dopplerPhase = paintIndex && isDoppler(item.market_hash_name)
                        ? getDopplerPhase(paintIndex) : null;
                      const fadeInfo = paintSeed != null && isFade(item.market_hash_name)
                        ? calculateFadePercent(paintSeed) : null;
                      const marbleFade = paintSeed != null && isMarbleFade(item.market_hash_name)
                        ? analyzeMarbleFade(paintSeed) : null;
                      const stickerCount = Array.isArray(item.stickers) ? item.stickers.length : 0;
                      const wearShort = getWearShort(item.wear);
                      const wearColors: Record<string, string> = { FN: '#4ade80', MW: '#22d3ee', FT: '#a78bfa', WW: '#f97316', BS: '#ef4444' };
                      const wearColor = isStatTrak ? '#cf6a32' : isSouvenir ? '#ffd700' : (wearShort && wearColors[wearShort]) || '#818cf8';
                      const rarityColor = (item.rarity && RARITY_COLORS[item.rarity]) || '#64748B';

                      return (
                        <tr
                          key={item.asset_id}
                          ref={isLast ? lastItemRef : undefined}
                          onClick={() => toggleSelect(item.asset_id)}
                          onDoubleClick={() => setSelectedItem(item)}
                          className={cn(
                            'border-b border-border/20 transition-colors cursor-pointer',
                            isSelected ? 'bg-primary/10' : 'hover:bg-surface-light/30'
                          )}
                          style={{ borderLeft: `3px solid ${rarityColor}` }}
                        >
                          <td className="px-2 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(item.asset_id)}
                              onClick={(e) => e.stopPropagation()}
                              className="accent-primary w-3.5 h-3.5"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-3">
                              <img src={getItemIconUrl(item.icon_url)} alt="" className="w-10 h-7 object-contain" />
                              <span className="truncate max-w-[200px] lg:max-w-[300px]">
                                {item.market_hash_name}
                              </span>
                              {isOnSale && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium border border-emerald-500/20">
                                  On sale
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 hidden md:table-cell">
                            {floatVal != null ? (
                              <span className="text-xs font-mono text-muted">
                                {floatVal.toFixed(floatVal < 0.01 ? 6 : 4)}
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
                                >{dopplerPhase.phase}</span>
                              )}
                              {fadeInfo && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-black"
                                  style={{ background: 'linear-gradient(135deg, #ff6b35, #f7c948, #6dd5ed)' }}
                                >{fadeInfo.percentage}%</span>
                              )}
                              {marbleFade && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white"
                                  style={{ backgroundColor: marbleFade.color + 'cc' }}
                                >{marbleFade.pattern === 'Fire & Ice' ? '\ud83d\udd25\u2744\ufe0f' : marbleFade.pattern}</span>
                              )}
                              {paintSeed != null && (dopplerPhase || fadeInfo || marbleFade) && (
                                <span className="text-[10px] font-mono text-slate-400">#{paintSeed}</span>
                              )}
                              {stickerCount > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-accent/20 text-accent rounded font-medium">x{stickerCount}</span>
                              )}
                              {item.sticker_value != null && item.sticker_value > 1 && (
                                <span className="text-[10px] text-amber-400 font-bold">{formatPrice(item.sticker_value)}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold" style={{ color: '#fde047' }}>
                            {price > 0 ? formatPrice(price) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                            {isOnSale ? (
                              <Tag size={12} className="inline text-emerald-400" />
                            ) : !item.tradable ? (
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
        </div>

        {/* Spacer so content doesn't hide behind fixed sell bar */}
        <div className="h-[140px]" />
      </div>

      {/* Fixed bottom sell tray */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-4 lg:px-6 pb-4" style={{ backgroundColor: '#0b0c10' }}>
        <BulkSellBar
          selectedItems={selectedItems}
          onClear={() => setSelectedIds(new Set())}
          onSell={(items) => setSellItems(items)}
          onQuickSell={(items) => setSellItems(items)}
          onRemoveItem={(assetId) => {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              next.delete(assetId);
              return next;
            });
          }}
        />
      </div>

      {/* Item detail modal */}
      <ItemDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onSell={(item) => {
          setSelectedItem(null);
          setSellItems([item]);
        }}
      />

      {/* Sell modal */}
      {sellItems && sellItems.length > 0 && (
        <SellModal
          items={sellItems}
          onClose={() => setSellItems(null)}
          onOperationStarted={(opId) => {
            setSellItems(null);
            setSellOperationId(opId);
            setSelectedIds(new Set());
          }}
        />
      )}

      {/* Sell progress modal */}
      {sellOperationId && (
        <SellProgressModal
          operationId={sellOperationId}
          onClose={() => setSellOperationId(null)}
        />
      )}
    </div>
  );
}
