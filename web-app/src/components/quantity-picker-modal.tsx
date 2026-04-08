'use client';

import type { InventoryItem } from '@/lib/types';
import { useFormatPrice, getItemIconUrl, getWearShort } from '@/lib/utils';
import { X, Minus, Plus } from 'lucide-react';
import { useState } from 'react';

interface ItemGroup {
  marketHashName: string;
  items: InventoryItem[];
  representative: InventoryItem;
  count: number;
  selectedCount: number;
}

interface QuantityPickerModalProps {
  group: ItemGroup;
  onConfirm: (assetIds: string[]) => void;
  onClose: () => void;
}

export function QuantityPickerModal({ group, onConfirm, onClose }: QuantityPickerModalProps) {
  const formatPrice = useFormatPrice();
  const [quantity, setQuantity] = useState(group.selectedCount || 1);
  const max = group.count;
  const rep = group.representative;
  const price = rep.prices?.steam || rep.prices?.buff || rep.prices?.skinport || 0;
  const ws = getWearShort(rep.wear);
  const totalPrice = price * quantity;

  // Items sorted by float asc (no float → end)
  const sorted = [...group.items].sort((a, b) => {
    const fa = a.float_value != null ? Number(a.float_value) : 999;
    const fb = b.float_value != null ? Number(b.float_value) : 999;
    return fa - fb;
  });

  const handleConfirm = () => {
    const ids = sorted.slice(0, quantity).map((i) => i.asset_id);
    onConfirm(ids);
  };

  const quickButtons: { label: string; value: number }[] = [{ label: '1', value: 1 }];
  if (max >= 10) quickButtons.push({ label: String(Math.floor(max / 4)), value: Math.floor(max / 4) });
  if (max >= 4) quickButtons.push({ label: String(Math.floor(max / 2)), value: Math.floor(max / 2) });
  quickButtons.push({ label: `All (${max})`, value: max });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-[340px] rounded-2xl overflow-hidden"
        style={{ background: '#1a1d25', border: '1px solid #272b36' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button onClick={onClose} className="absolute top-3 right-3 z-10 text-white/40 hover:text-white/70 transition-colors">
          <X size={18} />
        </button>

        {/* Header: item preview */}
        <div className="flex items-center gap-3 p-4 pb-2">
          <img src={getItemIconUrl(rep.icon_url)} alt="" className="w-16 h-12 object-contain" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white/90 truncate">
              {rep.market_hash_name.replace(/^(StatTrak™ |Souvenir |★ )/, '').replace(/^[^|]+\| /, '').trim()}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {ws && <span className="text-xs text-white/40">{ws}</span>}
              <span className="text-xs font-bold" style={{ color: '#eab308' }}>{formatPrice(price)}</span>
            </div>
            <p className="text-[11px] text-white/30 mt-0.5">x{max} available</p>
          </div>
        </div>

        {/* Quantity display */}
        <div className="flex items-center justify-center gap-4 py-4">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-20"
            style={{ background: '#272b36' }}
          >
            <Minus size={16} className="text-white/70" />
          </button>

          <div className="text-center" style={{ minWidth: 80 }}>
            <span className="text-3xl font-bold text-white">{quantity}</span>
            <span className="text-sm text-white/30 ml-1">/ {max}</span>
          </div>

          <button
            onClick={() => setQuantity(Math.min(max, quantity + 1))}
            disabled={quantity >= max}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-20"
            style={{ background: '#272b36' }}
          >
            <Plus size={16} className="text-white/70" />
          </button>
        </div>

        {/* Slider */}
        {max > 2 && (
          <div className="px-6 pb-2">
            <input
              type="range"
              min={1}
              max={max}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value))}
              className="w-full accent-primary h-1.5 cursor-pointer"
            />
          </div>
        )}

        {/* Quick buttons */}
        {max > 2 && (
          <div className="flex gap-2 px-4 pb-3">
            {quickButtons.map((b) => (
              <button
                key={b.label}
                onClick={() => setQuantity(b.value)}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: quantity === b.value ? 'rgba(59,130,246,0.2)' : '#272b36',
                  color: quantity === b.value ? '#60a5fa' : '#94a3b8',
                  border: quantity === b.value ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}

        {/* Float preview of selected items */}
        {sorted[0]?.float_value != null && (
          <div className="px-4 pb-3">
            <p className="text-[10px] text-white/30 mb-1">Selected items (by float):</p>
            <div className="flex flex-wrap gap-1 max-h-[52px] overflow-y-auto scrollbar-hide">
              {sorted.slice(0, quantity).map((item) => {
                const fv = item.float_value != null ? Number(item.float_value) : null;
                return (
                  <span
                    key={item.asset_id}
                    className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                    style={{ background: '#272b36', color: 'rgba(255,255,255,0.5)' }}
                  >
                    {fv != null ? fv.toFixed(6) : '—'}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Total + Confirm */}
        <div className="p-4 pt-2" style={{ borderTop: '1px solid #272b36' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-white/40">Total value</span>
            <span className="text-sm font-bold" style={{ color: '#eab308' }}>{formatPrice(totalPrice)}</span>
          </div>
          <button
            onClick={handleConfirm}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: '#3b82f6', color: '#fff' }}
          >
            Select {quantity} item{quantity > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
