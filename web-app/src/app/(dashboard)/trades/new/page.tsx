'use client';

import Link from 'next/link';
import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { ExtensionRequiredModal } from '@/components/extension-required-modal';
import { useInventory, useHasSession, useAccounts } from '@/lib/hooks';
import { api } from '@/lib/api';
import type { SteamFriend, TradeAccount, PartnerInventoryItem, InventoryItem } from '@/lib/types';
import { useFormatPrice, getItemIconUrl, getWearShort, cn } from '@/lib/utils';
import { Search, Send, Users, ArrowLeftRight, ChevronLeft, ChevronDown, Wifi, WifiOff, X } from 'lucide-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RARITY_COLORS } from '@/lib/constants';
import { QuantityPickerModal } from '@/components/quantity-picker-modal';
import { useUIStore } from '@/lib/store';

interface ItemGroup {
  marketHashName: string;
  items: InventoryItem[];
  representative: InventoryItem;
  count: number;
}

interface PartnerGroup {
  marketHashName: string;
  items: PartnerInventoryItem[];
  representative: PartnerInventoryItem;
  count: number;
}

type Step = 'pick-partner' | 'select-items';

const WC: Record<string, string> = { FN: '#4ade80', MW: '#22d3ee', FT: '#a78bfa', WW: '#f97316', BS: '#ef4444' };

