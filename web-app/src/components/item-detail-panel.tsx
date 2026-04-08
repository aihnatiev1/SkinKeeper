'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Copy, Check, Eye, ShoppingCart, Zap, Link2 } from 'lucide-react';
import type { InventoryItem } from '@/lib/types';
import { useFormatPrice, getItemIconUrl, getWearShort, getDopplerPhase, isDoppler, isFade, isMarbleFade, calculateFadePercent, analyzeMarbleFade } from '@/lib/utils';
import { RARITY_COLORS } from '@/lib/constants';
import { usePriceHistory, useItemPrices, useAddToWatchlist, useWatchlist, useRemoveFromWatchlist } from '@/lib/hooks';
import { useState, useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { toast } from 'sonner';

const SOURCES = [
  { key: 'steam', label: 'Steam', color: '#66c0f4' },
  { key: 'buff', label: 'Buff163', color: '#f59e0b' },
  { key: 'skinport', label: 'Skinport', color: '#ec4899' },
  { key: 'csfloat', label: 'CSFloat', color: '#3b82f6' },
  { key: 'dmarket', label: 'DMarket', color: '#22c55e' },
  { key: 'bitskins', label: 'BitSkins', color: '#eab308' },
];

interface Props {
  item: InventoryItem | null;
  onClose: () => void;
  onSell?: (item: InventoryItem) => void;
}

export function ItemDetailPanel({ item, onClose, onSell }: Props) {
  const formatPrice = useFormatPrice();
  const [copied, setCopied] = useState(false);
  const [histDays, setHistDays] = useState(30);
  const { data: histData } = usePriceHistory(item?.market_hash_name ?? null, histDays);
  const { data: pricesData } = useItemPrices(item?.market_hash_name ?? null);
  const addWatch = useAddToWatchlist();
  const removeWatch = useRemoveFromWatchlist();
  const { data: watchlist } = useWatchlist();
  const watchlistEntry = useMemo(
    () => watchlist?.find((w) => w.market_hash_name === item?.market_hash_name),
    [watchlist, item?.market_hash_name]
  );

  const prices = useMemo(() => ({ ...(item?.prices ?? {}), ...(pricesData?.current_prices ?? {}) }), [item?.prices, pricesData]);
  const steamPrice = prices.steam || 0;
  const bestSource = useMemo(() => {
    const entries = Object.entries(prices).filter(([, v]) => v > 0).sort((a, b) => a[1] - b[1]);
    return entries[0] || null;
  }, [prices]);

  const chart = useMemo(() => {
    if (!histData?.history) return [];
    return histData.history.map((p) => ({ date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), price: p.price }));
  }, [histData]);

  if (!item) return null;

  const ws = getWearShort(item.wear);
  const rc = (item.rarity && RARITY_COLORS[item.rarity]) || (item.rarity_color ? `#${item.rarity_color}` : '#64748B');
  const fv = item.float_value != null ? Number(item.float_value) : null;
  const pi = item.paint_index != null ? Number(item.paint_index) : null;
  const ps = item.paint_seed != null ? Number(item.paint_seed) : null;
  const dp = pi && isDoppler(item.market_hash_name) ? getDopplerPhase(pi) : null;
  const fi = ps != null && isFade(item.market_hash_name) ? calculateFadePercent(ps) : null;
  const mf = ps != null && isMarbleFade(item.market_hash_name) ? analyzeMarbleFade(ps) : null;
  const stickers = Array.isArray(item.stickers) ? item.stickers : [];
  const encodedName = encodeURIComponent(item.market_hash_name);

  const copyInspect = () => {
    if (!item.inspect_link) return;
    navigator.clipboard.writeText(item.inspect_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-0 bottom-0 w-full sm:max-w-lg overflow-y-auto"
          style={{ background: '#14161e' }}
        >
          {/* Close */}
          <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 rounded-lg hover:bg-white/5 transition-colors">
            <X size={20} className="text-white/60" />
          </button>

          {/* Image */}
          <div className="relative flex items-center justify-center h-[200px] sm:h-[280px]" style={{ background: `radial-gradient(ellipse at center, ${rc}15, transparent 70%)` }}>
            <img src={getItemIconUrl(item.icon_url)} alt={item.market_hash_name} className="max-h-[140px] sm:max-h-[200px] max-w-[80%] object-contain drop-shadow-2xl" />
            {/* Rarity bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: rc }} />
          </div>

          {/* Stickers under image */}
          {stickers.length > 0 && (
            <div className="flex gap-3 px-5 py-3 border-b border-white/5">
              {stickers.map((s, i) => (
                <div key={i} className="text-center">
                  {s.icon_url && <img src={s.icon_url} alt={s.name || ''} className="w-10 h-8 object-contain mx-auto" />}
                  <p className="text-[8px] text-white/40 mt-0.5 truncate max-w-[60px]">{s.name || ''}</p>
                </div>
              ))}
            </div>
          )}

          {/* Info */}
          <div className="px-5 py-4 space-y-4">
            {/* Name + rarity */}
            <div>
              <h2 className="text-lg font-bold text-white">{item.market_hash_name}</h2>
              <p className="text-xs mt-0.5" style={{ color: rc }}>{item.rarity || 'Unknown'}</p>
            </div>

            {/* Wear + Float bar */}
            {fv != null && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">Exterior: <span className="text-white/80 font-medium">{item.wear || '—'}</span></span>
                  <span className="font-mono text-white/60">{fv.toFixed(7)}</span>
                </div>
                <div className="relative h-[6px] rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, #4ade80 0%, #86efac 7%, #facc15 15%, #f97316 38%, #ef4444 60%, #991b1b 100%)' }}>
                  <div className="absolute top-[-2px] w-[4px] h-[10px] bg-white rounded-sm shadow-lg" style={{ left: `${fv * 100}%`, transform: 'translateX(-50%)' }} />
                </div>
                <div className="flex justify-between text-[9px] text-white/25">
                  <span>0.00</span><span>0.07</span><span>0.15</span><span>0.38</span><span>0.45</span><span>1.00</span>
                </div>
              </div>
            )}

            {/* Special properties */}
            <div className="flex flex-wrap gap-2">
              {dp && <span className="text-[10px] px-2 py-0.5 rounded font-bold text-white" style={{ background: dp.color }}>{dp.phase}</span>}
              {fi && <span className="text-[10px] px-2 py-0.5 rounded font-bold text-black" style={{ background: 'linear-gradient(135deg,#ff6b35,#f7c948,#6dd5ed)' }}>Fade {fi.percentage}%</span>}
              {mf && <span className="text-[10px] px-2 py-0.5 rounded font-bold text-white" style={{ background: mf.color }}>{mf.pattern}</span>}
              {ps != null && <span className="text-[10px] text-white/30">Seed: {ps}</span>}
              {pi != null && <span className="text-[10px] text-white/30">Index: {pi}</span>}
            </div>

            {/* Prices table */}
            <div>
              <h3 className="text-xs font-bold text-white/60 mb-2">PRICES</h3>
              <div className="space-y-1">
                {SOURCES.map((src) => {
                  const p = prices[src.key] || 0;
                  const diff = steamPrice > 0 && p > 0 ? ((p - steamPrice) / steamPrice) * 100 : null;
                  const isBest = bestSource && bestSource[0] === src.key && p > 0;
                  return (
                    <div
                      key={src.key}
                      className="flex items-center gap-2 py-1.5 px-2 rounded"
                      style={{ background: isBest ? 'rgba(74,222,128,0.08)' : 'transparent', border: isBest ? '1px solid rgba(74,222,128,0.2)' : '1px solid transparent' }}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: src.color }} />
                      <span className="text-xs text-white/60 flex-1">{src.label}</span>
                      <span className={`text-xs font-bold ${p > 0 ? 'text-white' : 'text-white/20'}`}>
                        {p > 0 ? formatPrice(p) : '—'}
                      </span>
                      {diff !== null && src.key !== 'steam' && (
                        <span className={`text-[10px] font-medium w-12 text-right ${diff < 0 ? 'text-green-400' : diff > 0 ? 'text-red-400' : 'text-white/30'}`}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Price history chart */}
            {chart.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-white/60">PRICE HISTORY</h3>
                  <div className="flex gap-1">
                    {[7, 30, 90].map((d) => (
                      <button key={d} onClick={() => setHistDays(d)} className={`px-2 py-0.5 text-[10px] rounded ${histDays === d ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/50'}`}>{d}d</button>
                    ))}
                  </div>
                </div>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chart}>
                      <defs>
                        <linearGradient id="dpg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={rc} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={rc} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} width={40} />
                      <Tooltip contentStyle={{ background: '#1e2028', border: '1px solid #2a2d38', borderRadius: 8, fontSize: 11 }} formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Price']} />
                      <Area type="monotone" dataKey="price" stroke={rc} fill="url(#dpg)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              {onSell && (
                <button
                  onClick={() => onSell(item)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  <ShoppingCart size={14} /> Sell on Market
                </button>
              )}
              {onSell && (
                <button
                  onClick={() => onSell(item)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  <Zap size={14} /> Quick Sell
                </button>
              )}
              <div className="flex gap-2">
                {item.inspect_link && (
                  <button onClick={copyInspect} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors border border-white/10">
                    {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Inspect Link'}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (watchlistEntry) {
                      removeWatch.mutate(watchlistEntry.id);
                      toast.success('Removed from watchlist');
                    } else {
                      addWatch.mutate({ marketHashName: item.market_hash_name, targetPrice: steamPrice * 0.9, iconUrl: item.icon_url });
                      toast.success('Added to watchlist');
                    }
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors border ${
                    watchlistEntry
                      ? 'text-primary border-primary/30 bg-primary/10 hover:bg-primary/20'
                      : 'text-white/60 hover:text-white hover:bg-white/5 border-white/10'
                  }`}
                >
                  <Eye size={12} /> {watchlistEntry ? 'Watching' : 'Watchlist'}
                </button>
              </div>

              {/* External links */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { label: 'Steam', url: `https://steamcommunity.com/market/listings/730/${encodedName}` },
                  { label: 'Skinport', url: `https://skinport.com/market?search=${encodedName}` },
                  { label: 'CSFloat', url: `https://csfloat.com/search?market_hash_name=${encodedName}` },
                  { label: 'Buff', url: `https://buff.163.com/market/csgo#tab=selling&page_num=1&search=${encodedName}` },
                ].map((l) => (
                  <a key={l.label} href={l.url} target="_blank" rel="noopener" className="text-[10px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-0.5">
                    {l.label} <ExternalLink size={8} />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
