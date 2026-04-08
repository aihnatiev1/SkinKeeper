'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Copy, Check, TrendingUp, Eye, DollarSign } from 'lucide-react';
import type { InventoryItem } from '@/lib/types';
import { useFormatPrice, getItemIconUrl, getWearShort } from '@/lib/utils';
import { RARITY_COLORS } from '@/lib/constants';
import { usePriceHistory, useItemPrices, useAddToWatchlist, useWatchlist, useRemoveFromWatchlist } from '@/lib/hooks';
import { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { toast } from 'sonner';

interface ItemDetailModalProps {
  item: InventoryItem | null;
  onClose: () => void;
  onSell?: (item: InventoryItem) => void;
}

const PRICE_SOURCES: { key: string; label: string; color: string }[] = [
  { key: 'steam', label: 'Steam', color: 'text-foreground' },
  { key: 'buff', label: 'Buff', color: 'text-orange-400' },
  { key: 'csfloat', label: 'CSFloat', color: 'text-blue-400' },
  { key: 'skinport', label: 'Skinport', color: 'text-pink-400' },
  { key: 'dmarket', label: 'DMarket', color: 'text-green-400' },
  { key: 'bitskins', label: 'BitSkins', color: 'text-yellow-400' },
];

export function ItemDetailModal({ item, onClose, onSell }: ItemDetailModalProps) {
  const formatPrice = useFormatPrice();
  const [copied, setCopied] = useState(false);
  const [historyDays, setHistoryDays] = useState(30);
  const { data: historyData } = usePriceHistory(item?.market_hash_name ?? null, historyDays);
  const { data: pricesData } = useItemPrices(item?.market_hash_name ?? null);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const { data: watchlist } = useWatchlist();
  const watchlistEntry = useMemo(
    () => watchlist?.find((w) => w.market_hash_name === item?.market_hash_name),
    [watchlist, item?.market_hash_name]
  );

  useEffect(() => {
    if (!item) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [item, onClose]);

  const copyName = () => {
    if (!item) return;
    navigator.clipboard.writeText(item.market_hash_name);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleWatchlist = () => {
    if (!item) return;
    if (watchlistEntry) {
      removeFromWatchlist.mutate(watchlistEntry.id, {
        onSuccess: () => toast.success('Removed from watchlist'),
        onError: () => toast.error('Failed to remove'),
      });
    } else {
      const steamPrice = prices.steam || prices.skinport || 0;
      addToWatchlist.mutate(
        {
          marketHashName: item.market_hash_name,
          targetPrice: steamPrice * 0.9,
          iconUrl: item.icon_url,
        },
        {
          onSuccess: () => toast.success('Added to watchlist'),
          onError: () => toast.error('Failed to add'),
        }
      );
    }
  };

  // Merge prices from item props and fresh API data
  const prices = useMemo(() => {
    const base = item?.prices ?? {};
    const fresh = pricesData?.current_prices ?? {};
    return { ...base, ...fresh };
  }, [item?.prices, pricesData]);

  const chartData = useMemo(() => {
    if (!historyData?.history) return [];
    return historyData.history.map((p) => ({
      date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: p.price,
    }));
  }, [historyData]);

  if (!item) return null;

  const bestPrice = Math.max(...Object.values(prices).filter((v) => typeof v === 'number' && v > 0), 0);
  const rarityColor = (item.rarity && RARITY_COLORS[item.rarity]) || (item.rarity_color ? `#${item.rarity_color}` : '#64748B');
  const encodedName = encodeURIComponent(item.market_hash_name);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-2xl glass-strong rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-1.5 rounded-lg glass text-muted hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>

          {/* Item image */}
          <div
            className="relative flex items-center justify-center h-48 p-6"
            style={{
              background: `linear-gradient(135deg, ${rarityColor}10, ${rarityColor}25, transparent)`,
            }}
          >
            <img
              src={getItemIconUrl(item.icon_url)}
              alt={item.market_hash_name}
              className="max-h-full max-w-full object-contain drop-shadow-2xl"
            />
            <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: rarityColor }} />
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Name & wear */}
            <div>
              <div className="flex items-start gap-2">
                <h2 className="text-lg font-bold flex-1">{item.market_hash_name}</h2>
                <button onClick={copyName} className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors shrink-0" title="Copy name">
                  {copied ? <Check size={14} className="text-profit" /> : <Copy size={14} />}
                </button>
                <button
                  onClick={handleWatchlist}
                  className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                    watchlistEntry
                      ? 'text-primary bg-primary/10 hover:bg-primary/20'
                      : 'text-muted hover:text-primary hover:bg-primary/10'
                  }`}
                  title={watchlistEntry ? 'Remove from watchlist' : 'Add to watchlist'}
                >
                  <Eye size={14} />
                </button>
                {onSell && item.tradable && (
                  <button
                    onClick={() => onSell(item)}
                    className="p-1.5 rounded-lg text-muted hover:text-profit hover:bg-profit/10 transition-colors shrink-0"
                    title="Sell on Steam Market"
                  >
                    <DollarSign size={14} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {item.wear && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface-light text-muted font-medium">
                    {getWearShort(item.wear)} — {item.wear}
                  </span>
                )}
                {item.rarity && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${rarityColor}15`, color: rarityColor }}>
                    {item.rarity}
                  </span>
                )}
              </div>
            </div>

            {/* Float value */}
            {item.float_value && (
              <div>
                <p className="text-xs text-muted mb-1.5">Float Value</p>
                <div className="relative h-2 bg-surface-light rounded-full overflow-hidden">
                  <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-profit via-warning to-loss rounded-full" style={{ width: '100%' }} />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-primary shadow-lg"
                    style={{ left: `${item.float_value * 100}%`, transform: 'translate(-50%, -50%)' }}
                  />
                </div>
                <p className="text-xs font-mono text-foreground mt-1">{item.float_value.toFixed(14)}</p>
              </div>
            )}

            {/* All price sources */}
            <div>
              <p className="text-xs text-muted mb-2">Prices</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {PRICE_SOURCES.map((source) => {
                  const price = prices[source.key] || 0;
                  return (
                    <div key={source.key} className="glass rounded-xl p-2.5 text-center">
                      <p className="text-[10px] text-muted mb-0.5">{source.label}</p>
                      <p className={`text-xs font-bold ${price === bestPrice && price > 0 ? 'text-profit' : source.color}`}>
                        {price > 0 ? formatPrice(price) : '—'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Price analysis */}
            {(() => {
              const steam = prices.steam || 0;
              const buff = prices.buff || 0;
              const cheapest = Object.entries(prices)
                .filter(([, v]) => v > 0)
                .sort((a, b) => a[1] - b[1])[0];
              const buffSteamRatio = buff > 0 && steam > 0 ? Math.round((buff / steam) * 100) : null;
              const arbitrage = cheapest && steam > 0
                ? { source: cheapest[0], profit: steam * 0.85 - cheapest[1], pct: ((steam * 0.85 / cheapest[1] - 1) * 100) }
                : null;

              if (!buffSteamRatio && !arbitrage) return null;
              return (
                <div className="flex flex-wrap gap-3 text-xs">
                  {buffSteamRatio !== null && (
                    <div className="glass rounded-lg px-3 py-2">
                      <span className="text-muted">Buff/Steam: </span>
                      <span className={`font-bold ${buffSteamRatio < 85 ? 'text-profit' : buffSteamRatio > 95 ? 'text-loss' : 'text-foreground'}`}>
                        {buffSteamRatio}%
                      </span>
                    </div>
                  )}
                  {arbitrage && arbitrage.profit > 0 && arbitrage.pct > 2 && (
                    <div className="glass rounded-lg px-3 py-2">
                      <span className="text-muted">Buy on {arbitrage.source}: </span>
                      <span className="font-bold text-profit">
                        +{formatPrice(arbitrage.profit)} (+{arbitrage.pct.toFixed(1)}%)
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Price History Chart */}
            {chartData.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted flex items-center gap-1">
                    <TrendingUp size={12} /> Price History
                    {historyData?.partial && <span className="text-warning">(partial)</span>}
                  </p>
                  <div className="flex gap-1">
                    {[7, 30, 90].map((d) => (
                      <button
                        key={d}
                        onClick={() => setHistoryDays(d)}
                        className={`px-2 py-0.5 text-[10px] rounded-md transition-colors ${
                          historyDays === d ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground'
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted))" tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted))" tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} width={45} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(value) => [formatPrice(Number(value)), 'Price']}
                      />
                      <Area type="monotone" dataKey="price" stroke="hsl(var(--primary))" fill="url(#priceGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {item.paint_seed && (
                <div>
                  <p className="text-xs text-muted">Pattern</p>
                  <p className="font-medium">{item.paint_seed}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted">Tradable</p>
                <p className={`font-medium ${item.tradable ? 'text-profit' : 'text-loss'}`}>
                  {item.tradable ? 'Yes' : item.trade_ban_until ? `Until ${new Date(item.trade_ban_until).toLocaleDateString()}` : 'No'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Account</p>
                <p className="font-medium truncate">{item.account_name}</p>
              </div>
              {item.paint_index != null && (
                <div>
                  <p className="text-xs text-muted">Paint Index</p>
                  <p className="font-medium">{item.paint_index}</p>
                </div>
              )}
            </div>

            {/* Stickers */}
            {(() => {
              const stickers = item.stickers as Array<{ name?: string; icon_url?: string }> | null;
              if (!stickers || !Array.isArray(stickers) || stickers.length === 0) return null;
              return (
                <div>
                  <p className="text-xs text-muted mb-2">Stickers</p>
                  <div className="flex gap-2">
                    {stickers.map((sticker, i) => (
                      <div key={i} className="glass rounded-lg p-2 text-center" title={sticker.name || ''}>
                        {sticker.icon_url && (
                          <img src={sticker.icon_url} alt={sticker.name || ''} className="w-12 h-9 object-contain mx-auto" />
                        )}
                        <p className="text-[9px] text-muted truncate max-w-[60px] mt-1">{sticker.name || ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Sell button */}
            {onSell && item.tradable && (
              <button
                onClick={() => onSell(item)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25"
              >
                <DollarSign size={16} />
                Sell on Steam Market
              </button>
            )}

            {/* External links */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
              <a
                href={`https://steamcommunity.com/market/listings/730/${encodedName}`}
                target="_blank" rel="noopener"
                className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors"
              >
                Steam Market <ExternalLink size={10} />
              </a>
              <a
                href={`https://skinport.com/market?search=${encodedName}`}
                target="_blank" rel="noopener"
                className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors"
              >
                Skinport <ExternalLink size={10} />
              </a>
              <a
                href={`https://csfloat.com/search?market_hash_name=${encodedName}`}
                target="_blank" rel="noopener"
                className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors"
              >
                CSFloat <ExternalLink size={10} />
              </a>
              <a
                href={`https://buff.163.com/market/csgo#tab=selling&page_num=1&search=${encodedName}`}
                target="_blank" rel="noopener"
                className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors"
              >
                Buff <ExternalLink size={10} />
              </a>
              {item.inspect_link && (
                <a
                  href={item.inspect_link}
                  className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors"
                >
                  Inspect <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
