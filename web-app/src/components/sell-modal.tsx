'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Loader2, DollarSign, AlertTriangle, Zap, Edit3,
  ArrowRight, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import type { InventoryItem } from '@/lib/types';
import {
  useRefreshPrices, useWalletInfo, useSellVolume,
  useCreateSellOperation,
} from '@/lib/hooks';
import { formatPrice, getItemIconUrl } from '@/lib/utils';

interface SellModalProps {
  items: InventoryItem[];
  onClose: () => void;
  onOperationStarted: (operationId: string) => void;
}

// Fee calculation (matches backend logic)
function calculateFees(sellerReceivesCents: number) {
  // Reverse: find buyerPays from sellerReceives
  let buyerPays = Math.ceil(sellerReceivesCents / 0.8696);
  // Verify and adjust
  for (let i = 0; i < 10; i++) {
    const steamFee = Math.max(1, Math.floor(buyerPays * 0.05));
    const cs2Fee = Math.max(1, Math.floor(buyerPays * 0.10));
    const actual = buyerPays - steamFee - cs2Fee;
    if (actual >= sellerReceivesCents) {
      return { buyerPays, steamFee, cs2Fee, sellerReceives: actual };
    }
    buyerPays++;
  }
  const steamFee = Math.max(1, Math.floor(buyerPays * 0.05));
  const cs2Fee = Math.max(1, Math.floor(buyerPays * 0.10));
  return { buyerPays, steamFee, cs2Fee, sellerReceives: buyerPays - steamFee - cs2Fee };
}

