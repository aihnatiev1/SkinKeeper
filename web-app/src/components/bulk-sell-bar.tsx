'use client';

import type { InventoryItem } from '@/lib/types';
import { formatPrice, getItemIconUrl, getWearShort } from '@/lib/utils';
import { DollarSign, ChevronDown, X, Zap, Timer, Lock } from 'lucide-react';

interface BulkSellBarProps {
  selectedItems: InventoryItem[];
  onClear: () => void;
  onSell: (items: InventoryItem[]) => void;
  onQuickSell?: (items: InventoryItem[]) => void;
  onRemoveItem?: (assetId: string) => void;
}

const WC: Record<string, string> = { FN: '#4ade80', MW: '#22d3ee', FT: '#a78bfa', WW: '#f97316', BS: '#ef4444' };

export function BulkSellBar({ selectedItems, onClear, onSell, onQuickSell, onRemoveItem }: BulkSellBarProps) {
  const totalValue = selectedItems.reduce((sum, item) => {
    const price = item.prices?.steam || item.prices?.buff || 0;
    return sum + price;
  }, 0);

  const sellerReceives = totalValue * 0.87;
  const tradableCount = selectedItems.filter(i => i.tradable).length;
  const hasItems = selectedItems.length > 0;
  const canSell = tradableCount > 0 && hasItems;

  const emptySlots = Math.max(0, 8 - selectedItems.length);

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#141519' }}>
      <div className="px-4 py-3">
        {/* Header row: Remove All + total */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <button
              onClick={onClear}
              disabled={!hasItems}
              className="flex items-center gap-1 shrink-0 disabled:opacity-25 hover:opacity-80 transition-opacity"
              style={{ color: '#6b7280', fontSize: '12px' }}
            >
              <ChevronDown size={16} />
              <span>Remove All</span>
              {hasItems && <X size={12} style={{ color: '#6b7280', marginLeft: 2 }} />}
            </button>
          </div>

          <div className="flex items-center gap-4">
            {hasItems && (
              <span style={{ color: '#9ca3af', fontSize: '13px' }}>
                Sell now and get: <span style={{ color: '#e5e7eb', fontWeight: 600 }}>({selectedItems.length})</span>
              </span>
            )}
            <span className="text-xl font-bold" style={{ color: '#4ade80' }}>
              {hasItems ? (
                <span className="flex items-center gap-1">
                  <span style={{ color: '#eab308', fontSize: 14 }}>⚡</span>
                  {formatPrice(sellerReceives)}
                </span>
              ) : (
                <span style={{ color: '#374151', fontSize: '13px', fontWeight: 400 }}>Select items</span>
              )}
            </span>
          </div>
        </div>

        {/* Mini card slots */}
        <div className="flex gap-[6px] overflow-x-auto scrollbar-hide pb-2">
          {selectedItems.map((item) => {
            const price = item.prices?.steam || item.prices?.buff || item.prices?.skinport || 0;
            const ws = getWearShort(item.wear);
            const isST = item.market_hash_name.includes('StatTrak');
            const wc = isST ? '#cf6a32' : (ws && WC[ws]) || '#818cf8';
            const fv = item.float_value != null ? Number(item.float_value) : null;
            const tlDays = !item.tradable && item.trade_ban_until
              ? Math.max(0, Math.ceil((new Date(item.trade_ban_until).getTime() - Date.now()) / 86400000))
              : null;

            return (
              <div
                key={item.asset_id}
                className="group relative shrink-0 flex flex-col"
                style={{
                  width: '110px',
                  borderRadius: '6px',
                  border: '1.5px solid rgba(59,130,246,0.4)',
                  backgroundColor: '#1a1d25',
                  overflow: 'hidden',
                }}
              >
                {/* Top row: price + wear badge */}
                <div style={{ padding: '3px 5px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
                    <span style={{ color: '#eab308', fontSize: 8 }}>⚡</span>
                    <span style={{ color: '#eab308', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>
                      {price > 0 ? formatPrice(price) : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    {isST && <span style={{ fontSize: 7, fontWeight: 800, color: '#f97316', background: 'rgba(249,115,22,0.15)', padding: '0px 3px', borderRadius: 2, lineHeight: '12px' }}>ST</span>}
                    {ws && <span style={{ fontSize: 7, fontWeight: 800, color: wc, background: `${wc}18`, padding: '0px 3px', borderRadius: 2, lineHeight: '12px' }}>{ws}</span>}
                  </div>
                </div>

                {/* Image */}
                <div style={{ padding: '2px 6px', position: 'relative' }}>
                  <img
                    src={getItemIconUrl(item.icon_url)}
                    alt=""
                    style={{ width: '100%', height: '48px', objectFit: 'contain' }}
                  />
                </div>

                {/* Bottom: DMarket price + float + lock */}
                <div style={{ padding: '0 5px 3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
                    {item.prices?.buff ? (
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#f87171' }}>
                        <span style={{ fontSize: 7, color: '#ef4444' }}>◆</span> {formatPrice(item.prices.buff)}
                      </span>
                    ) : null}
                    {fv != null && (
                      <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.45)' }}>
                        {fv.toFixed(7)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    {tlDays != null && tlDays > 0 && (
                      <span style={{ fontSize: 7, fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Lock size={7} />{tlDays}d
                      </span>
                    )}
                    {!item.tradable && (tlDays === null || tlDays === 0) && <Lock size={8} style={{ color: '#ef4444', opacity: 0.5 }} />}
                  </div>
                </div>

                {/* Remove button */}
                {onRemoveItem && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveItem(item.asset_id); }}
                    className="absolute -top-1.5 -right-1.5 w-[16px] h-[16px] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    style={{ backgroundColor: '#ef4444' }}
                  >
                    <X size={8} className="text-white" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Empty slots */}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <div
              key={`e-${i}`}
              className="shrink-0"
              style={{
                width: '110px',
                height: '86px',
                borderRadius: '6px',
                border: '1.5px solid #1e2028',
                backgroundColor: '#1a1c22',
              }}
            />
          ))}
        </div>

        {/* Buttons row */}
        <div className="flex items-center mt-1 gap-2">
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
