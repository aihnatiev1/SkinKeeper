'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Search, RefreshCw, Eye, EyeOff, Package, Loader2, ChevronDown, ArrowRightToLine, Sparkles, Pencil } from 'lucide-react';
import { useFormatPrice } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useDesktopInventory, useStorageUnits } from '@/lib/use-desktop';
import { useTransferStore } from '@/lib/transfer-store';
import { useFastmove } from './use-fastmove';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STEAM_CDN = 'https://community.akamai.steamstatic.com/economy/image/';
const STORAGE_UNIT_ICON = 'https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJG51EejH_XV0MGkITXE5AB094KtuwG0Exv1yMfkqXcCtvT_MPw5JPTKV2bDk7Z3sudtHSjr2w0ptCMWPT2u';

function getWear(paintWear: number | null | undefined): string | null {
  if (paintWear == null) return null;
  if (paintWear < 0.07) return 'FN';
  if (paintWear < 0.15) return 'MW';
  if (paintWear < 0.38) return 'FT';
  if (paintWear < 0.45) return 'WW';
  return 'BS';
}

const WEAR_COLORS: Record<string, string> = {
  FN: '#4ade80', MW: '#22d3ee', FT: '#a78bfa', WW: '#f97316', BS: '#ef4444',
};

// Group items by market_hash_name + wear (so same skin with different wear = separate rows)
function groupItems(items: any[]) {
  const map = new Map<string, { item: any; ids: string[]; count: number }>();
  for (const item of items) {
    const wear = getWear(item.paint_wear);
    // Use market_hash_name (includes wear), fallback to name+wear
    const key = item.market_hash_name || `${item.name || item.id}__${wear || ''}`;
    const existing = map.get(key);
    if (existing) {
      existing.ids.push(item.id);
      existing.count++;
    } else {
      map.set(key, { item, ids: [item.id], count: 1 });
    }
  }
  return Array.from(map.values());
}

