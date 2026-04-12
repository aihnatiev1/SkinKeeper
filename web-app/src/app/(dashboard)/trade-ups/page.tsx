'use client';

import { useState, useEffect, useMemo } from 'react';
import { Shuffle, Plus, Trash2, Zap, Info, RotateCcw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useFormatPrice } from '@/lib/utils';
import { useIsDesktop, useSteamStatus } from '@/lib/use-desktop';
import { getDesktopAPI } from '@/lib/desktop';
import { useRouter } from 'next/navigation';
import { InventoryPicker } from '@/components/inventory-picker';
import { toast } from 'sonner';

interface TradeUpSlot {
  index: number;
  item?: any;
}

const RARITY_ORDER = ['Consumer Grade','Industrial Grade','Mil-Spec Grade','Restricted','Classified','Covert'];
const RARITY_COLORS: Record<string, string> = {
  'Consumer Grade': '#B0C3D9', 'Industrial Grade': '#5E98D9', 'Mil-Spec Grade': '#4B69FF',
  'Restricted': '#8847FF', 'Classified': '#D32CE6', 'Covert': '#EB4B4B',
};
const WEAR_LABELS: Record<string, string> = { FN: 'Factory New', MW: 'Minimal Wear', FT: 'Field-Tested', WW: 'Well-Worn', BS: 'Battle-Scarred' };
const WEAR_COLORS: Record<string, string> = { FN: '#4ade80', MW: '#22d3ee', FT: '#a78bfa', WW: '#f97316', BS: '#ef4444' };

function floatToWear(f: number): string {
  if (f < 0.07) return 'FN';
  if (f < 0.15) return 'MW';
  if (f < 0.38) return 'FT';
  if (f < 0.45) return 'WW';
  return 'BS';
}

