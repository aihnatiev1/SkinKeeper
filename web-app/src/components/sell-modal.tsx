'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Loader2, DollarSign, AlertTriangle, ExternalLink, Zap, Timer,
} from 'lucide-react';
import { toast } from 'sonner';
import type { InventoryItem } from '@/lib/types';
import {
  useRefreshPrices, useWalletInfo, useSellVolume,
  useCreateSellOperation,
} from '@/lib/hooks';
import { getItemIconUrl } from '@/lib/utils';
import { SteamSessionModal } from './steam-session-modal';

interface SellModalProps {
  items: InventoryItem[];
  initialMode?: 'sell' | 'quick' | 'instant';
  onClose: () => void;
  onOperationStarted: (operationId: string) => void;
}

function calcFees(sellerCents: number) {
  if (sellerCents <= 0) return { bp: 0, sf: 0, cf: 0, sr: 0 };
  let bp = Math.ceil(sellerCents / 0.8696);
  for (let i = 0; i < 10; i++) {
    const sf = Math.max(1, Math.floor(bp * 0.05));
    const cf = Math.max(1, Math.floor(bp * 0.10));
    if (bp - sf - cf >= sellerCents) {
      const sfL = Math.max(1, Math.floor((bp - 1) * 0.05));
      const cfL = Math.max(1, Math.floor((bp - 1) * 0.10));
      if ((bp - 1) - sfL - cfL >= sellerCents) { bp--; continue; }
      return { bp, sf, cf, sr: bp - sf - cf };
    }
    bp++;
  }
  const sf = Math.max(1, Math.floor(bp * 0.05));
  const cf = Math.max(1, Math.floor(bp * 0.10));
  return { bp, sf, cf, sr: bp - sf - cf };
}

function buyerFees(bpCents: number) {
  if (bpCents <= 0) return { bp: 0, sf: 0, cf: 0, sr: 0 };
  const sf = Math.max(1, Math.floor(bpCents * 0.05));
  const cf = Math.max(1, Math.floor(bpCents * 0.10));
  return { bp: bpCents, sf, cf, sr: bpCents - sf - cf };
}