// Extract categories from items
function getCategories(items: any[]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const cat = item.type || 'Other';
    map.set(cat, (map.get(cat) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function useBatchPrices(names: string[]) {
  const [prices, setPrices] = useState<Record<string, any>>({});
  const fetchedRef = useRef<string>('');

  useEffect(() => {
    const unique = [...new Set(names.filter(Boolean))].slice(0, 500);
    if (unique.length === 0) return;
    const key = unique.slice(0, 20).join('|');
    if (fetchedRef.current === key) return;
    fetchedRef.current = key;

    fetch('/api/proxy/prices/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: unique }),
    })
      .then(r => r.json())
      .then(data => { if (data?.prices) setPrices(data.prices); })
      .catch(() => {});
  }, [names.length > 0 ? names[0] : '']); // re-fetch when inventory changes

  return prices;
}

export function ToStorageTab() {
  const formatPrice = useFormatPrice();
  const { items, loading: invLoading, error: invError, refresh } = useDesktopInventory();
  const { units, loading: unitsLoading, fetchUnits, moveToUnit, renameUnit } = useStorageUnits();
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [hideFull, setHideFull] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());
  const {
    fastmove, toggleFastmove,
    isTransferring, progress, setTransferring,
    movedItems, clearMovedItems, addToQueue, queue, processingItem, clearQueue,
  } = useTransferStore();

  const { queueLength, isProcessing } = useFastmove(moveToUnit, selectedUnitId);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  // Filtered storage units
  const filteredUnits = useMemo(() => {
    let u = units || [];
    if (hideFull) u = u.filter((s: any) => (s.item_count || 0) < 1000);
    if (hideEmpty) u = u.filter((s: any) => (s.item_count || 0) > 0);
    return u;
  }, [units, hideFull, hideEmpty]);

  // Filtered and grouped items (exclude storage units)
  const filteredItems = useMemo(() => {
    if (!items) return [];
    let filtered = items.filter((item: any) =>
      !movedItems.has(item.id) &&
      item.def_index !== 1201 &&
      !(item.type || '').toLowerCase().includes('storage unit') &&
      !(item.market_hash_name || '').toLowerCase().includes('storage unit')
    );
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((item: any) =>
        item.name?.toLowerCase().includes(q) || item.market_hash_name?.toLowerCase().includes(q)
      );
    }
    if (categoryFilter) {
      filtered = filtered.filter((item: any) => (item.type || 'Other') === categoryFilter);
    }
    return filtered;
  }, [items, search, categoryFilter, movedItems]);

  const grouped = useMemo(() => groupItems(filteredItems), [filteredItems]);
  const categories = useMemo(() => getCategories(items || []), [items]);

  // Batch-fetch prices for all inventory items
  const marketNames = useMemo(() =>
    (items || []).map((i: any) => i.market_hash_name).filter(Boolean),
    [items]
  );
  const prices = useBatchPrices(marketNames);

  const setQty = useCallback((key: string, qty: number) => {
    setQuantities((prev) => {
      const next = new Map(prev);
      next.set(key, qty);
      return next;
    });
  }, []);

  const handleMoveGroup = async (group: { item: any; ids: string[]; count: number }) => {
    if (!selectedUnitId) {
      toast.error('Select a destination storage unit');
      return;
    }
    const selectedUnit = (units || []).find((u: any) => u.id === selectedUnitId);
    if (selectedUnit && !selectedUnit.activated) {
      toast.error('Activate this storage unit first (give it a name)');
      return;
    }
    const key = group.item.market_hash_name || group.item.id;
    const qty = quantities.get(key) ?? 0;
    if (qty === 0) {
      toast.error('Set quantity first');
      return;
    }
    const idsToMove = group.ids.slice(0, qty);

    if (fastmove) {
      for (const id of idsToMove) addToQueue(id);
      return;
    }

    setTransferring(true, { current: 0, total: idsToMove.length });
    const result = await moveToUnit(idsToMove, selectedUnitId);
    setTransferring(false, null);

    if (result?.success) {
      toast.success(`Moved ${result.moved} items to storage`);
      setQty(key, 0); // Reset qty
      refresh(); // Refresh inventory
      fetchUnits(); // Refresh storage unit counts
    } else {
      toast.error('Failed to move items');
    }
  };

  const handleMoveAll = async () => {
    if (!selectedUnitId) return;
    const selectedUnit = (units || []).find((u: any) => u.id === selectedUnitId);
    if (selectedUnit && !selectedUnit.activated) {
      toast.error('Activate this storage unit first');
      return;
    }

    // Collect IDs only from groups with qty > 0
    const idsToMove: string[] = [];
    for (const group of grouped) {
      const key = group.item.market_hash_name || group.item.id;
      const qty = quantities.get(key) ?? 0;
      if (qty > 0) {
        idsToMove.push(...group.ids.slice(0, qty));
      }
    }

    if (idsToMove.length === 0) {
      toast.error('Set quantity for items you want to move');
      return;
    }

    setTransferring(true, { current: 0, total: idsToMove.length });
    const result = await moveToUnit(idsToMove, selectedUnitId);
    setTransferring(false, null);

    if (result?.success) {
      toast.success(`Moved ${result.moved} items`);
      setQuantities(new Map());
      refresh();
      fetchUnits();
    }
  };

  return (
    <div className="space-y-4">
      {/* Storage Units — horizontal cards */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted font-medium uppercase tracking-wider">Storage Units</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHideEmpty(!hideEmpty)}
              className={cn('text-xs flex items-center gap-1 px-2 py-1 rounded-lg transition-colors',
                hideEmpty ? 'text-foreground bg-surface-light' : 'text-muted hover:text-foreground'
              )}
            >
              {hideEmpty ? <EyeOff size={12} /> : <Eye size={12} />} Empty
            </button>
            <button
              onClick={() => setHideFull(!hideFull)}
              className={cn('text-xs flex items-center gap-1 px-2 py-1 rounded-lg transition-colors',
                hideFull ? 'text-foreground bg-surface-light' : 'text-muted hover:text-foreground'
              )}
            >
              {hideFull ? <EyeOff size={12} /> : <Eye size={12} />} Full
            </button>
            <button
              onClick={fetchUnits}
              disabled={unitsLoading}
              className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors"
            >
              <RefreshCw size={14} className={unitsLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {filteredUnits.map((unit: any) => {
            const fillPct = Math.min(100, ((unit.item_count || 0) / 1000) * 100);
            const isSelected = selectedUnitId === unit.id;
            const liveCount = isSelected && isTransferring && progress
              ? unit.item_count + progress.current
              : unit.item_count;
            return (
            <div
              key={unit.id}
              onClick={() => {
                if (!unit.activated) {
                  setSelectedUnitId(unit.id);
                  setEditingUnit(unit.id);
                  setEditName('');
                } else {
                  setSelectedUnitId(unit.id);
                }
              }}
              className={cn(
                'flex flex-col gap-1.5 px-3 pt-2.5 pb-2 rounded-xl border shrink-0 transition-all w-[160px] group cursor-pointer relative',
                !unit.activated && 'border-warning/30 border-dashed',
                isSelected
                  ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/30 shadow-lg shadow-primary/10'
                  : unit.activated ? 'border-border/40 glass hover:border-border hover:bg-surface-light/50' : ''
              )}
            >
              <div className="flex items-center gap-2">
                <img src={STORAGE_UNIT_ICON} alt="" className="w-7 h-7 shrink-0 object-contain" />
                <div className="min-w-0 flex-1">
                  {editingUnit === unit.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={async () => {
                        if (editName.trim() && editName !== unit.name) await renameUnit(unit.id, editName.trim());
                        setEditingUnit(null);
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          if (editName.trim() && editName !== unit.name) await renameUnit(unit.id, editName.trim());
                          setEditingUnit(null);
                        }
                        if (e.key === 'Escape') setEditingUnit(null);
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      className="w-full text-xs font-semibold bg-transparent border-b border-primary/50 focus:outline-none"
                    />
                  ) : (
                    <p className={cn('text-xs font-semibold truncate leading-tight', !unit.activated ? 'text-warning' : isSelected ? 'text-primary' : '')}>
                      {unit.name || 'Tap to activate'}
                    </p>
                  )}
                  <p className="text-[10px] text-muted tabular-nums">{liveCount} / 1000</p>
                </div>
                {isSelected && editingUnit !== unit.id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingUnit(unit.id); setEditName(unit.name); }}
                    className="p-0.5 rounded text-muted hover:text-foreground opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Pencil size={11} />
                  </button>
                )}
              </div>
              {/* Fill bar */}
              <div className="h-1 rounded-full bg-white/8 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', fillPct > 90 ? 'bg-loss' : fillPct > 70 ? 'bg-warning' : 'bg-primary/60')}
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            </div>
            );
          })}
          {filteredUnits.length === 0 && !unitsLoading && (
            <div className="text-sm text-muted py-3">No storage units found</div>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl glass border border-border/50 text-sm focus:border-primary/30 focus:outline-none transition-colors"
          />
        </div>

        {/* Category dropdown */}
        {categories.length > 0 && (
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg glass border border-border/50 text-xs font-medium hover:border-border transition-colors">
              {categoryFilter || 'All categories'}
              <ChevronDown size={12} className="text-muted" />
            </button>
            <div className="absolute z-30 top-full mt-1 left-0 glass-strong rounded-xl border border-border/50 shadow-2xl overflow-hidden max-h-60 overflow-y-auto w-48 hidden group-hover:block">
              <button
                onClick={() => setCategoryFilter(null)}
                className={cn('w-full text-left px-3 py-2 text-xs transition-colors',
                  !categoryFilter ? 'bg-primary/10 text-primary' : 'hover:bg-surface-light'
                )}
              >
                All ({items?.length || 0})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => setCategoryFilter(cat.name)}
                  className={cn('w-full text-left px-3 py-2 text-xs transition-colors',
                    categoryFilter === cat.name ? 'bg-primary/10 text-primary' : 'hover:bg-surface-light'
                  )}
                >
                  {cat.name} ({cat.count})
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={toggleFastmove}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all',
            fastmove
              ? 'bg-warning/15 text-warning border border-warning/30'
              : 'text-muted hover:text-foreground glass border border-border/50'
          )}
        >
          <Sparkles size={13} />
          Quick Move
        </button>

        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{filteredItems.length} items</span>
          {movedItems.size > 0 && <span className="text-profit">{movedItems.size} moved</span>}
        </div>

        {filteredItems.length > 0 && selectedUnitId && !fastmove && (
          <button
            onClick={handleMoveAll}
            disabled={isTransferring}
            className="px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
          >
            Move all
          </button>
        )}
      </div>

      {/* Fastmove status bar */}
      {fastmove && (queueLength > 0 || isProcessing || movedItems.size > 0) && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl glass border border-warning/20 text-xs">
          <Sparkles size={12} className="text-warning" />
          {isProcessing && <Loader2 size={12} className="animate-spin text-warning" />}
          <span className="text-muted">
            {isProcessing ? '1 moving' : ''}{queueLength > 0 ? `${isProcessing ? ', ' : ''}${queueLength} queued` : ''}
            {movedItems.size > 0 ? `${(isProcessing || queueLength > 0) ? ' · ' : ''}${movedItems.size} done` : ''}
          </span>
          <button onClick={() => { clearQueue(); clearMovedItems(); }} className="ml-auto text-muted hover:text-foreground">Cancel</button>
        </div>
      )}

      {/* Items table */}
      <div className="overflow-y-auto max-h-[calc(100vh-380px)]">
        {invLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-surface-light/30 animate-pulse" />
            ))}
          </div>
        ) : invError ? (
          <div className="text-center py-12">
            <p className="text-sm text-loss mb-2">{invError}</p>
            <button onClick={refresh} className="text-xs text-primary hover:underline">Retry</button>
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted">
            {search || categoryFilter ? 'No items match filters' : 'Inventory is empty'}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-muted border-b border-border/30">
                <th className="text-left py-2 px-2 font-medium w-12"></th>
                <th className="text-left py-2 px-2 font-medium">Item</th>
                <th className="text-left py-2 px-2 font-medium hidden lg:table-cell">Type</th>
                <th className="text-left py-2 px-2 font-medium hidden md:table-cell w-16">Wear</th>
                <th className="text-right py-2 px-2 font-medium hidden md:table-cell w-20">Price</th>
                <th className="text-center py-2 px-2 font-medium w-14">Qty</th>
                <th className="text-center py-2 px-2 font-medium w-24">Select</th>
                <th className="text-center py-2 px-2 font-medium w-14">Move</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => {
                const { item, ids, count } = group;
                const key = item.market_hash_name || item.id;
                const qty = quantities.get(key) ?? 0;
                const isQueued = ids.some((id: string) => queue.includes(id));
                const isProcessingThis = ids.some((id: string) => processingItem === id);

                return (
                  <motion.tr
                    key={key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={cn(
                      'border-b border-border/20 hover:bg-surface-light/30 transition-colors',
                      isProcessingThis && 'bg-warning/5',
                      isQueued && !isProcessingThis && 'bg-accent/5'
                    )}
                  >
                    {/* Image */}
                    <td className="py-1.5 px-2">
                      <div className="w-10 h-10 rounded-lg bg-surface-light/50 overflow-hidden flex items-center justify-center">
                        {(item.icon_url || item.icon_url_full) ? (
                          <img
                            src={item.icon_url_full || `${STEAM_CDN}${item.icon_url}/64x64`}
                            alt=""
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <Package size={16} className="text-muted" />
                        )}
                      </div>
                    </td>

                    {/* Name */}
                    <td className="py-1.5 px-2">
                      <p className="text-sm font-medium truncate max-w-[220px] leading-tight">
                        {item.name || item.market_hash_name || 'Unknown'}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {item.rarity && (
                          <span className="text-[10px] text-muted">{item.rarity}</span>
                        )}
                        {count > 1 && (
                          <span className="text-[10px] px-1.5 py-0 rounded-full bg-surface-light text-muted font-medium">×{count}</span>
                        )}
                      </div>
                    </td>

                    {/* Type */}
                    <td className="py-1.5 px-2 hidden lg:table-cell">
                      <span className="text-xs text-muted truncate max-w-[120px] block">{item.type || '-'}</span>
                    </td>

                    {/* Wear */}
                    <td className="py-1.5 px-2 hidden md:table-cell">
                      {(() => {
                        const wear = getWear(item.paint_wear);
                        return wear ? (
                          <span
                            className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                            style={{ color: WEAR_COLORS[wear], background: `${WEAR_COLORS[wear]}18` }}
                          >
                            {wear}
                          </span>
                        ) : <span className="text-xs text-muted/40">—</span>;
                      })()}
                    </td>

                    {/* Price */}
                    <td className="py-1.5 px-2 hidden md:table-cell text-right">
                      {(() => {
                        const p = prices[item.market_hash_name];
                        const priceUsd = p?.steam ?? p?.skinport ?? p?.buff ?? p?.dmarket;
                        return priceUsd ? (
                          <span className="text-xs font-medium text-foreground tabular-nums">
                            {formatPrice(priceUsd)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted/40">—</span>
                        );
                      })()}
                    </td>

                    {/* Qty (total count, no selector needed — use Select col) */}
                    <td className="py-1.5 px-2 text-center">
                      <span className="text-xs font-semibold tabular-nums">{count}</span>
                    </td>

                    {/* Select qty */}
                    <td className="py-1.5 px-2 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setQty(key, Math.max(0, qty - 1))}
                          className="w-5 h-5 rounded text-xs text-muted hover:text-foreground hover:bg-surface-light transition-colors"
                        >-</button>
                        <input
                          type="number"
                          min={0}
                          max={count}
                          value={qty}
                          onChange={(e) => setQty(key, Math.min(count, Math.max(0, parseInt(e.target.value) || 0)))}
                          className="w-12 text-center text-xs py-0.5 rounded bg-surface-light border border-border/50 focus:border-primary/30 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          onClick={() => setQty(key, Math.min(count, qty + 1))}
                          className="w-5 h-5 rounded text-xs text-muted hover:text-foreground hover:bg-surface-light transition-colors"
                        >+</button>
                        <button
                          onClick={() => {
                            const unit = (units || []).find((u: any) => u.id === selectedUnitId);
                            const remaining = unit ? Math.max(0, 1000 - unit.item_count) : count;
                            setQty(key, Math.min(count, remaining));
                          }}
                          className="ml-1 px-1.5 py-0.5 rounded text-[10px] text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                        >all</button>
                      </div>
                    </td>

                    {/* Move button */}
                    <td className="py-1.5 px-2 text-center">
                      {isProcessingThis ? (
                        <Loader2 size={16} className="animate-spin text-warning mx-auto" />
                      ) : (
                        <button
                          onClick={() => handleMoveGroup(group)}
                          disabled={!selectedUnitId || isTransferring || qty === 0}
                          className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ArrowRightToLine size={16} />
                        </button>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
