'use client';

import type { InventoryItem } from '@/lib/types';
import { formatPrice, getItemIconUrl } from '@/lib/utils';
import { DollarSign, ChevronDown, X, Zap, Timer } from 'lucide-react';

interface BulkSellBarProps {
  selectedItems: InventoryItem[];
  onClear: () => void;
  onSell: (items: InventoryItem[]) => void;
  onQuickSell?: (items: InventoryItem[]) => void;
  onRemoveItem?: (assetId: string) => void;
}

export function BulkSellBar({ selectedItems, onClear, onSell, onQuickSell, onRemoveItem }: BulkSellBarProps) {
  const totalValue = selectedItems.reduce((sum, item) => {
    const price = item.prices?.steam || item.prices?.buff || 0;
    return sum + price;
  }, 0);

  const sellerReceives = totalValue * 0.87;
  const tradableCount = selectedItems.filter(i => i.tradable).length;
  const hasItems = selectedItems.length > 0;
  const canSell = tradableCount > 0 && hasItems;

  const slotCount = Math.max(8, selectedItems.length);

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#141519' }}>
      <div className="px-4 py-3">
        {/* Remove All + Slots + Price */}
        <div className="flex items-center gap-3">
          {/* Remove All */}
          <button
            onClick={onClear}
            disabled={!hasItems}
            className="flex items-center gap-1 shrink-0 disabled:opacity-25 hover:opacity-80 transition-opacity"
            style={{ color: '#6b7280', fontSize: '12px' }}
          >
            <ChevronDown size={16} />
            <span>Remove All</span>
          </button>

          {/* Item slot cells */}
          <div className="flex-1 flex gap-[6px] overflow-x-auto scrollbar-hide py-1">
            {Array.from({ length: slotCount }).map((_, i) => {
              const item = selectedItems[i];
              return (
                <div
                  key={item?.asset_id ?? `e-${i}`}
                  className="group relative shrink-0 flex items-center justify-center"
                  style={{
                    width: '88px',
                    height: '68px',
                    borderRadius: '6px',
                    border: item ? '1.5px solid rgba(59,130,246,0.5)' : '1.5px solid #1e2028',
                    backgroundColor: item ? 'rgba(59,130,246,0.06)' : '#1a1c22',
                  }}
                >
                  {item ? (
                    <>
                      <img
                        src={getItemIconUrl(item.icon_url)}
                        alt=""
                        className="w-full h-full object-contain p-1.5"
                      />
                      {onRemoveItem && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRemoveItem(item.asset_id); }}
                          className="absolute -top-2 -right-2 w-[18px] h-[18px] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          style={{ backgroundColor: '#ef4444' }}
                        >
                          <X size={9} className="text-white" />
                        </button>
                      )}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Price */}
          <div className="shrink-0 text-right pl-3">
            {hasItems ? (
              <p className="text-lg font-bold" style={{ color: '#4ade80' }}>
                ≈ {formatPrice(sellerReceives)}
              </p>
            ) : (
              <p style={{ color: '#374151', fontSize: '13px' }}>Select items</p>
            )}
          </div>
        </div>

        {/* Buttons row */}
        <div className="flex items-center mt-2.5 gap-2">
          {hasItems && (
            <span style={{ color: '#6b7280', fontSize: '12px' }}>
              <span className="font-semibold" style={{ color: '#e5e7eb' }}>{selectedItems.length}</span>
              {' '}selected
              {tradableCount < selectedItems.length && (
                <span style={{ color: '#eab308' }}> ({tradableCount} tradable)</span>
              )}
            </span>
          )}

          <div className="flex-1" />

          <button
            onClick={() => onSell(selectedItems)}
            disabled={!canSell}
            className="px-5 py-[7px] rounded-md text-[13px] font-semibold transition-opacity disabled:opacity-25 hover:opacity-90"
            style={{ backgroundColor: '#3b82f6', color: '#fff' }}
          >
            <span className="flex items-center gap-1.5">
              <DollarSign size={14} />
              Sell
            </span>
          </button>

          <button
            onClick={() => onQuickSell ? onQuickSell(selectedItems) : onSell(selectedItems)}
            disabled={!canSell}
            className="px-5 py-[7px] rounded-md text-[13px] font-semibold transition-opacity disabled:opacity-25 hover:opacity-90"
            style={{ backgroundColor: '#16a34a', color: '#fff' }}
          >
            <span className="flex items-center gap-1.5">
              <Zap size={14} />
              Quick Sell
            </span>
          </button>

          <button
            disabled={!canSell}
            title="Instant sell at highest buy order"
            className="px-5 py-[7px] rounded-md text-[13px] font-semibold transition-opacity disabled:opacity-25 hover:opacity-90"
            style={{ backgroundColor: '#d97706', color: '#fff' }}
          >
            <span className="flex items-center gap-1.5">
              <Timer size={14} />
              Instant Sell
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