export default function NewTradePage() {
  const formatPrice = useFormatPrice();
  const router = useRouter();
  const { data: accounts } = useAccounts();
  const hasSession = useHasSession();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);

  const [sendFromAccountId, setSendFromAccountId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (accounts?.length && !sendFromAccountId) {
      const active = accounts.find((a) => a.isActive);
      if (active) setSendFromAccountId(active.id);
      else setSendFromAccountId(accounts[0].id);
    }
  }, [accounts, sendFromAccountId]);

  const { data: invData, isLoading: invLoading } = useInventory({ tradableOnly: true, accountId: sendFromAccountId });
  const myItems = useMemo(() => invData?.pages.flatMap((p) => p.items) ?? [], [invData]);

  const [step, setStep] = useState<Step>('pick-partner');
  const [showSessionGate, setShowSessionGate] = useState(false);

  const [friends, setFriends] = useState<SteamFriend[]>([]);
  const [linkedAccounts, setLinkedAccounts] = useState<TradeAccount[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState('');
  const [friendSearch, setFriendSearch] = useState('');

  const [partner, setPartner] = useState<{ steamId: string; name: string; avatar: string } | null>(null);
  const [tradeToken, setTradeToken] = useState('');

  const [partnerItems, setPartnerItems] = useState<PartnerInventoryItem[]>([]);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const [selectedGive, setSelectedGive] = useState<Set<string>>(new Set());
  const [selectedReceive, setSelectedReceive] = useState<Set<string>>(new Set());
  const [mySearch, setMySearch] = useState('');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setFriendsLoading(true);
      try {
        const [friendsRes, accountsRes] = await Promise.all([
          api.get<{ friends: SteamFriend[] }>('/trades/friends').catch(() => ({ friends: [] as SteamFriend[] })),
          api.get<{ accounts: TradeAccount[] }>('/trades/accounts').catch(() => ({ accounts: [] as TradeAccount[] })),
        ]);
        setFriends(friendsRes.friends || []);
        setLinkedAccounts(accountsRes.accounts || []);
      } catch {
        setFriendsError('Failed to load friends');
      } finally {
        setFriendsLoading(false);
      }
    }
    load();
  }, []);

  const filteredFriends = useMemo(() => {
    if (!friendSearch) return friends;
    const q = friendSearch.toLowerCase();
    return friends.filter((f) => (f.personaName || '').toLowerCase().includes(q));
  }, [friends, friendSearch]);

  const onlineFriends = useMemo(() => filteredFriends.filter((f) => f.onlineStatus !== 'offline'), [filteredFriends]);
  const offlineFriends = useMemo(() => filteredFriends.filter((f) => f.onlineStatus === 'offline'), [filteredFriends]);

  const selectPartner = async (steamId: string, name: string, avatar: string) => {
    setPartner({ steamId, name, avatar });
    setStep('select-items');
    setSelectedGive(new Set());
    setSelectedReceive(new Set());
    setPartnerLoading(true);
    try {
      const data = await api.get<{ items: PartnerInventoryItem[] }>(`/trades/partner-inventory/${steamId}`);
      setPartnerItems(data.items || []);
    } catch {
      setPartnerItems([]);
    } finally {
      setPartnerLoading(false);
    }
  };

  const [pickerGroup, setPickerGroup] = useState<(ItemGroup & { selectedCount: number }) | null>(null);
  const [partnerPickerGroup, setPartnerPickerGroup] = useState<(PartnerGroup & { selectedCount: number }) | null>(null);

  const filteredMyItems = useMemo(() => {
    if (!myItems.length) return [];
    if (!mySearch) return myItems;
    const q = mySearch.toLowerCase();
    return myItems.filter((i) => i.market_hash_name.toLowerCase().includes(q));
  }, [myItems, mySearch]);

  // Group duplicate items by market_hash_name
  const myGroups = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    for (const item of filteredMyItems) {
      const existing = map.get(item.market_hash_name);
      if (existing) existing.push(item);
      else map.set(item.market_hash_name, [item]);
    }
    return Array.from(map.entries()).map(([name, groupItems]) => ({
      marketHashName: name,
      items: groupItems,
      representative: groupItems[0],
      count: groupItems.length,
    }));
  }, [filteredMyItems]);

  const filteredPartnerItems = useMemo(() => {
    if (!partnerSearch) return partnerItems;
    const q = partnerSearch.toLowerCase();
    return partnerItems.filter((i) => (i.marketHashName || '').toLowerCase().includes(q));
  }, [partnerItems, partnerSearch]);

  // Group partner items
  const partnerGroups = useMemo(() => {
    const map = new Map<string, PartnerInventoryItem[]>();
    for (const item of filteredPartnerItems) {
      const key = item.marketHashName || item.assetId;
      const existing = map.get(key);
      if (existing) existing.push(item);
      else map.set(key, [item]);
    }
    return Array.from(map.entries()).map(([name, groupItems]) => ({
      marketHashName: name,
      items: groupItems,
      representative: groupItems[0],
      count: groupItems.length,
    }));
  }, [filteredPartnerItems]);

  const handleMyGroupClick = (group: ItemGroup) => {
    if (group.count === 1) {
      // Single item — toggle directly
      const id = group.items[0].asset_id;
      setSelectedGive((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    } else {
      // Multiple — open quantity picker
      const selCount = group.items.filter((i) => selectedGive.has(i.asset_id)).length;
      setPickerGroup({ ...group, selectedCount: selCount });
    }
  };

  const handleGroupConfirm = (assetIds: string[]) => {
    if (!pickerGroup) return;
    setSelectedGive((prev) => {
      const next = new Set(prev);
      for (const item of pickerGroup.items) next.delete(item.asset_id);
      for (const id of assetIds) next.add(id);
      return next;
    });
    setPickerGroup(null);
  };

  const handlePartnerGroupClick = (group: PartnerGroup) => {
    if (group.count === 1) {
      const id = group.items[0].assetId;
      setSelectedReceive((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    } else {
      const selCount = group.items.filter((i) => selectedReceive.has(i.assetId)).length;
      setPartnerPickerGroup({ ...group, selectedCount: selCount });
    }
  };

  const handlePartnerGroupConfirm = (assetIds: string[]) => {
    if (!partnerPickerGroup) return;
    setSelectedReceive((prev) => {
      const next = new Set(prev);
      for (const item of partnerPickerGroup.items) next.delete(item.assetId);
      for (const id of assetIds) next.add(id);
      return next;
    });
    setPartnerPickerGroup(null);
  };

  const giveValue = useMemo(() => {
    return myItems.filter((i) => selectedGive.has(i.asset_id)).reduce((s, i) => s + (i.prices?.steam || i.prices?.skinport || 0), 0);
  }, [myItems, selectedGive]);

  const receiveValue = useMemo(() => {
    return partnerItems.filter((i) => selectedReceive.has(i.assetId)).reduce((s, i) => s + ((i.priceCents || 0) / 100), 0);
  }, [partnerItems, selectedReceive]);

  const handleSend = async () => {
    if (!partner || (selectedGive.size === 0 && selectedReceive.size === 0)) return;
    if (!hasSession) { setShowSessionGate(true); return; }
    setSending(true);
    setError('');
    try {
      await api.post('/trades/send', {
        partnerSteamId: partner.steamId,
        tradeToken: tradeToken.trim() || undefined,
        itemsToGive: Array.from(selectedGive).map((id) => {
          const item = myItems.find((i) => i.asset_id === id);
          return { assetId: id, marketHashName: item?.market_hash_name, iconUrl: item?.icon_url };
        }),
        itemsToReceive: Array.from(selectedReceive).map((id) => {
          const item = partnerItems.find((i) => i.assetId === id);
          return { assetId: id, marketHashName: item?.marketHashName, iconUrl: item?.iconUrl };
        }),
        message: message.trim() || undefined,
        accountId: sendFromAccountId,
      });
      toast.success('Trade offer sent!');
      router.push('/trades');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send trade';
      setError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const totalItems = selectedGive.size + selectedReceive.size;
  const diff = receiveValue - giveValue;
  const diffPct = giveValue > 0 ? (diff / giveValue) * 100 : 0;

  // ─── Step 1: Pick Partner ───────────────────────────────────────────
  if (step === 'pick-partner') {
    return (
      <div>
        <Header title="New Trade" />
        <div className="px-4 lg:px-6 pt-3">
          <nav className="flex items-center gap-1.5 text-xs text-muted" aria-label="Breadcrumb">
            <Link href="/trades" className="hover:text-foreground transition-colors">Trades</Link>
            <span>/</span>
            <span className="text-foreground">New Trade</span>
          </nav>
        </div>
        <div className="p-6 max-w-3xl mx-auto space-y-4">
          <h2 className="text-lg font-semibold">Choose trade partner</h2>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search friends..." value={friendSearch} onChange={(e) => setFriendSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 glass rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all" />
          </div>
          {friendsLoading ? <PageLoader /> : friendsError ? (
            <p className="text-sm text-loss text-center py-8">{friendsError}</p>
          ) : (
            <div className="space-y-4">
              {linkedAccounts.length > 1 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ArrowLeftRight size={12} /> Your Accounts
                  </h3>
                  <div className="space-y-1">
                    {linkedAccounts.map((acc) => (
                      <button key={acc.id} onClick={() => selectPartner(acc.steam_id, acc.display_name, acc.avatar_url)}
                        className="flex items-center gap-3 w-full px-4 py-3 glass rounded-xl hover:border-primary/20 transition-all">
                        {acc.avatar_url ? <img src={acc.avatar_url} alt="" className="w-10 h-10 rounded-full" /> : <div className="w-10 h-10 rounded-full bg-surface-light" />}
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-medium truncate">{acc.display_name}</p>
                          <p className="text-xs text-muted">Internal transfer</p>
                        </div>
                        <ArrowLeftRight size={16} className="text-accent" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {onlineFriends.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Wifi size={12} className="text-profit" /> Online — {onlineFriends.length}
                  </h3>
                  <div className="space-y-1">{onlineFriends.map((f) => <FriendRow key={f.steamId} friend={f} onSelect={selectPartner} />)}</div>
                </div>
              )}
              {offlineFriends.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <WifiOff size={12} /> Offline — {offlineFriends.length}
                  </h3>
                  <div className="space-y-1">{offlineFriends.map((f) => <FriendRow key={f.steamId} friend={f} onSelect={selectPartner} />)}</div>
                </div>
              )}
              {friends.length === 0 && (
                <div className="text-center text-muted py-12">
                  <Users size={40} className="mx-auto mb-3 opacity-50" />
                  <p>No friends found</p>
                  <p className="text-xs mt-1">Make sure your friends list is public on Steam</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Step 2: Select Items ───────────────────────────────────────────
  return (
    <div className="pb-[140px]">
      <Header title="New Trade" />
      <div className="p-4 sm:p-5 space-y-3">
        {/* Partner bar */}
        <div className="flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ background: '#161923', border: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={() => setStep('pick-partner')} className="text-white/30 hover:text-white/70 transition-colors">
            <ChevronLeft size={20} />
          </button>
          {partner?.avatar && <img src={partner.avatar} alt="" className="w-7 h-7 rounded-full" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{partner?.name}</p>
          </div>
          <input type="text" placeholder="Trade URL token" value={tradeToken} onChange={(e) => setTradeToken(e.target.value)}
            className="w-44 px-3 py-1.5 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-primary hidden sm:block"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#94a3b8' }} />
        </div>

        {/* Two-column inventory grids */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* YOUR ITEMS */}
          <div className="rounded-xl overflow-hidden" style={{ background: '#161923', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="text-xs font-semibold text-white/70 flex-1">Your Items</span>
              {accounts && accounts.length > 1 && (
                <AccountSelector accounts={accounts} selectedId={sendFromAccountId} onChange={setSendFromAccountId} />
              )}
            </div>
            <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#475569' }} />
                <input type="text" placeholder="Search..." value={mySearch} onChange={(e) => setMySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0' }} />
              </div>
            </div>
            <div className="max-h-[520px] overflow-y-auto p-1.5" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 4 }}>
              {invLoading ? <div className="col-span-full py-8"><PageLoader /></div> : myGroups.length === 0 ? (
                <p className="col-span-full text-center text-xs py-8" style={{ color: '#475569' }}>No tradable items</p>
              ) : myGroups.map((group) => {
                const item = group.representative;
                const selCount = group.items.filter((i) => selectedGive.has(i.asset_id)).length;
                return (
                  <TradeItemCard key={group.marketHashName} id={item.asset_id} name={item.market_hash_name} icon={item.icon_url}
                    price={item.prices?.steam || item.prices?.buff || item.prices?.skinport || 0}
                    wear={item.wear} floatValue={item.float_value} rarity={item.rarity}
                    selected={selCount > 0} stackCount={group.count} selectedCount={selCount}
                    onToggle={() => handleMyGroupClick(group)}
                    formatPrice={formatPrice} accent="red" />
                );
              })}
            </div>
            {selectedGive.size > 0 && (
              <div className="px-3 py-2 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="text-[11px]" style={{ color: '#64748b' }}>{selectedGive.size} selected</span>
                <span className="text-xs font-bold" style={{ color: '#ef4444' }}>{formatPrice(giveValue)}</span>
              </div>
            )}
          </div>

          {/* PARTNER'S ITEMS */}
          <div className="rounded-xl overflow-hidden" style={{ background: '#161923', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="px-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="text-xs font-semibold text-white/70">{partner?.name}&apos;s Items</span>
            </div>
            <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#475569' }} />
                <input type="text" placeholder="Search..." value={partnerSearch} onChange={(e) => setPartnerSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0' }} />
              </div>
            </div>
            <div className="max-h-[520px] overflow-y-auto p-1.5" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 4 }}>
              {partnerLoading ? <div className="col-span-full py-8"><PageLoader /></div> : partnerGroups.length === 0 ? (
                <p className="col-span-full text-center text-xs py-8" style={{ color: '#475569' }}>No items</p>
              ) : partnerGroups.map((group) => {
                const item = group.representative;
                const selCount = group.items.filter((i) => selectedReceive.has(i.assetId)).length;
                return (
                  <TradeItemCard key={group.marketHashName} id={item.assetId} name={item.marketHashName || ''} icon={item.iconUrl || ''}
                    price={(item.priceCents || 0) / 100} wear={null} floatValue={item.floatValue ?? null} rarity={null}
                    selected={selCount > 0} stackCount={group.count} selectedCount={selCount}
                    onToggle={() => handlePartnerGroupClick(group)}
                    formatPrice={formatPrice} accent="green" />
                );
              })}
            </div>
            {selectedReceive.size > 0 && (
              <div className="px-3 py-2 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="text-[11px]" style={{ color: '#64748b' }}>{selectedReceive.size} selected</span>
                <span className="text-xs font-bold" style={{ color: '#4ade80' }}>{receiveValue > 0 ? formatPrice(receiveValue) : ''}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ FIXED BOTTOM BAR ═══ */}
      <div className="fixed bottom-0 right-0 z-40 transition-[left] duration-300" data-trade-bar
        style={{ background: 'rgba(13,15,21,0.95)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(255,255,255,0.06)', left: 0 }}>
        <style>{`@media (min-width: 1024px) { [data-trade-bar] { left: ${sidebarOpen ? 240 : 72}px !important; } }`}</style>
        <div className="px-4 sm:px-6 py-3">
          <div className="flex items-center gap-4">
            {/* You give */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: '#64748b' }}>You give</p>
              <p className="text-base font-bold" style={{ color: selectedGive.size > 0 ? '#ef4444' : '#1e293b' }}>
                {selectedGive.size > 0 ? formatPrice(giveValue) : '—'}
              </p>
              <p className="text-[10px]" style={{ color: '#475569' }}>{selectedGive.size} items</p>
            </div>

            {/* Fee breakdown — shown when both sides have items with known price */}
            {selectedReceive.size > 0 && receiveValue > 0 && (
              <div className="hidden md:flex flex-col items-center gap-0.5 px-2 shrink-0">
                <p className="text-[9px] uppercase tracking-wider" style={{ color: '#334155' }}>Listed at</p>
                <p className="text-xs font-bold tabular-nums" style={{ color: '#e2e8f0' }}>
                  {formatPrice(receiveValue / 0.8696)}
                </p>
                <p className="text-[9px]" style={{ color: '#475569' }}>−15% fee</p>
                <p className="text-[9px] font-semibold" style={{ color: '#4ade80' }}>
                  → {formatPrice(receiveValue)}
                </p>
              </div>
            )}

            {/* P&L badge */}
            {totalItems > 0 && receiveValue > 0 && giveValue > 0 && (
              <div className="shrink-0 text-center px-3 py-1.5 rounded-lg" style={{
                background: diff >= 0 ? 'rgba(74,222,128,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${diff >= 0 ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)'}`,
              }}>
                <p className="text-xs font-bold" style={{ color: diff >= 0 ? '#4ade80' : '#ef4444' }}>
                  {diff >= 0 ? '+' : ''}{formatPrice(diff)}
                </p>
                <p className="text-[9px]" style={{ color: diff >= 0 ? '#4ade80' : '#ef4444', opacity: 0.7 }}>
                  {diff >= 0 ? '+' : ''}{diffPct.toFixed(1)}%
                </p>
              </div>
            )}

            {/* Swap icon */}
            <ArrowLeftRight size={16} style={{ color: '#334155' }} className="shrink-0" />

            {/* You receive */}
            <div className="flex-1 min-w-0 text-right">
              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: '#64748b' }}>You receive</p>
              <p className="text-base font-bold" style={{ color: selectedReceive.size > 0 ? '#4ade80' : '#1e293b' }}>
                {selectedReceive.size > 0 ? (receiveValue > 0 ? formatPrice(receiveValue) : `${selectedReceive.size} items`) : '—'}
              </p>
              <p className="text-[10px]" style={{ color: '#475569' }}>{selectedReceive.size} items</p>
            </div>

            {/* Message + Send */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <input type="text" placeholder="Message..." value={message} onChange={(e) => setMessage(e.target.value)}
                className="w-36 px-3 py-2 rounded-lg text-xs focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#94a3b8' }} />
              <button onClick={handleSend}
                disabled={sending || totalItems === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-30"
                style={{ background: '#6366f1', color: '#fff' }}>
                <Send size={14} />
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>

          {/* Mobile: message + send below */}
          <div className="flex sm:hidden items-center gap-2 mt-2">
            <input type="text" placeholder="Message..." value={message} onChange={(e) => setMessage(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg text-xs focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#94a3b8' }} />
            <button onClick={handleSend} disabled={sending || totalItems === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-30"
              style={{ background: '#6366f1', color: '#fff' }}>
              <Send size={14} />{sending ? '...' : 'Send'}
            </button>
          </div>

          {error && <p className="text-xs mt-1.5 text-center" style={{ color: '#ef4444' }}>{error}</p>}
        </div>
      </div>

      <ExtensionRequiredModal open={showSessionGate} onClose={() => setShowSessionGate(false)} action="trade" />

      {/* Quantity picker for your items */}
      {pickerGroup && (
        <QuantityPickerModal
          group={pickerGroup}
          onConfirm={handleGroupConfirm}
          onClose={() => setPickerGroup(null)}
        />
      )}

      {/* Quantity picker for partner items — adapt PartnerGroup to ItemGroup format */}
      {partnerPickerGroup && (
        <QuantityPickerModal
          group={{
            marketHashName: partnerPickerGroup.marketHashName,
            count: partnerPickerGroup.count,
            selectedCount: partnerPickerGroup.selectedCount,
            representative: {
              asset_id: partnerPickerGroup.representative.assetId,
              market_hash_name: partnerPickerGroup.representative.marketHashName || '',
              icon_url: partnerPickerGroup.representative.iconUrl || '',
              prices: { steam: (partnerPickerGroup.representative.priceCents || 0) / 100 },
              float_value: partnerPickerGroup.representative.floatValue ?? null,
              wear: null, rarity: null, rarity_color: null, tradable: true, trade_ban_until: null,
              inspect_link: null, paint_seed: null, paint_index: null, stickers: null, charms: null,
              account_steam_id: '', account_id: 0, account_name: '', account_avatar_url: '',
              sticker_value: null, fade_percentage: null, collection: null, min_float: null, max_float: null,
            } as InventoryItem,
            items: partnerPickerGroup.items.map((i) => ({
              asset_id: i.assetId,
              market_hash_name: i.marketHashName || '',
              icon_url: i.iconUrl || '',
              prices: { steam: (i.priceCents || 0) / 100 },
              float_value: i.floatValue ?? null,
              wear: null, rarity: null, rarity_color: null, tradable: true, trade_ban_until: null,
              inspect_link: null, paint_seed: null, paint_index: null, stickers: null, charms: null,
              account_steam_id: '', account_id: 0, account_name: '', account_avatar_url: '',
              sticker_value: null, fade_percentage: null, collection: null, min_float: null, max_float: null,
            } as InventoryItem)),
          }}
          onConfirm={handlePartnerGroupConfirm}
          onClose={() => setPartnerPickerGroup(null)}
        />
      )}
    </div>
  );
}

// ─── Trade Item Card ──────────────────────────────────────────────────

function TradeItemCard({ id, name, icon, price, wear, floatValue, rarity, selected, stackCount, selectedCount, onToggle, formatPrice, accent }: {
  id: string; name: string; icon: string; price: number; wear: string | null; floatValue: number | null;
  rarity: string | null; selected: boolean; stackCount?: number; selectedCount?: number;
  onToggle: () => void; formatPrice: (v: number) => string; accent: 'red' | 'green';
}) {
  const ws = getWearShort(wear);
  const isST = name.includes('StatTrak');
  const wc = isST ? '#cf6a32' : (ws && WC[ws]) || '#818cf8';
  const fv = floatValue != null ? Number(floatValue) : null;
  const shortName = name.replace(/^(StatTrak™ |Souvenir |★ )/, '').replace(/^[^|]+\| /, '').trim();
  const iconUrl = getItemIconUrl(icon);
  const rc = (rarity && RARITY_COLORS[rarity]) || '#64748B';

  const borderColor = accent === 'red' ? 'rgba(239,68,68,0.5)' : 'rgba(74,222,128,0.5)';
  const bgColor = accent === 'red' ? 'rgba(239,68,68,0.06)' : 'rgba(74,222,128,0.06)';

  return (
    <button
      onClick={onToggle}
      className="relative rounded-md overflow-hidden transition-all text-left flex flex-col"
      style={{
        background: selected ? bgColor : '#1a1d25',
        border: selected ? `1.5px solid ${borderColor}` : '1.5px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Price + wear */}
      <div style={{ padding: '3px 4px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <span style={{ color: '#eab308', fontSize: 9, fontWeight: 800, letterSpacing: '-0.3px' }}>
          {price > 0 ? formatPrice(price) : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {isST && <span style={{ fontSize: 7, fontWeight: 800, color: '#f97316' }}>ST</span>}
          {ws && <span style={{ fontSize: 7, fontWeight: 700, color: wc }}>{ws}</span>}
        </div>
      </div>

      {/* Image */}
      <div style={{ padding: '2px 4px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, position: 'relative' }}>
        {iconUrl && <img src={iconUrl} alt="" className="max-w-full max-h-full object-contain" />}
        {/* Stack count badge */}
        {stackCount && stackCount > 1 && (
          <span className="absolute top-0 right-0 rounded-full flex items-center justify-center font-bold"
            style={{ fontSize: 8, minWidth: 16, height: 16, padding: '0 4px', background: selectedCount && selectedCount > 0 ? (accent === 'red' ? '#ef4444' : '#16a34a') : '#334155', color: '#fff' }}>
            {selectedCount && selectedCount > 0 ? `${selectedCount}/${stackCount}` : `x${stackCount}`}
          </span>
        )}
      </div>

      {/* Name + float */}
      <div style={{ padding: '1px 4px 2px' }}>
        <p className="truncate" style={{ fontSize: 8, color: '#94a3b8', lineHeight: 1.2 }}>{shortName}</p>
        {fv != null && <p style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>{fv.toFixed(6)}</p>}
      </div>

      {/* Rarity bar */}
      <div style={{ height: 2, background: rc, opacity: 0.7 }} />
    </button>
  );
}

// ─── Account Selector ─────────────────────────────────────────────────

function AccountSelector({ accounts, selectedId, onChange }: {
  accounts: { id: number; displayName: string; avatarUrl: string; isActive: boolean }[];
  selectedId?: number;
  onChange: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = accounts.find((a) => a.id === selectedId) || accounts[0];

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] transition-colors"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {selected?.avatarUrl && <img src={selected.avatarUrl} alt="" className="w-4 h-4 rounded-full" />}
        <span style={{ color: '#94a3b8' }} className="max-w-[80px] truncate">{selected?.displayName}</span>
        <ChevronDown size={10} style={{ color: '#475569' }} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 rounded-lg overflow-hidden shadow-xl py-1" style={{ background: '#1a1d25', border: '1px solid #272b36', minWidth: 160 }}>
          {accounts.map((acc) => (
            <button key={acc.id} onClick={() => { onChange(acc.id); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] transition-colors"
              style={{ color: acc.id === selectedId ? '#818cf8' : '#94a3b8', background: acc.id === selectedId ? 'rgba(99,102,241,0.08)' : 'transparent' }}>
              {acc.avatarUrl && <img src={acc.avatarUrl} alt="" className="w-5 h-5 rounded-full" />}
              <span className="truncate">{acc.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Friend Row ───────────────────────────────────────────────────────

function FriendRow({ friend, onSelect }: { friend: SteamFriend; onSelect: (id: string, name: string, avatar: string) => void }) {
  const online = friend.onlineStatus !== 'offline';
  return (
    <button onClick={() => onSelect(friend.steamId, friend.personaName || friend.steamId, friend.avatarUrl || '')}
      className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl hover:bg-surface-light transition-colors">
      <div className="relative">
        {friend.avatarUrl ? <img src={friend.avatarUrl} alt="" className="w-10 h-10 rounded-full" /> : <div className="w-10 h-10 rounded-full bg-surface-light" />}
        <span className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background', online ? 'bg-profit' : 'bg-muted')} />
      </div>
      <span className="text-sm font-medium truncate flex-1 text-left">{friend.personaName || friend.steamId}</span>
      <Send size={14} className="text-muted" />
    </button>
  );
}
