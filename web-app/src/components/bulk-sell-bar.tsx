'use client';

import type { InventoryItem } from '@/lib/types';
import { useFormatPrice, getItemIconUrl, getWearShort } from '@/lib/utils';
import { DollarSign, ChevronDown, X, Zap, Timer, Lock, Unlock, Info } from 'lucide-react';
import { RARITY_COLORS } from '@/lib/constants';
import { cn, getDopplerPhase, isDoppler, isFade, isMarbleFade, calculateFadePercent, analyzeMarbleFade } from '@/lib/utils';

export type SellMode = 'sell' | 'quick' | 'instant';

interface BulkSellBarProps {
  selectedItems: InventoryItem[];
  onClear: () => void;
  onSell: (items: InventoryItem[], mode: SellMode) => void;
  onRemoveItem?: (assetId: string) => void;
}

const WC: Record<string, string> = { FN: '#4ade80', MW: '#22d3ee', FT: '#a78bfa', WW: '#f97316', BS: '#ef4444' };

export function BulkSellBar({ selectedItems, onClear, onSell, onRemoveItem }: BulkSellBarProps) {
  const formatPrice = useFormatPrice();
  const totalValue = selectedItems.reduce((sum, item) => {
    const price = item.prices?.steam || item.prices?.buff || 0;
    return sum + price;
  }, 0);

  const sellerReceives = totalValue * 0.85;
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
        <div className="flex gap-[6px] overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory">
          {selectedItems.map((item) => {
            const price = item.prices?.steam || item.prices?.buff || item.prices?.skinport || 0;
            const ws = getWearShort(item.wear);
            const isST = item.market_hash_name.includes('StatTrak');
            const isSV = item.market_hash_name.includes('Souvenir');
            const fv = item.float_value != null ? Number(item.float_value) : null;
            const pi = item.paint_index != null ? Number(item.paint_index) : null;
            const ps = item.paint_seed != null ? Number(item.paint_seed) : null;
            const dp = pi && isDoppler(item.market_hash_name) ? getDopplerPhase(pi) : null;
            const fi = ps != null && isFade(item.market_hash_name) ? calculateFadePercent(ps) : null;
            const mf = ps != null && isMarbleFade(item.market_hash_name) ? analyzeMarbleFade(ps) : null;
            const isCH = item.market_hash_name.includes('Case Hardened');
            const rc = (item.rarity && RARITY_COLORS[item.rarity]) || '#64748B';
            const tlDays = !item.tradable && item.trade_ban_until
              ? Math.max(0, Math.ceil((new Date(item.trade_ban_until).getTime() - Date.now()) / 86400000))
              : null;

            return (
              <div
                key={item.asset_id}
                className="group relative shrink-0 cursor-pointer hover:opacity-75 transition-opacity snap-start"
                onClick={() => onRemoveItem?.(item.asset_id)}
                style={{
                  width: 'min(100px, 22vw)',
                  borderRadius: '6px',
                  border: '1.5px solid rgba(59,130,246,0.4)',
                  backgroundColor: '#1a1d25',
                  overflow: 'hidden',
                }}
              >
                {/* Card content — same layout as grid */}
                <div className="relative" style={{ aspectRatio: '1' }}>
                  {/* Phase / Fade / Marble — top left */}
                  <div className="absolute top-0.5 left-1 z-10 flex flex-col gap-0.5">
                    {dp && <span className="text-[7px] px-[3px] py-[0.5px] rounded font-extrabold text-white" style={dp.tier===1?{background:`linear-gradient(135deg,${dp.color}ee,${dp.color}88)`}:{background:dp.color+'cc'}}>{dp.tier===1?dp.phase:dp.phase.replace('Phase ','P').replace('Gamma ','G')}</span>}
                    {fi && !dp && <span className="text-[7px] px-[3px] py-[0.5px] rounded font-extrabold text-black" style={{background:'linear-gradient(135deg,#ff6b35,#f7c948,#6dd5ed)'}}>Fade {fi.percentage}%</span>}
                    {mf && !dp && !fi && <span className="text-[7px] px-[3px] py-[0.5px] rounded font-extrabold text-white" style={{background:mf.color+'cc'}}>{mf.pattern==='Fire & Ice'?'F&I':mf.pattern}</span>}
                    {isCH && !dp && !fi && !mf && <span className="text-[7px] px-[3px] py-[0.5px] rounded font-extrabold text-white" style={{background:'#3b82f6cc'}}>CH</span>}
                  </div>

                  {/* Info (i) — top right */}
                  <Info size={12} className="absolute top-1 right-1 z-10" style={{ color: 'rgba(255,255,255,0.15)', strokeWidth: 1.2 }} />

                  {/* Image — centered */}
                  <div className="absolute inset-0 flex items-center justify-center" style={{ padding: '4px 6px 28px' }}>
                    <img
                      src={getItemIconUrl(item.icon_url)}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* Bottom overlay: wear / price / float + lock */}
                  <div className="absolute bottom-0 left-0 right-0 z-10" style={{ padding: '1px 4px 3px', background: 'linear-gradient(transparent, rgba(26,29,37,0.85) 30%, #1a1d25)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          {isST && <span style={{ fontSize: 7, fontWeight: 800, color: '#f97316' }}>ST</span>}
                          {isSV && <span style={{ fontSize: 7, fontWeight: 800, color: '#eab308' }}>SV</span>}
                          {ws && <span style={{ fontSize: 8, fontWeight: 300, color: '#64748b' }}>{ws}</span>}
                        </div>
                        <span style={{ color: '#eab308', fontSize: 10, fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.3 }}>
                          {price > 0 ? formatPrice(price) : '—'}
                        </span>
                        {fv != null ? (
                          <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.45)', lineHeight: 1.2 }}>
                            {fv.toFixed(7)}
                          </span>
                        ) : (
                          <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', lineHeight: 1.2 }}>—</span>
                        )}
                      </div>
                      <div style={{ flexShrink: 0, paddingBottom: 1 }}>
                        {tlDays != null && tlDays > 0 ? (
                          <span style={{ fontSize: 7, fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Lock size={8} style={{ strokeWidth: 1.5 }} />{tlDays}d
                          </span>
                        ) : !item.tradable ? (
                          <Lock size={8} style={{ color: '#ef4444', opacity: 0.5, strokeWidth: 1.5 }} />
                        ) : (
                          <Unlock size={8} style={{ color: '#4ade80', opacity: 0.35, strokeWidth: 1.5 }} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rarity bar */}
                <div style={{ height: 2, background: rc, opacity: 0.8 }} />

              </div>
            );
          })}

          {/* Empty slots — hide on mobile to save space */}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <div
              key={`e-${i}`}
              className="shrink-0 hidden sm:block"
              style={{
                width: 'min(100px, 22vw)',
                aspectRatio: '1',
                borderRadius: '6px',
                border: '1.5px solid #1e2028',
                backgroundColor: '#1a1c22',
              }}
            />
          ))}
        </div>

        {/* Buttons row */}
        <div className="flex flex-wrap items-center mt-1 gap-2">
          {hasItems && (
            <span className="w-full sm:w-auto" style={{ color: '#6b7280', fontSize: '12px' }}>
              <span className="font-semibold" style={{ color: '#e5e7eb' }}>{selectedItems.length}</span>
              {' '}selected
              {tradableCount < selectedItems.length && (
                <span style={{ color: '#eab308' }}> ({tradableCount} tradable)</span>
              )}
            </span>
          )}

          <div className="hidden sm:block flex-1" />

          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => onSell(selectedItems, 'sell')}
              disabled={!canSell}
              className="flex-1 sm:flex-initial px-4 sm:px-5 py-[7px] rounded-md text-[13px] font-semibold transition-opacity disabled:opacity-25 hover:opacity-90"
              style={{ backgroundColor: '#3b82f6', color: '#fff' }}
            >
              <span className="flex items-center justify-center gap-1.5">
                <DollarSign size={14} />
                Sell
              </span>
            </button>

            <button
              onClick={() => onSell(selectedItems, 'quick')}
              disabled={!canSell}
              className="flex-1 sm:flex-initial px-4 sm:px-5 py-[7px] rounded-md text-[13px] font-semibold transition-opacity disabled:opacity-25 hover:opacity-90"
              style={{ backgroundColor: '#16a34a', color: '#fff' }}
            >
              <span className="flex items-center justify-center gap-1.5">
                <Zap size={14} />
                Quick
              </span>
            </button>

            <button
              onClick={() => onSell(selectedItems, 'instant')}
              disabled={!canSell}
              className="flex-1 sm:flex-initial px-4 sm:px-5 py-[7px] rounded-md text-[13px] font-semibold transition-opacity disabled:opacity-25 hover:opacity-90"
              style={{ backgroundColor: '#d97706', color: '#fff' }}
            >
              <span className="flex items-center justify-center gap-1.5">
                <Timer size={14} />
                Instant
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
