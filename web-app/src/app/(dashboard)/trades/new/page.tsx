'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { useInventory } from '@/lib/hooks';
import { api } from '@/lib/api';
import { formatPrice, getItemIconUrl, getWearShort, cn } from '@/lib/utils';
import type { InventoryItem } from '@/lib/types';
import { ArrowRight, Search, Send, X, Users, ArrowLeftRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

interface PartnerItem {
  assetid: string;
  market_hash_name: string;
  icon_url: string;
  prices?: Record<string, number>;
}

export default function NewTradePage() {
  const router = useRouter();
  const { data: myItems, isLoading: invLoading } = useInventory();

  const [partnerSteamId, setPartnerSteamId] = useState('');
  const [tradeToken, setTradeToken] = useState('');
  const [partnerItems, setPartnerItems] = useState<PartnerItem[]>([]);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const [partnerError, setPartnerError] = useState('');

  const [selectedGive, setSelectedGive] = useState<Set<string>>(new Set());
  const [selectedReceive, setSelectedReceive] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const [mySearch, setMySearch] = useState('');
  const [partnerSearch, setPartnerSearch] = useState('');

  const filteredMyItems = useMemo(() => {
    if (!myItems) return [];
    const tradable = myItems.filter((i) => i.tradable);
    if (!mySearch) return tradable;
    const q = mySearch.toLowerCase();
    return tradable.filter((i) => i.market_hash_name.toLowerCase().includes(q));
  }, [myItems, mySearch]);

  const filteredPartnerItems = useMemo(() => {
    if (!partnerSearch) return partnerItems;
    const q = partnerSearch.toLowerCase();
    return partnerItems.filter((i) => i.market_hash_name.toLowerCase().includes(q));
  }, [partnerItems, partnerSearch]);

  const loadPartner = async () => {
    if (!partnerSteamId.trim()) return;
    setPartnerLoading(true);
    setPartnerError('');
    try {
      const data = await api.get<{ items: PartnerItem[] }>(
        `/trades/partner-inventory/${partnerSteamId.trim()}`
      );
      setPartnerItems(data.items || []);
    } catch {
      setPartnerError('Failed to load partner inventory');
    } finally {
      setPartnerLoading(false);
    }
  };

  const toggleGive = (assetId: string) => {
    setSelectedGive((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const toggleReceive = (assetId: string) => {
    setSelectedReceive((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const giveValue = useMemo(() => {
    if (!myItems) return 0;
    return myItems
      .filter((i) => selectedGive.has(i.asset_id))
      .reduce((s, i) => s + (i.prices?.steam || i.prices?.skinport || 0), 0);
  }, [myItems, selectedGive]);

  const receiveValue = useMemo(() => {
    return partnerItems
      .filter((i) => selectedReceive.has(i.assetid))
      .reduce((s, i) => s + (i.prices?.steam || i.prices?.skinport || 0), 0);
  }, [partnerItems, selectedReceive]);

  const handleSend = async () => {
    if (selectedGive.size === 0 && selectedReceive.size === 0) return;
    setSending(true);
    setError('');
    try {
      await api.post('/trades/send', {
        partnerSteamId: partnerSteamId.trim(),
        tradeToken: tradeToken.trim() || undefined,
        itemsToGive: Array.from(selectedGive),
        itemsToReceive: Array.from(selectedReceive),
        message: message.trim() || undefined,
      });
      router.push('/trades');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send trade');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <Header title="New Trade" />
      <div className="p-6 space-y-6">
        {/* Partner input */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-muted" />
            <h2 className="font-semibold">Trade Partner</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Partner Steam ID or profile URL"
              value={partnerSteamId}
              onChange={(e) => setPartnerSteamId(e.target.value)}
              className="flex-1 min-w-[200px] px-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
            />
            <input
              type="text"
              placeholder="Trade token (optional)"
              value={tradeToken}
              onChange={(e) => setTradeToken(e.target.value)}
              className="w-48 px-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
            />
            <button
              onClick={loadPartner}
              disabled={partnerLoading || !partnerSteamId.trim()}
              className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {partnerLoading ? 'Loading...' : 'Load Inventory'}
            </button>
          </div>
          {partnerError && (
            <p className="text-sm text-loss mt-2">{partnerError}</p>
          )}
        </div>

        {/* Items selection */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* My items */}
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold mb-2">Your Items</h3>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={mySearch}
                  onChange={(e) => setMySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-lg text-xs focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto p-2 grid grid-cols-4 sm:grid-cols-5 gap-1.5">
              {invLoading ? (
                <div className="col-span-full py-8"><PageLoader /></div>
              ) : filteredMyItems.length === 0 ? (
                <p className="col-span-full text-center text-xs text-muted py-8">No tradable items</p>
              ) : (
                filteredMyItems.map((item) => (
                  <button
                    key={item.asset_id}
                    onClick={() => toggleGive(item.asset_id)}
                    className={cn(
                      'relative rounded-lg border p-1.5 transition-all',
                      selectedGive.has(item.asset_id)
                        ? 'border-primary bg-primary/10 ring-1 ring-primary'
                        : 'border-border hover:border-primary/30'
                    )}
                  >
                    {getItemIconUrl(item.icon_url) && (
                      <img
                        src={getItemIconUrl(item.icon_url)}
                        alt={item.market_hash_name}
                        title={item.market_hash_name}
                        className="w-full h-10 object-contain"
                      />
                    )}
                    <p className="text-[9px] truncate mt-1 text-muted">{item.market_hash_name}</p>
                  </button>
                ))
              )}
            </div>
            {selectedGive.size > 0 && (
              <div className="px-4 py-2 border-t border-border text-xs flex justify-between">
                <span>{selectedGive.size} items selected</span>
                <span className="text-loss">{formatPrice(giveValue)}</span>
              </div>
            )}
          </div>

          {/* Partner items */}
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold mb-2">Partner Items</h3>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={partnerSearch}
                  onChange={(e) => setPartnerSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-lg text-xs focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto p-2 grid grid-cols-4 sm:grid-cols-5 gap-1.5">
              {partnerItems.length === 0 ? (
                <p className="col-span-full text-center text-xs text-muted py-8">
                  {partnerSteamId ? 'Load partner inventory first' : 'Enter partner Steam ID above'}
                </p>
              ) : filteredPartnerItems.length === 0 ? (
                <p className="col-span-full text-center text-xs text-muted py-8">No items match</p>
              ) : (
                filteredPartnerItems.map((item) => (
                  <button
                    key={item.assetid}
                    onClick={() => toggleReceive(item.assetid)}
                    className={cn(
                      'relative rounded-lg border p-1.5 transition-all',
                      selectedReceive.has(item.assetid)
                        ? 'border-profit bg-profit/10 ring-1 ring-profit'
                        : 'border-border hover:border-profit/30'
                    )}
                  >
                    {item.icon_url && (
                      <img
                        src={getItemIconUrl(item.icon_url)}
                        alt={item.market_hash_name}
                        title={item.market_hash_name}
                        className="w-full h-10 object-contain"
                      />
                    )}
                    <p className="text-[9px] truncate mt-1 text-muted">{item.market_hash_name}</p>
                  </button>
                ))
              )}
            </div>
            {selectedReceive.size > 0 && (
              <div className="px-4 py-2 border-t border-border text-xs flex justify-between">
                <span>{selectedReceive.size} items selected</span>
                <span className="text-profit">{formatPrice(receiveValue)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Summary & send */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="text-center flex-1">
              <p className="text-xs text-muted mb-1">You give</p>
              <p className="text-lg font-semibold text-loss">
                {selectedGive.size > 0 ? formatPrice(giveValue) : '—'}
              </p>
              <p className="text-xs text-muted">{selectedGive.size} items</p>
            </div>
            <ArrowLeftRight size={24} className="text-muted shrink-0" />
            <div className="text-center flex-1">
              <p className="text-xs text-muted mb-1">You receive</p>
              <p className="text-lg font-semibold text-profit">
                {selectedReceive.size > 0 ? formatPrice(receiveValue) : '—'}
              </p>
              <p className="text-xs text-muted">{selectedReceive.size} items</p>
            </div>
          </div>

          <input
            type="text"
            placeholder="Message (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-4 py-2 mb-4 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
          />

          {error && <p className="text-sm text-loss mb-3">{error}</p>}

          <button
            onClick={handleSend}
            disabled={sending || (selectedGive.size === 0 && selectedReceive.size === 0) || !partnerSteamId.trim()}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            <Send size={16} />
            {sending ? 'Sending...' : 'Send Trade Offer'}
          </button>
        </div>
      </div>
    </div>
  );
}
