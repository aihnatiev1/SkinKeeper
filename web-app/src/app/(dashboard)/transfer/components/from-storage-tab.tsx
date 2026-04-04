'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Eye, EyeOff, Package, Loader2, ArrowUp, Sparkles, ArrowLeftFromLine } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStorageUnits } from '@/lib/use-desktop';
import { useTransferStore } from '@/lib/transfer-store';
import { useFastmove } from './use-fastmove';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STEAM_CDN = 'https://community.akamai.steamstatic.com/economy/image/';

function groupItems(items: any[]) {
  const map = new Map<string, { item: any; ids: string[]; count: number }>();
  for (const item of items) {
    const key = item.market_hash_name || item.name || item.id;
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

export function FromStorageTab() {
  const { units, loading: unitsLoading, fetchUnits, getContents, moveFromUnit } = useStorageUnits();
  const [search, setSearch] = useState('');
  const [contents, setContents] = useState<any[]>([]);
  const [loadingContents, setLoadingContents] = useState(false);
  const [hideFull, setHideFull] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());
  const {
    fastmove, toggleFastmove,
    isTransferring, setTransferring,
    movedItems, clearMovedItems, addToQueue, queue, processingItem, clearQueue,
  } = useTransferStore();

  const { queueLength, isProcessing } = useFastmove(moveFromUnit, selectedUnitId);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  useEffect(() => {
    if (!selectedUnitId) { setContents([]); return; }
    setLoadingContents(true);
    getContents(selectedUnitId).then((items) => {
      setContents(items);
      setLoadingContents(false);
    });
  }, [selectedUnitId, getContents]);

  const filteredUnits = useMemo(() => {
    let u = units || [];
    if (hideFull) u = u.filter((s: any) => (s.item_count || 0) < 1000);
    if (hideEmpty) u = u.filter((s: any) => (s.item_count || 0) > 0);
    return u;
  }, [units, hideFull, hideEmpty]);

  const filteredItems = useMemo(() => {
    let filtered = contents.filter((item: any) => !movedItems.has(item.id));
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((item: any) =>
        item.name?.toLowerCase().includes(q) || item.market_hash_name?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [contents, search, movedItems]);

  const grouped = useMemo(() => groupItems(filteredItems), [filteredItems]);

  const setQty = useCallback((key: string, qty: number) => {
    setQuantities((prev) => { const next = new Map(prev); next.set(key, qty); return next; });
  }, []);

  const handleWithdrawGroup = async (group: { item: any; ids: string[]; count: number }) => {
    if (!selectedUnitId) return;
    const qty = quantities.get(group.item.market_hash_name || group.item.id) ?? 0;
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
    const result = await moveFromUnit(idsToMove, selectedUnitId);
    setTransferring(false);

    if (result?.success) {
      toast.success(`Withdrew ${result.moved} items`);
      const updated = await getContents(selectedUnitId);
      setContents(updated);
      fetchUnits();
    }
  };

  return (
    <div className="space-y-4">
      {/* Storage Units cards */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted font-medium uppercase tracking-wider">Storage Units</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setHideEmpty(!hideEmpty)}
              className={cn('text-xs flex items-center gap-1 px-2 py-1 rounded-lg transition-colors',
                hideEmpty ? 'text-foreground bg-surface-light' : 'text-muted hover:text-foreground')}>
              {hideEmpty ? <EyeOff size={12} /> : <Eye size={12} />} Empty
            </button>
            <button onClick={() => setHideFull(!hideFull)}
              className={cn('text-xs flex items-center gap-1 px-2 py-1 rounded-lg transition-colors',
                hideFull ? 'text-foreground bg-surface-light' : 'text-muted hover:text-foreground')}>
              {hideFull ? <EyeOff size={12} /> : <Eye size={12} />} Full
            </button>
            <button onClick={fetchUnits} disabled={unitsLoading}
              className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors">
              <RefreshCw size={14} className={unitsLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {filteredUnits.map((unit: any) => (
            <button key={unit.id} onClick={() => setSelectedUnitId(unit.id)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl border shrink-0 transition-all min-w-[180px]',
                selectedUnitId === unit.id
                  ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/30'
                  : 'border-border/50 glass hover:border-border'
              )}>
              <Package size={18} className={cn(selectedUnitId === unit.id ? 'text-primary' : 'text-muted')} />
              <div className="text-left min-w-0">
                <p className="text-sm font-medium truncate">{unit.name}</p>
                <p className="text-xs text-muted">{unit.item_count} items</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="text" placeholder="Search items in storage..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl glass border border-border/50 text-sm focus:border-primary/30 focus:outline-none transition-colors" />
        </div>

        <button onClick={toggleFastmove}
          className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all',
            fastmove ? 'bg-warning/15 text-warning border border-warning/30'
              : 'text-muted hover:text-foreground glass border border-border/50')}>
          <Sparkles size={13} />
          Quick Move
        </button>

        <span className="text-xs text-muted">{filteredItems.length} items</span>
      </div>

      {/* Fastmove status */}
      {fastmove && (queueLength > 0 || isProcessing || movedItems.size > 0) && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl glass border border-warning/20 text-xs">
          <Sparkles size={12} className="text-warning" />
          {isProcessing && <Loader2 size={12} className="animate-spin text-warning" />}
          <span className="text-muted">
            {isProcessing ? '1 moving' : ''}{queueLength > 0 ? `${isProcessing ? ', ' : ''}${queueLength} queued` : ''}
            {movedItems.size > 0 ? ` · ${movedItems.size} done` : ''}
          </span>
          <button onClick={() => { clearQueue(); clearMovedItems(); }} className="ml-auto text-muted hover:text-foreground">Cancel</button>
        </div>
      )}

      {/* Items table */}
      <div className="overflow-y-auto max-h-[calc(100vh-380px)]">
        {!selectedUnitId ? (
          <div className="text-center py-12 text-sm text-muted">Select a storage unit above</div>
        ) : loadingContents ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-surface-light/30 animate-pulse" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted">
            {search ? 'No items match' : 'Storage unit is empty'}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-muted border-b border-border/30">
                <th className="text-left py-2 px-2 font-medium w-12"></th>
                <th className="text-left py-2 px-2 font-medium">Item</th>
                <th className="text-left py-2 px-2 font-medium hidden sm:table-cell">Type</th>
                <th className="text-center py-2 px-2 font-medium w-16">Total</th>
                <th className="text-center py-2 px-2 font-medium w-24">Qty</th>
                <th className="text-center py-2 px-2 font-medium w-16">Move</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => {
                const { item, ids, count } = group;
                const key = item.market_hash_name || item.name || item.id;
                const qty = quantities.get(key) ?? 0;
                const isProcessingThis = ids.some((id: string) => processingItem === id);

                return (
                  <motion.tr key={key} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className={cn('border-b border-border/20 hover:bg-surface-light/30 transition-colors',
                      isProcessingThis && 'bg-warning/5')}>
                    <td className="py-1.5 px-2">
                      <div className="w-10 h-10 rounded-lg bg-surface-light/50 overflow-hidden flex items-center justify-center">
                        {item.icon_url ? (
                          <img src={item.icon_url_full || (item.icon_url ? `${STEAM_CDN}${item.icon_url}/64x64` : '')} alt="" className="w-full h-full object-contain" loading="lazy" />
                        ) : (
                          <Package size={16} className="text-muted" />
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 px-2">
                      <p className="text-sm font-medium truncate max-w-[280px]">{item.name || 'Unknown'}</p>
                      {item.rarity && <p className="text-[10px] text-muted">{item.rarity}</p>}
                    </td>
                    <td className="py-1.5 px-2 hidden sm:table-cell">
                      <span className="text-xs text-muted">{item.type || '-'}</span>
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <span className="text-xs font-medium">{count}</span>
                    </td>
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
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      {isProcessingThis ? (
                        <Loader2 size={16} className="animate-spin text-warning mx-auto" />
                      ) : (
                        <button
                          onClick={() => handleWithdrawGroup(group)}
                          disabled={isTransferring || qty === 0}
                          className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ArrowLeftFromLine size={16} />
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