export default function TradeUpsPage() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const { status } = useSteamStatus();
  const formatPrice = useFormatPrice();
  const [slots, setSlots] = useState<TradeUpSlot[]>(
    Array.from({ length: 10 }, (_, i) => ({ index: i }))
  );
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (desktop === false) {
      router.replace('/portfolio');
    }
  }, [desktop, router]);

  const filledSlots = slots.filter((s) => s.item);
  const emptyCount = 10 - filledSlots.length;
  const canExecute = filledSlots.length === 10;

  // Determine locked rarity: once first item is added, all must match
  const lockedRarity = filledSlots.length > 0 ? filledSlots[0].item?.rarity : undefined;

  // Output predictions (shown when all 10 slots filled)
  const prediction = useMemo(() => {
    if (filledSlots.length !== 10) return null;
    const items = filledSlots.map(s => s.item);

    // Avg float
    const floats = items.map(i => i.paint_wear ?? i.float_value ?? 0.5);
    const avgFloat = floats.reduce((a, b) => a + b, 0) / 10;

    // Output wear (using standard float ranges: min=0, max=1)
    const outputFloat = avgFloat; // simplified: most skins min=0, max=1
    const outputWear = floatToWear(outputFloat);

    // Output rarity (next tier)
    const rarityIdx = RARITY_ORDER.indexOf(lockedRarity ?? '');
    const outputRarity = rarityIdx >= 0 && rarityIdx < RARITY_ORDER.length - 1
      ? RARITY_ORDER[rarityIdx + 1]
      : 'Covert';

    // Collection probabilities
    const colCounts: Record<string, number> = {};
    for (const item of items) {
      const col = item.collection || item.market_hash_name?.split(' | ')[0] || 'Unknown';
      colCounts[col] = (colCounts[col] ?? 0) + 1;
    }
    const collections = Object.entries(colCounts)
      .map(([name, count]) => ({ name, count, pct: Math.round(count * 10) }))
      .sort((a, b) => b.count - a.count);

    // Input cost
    const inputCost = items.reduce((s, i) => s + (i.prices?.steam ?? i.prices?.skinport ?? 0), 0);

    return { avgFloat, outputFloat, outputWear, outputRarity, collections, inputCost };
  }, [filledSlots, lockedRarity]);
  const excludeIds = useMemo(
    () => filledSlots.map((s) => s.item.id),
    [filledSlots]
  );

  const handlePickerSelect = (items: any[]) => {
    setSlots((prev) => {
      const next = [...prev];
      let added = 0;
      for (const item of items) {
        const emptySlot = next.find((s) => !s.item);
        if (emptySlot) {
          emptySlot.item = item;
          added++;
        }
      }
      return next;
    });
  };

  const handleExecute = async () => {
    if (!canExecute) return;
    const api = getDesktopAPI();
    if (!api) return;

    setExecuting(true);
    setResult(null);

    const itemIds = filledSlots.map((s) => s.item.id);
    const res = await api.steam.executeTradeUp(itemIds);

    setResult(res);
    setExecuting(false);

    if (res.success) {
      toast.success('Trade Up successful!');
      setSlots(Array.from({ length: 10 }, (_, i) => ({ index: i })));
    } else {
      toast.error('Trade Up failed');
    }
  };

  const removeSlot = (index: number) => {
    setSlots((prev) =>
      prev.map((s) => (s.index === index ? { index } : s))
    );
  };

  const resetAll = () => {
    setSlots(Array.from({ length: 10 }, (_, i) => ({ index: i })));
    setResult(null);
  };

  if (!desktop) return null;

  if (!status.loggedIn) {
    return (
      <div className="p-6">
        <div className="glass rounded-2xl p-12 text-center">
          <Shuffle size={48} className="mx-auto mb-4 text-muted" />
          <h2 className="text-xl font-bold mb-2">Steam Connection Required</h2>
          <p className="text-muted">Connect to Steam in Settings to use Trade Ups.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trade Up Contract</h1>
          <p className="text-muted text-sm mt-1">
            Select 10 items of the same quality to trade up. No game launch required.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filledSlots.length > 0 && (
            <button
              onClick={resetAll}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground glass rounded-xl transition-colors"
            >
              <RotateCcw size={16} />
              Reset
            </button>
          )}
          <button
            onClick={handleExecute}
            disabled={!canExecute || executing}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            <Zap size={18} />
            {executing ? 'Executing...' : 'Execute Trade Up'}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
        <Info size={18} className="text-primary mt-0.5 shrink-0" />
        <div className="text-sm text-muted">
          <p>Select 10 items of the <strong>same quality</strong> (e.g., all Mil-Spec or all Restricted). The result will be one item of the next quality tier from the same collection(s).</p>
          {lockedRarity && (
            <p className="mt-1 text-primary font-medium">Locked rarity: {lockedRarity}</p>
          )}
        </div>
      </div>

      {/* Trade-up slots */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-muted">
            Input Items ({filledSlots.length}/10)
          </h3>
          {emptyCount > 0 && (
            <button
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
            >
              <Plus size={14} />
              Add Items ({emptyCount} remaining)
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {slots.map((slot) => (
            <div
              key={slot.index}
              onClick={() => !slot.item && setPickerOpen(true)}
              className="relative aspect-square rounded-xl border-2 border-dashed border-border/50 flex items-center justify-center bg-surface-light/50 hover:border-primary/30 transition-colors cursor-pointer group"
            >
              {slot.item ? (
                <>
                  <img
                    src={`https://community.akamai.steamstatic.com/economy/image/${slot.item.icon_url}/128x128`}
                    alt={slot.item.name}
                    className="w-full h-full object-contain p-2"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSlot(slot.index);
                    }}
                    className="absolute top-1 right-1 p-1 rounded-lg bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={14} />
                  </button>
                  <p className="absolute bottom-1 left-1 right-1 text-[10px] font-medium truncate text-center">
                    {slot.item.name}
                  </p>
                </>
              ) : (
                <Plus size={24} className="text-muted/30" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Output Prediction Panel */}
      {prediction && !result && (
        <div className="glass rounded-2xl p-6 border border-primary/20 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" />
            <h3 className="text-sm font-semibold">Predicted Outcome</h3>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* Output rarity */}
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-xs text-muted mb-1.5">Output Rarity</p>
              <span
                className="text-sm font-bold px-2 py-1 rounded-lg"
                style={{
                  color: RARITY_COLORS[prediction.outputRarity] ?? '#8847FF',
                  background: `${RARITY_COLORS[prediction.outputRarity] ?? '#8847FF'}18`,
                }}
              >
                {prediction.outputRarity}
              </span>
            </div>

            {/* Output wear */}
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-xs text-muted mb-1.5">Expected Wear</p>
              <span
                className="text-sm font-bold px-2 py-1 rounded-lg"
                style={{
                  color: WEAR_COLORS[prediction.outputWear],
                  background: `${WEAR_COLORS[prediction.outputWear]}18`,
                }}
              >
                {WEAR_LABELS[prediction.outputWear]}
              </span>
            </div>

            {/* Avg float */}
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-xs text-muted mb-1.5">Avg Float</p>
              <span className="text-sm font-mono font-bold">
                {prediction.avgFloat.toFixed(4)}
              </span>
            </div>
          </div>

          {/* Collection breakdown */}
          {prediction.collections.length > 1 && (
            <div>
              <p className="text-xs text-muted mb-2">Output chances by collection</p>
              <div className="space-y-1.5">
                {prediction.collections.map(col => (
                  <div key={col.name} className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-surface-light rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${col.pct * 10}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted truncate max-w-[160px]">{col.name}</span>
                    <span className="text-xs font-bold w-10 text-right">{col.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cost */}
          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <div>
              <p className="text-xs text-muted">Input Cost</p>
              <p className="text-lg font-bold text-loss">
                {prediction.inputCost > 0 ? formatPrice(prediction.inputCost) : '—'}
              </p>
            </div>
            <div className="flex items-center gap-2 text-muted">
              <Minus size={14} />
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">1× {prediction.outputRarity}</p>
              <p className="text-xs text-muted">{WEAR_LABELS[prediction.outputWear]}</p>
            </div>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="glass rounded-2xl p-6 text-center">
          {result.success ? (
            <>
              <h3 className="text-lg font-bold text-green-400 mb-4">Trade Up Successful!</h3>
              {result.result && (
                <div className="inline-block p-4 rounded-xl bg-surface-light">
                  <img
                    src={`https://community.akamai.steamstatic.com/economy/image/${result.result.icon_url}/256x256`}
                    alt={result.result.name}
                    className="w-32 h-32 object-contain mx-auto"
                  />
                  <p className="mt-3 font-medium">{result.result.name}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-red-400">Trade up failed. Please try again.</p>
          )}
        </div>
      )}

      {/* Inventory Picker */}
      <InventoryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
        maxItems={emptyCount}
        excludeIds={excludeIds}
        filterRarity={lockedRarity}
        title="Select Trade Up Items"
      />
    </div>
  );
}
