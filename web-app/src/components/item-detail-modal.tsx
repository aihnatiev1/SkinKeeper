'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Copy, Check } from 'lucide-react';
import type { InventoryItem } from '@/lib/types';
import { formatPrice, getItemIconUrl, getWearShort } from '@/lib/utils';
import { RARITY_COLORS } from '@/lib/constants';
import { useState, useEffect } from 'react';

interface ItemDetailModalProps {
  item: InventoryItem | null;
  onClose: () => void;
}

export function ItemDetailModal({ item, onClose }: ItemDetailModalProps) {
  const [copied, setCopied] = useState(false);

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

  if (!item) return null;

  const steamPrice = item.prices?.steam || 0;
  const skinportPrice = item.prices?.skinport || 0;
  const csfloatPrice = item.prices?.csfloat || 0;
  const bestPrice = Math.max(steamPrice, skinportPrice, csfloatPrice);
  const rarityColor = (item.rarity && RARITY_COLORS[item.rarity]) || '#64748B';
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
          className="relative w-full max-w-lg glass-strong rounded-2xl overflow-hidden"
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
            {/* Rarity bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: rarityColor }} />
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Name & wear */}
            <div>
              <div className="flex items-start gap-2">
                <h2 className="text-lg font-bold flex-1">{item.market_hash_name}</h2>
                <button
                  onClick={copyName}
                  className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors shrink-0"
                  title="Copy name"
                >
                  {copied ? <Check size={14} className="text-profit" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {item.wear && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface-light text-muted font-medium">
                    {getWearShort(item.wear)} — {item.wear}
                  </span>
                )}
                {item.rarity && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: `${rarityColor}15`, color: rarityColor }}
                  >
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
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-profit via-warning to-loss rounded-full"
                    style={{ width: '100%' }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-primary shadow-lg"
                    style={{ left: `${item.float_value * 100}%`, transform: 'translate(-50%, -50%)' }}
                  />
                </div>
                <p className="text-xs font-mono text-foreground mt-1">{item.float_value.toFixed(14)}</p>
              </div>
            )}

            {/* Prices */}
            <div>
              <p className="text-xs text-muted mb-2">Prices</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Steam', price: steamPrice, color: 'text-foreground' },
                  { label: 'Skinport', price: skinportPrice, color: 'text-accent' },
                  { label: 'CSFloat', price: csfloatPrice, color: 'text-warning' },
                ].map((source) => (
                  <div key={source.label} className="glass rounded-xl p-3 text-center">
                    <p className="text-[10px] text-muted mb-0.5">{source.label}</p>
                    <p className={`text-sm font-bold ${source.price === bestPrice && source.price > 0 ? 'text-profit' : source.color}`}>
                      {source.price > 0 ? formatPrice(source.price) : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 gap-3 text-sm">
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

            {/* External links */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
              <a
                href={`https://steamcommunity.com/market/listings/730/${encodedName}`}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors"
              >
                Steam Market <ExternalLink size={10} />
              </a>
              <a
                href={`https://skinport.com/market?search=${encodedName}`}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors"
              >
                Skinport <ExternalLink size={10} />
              </a>
              <a
                href={`https://csfloat.com/search?market_hash_name=${encodedName}`}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors"
              >
                CSFloat <ExternalLink size={10} />
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
