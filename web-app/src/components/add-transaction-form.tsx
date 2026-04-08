'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Search, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface AddTransactionFormProps {
  portfolioId: number;
  onDone: () => void;
}

interface SearchResult {
  marketHashName: string;
  iconUrl?: string;
}

const SOURCES = ['Other', 'Buff', 'CSFloat', 'Skinport', 'Trade', 'Drop'];
const SOURCE_MAP: Record<string, string> = { Other: 'manual', Buff: 'buff163', CSFloat: 'csfloat', Skinport: 'skinport', Trade: 'trade', Drop: 'drop' };

export function AddTransactionForm({ portfolioId, onDone }: AddTransactionFormProps) {
  const qc = useQueryClient();
  const [type, setType] = useState<'buy' | 'sell'>('buy');
  const [itemName, setItemName] = useState('');
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [source, setSource] = useState('Other');
  const [saving, setSaving] = useState(false);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (itemName.length < 2) { setResults([]); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const d = await api.get<{ items: SearchResult[] }>(`/transactions/search-items?q=${encodeURIComponent(itemName)}`);
        setResults(d?.items ?? []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [itemName]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShowDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const pick = (r: SearchResult) => { setItemName(r.marketHashName); setIconUrl(r.iconUrl || null); setShowDrop(false); };

  const handleSave = async () => {
    const name = itemName.trim();
    const p = parseFloat(price);
    const q = parseInt(qty) || 1;
    if (!name) { toast.error('Enter item name'); return; }
    if (!p || p <= 0) { toast.error('Enter price'); return; }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        marketHashName: name, priceCentsPerUnit: Math.round(p * 100),
        type, date: new Date().toISOString().slice(0, 10),
        source: SOURCE_MAP[source] || 'manual', portfolioId,
      };
      if (iconUrl) body.iconUrl = iconUrl;
      if (q > 1) body.quantity = q;
      await api.post(q > 1 ? '/transactions/manual/batch' : '/transactions/manual', body);
      toast.success('Added');
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      onDone();
    } catch (err: any) { toast.error(err?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div ref={ref} className="px-4 py-3 border-t border-border/30 space-y-2">
      {/* Row 1: type + search */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setType(type === 'buy' ? 'sell' : 'buy')}
          className={`shrink-0 px-2.5 py-2 rounded-lg text-[10px] font-bold transition-all ${
            type === 'buy' ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'
          }`}
        >
          {type === 'buy' ? 'BUY' : 'SELL'}
        </button>
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text" value={itemName} autoFocus
            onChange={(e) => { setItemName(e.target.value); setShowDrop(true); setIconUrl(null); }}
            onFocus={() => results.length > 0 && setShowDrop(true)}
            placeholder="Item name..."
            className="w-full pl-7 pr-2 py-2 glass rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searching && <Loader2 size={12} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted" />}
          {showDrop && results.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-0.5 z-30 glass-strong rounded-lg border border-border/50 max-h-[160px] overflow-y-auto">
              {results.slice(0, 8).map((r) => (
                <button key={r.marketHashName} onClick={() => pick(r)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-surface-light transition-colors">
                  {r.iconUrl && <img src={`https://community.akamai.steamstatic.com/economy/image/${r.iconUrl}/32x32`} alt="" className="w-4 h-4 object-contain shrink-0" />}
                  <span className="truncate">{r.marketHashName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: price + qty + source + save */}
      <div className="flex gap-1.5 items-center">
        <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
          placeholder="$ Price" step="0.01" min="0"
          className="w-24 px-2.5 py-2 glass rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
        <input type="number" value={qty} onChange={(e) => setQty(e.target.value)}
          placeholder="Qty" min="1"
          className="w-14 px-2 py-2 glass rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary" />
        <select value={source} onChange={(e) => setSource(e.target.value)}
          className="w-20 px-1.5 py-2 glass rounded-lg text-[10px] text-muted focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer">
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={handleSave} disabled={saving}
          className="ml-auto shrink-0 flex items-center gap-1 px-3 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50 active:scale-[0.98]">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Save
        </button>
      </div>
    </div>
  );
}
