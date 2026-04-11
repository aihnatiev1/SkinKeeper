'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search, ArrowRight, Check, Package } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStorageUnits } from '@/lib/use-desktop';
import { useTransferStore } from '@/lib/transfer-store';
import { StorageUnitSelector } from './storage-unit-selector';
import { TransferProgress } from './transfer-progress';
import { toast } from 'sonner';

const STEAM_CDN = 'https://community.akamai.steamstatic.com/economy/image/';

export function BetweenTab() {
  const { units, loading: unitsLoading, fetchUnits, getContents, moveBetweenUnits } = useStorageUnits();
  const [search, setSearch] = useState('');
  const [contents, setContents] = useState<any[]>([]);
  const [loadingContents, setLoadingContents] = useState(false);
  const {
    sourceUnit, setSourceUnit,
    targetUnit, setTargetUnit,
    selectedItems, toggleItem, selectAll, clearSelection,
    isTransferring, progress, setTransferring,
  } = useTransferStore();

  // Fetch storage units on mount
  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  // Load source unit contents
  useEffect(() => {
    if (!sourceUnit) {
      setContents([]);
      return;
    }
    setLoadingContents(true);
    getContents(sourceUnit).then((items) => {
      setContents(items);
      setLoadingContents(false);
    });
  }, [sourceUnit, getContents]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection();
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && filteredItems.length > 0) {
        e.preventDefault();
        selectAll(filteredItems.map((i: any) => i.id));
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return contents.filter((item: any) =>
      !q || item.name?.toLowerCase().includes(q) || item.market_hash_name?.toLowerCase().includes(q)
    );
  }, [contents, search]);

  // Filter target units to exclude source
  const targetUnits = useMemo(() =>
    units.filter((u) => u.id !== sourceUnit),
  [units, sourceUnit]);

  const handleTransfer = async () => {
    if (!sourceUnit || !targetUnit || selectedItems.size === 0) return;
    setTransferring(true, { current: 0, total: selectedItems.size });

    const ids = Array.from(selectedItems);
    const result = await moveBetweenUnits(ids, sourceUnit, targetUnit);

    setTransferring(false);
    clearSelection();

    if (result?.success) {
      toast.success(`Transferred ${result.moved} items between storage units`);
      const updated = await getContents(sourceUnit);
      setContents(updated);
      fetchUnits();
    } else {
      toast.error('Failed to transfer items');
    }
  };

  const handleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      clearSelection();
    } else {
      selectAll(filteredItems.map((i: any) => i.id));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
      {/* Left: Source contents */}
      <div className="lg:col-span-2 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl glass border border-border/50 text-sm focus:border-primary/30 focus:outline-none transition-colors"
            />
          </div>
          {filteredItems.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="text-xs text-muted hover:text-foreground px-3 py-2 rounded-lg hover:bg-surface-light transition-colors whitespace-nowrap"
            >
              {selectedItems.size === filteredItems.length ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto max-h-[calc(100vh-280px)] rounded-xl">
          {!sourceUnit ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted">
              Select a source storage unit
            </div>
          ) : loadingContents ? (
            <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-surface-light/50 animate-pulse" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted">
              {search ? 'No items match' : 'Storage unit is empty'}
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
              {filteredItems.map((item: any) => {
                const isSelected = selectedItems.has(item.id);
                return (
                  <motion.button
                    key={item.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => toggleItem(item.id)}
                    disabled={isTransferring}
                    title={item.name || item.market_hash_name}
                    className={`relative aspect-square rounded-lg border transition-all overflow-hidden group flex flex-col items-center justify-center ${
                      isSelected
                        ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/30'
                        : 'border-border/30 hover:border-border bg-surface-light/30 hover:bg-surface-light/50'
                    }`}
                  >
                    {(item.icon_url || item.icon_url_full) ? (
                      <img
                        src={item.icon_url_full || `${STEAM_CDN}${item.icon_url}/128x128`}
                        alt={item.name}
                        className="w-full h-full object-contain p-1"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 px-1">
                        <Package size={14} className="text-muted/50 shrink-0" />
                        <p className="text-[8px] text-muted/70 text-center leading-tight line-clamp-2">
                          {(item.name || item.market_hash_name || '').replace(/^.*\| /, '')}
                        </p>
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <Check size={10} className="text-white" />
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1 pb-1 pt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[8px] text-white truncate text-center leading-tight">
                        {(item.name || item.market_hash_name || '').replace(/^.*\| /, '')}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Source + Target selectors + action */}
      <div className="flex flex-col gap-4">
        <StorageUnitSelector
          units={units}
          selected={sourceUnit}
          onSelect={setSourceUnit}
          label="From"
          loading={unitsLoading}
        />

        <div className="flex items-center justify-center">
          <ArrowRight size={20} className="text-muted" />
        </div>

        <StorageUnitSelector
          units={targetUnits}
          selected={targetUnit}
          onSelect={setTargetUnit}
          label="To"
          loading={unitsLoading}
        />

        {isTransferring && progress ? (
          <TransferProgress
            current={progress.current}
            total={progress.total}
            currentItem={progress.currentItem}
          />
        ) : (
          <button
            onClick={handleTransfer}
            disabled={selectedItems.size === 0 || !sourceUnit || !targetUnit || isTransferring}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/25 hover:shadow-primary/40"
          >
            <ArrowRight size={18} />
            {selectedItems.size > 0
              ? `Transfer ${selectedItems.size} item${selectedItems.size > 1 ? 's' : ''}`
              : 'Select items to transfer'}
          </button>
        )}

        {selectedItems.size > 0 && !isTransferring && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{selectedItems.size} selected</span>
            <button
              onClick={clearSelection}
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
