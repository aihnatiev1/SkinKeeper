'use client';

import { Header } from '@/components/header';
import { PageLoader } from '@/components/loading';
import { useInventory } from '@/lib/hooks';
import { api } from '@/lib/api';
import type { SteamFriend, TradeAccount, PartnerInventoryItem } from '@/lib/types';
import { formatPrice, getItemIconUrl, cn } from '@/lib/utils';
import { Search, Send, Users, ArrowLeftRight, ChevronLeft, Wifi, WifiOff } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type Step = 'pick-partner' | 'select-items';

export default function NewTradePage() {
  const router = useRouter();
  const { data: invData, isLoading: invLoading } = useInventory({ tradableOnly: true });
  const myItems = useMemo(() => invData?.pages.flatMap((p) => p.items) ?? [], [invData]);

  const [step, setStep] = useState<Step>('pick-partner');

  // Partner selection
  const [friends, setFriends] = useState<SteamFriend[]>([]);
  const [linkedAccounts, setLinkedAccounts] = useState<TradeAccount[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState('');
  const [friendSearch, setFriendSearch] = useState('');

  // Selected partner
  const [partner, setPartner] = useState<{ steamId: string; name: string; avatar: string } | null>(null);
  const [tradeToken, setTradeToken] = useState('');

  // Items
  const [partnerItems, setPartnerItems] = useState<PartnerInventoryItem[]>([]);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const [selectedGive, setSelectedGive] = useState<Set<string>>(new Set());
  const [selectedReceive, setSelectedReceive] = useState<Set<string>>(new Set());
  const [mySearch, setMySearch] = useState('');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Load friends & linked accounts
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

  const filteredMyItems = useMemo(() => {
    if (!myItems.length) return [];
    if (!mySearch) return myItems;
    const q = mySearch.toLowerCase();
    return myItems.filter((i: any) => i.market_hash_name.toLowerCase().includes(q));
  }, [myItems, mySearch]);

  const filteredPartnerItems = useMemo(() => {
    if (!partnerSearch) return partnerItems;
    const q = partnerSearch.toLowerCase();
    return partnerItems.filter((i) => (i.marketHashName || '').toLowerCase().includes(q));
  }, [partnerItems, partnerSearch]);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  };

  const giveValue = useMemo(() => {
    if (!myItems.length) return 0;
    return myItems
      .filter((i: any) => selectedGive.has(i.asset_id))
      .reduce((s: number, i: any) => s + (i.prices?.steam || i.prices?.skinport || 0), 0);
  }, [myItems, selectedGive]);

  const handleSend = async () => {
    if (!partner || (selectedGive.size === 0 && selectedReceive.size === 0)) return;
    setSending(true);
    setError('');
    try {
      await api.post('/trades/send', {
        partnerSteamId: partner.steamId,
        tradeToken: tradeToken.trim() || undefined,
        itemsToGive: Array.from(selectedGive),
        itemsToReceive: Array.from(selectedReceive),
        message: message.trim() || undefined,
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

  // ─── Step 1: Pick Partner ───────────────────────────────────────────
  if (step === 'pick-partner') {
    return (
      <div>
        <Header title="New Trade" />
        <div className="p-6 max-w-3xl mx-auto space-y-4">
          <h2 className="text-lg font-semibold">Choose trade partner</h2>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search friends..."
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 glass rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
            />
          </div>

          {friendsLoading ? (
            <PageLoader />
          ) : friendsError ? (
            <p className="text-sm text-loss text-center py-8">{friendsError}</p>
          ) : (
            <div className="space-y-4">
              {/* Linked accounts — snake_case from /trades/accounts */}
              {linkedAccounts.length > 1 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ArrowLeftRight size={12} /> Your Accounts
                  </h3>
                  <div className="space-y-1">
                    {linkedAccounts.map((acc) => (
                      <button
                        key={acc.id}
                        onClick={() => selectPartner(acc.steam_id, acc.display_name, acc.avatar_url)}
                        className="flex items-center gap-3 w-full px-4 py-3 glass rounded-xl hover:border-primary/20 transition-all"
                      >
                        {acc.avatar_url ? (
                          <img src={acc.avatar_url} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-surface-light" />
                        )}
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

              {/* Online friends */}
              {onlineFriends.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Wifi size={12} className="text-profit" /> Online — {onlineFriends.length}
                  </h3>
                  <div className="space-y-1">
                    {onlineFriends.map((f) => (
                      <FriendRow key={f.steamId} friend={f} onSelect={selectPartner} />
                    ))}
                  </div>
                </div>
              )}

              {/* Offline friends */}
              {offlineFriends.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <WifiOff size={12} /> Offline — {offlineFriends.length}
                  </h3>
                  <div className="space-y-1">
                    {offlineFriends.map((f) => (
                      <FriendRow key={f.steamId} friend={f} onSelect={selectPartner} />
                    ))}
                  </div>
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
    <div>
      <Header title="New Trade" />
      <div className="p-6 space-y-4">
        {/* Partner bar */}
        <div className="flex items-center gap-3 glass rounded-xl px-4 py-3">
          <button onClick={() => setStep('pick-partner')} className="text-muted hover:text-foreground transition-colors">
            <ChevronLeft size={20} />
          </button>
          {partner?.avatar && <img src={partner.avatar} alt="" className="w-8 h-8 rounded-full" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Trade with {partner?.name}</p>
            <p className="text-xs text-muted">{partner?.steamId}</p>
          </div>
        </div>

        {/* Items grids */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ItemGrid
            title="Your Items"
            search={mySearch}
            onSearchChange={setMySearch}
            loading={invLoading}
            items={filteredMyItems.map((i) => ({ id: i.asset_id, name: i.market_hash_name, icon: i.icon_url }))}
            selected={selectedGive}
            onToggle={(id) => setSelectedGive(toggle(selectedGive, id))}
            accent="primary"
          />
          <ItemGrid
            title={`${partner?.name || 'Partner'}'s Items`}
            search={partnerSearch}
            onSearchChange={setPartnerSearch}
            loading={partnerLoading}
            items={filteredPartnerItems.map((i) => ({ id: i.assetId, name: i.marketHashName || '', icon: i.iconUrl || '' }))}
            selected={selectedReceive}
            onToggle={(id) => setSelectedReceive(toggle(selectedReceive, id))}
            accent="profit"
          />
        </div>

        {/* Summary & send */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="text-center flex-1">
              <p className="text-xs text-muted mb-1">You give</p>
              <p className="text-lg font-semibold text-loss">{selectedGive.size > 0 ? formatPrice(giveValue) : '—'}</p>
              <p className="text-xs text-muted">{selectedGive.size} items</p>
            </div>
            <ArrowLeftRight size={24} className="text-muted shrink-0" />
            <div className="text-center flex-1">
              <p className="text-xs text-muted mb-1">You receive</p>
              <p className="text-lg font-semibold text-profit">{selectedReceive.size > 0 ? `${selectedReceive.size} items` : '—'}</p>
              <p className="text-xs text-muted">{selectedReceive.size} items</p>
            </div>
          </div>

          <input
            type="text"
            placeholder="Message (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-4 py-2.5 mb-4 glass rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
          />

          {error && <p className="text-sm text-loss mb-3">{error}</p>}

          <button
            onClick={handleSend}
            disabled={sending || (selectedGive.size === 0 && selectedReceive.size === 0)}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-bold transition-all hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 active:scale-[0.98]"
          >
            <Send size={16} />
            {sending ? 'Sending...' : 'Send Trade Offer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FriendRow({ friend, onSelect }: { friend: SteamFriend; onSelect: (id: string, name: string, avatar: string) => void }) {
  const online = friend.onlineStatus !== 'offline';
  return (
    <button
      onClick={() => onSelect(friend.steamId, friend.personaName || friend.steamId, friend.avatarUrl || '')}
      className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl hover:bg-surface-light transition-colors"
    >
      <div className="relative">
        {friend.avatarUrl ? (
          <img src={friend.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-surface-light" />
        )}
        <span className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background', online ? 'bg-profit' : 'bg-muted')} />
      </div>
      <span className="text-sm font-medium truncate flex-1 text-left">{friend.personaName || friend.steamId}</span>
      <Send size={14} className="text-muted" />
    </button>
  );
}

function ItemGrid({ title, search, onSearchChange, loading, items, selected, onToggle, accent }: {
  title: string; search: string; onSearchChange: (v: string) => void; loading: boolean;
  items: { id: string; name: string; icon: string }[]; selected: Set<string>; onToggle: (id: string) => void;
  accent: 'primary' | 'profit';
}) {
  const active = accent === 'primary' ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-profit bg-profit/10 ring-1 ring-profit';
  const hover = accent === 'primary' ? 'hover:border-primary/30' : 'hover:border-profit/30';

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold mb-2">{title}</h3>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="text" placeholder="Search..." value={search} onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-lg text-xs focus:outline-none focus:border-primary" />
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto p-2 grid grid-cols-4 sm:grid-cols-5 gap-1.5">
        {loading ? (
          <div className="col-span-full py-8"><PageLoader /></div>
        ) : items.length === 0 ? (
          <p className="col-span-full text-center text-xs text-muted py-8">No items</p>
        ) : (
          items.map((item) => {
            const iconUrl = getItemIconUrl(item.icon);
            return (
              <button key={item.id} onClick={() => onToggle(item.id)}
                className={cn('relative rounded-lg border p-1.5 transition-all', selected.has(item.id) ? active : `border-border ${hover}`)}>
                {iconUrl && <img src={iconUrl} alt={item.name} title={item.name} className="w-full h-10 object-contain" />}
                <p className="text-[9px] truncate mt-1 text-muted">{item.name}</p>
              </button>
            );
          })
        )}
      </div>
      {selected.size > 0 && (
        <div className="px-4 py-2 border-t border-border text-xs text-muted">{selected.size} selected</div>
      )}
    </div>
  );
}