function fmt(cents: number, s: string) { return `${s}${(cents / 100).toFixed(2)}`; }
function steamUrl(n: string) { return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(n)}`; }

interface PriceInfo {
  sellerReceivesCents: number;
  highestBuyOrder: number;
  lowestSellOrder: number;
  currencyId: number;
  fresh: boolean;
}

export function SellModal({ items, initialMode = 'sell', onClose, onOperationStarted }: SellModalProps) {
  const { data: wallet } = useWalletInfo();
  const { data: volume } = useSellVolume();
  const refreshPrices = useRefreshPrices();
  const createSell = useCreateSellOperation();

  const [price, setPrice] = useState<PriceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [showCustom, setShowCustom] = useState(initialMode === 'sell');
  const [customInput, setCustomInput] = useState('');
  const [selling, setSelling] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const $ = wallet?.symbol || '$';
  const count = items.length;
  const item = items[0];
  const mUrl = item ? steamUrl(item.market_hash_name) : '';
  const tradable = items.filter(i => i.tradable);
  const untradable = items.length - tradable.length;

  useEffect(() => {
    const names = [...new Set(items.map(i => i.market_hash_name))];
    setLoading(true);
    refreshPrices.mutate({ names }, {
      onSuccess: (data) => {
        const p = data.prices[items[0]?.market_hash_name];
        setPrice(p && p.sellerReceivesCents > 0 ? p as PriceInfo : null);
        setLoading(false);
      },
      onError: (err: any) => {
        if (err?.status === 401) setSessionExpired(true);
        else setError(true);
        setLoading(false);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasQuickPrice = price && price.sellerReceivesCents > 0 && price.fresh;
  const hasInstantPrice = price && price.highestBuyOrder > 0;
  const stale = price ? !price.fresh : false;

  const qFees = useMemo(() => price ? calcFees(price.sellerReceivesCents) : null, [price]);
  const iFees = useMemo(() => price ? buyerFees(price.highestBuyOrder) : null, [price]);
  const customCents = Math.round(parseFloat(customInput || '0') * 100);
  const cFees = useMemo(() => customCents > 0 ? buyerFees(customCents) : null, [customCents]);

  const doSell = useCallback((priceCentsPerItem: number) => {
    if (selling) return;
    setSelling(true);
    const si = tradable.map(i => ({ assetId: i.asset_id, marketHashName: i.market_hash_name, priceCents: priceCentsPerItem }));
    if (!si.length) { toast.error('No tradable items'); setSelling(false); return; }
    createSell.mutate(si, {
      onSuccess: (d) => onOperationStarted(d.operationId),
      onError: (e: any) => {
        if (e?.status === 401) { setSessionExpired(true); setSelling(false); return; }
        toast.error(e?.message || 'Failed'); setSelling(false);
      },
    });
  }, [selling, tradable, createSell, onOperationStarted]);

  const handleQuick = () => { if (price) doSell(price.sellerReceivesCents); };
  const handleInstant = () => { if (iFees && iFees.sr > 0) doSell(iFees.sr); };
  const handleCustom = () => { if (cFees && cFees.sr > 0) doSell(cFees.sr); };

  const volWarn = volume && volume.remaining < 50;

  // Note: instant mode no longer auto-fires — user must click the Instant button deliberately

  return (
    <>
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 50 }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full sm:max-w-[420px] sm:rounded-2xl rounded-t-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
          style={{ background: 'linear-gradient(180deg, #1e2130 0%, #151722 100%)', border: '1px solid rgba(255,255,255,0.08)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sell-modal-title"
        >
          {/* Handle bar */}
          <div className="flex justify-center pt-3 sm:hidden">
            <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
          </div>

          {/* Header */}
          <div className="px-5 pt-4 pb-3 flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <img src={getItemIconUrl(item?.icon_url || '')} alt="" className="w-12 h-10 object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <p id="sell-modal-title" className="text-[15px] font-bold text-white truncate">
                {count > 1 && `${count}x `}
                {item?.market_hash_name.replace(/^(StatTrak™ |Souvenir |★ )/, '').replace(/^[^|]+\| /, '').trim()}
              </p>
              <p className="text-xs text-white/40 truncate mt-0.5">
                {item?.market_hash_name.split('|')[0]?.replace(/(StatTrak™ |Souvenir |★ )/g, '').trim()}
                {item?.wear ? ` · ${item.wear}` : ''}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all shrink-0">
              <X size={18} />
            </button>
          </div>

          <div className="px-5 pb-5 space-y-3">
            {/* Warnings */}
            {untradable > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.15)' }}>
                <AlertTriangle size={13} className="text-yellow-500 shrink-0" />
                <p className="text-[11px] text-yellow-500">{untradable} item{untradable > 1 ? 's' : ''} not tradable — skipped</p>
              </div>
            )}
            {volWarn && volume && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.15)' }}>
                <AlertTriangle size={13} className="text-yellow-500 shrink-0" />
                <p className="text-[11px] text-yellow-500">{volume.today}/{volume.limit} daily listings · {volume.remaining} left</p>
              </div>
            )}

            {/* Session expired */}
            {sessionExpired && (
              <div className="py-4 space-y-4">
                <div className="rounded-xl p-4 text-center space-y-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
                    <AlertTriangle size={24} style={{ color: '#f87171' }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Steam session expired</p>
                    <p className="text-xs text-white/40 mt-1.5 leading-relaxed">
                      Steam tokens last only ~24 hours. Please reconnect your session.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setQrOpen(true)}
                  className="flex items-center justify-center gap-2.5 w-full py-3 rounded-xl text-sm font-semibold transition-all hover:brightness-125 active:scale-[0.98]"
                  style={{ background: '#2a475e', color: '#fff' }}
                >
                  <svg width="18" height="18" viewBox="0 0 256 259" fill="currentColor">
                    <path d="M127.779 0C57.865 0 .947 54.087.017 123.057l68.641 28.359a35.899 35.899 0 0 1 20.42-6.348l30.63-44.399v-.623c0-27.705 22.53-50.243 50.237-50.243 27.724 0 50.254 22.538 50.254 50.271 0 27.724-22.53 50.254-50.254 50.254h-1.16l-43.688 31.193c0 .402.017.804.017 1.188 0 20.793-16.89 37.7-37.7 37.7-18.419 0-33.868-13.27-37.134-30.773L1.932 163.86C17.28 218.24 67.826 258.384 127.779 258.384c70.693 0 128.034-57.333 128.034-128.026v-.166C255.813 57.35 198.472 0 127.779 0" />
                  </svg>
                  Sign in with Steam
                </button>
              </div>
            )}

            {/* Loading */}
            {loading && !sessionExpired && (
              <div className="flex items-center justify-center gap-2.5 py-10">
                <Loader2 size={22} className="animate-spin" style={{ color: '#60a5fa' }} />
                <p className="text-sm text-white/50">Fetching prices...</p>
              </div>
            )}

            {/* Error */}
            {error && !loading && !sessionExpired && (
              <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} style={{ color: '#f87171' }} />
                  <p className="text-sm" style={{ color: '#f87171' }}>Could not fetch price</p>
                </div>
                <a href={mUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs hover:underline" style={{ color: '#60a5fa' }}>
                  <ExternalLink size={12} />Check on Steam Market
                </a>
                <button onClick={() => setShowCustom(true)}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#3b82f6', color: '#fff' }}>
                  Set Custom Price
                </button>
              </div>
            )}

            {/* Main content */}
            {!loading && !error && !sessionExpired && (
              <>
                {/* No price found */}
                {!price && (
                  <div className="rounded-xl p-3.5 space-y-2" style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.15)' }}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} style={{ color: '#eab308' }} />
                      <p className="text-xs font-medium" style={{ color: '#eab308' }}>No price available for this item</p>
                    </div>
                    <p className="text-[11px] text-white/35">Check the current price on Steam Market and enter it manually below.</p>
                    <a href={mUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] hover:underline" style={{ color: '#60a5fa' }}>
                      <ExternalLink size={11} />Open on Steam Market
                    </a>
                  </div>
                )}

                {/* Stale warning */}
                {stale && (
                  <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={13} style={{ color: '#f87171' }} />
                      <p className="text-[11px] font-medium" style={{ color: '#f87171' }}>Price may be outdated</p>
                    </div>
                    <a href={mUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] hover:underline" style={{ color: '#60a5fa' }}>
                      <ExternalLink size={11} />Check on Steam Market
                    </a>
                  </div>
                )}

                {/* Fee breakdown */}
                {qFees && qFees.bp > 0 && (
                  <div className="rounded-xl p-3.5 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/40">Buyer pays</span>
                      <span className="font-semibold text-white/80">{fmt(qFees.bp, $)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/40">Steam fee (15%)</span>
                      <span className="font-semibold" style={{ color: '#f87171' }}>-{fmt(qFees.sf + qFees.cf, $)}</span>
                    </div>
                    <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-white/70">You receive</span>
                      <span className="font-bold" style={{ color: '#4ade80' }}>{fmt(qFees.sr, $)}</span>
                    </div>
                    {count > 1 && (
                      <div className="flex justify-between text-xs pt-1">
                        <span className="text-white/30">Total ({count} items)</span>
                        <span className="font-bold" style={{ color: '#eab308' }}>{fmt(qFees.bp * count, $)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Instant sell info */}
                {hasInstantPrice && iFees && iFees.sr > 0 && (
                  <div className="rounded-xl p-3.5 flex items-center justify-between" style={{ background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.15)' }}>
                    <div>
                      <p className="text-[10px] font-medium text-white/50 uppercase tracking-wide">Instant — sells immediately to highest buyer</p>
                      <p className="text-sm font-bold" style={{ color: '#fbbf24' }}>{fmt(price!.highestBuyOrder, $)}</p>
                      <p className="text-[10px] text-white/50">You receive: {fmt(iFees.sr, $)}</p>
                    </div>
                    <button
                      onClick={handleInstant}
                      disabled={selling}
                      className="px-4 py-2 rounded-lg text-xs font-bold transition-all hover:opacity-90 disabled:opacity-40"
                      style={{ background: '#d97706', color: '#000' }}
                    >
                      {selling ? <Loader2 size={14} className="animate-spin" /> : (
                        <span className="flex items-center gap-1.5"><Timer size={13} />Instant</span>
                      )}
                    </button>
                  </div>
                )}

                {/* Quick Sell + Sell buttons */}
                {hasQuickPrice ? (
                  <div className="space-y-1.5">
                    <div className="flex gap-2.5">
                      <button
                        onClick={handleQuick}
                        disabled={selling}
                        className="flex-[3] py-3.5 rounded-xl text-[13px] font-bold transition-all hover:brightness-110 disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', color: '#000' }}
                      >
                        {selling ? (
                          <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" />Selling...</span>
                        ) : (
                          <>Quick Sell <span style={{ opacity: 0.6 }}>{fmt(qFees ? (count === 1 ? qFees.bp : qFees.bp * count) : 0, $)}</span></>
                        )}
                      </button>
                      <button
                        onClick={() => setShowCustom(!showCustom)}
                        className="flex-[1.5] py-3.5 rounded-xl text-[13px] font-semibold transition-all"
                        style={{
                          border: showCustom ? '1.5px solid #3b82f6' : '1.5px solid rgba(255,255,255,0.12)',
                          color: showCustom ? '#60a5fa' : 'rgba(255,255,255,0.5)',
                          background: showCustom ? 'rgba(59,130,246,0.08)' : 'transparent',
                        }}
                      >
                        Custom
                      </button>
                    </div>
                    <p className="text-[10px] text-white/40 text-center">Quick Sell lists at the current lowest ask price · Custom lets you set your own</p>
                  </div>
                ) : (
                  <>
                    <a href={mUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-[13px] font-semibold transition-all hover:brightness-110"
                      style={{ border: '1.5px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}>
                      <ExternalLink size={14} />Check Price on Steam Market
                    </a>
                    <button onClick={() => setShowCustom(true)}
                      className="w-full py-3.5 rounded-xl text-[13px] font-bold transition-all hover:brightness-110"
                      style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff' }}>
                      Sell at Custom Price
                    </button>
                  </>
                )}

                {/* Custom price input */}
                {showCustom && (
                  <div className="space-y-3 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>{$}</span>
                      <input
                        type="number" step="0.01" min="0.03"
                        value={customInput}
                        onChange={(e) => setCustomInput(e.target.value)}
                        className="w-full pl-9 pr-4 py-3.5 rounded-xl text-lg font-bold font-mono focus:outline-none transition-all"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.1)', color: '#fff' }}
                        onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                        onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>

                    {/* Quick price hint */}
                    {qFees && qFees.bp > 0 && (
                      <p className="text-[10px] text-white/30">
                        Lowest listing: {fmt(qFees.bp, $)}
                        <button onClick={() => setCustomInput((qFees.bp / 100).toFixed(2))}
                          className="ml-1.5 hover:underline" style={{ color: '#60a5fa' }}>use this</button>
                      </p>
                    )}

                    {cFees && cFees.sr > 0 && (
                      <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="flex justify-between text-xs">
                          <span className="text-white/40">Buyer pays</span>
                          <span className="font-semibold text-white/80">{fmt(cFees.bp, $)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-white/40">Fee (15%)</span>
                          <span style={{ color: '#f87171' }}>-{fmt(cFees.sf + cFees.cf, $)}</span>
                        </div>
                        <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                        <div className="flex justify-between text-sm">
                          <span className="font-bold text-white/60">You receive</span>
                          <span className="font-bold" style={{ color: '#4ade80' }}>{fmt(cFees.sr, $)}</span>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleCustom}
                      disabled={customCents <= 0 || selling}
                      className="w-full py-3.5 rounded-xl text-[13px] font-bold transition-all hover:brightness-110 disabled:opacity-25"
                      style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff' }}
                    >
                      {selling ? (
                        <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" />Listing...</span>
                      ) : customCents > 0 ? (
                        count === 1 ? `List at ${$}${(customCents / 100).toFixed(2)}` : `List ${count} at ${$}${(customCents / 100).toFixed(2)} each`
                      ) : 'Enter a price'}
                    </button>
                  </div>
                )}

                <p className="text-[10px] text-center text-white/50 pt-1">Confirm in Steam Guard mobile app</p>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
    <SteamSessionModal
      open={qrOpen}
      onClose={() => setQrOpen(false)}
      onSuccess={() => {
        setQrOpen(false);
        setSessionExpired(false);
        toast.success('Steam session refreshed');
      }}
    />
    </>
  );
}