function formatCents(cents: number, symbol: string) {
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export function SellModal({ items, onClose, onOperationStarted }: SellModalProps) {
  const { data: wallet } = useWalletInfo();
  const { data: volume } = useSellVolume();
  const refreshPrices = useRefreshPrices();
  const createSell = useCreateSellOperation();

  // Per-item prices: map assetId -> sellerReceivesCents
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [customPriceMode, setCustomPriceMode] = useState(false);
  const [customPriceInput, setCustomPriceInput] = useState('');
  // For single item: track which item is being custom-priced
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [priceError, setPriceError] = useState<string | null>(null);

  const currencySymbol = wallet?.symbol || '$';
  const isSingle = items.length === 1;
  const singleItem = isSingle ? items[0] : null;

  // Fetch fresh prices on mount
  useEffect(() => {
    const uniqueNames = [...new Set(items.map(i => i.market_hash_name))];
    setLoadingPrices(true);
    setPriceError(null);

    refreshPrices.mutate(
      { names: uniqueNames },
      {
        onSuccess: (data) => {
          const newPrices: Record<string, number> = {};
          for (const item of items) {
            const p = data.prices[item.market_hash_name];
            if (p) {
              newPrices[item.asset_id] = p.sellerReceivesCents;
            }
          }
          setPrices(newPrices);
          setLoadingPrices(false);

          // Pre-fill custom price input for single item
          if (isSingle && items[0]) {
            const p = data.prices[items[0].market_hash_name];
            if (p) {
              setCustomPriceInput((p.sellerReceivesCents / 100).toFixed(2));
            }
          }
        },
        onError: () => {
          setPriceError('Failed to fetch prices from Steam');
          setLoadingPrices(false);
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tradable items only
  const sellableItems = useMemo(
    () => items.filter(i => i.tradable),
    [items]
  );

  const untradableCount = items.length - sellableItems.length;

  // Items with prices
  const itemsWithPrices = useMemo(
    () => sellableItems.filter(i => prices[i.asset_id] && prices[i.asset_id] > 0),
    [sellableItems, prices]
  );

  const itemsWithoutPrices = useMemo(
    () => sellableItems.filter(i => !prices[i.asset_id] || prices[i.asset_id] <= 0),
    [sellableItems, prices]
  );

  // Total fees
  const totals = useMemo(() => {
    let totalSellerReceives = 0;
    let totalBuyerPays = 0;
    let totalSteamFee = 0;
    let totalCs2Fee = 0;

    for (const item of itemsWithPrices) {
      const sellerCents = customPriceMode && isSingle
        ? Math.round(parseFloat(customPriceInput || '0') * 100)
        : prices[item.asset_id];
      if (!sellerCents || sellerCents <= 0) continue;
      const fees = calculateFees(sellerCents);
      totalSellerReceives += fees.sellerReceives;
      totalBuyerPays += fees.buyerPays;
      totalSteamFee += fees.steamFee;
      totalCs2Fee += fees.cs2Fee;
    }

    return { totalSellerReceives, totalBuyerPays, totalSteamFee, totalCs2Fee };
  }, [itemsWithPrices, prices, customPriceMode, customPriceInput, isSingle]);

  // Custom price fees for single item
  const customFees = useMemo(() => {
    if (!customPriceMode || !isSingle) return null;
    const cents = Math.round(parseFloat(customPriceInput || '0') * 100);
    if (cents <= 0) return null;
    return calculateFees(cents);
  }, [customPriceMode, customPriceInput, isSingle]);

  const handleSell = useCallback(() => {
    const sellItems = itemsWithPrices.map(item => {
      const priceCents = customPriceMode && isSingle
        ? Math.round(parseFloat(customPriceInput || '0') * 100)
        : prices[item.asset_id];
      return {
        assetId: item.asset_id,
        marketHashName: item.market_hash_name,
        priceCents: priceCents || 0,
      };
    }).filter(i => i.priceCents > 0);

    if (sellItems.length === 0) {
      toast.error('No items with valid prices');
      return;
    }

    createSell.mutate(sellItems, {
      onSuccess: (data) => {
        onOperationStarted(data.operationId);
      },
      onError: (err: any) => {
        toast.error(err?.message || 'Failed to create sell operation');
      },
    });
  }, [itemsWithPrices, prices, customPriceMode, customPriceInput, isSingle, createSell, onOperationStarted]);

  const volumeWarning = volume && volume.remaining < 50;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full sm:max-w-lg glass-strong sm:rounded-2xl rounded-t-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <DollarSign size={18} className="text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold">
                  Sell {items.length === 1 ? 'Item' : `${items.length} Items`}
                </h2>
                <p className="text-xs text-muted">Steam Market</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Items preview */}
          <div className="p-4 space-y-3">
            {/* Single item preview */}
            {singleItem && (
              <div className="flex items-center gap-3 glass rounded-xl p-3">
                <img
                  src={getItemIconUrl(singleItem.icon_url)}
                  alt={singleItem.market_hash_name}
                  className="w-16 h-12 object-contain"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{singleItem.market_hash_name}</p>
                  <p className="text-xs text-muted">{singleItem.wear || 'No wear'}</p>
                </div>
              </div>
            )}

            {/* Multi item summary */}
            {!isSingle && (
              <div className="glass rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex -space-x-2">
                    {items.slice(0, 4).map((item, i) => (
                      <img
                        key={item.asset_id}
                        src={getItemIconUrl(item.icon_url)}
                        alt=""
                        className="w-10 h-8 object-contain rounded border border-border/30 bg-surface"
                        style={{ zIndex: 4 - i }}
                      />
                    ))}
                    {items.length > 4 && (
                      <div className="w-10 h-8 rounded border border-border/30 bg-surface flex items-center justify-center text-xs text-muted font-medium">
                        +{items.length - 4}
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-muted">{items.length} items selected</p>
                </div>
              </div>
            )}

            {/* Warnings */}
            {untradableCount > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20">
                <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-warning">
                  {untradableCount} item{untradableCount > 1 ? 's' : ''} not tradable and will be skipped.
                </p>
              </div>
            )}

            {volumeWarning && volume && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20">
                <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-warning">
                  Daily limit: {volume.today}/{volume.limit} listings used. {volume.remaining} remaining.
                </p>
              </div>
            )}

            {itemsWithoutPrices.length > 0 && !loadingPrices && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20">
                <Info size={14} className="text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-warning">
                  {itemsWithoutPrices.length} item{itemsWithoutPrices.length > 1 ? 's' : ''} without price will be skipped.
                </p>
              </div>
            )}

            {priceError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-loss/10 border border-loss/20">
                <AlertTriangle size={14} className="text-loss shrink-0 mt-0.5" />
                <p className="text-xs text-loss">{priceError}</p>
              </div>
            )}

            {/* Loading prices */}
            {loadingPrices && (
              <div className="flex items-center justify-center gap-2 py-6">
                <Loader2 size={18} className="animate-spin text-primary" />
                <p className="text-sm text-muted">Fetching live prices...</p>
              </div>
            )}

            {/* Pricing section */}
            {!loadingPrices && itemsWithPrices.length > 0 && (
              <>
                {/* Quick Sell / Custom toggle */}
                {isSingle && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCustomPriceMode(false)}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        !customPriceMode
                          ? 'bg-primary/15 text-primary border border-primary/30'
                          : 'glass text-muted hover:text-foreground'
                      }`}
                    >
                      <Zap size={14} />
                      Quick Sell
                    </button>
                    <button
                      onClick={() => setCustomPriceMode(true)}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        customPriceMode
                          ? 'bg-primary/15 text-primary border border-primary/30'
                          : 'glass text-muted hover:text-foreground'
                      }`}
                    >
                      <Edit3 size={14} />
                      Custom Price
                    </button>
                  </div>
                )}

                {/* Custom price input */}
                {customPriceMode && isSingle && (
                  <div className="space-y-2">
                    <label className="text-xs text-muted">You receive ({currencySymbol})</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">{currencySymbol}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={customPriceInput}
                        onChange={(e) => setCustomPriceInput(e.target.value)}
                        className="w-full pl-8 pr-4 py-2.5 glass rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>
                  </div>
                )}

                {/* Fee breakdown */}
                <div className="glass rounded-xl p-3 space-y-2">
                  <p className="text-xs text-muted font-medium mb-2">Fee Breakdown</p>

                  {(() => {
                    const fees = customPriceMode && isSingle && customFees
                      ? customFees
                      : {
                          buyerPays: totals.totalBuyerPays,
                          steamFee: totals.totalSteamFee,
                          cs2Fee: totals.totalCs2Fee,
                          sellerReceives: totals.totalSellerReceives,
                        };
                    return (
                      <>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted">Buyer pays</span>
                          <span className="font-medium">{formatCents(fees.buyerPays, currencySymbol)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted">Steam fee (5%)</span>
                          <span className="text-loss font-medium">-{formatCents(fees.steamFee, currencySymbol)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted">CS2 fee (10%)</span>
                          <span className="text-loss font-medium">-{formatCents(fees.cs2Fee, currencySymbol)}</span>
                        </div>
                        <div className="h-px bg-border/30 my-1" />
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold">You receive</span>
                          <span className="font-bold text-profit">{formatCents(fees.sellerReceives, currencySymbol)}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </>
            )}

            {/* Sell button */}
            <button
              onClick={handleSell}
              disabled={loadingPrices || createSell.isPending || itemsWithPrices.length === 0}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createSell.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  {customPriceMode ? 'List on Market' : 'Quick Sell'}
                  <ArrowRight size={16} />
                  {!loadingPrices && itemsWithPrices.length > 0 && (
                    <span className="opacity-75">
                      ({itemsWithPrices.length} item{itemsWithPrices.length > 1 ? 's' : ''})
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
