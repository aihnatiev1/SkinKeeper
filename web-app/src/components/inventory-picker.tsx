'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Check, Loader2, Filter } from 'lucide-react';
import { useDesktopInventory } from '@/lib/use-desktop';

interface InventoryPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (items: any[]) => void;
  /** Max items that can be selected */
  maxItems?: number;
  /** Already selected item IDs (excluded from list) */
  excludeIds?: string[];
  /** Filter by rarity (e.g. for trade-ups: all items must be same rarity) */
  filterRarity?: string;
  title?: string;
}

const RARITY_COLORS: Record<string, string> = {
  'Consumer Grade': '#b0c3d9',
  'Industrial Grade': '#5e98d9',
  'Mil-Spec Grade': '#4b69ff',
  'Restricted': '#8847ff',
  'Classified': '#d32ce6',
  'Covert': '#eb4b4b',
  'Contraband': '#e4ae39',
};

export function InventoryPicker({
  open,
  onClose,
  onSelect,
  maxItems = 1,
  excludeIds = [],
  filterRarity,
  title = 'Select Items',
}: InventoryPickerProps) {
  const { items: allItems, loading, refresh, isDesktop } = useDesktopInventory();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rarityFilter, setRarityFilter] = useState<string | null>(filterRarity || null);

  // Fetch inventory on open
  useEffect(() => {
    if (open && isDesktop) {
      refresh();
    }
    if (open) {
      setSelected(new Set());
      setSearch('');
    }
  }, [open, isDesktop]);

  // Lock rarity filter if prop set
  useEffect(() => {
    if (filterRarity) setRarityFilter(filterRarity);
  }, [filterRarity]);

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item: any) => {
      if (excludeSet.has(item.id)) return false;
      if (rarityFilter && item.rarity !== rarityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          item.name?.toLowerCase().includes(q) ||
          item.market_hash_name?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allItems, search, rarityFilter, excludeSet]);

  const availableRarities = useMemo(() => {
    const rarities = new Set<string>();
    allItems.forEach((item: any) => {
      if (item.rarity && !excludeSet.has(item.id)) {
        rarities.add(item.rarity);
      }
    });
    return Array.from(rarities);
  }, [allItems, excludeSet]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < maxItems) {
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const selectedItems = allItems.filter((item: any) => selected.has(item.id));
    onSelect(selectedItems);
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl max-h-[80vh] bg-surface border border-border/50 rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/30">
            <div>
              <h2 className="font-bold text-lg">{title}</h2>
              <p className="text-xs text-muted">
                {selected.size}/{maxItems} selected
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Search + Filters */}
          <div className="px-6 py-3 border-b border-border/30 space-y-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items..."
                autoFocus
                className="w-full pl-9 pr-4 py-2 bg-surface-light rounded-xl text-sm border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            {!filterRarity && availableRarities.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Filter size={12} className="text-muted" />
                <button
                  onClick={() => setRarityFilter(null)}
                  className={`px-2 py-0.5 text-[11px] rounded-lg font-medium transition-colors ${
                    !rarityFilter ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground'
                  }`}
                >
                  All
                </button>
                {availableRarities.map((rarity) => (
                  <button
                    key={rarity}
                    onClick={() => setRarityFilter(rarity === rarityFilter ? null : rarity)}
                    className={`px-2 py-0.5 text-[11px] rounded-lg font-medium transition-colors ${
                      rarityFilter === rarity ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground'
                    }`}
                  >
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                      style={{ backgroundColor: RARITY_COLORS[rarity] || '#888' }}
                    />
                    {rarity}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-muted" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-20 text-muted text-sm">
                {search ? 'No items match your search' : 'No items available'}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {filteredItems.map((item: any) => {
                  const isSelected = selected.has(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleSelect(item.id)}
                      disabled={!isSelected && selected.size >= maxItems}
                      className={`relative p-2 rounded-xl transition-all text-left group ${
                        isSelected
                          ? 'bg-primary/10 ring-2 ring-primary'
                          : 'bg-surface-light hover:bg-surface-light/80 disabled:opacity-30'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                      <img
                        src={`https://community.akamai.steamstatic.com/economy/image/${item.icon_url}/128x128`}
                        alt={item.name}
                        className="w-full aspect-square object-contain"
                        loading="lazy"
                      />
                      <p className="text-[10px] font-medium mt-1 truncate">{item.name}</p>
                      {item.rarity && (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl"
                          style={{ backgroundColor: RARITY_COLORS[item.rarity] || '#888' }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border/30 flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className="px-6 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-bold transition-all disabled:opacity-40"
            >
              Add {selected.size} item{selected.size !== 1 ? 's' : ''}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
