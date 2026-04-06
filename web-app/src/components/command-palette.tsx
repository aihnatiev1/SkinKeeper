'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, LayoutDashboard, Backpack, Store, TrendingUp, Eye,
  ArrowLeftRight, History, Bell, Settings, Plus, Command,
} from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const navigate = (path: string) => {
    router.push(path);
    setOpen(false);
  };

  const items: CommandItem[] = useMemo(() => [
    { id: 'portfolio', label: 'Portfolio', description: 'Dashboard & P/L', icon: <LayoutDashboard size={16} />, action: () => navigate('/portfolio'), keywords: ['dashboard', 'value', 'pl', 'profit'] },
    { id: 'inventory', label: 'Inventory', description: 'Browse your items', icon: <Backpack size={16} />, action: () => navigate('/inventory'), keywords: ['items', 'skins', 'float'] },
    { id: 'market', label: 'Market', description: 'Listings & sell', icon: <Store size={16} />, action: () => navigate('/market'), keywords: ['sell', 'listing', 'steam market'] },
    { id: 'deals', label: 'Deals', description: 'Arbitrage opportunities', icon: <TrendingUp size={16} />, action: () => navigate('/deals'), keywords: ['arbitrage', 'profit', 'buff'] },
    { id: 'watchlist', label: 'Watchlist', description: 'Track item prices', icon: <Eye size={16} />, action: () => navigate('/watchlist'), keywords: ['track', 'watch', 'price'] },
    { id: 'trades', label: 'Trades', description: 'Trade offers', icon: <ArrowLeftRight size={16} />, action: () => navigate('/trades'), keywords: ['trade', 'offer', 'send'] },
    { id: 'new-trade', label: 'New Trade', description: 'Create trade offer', icon: <Plus size={16} />, action: () => navigate('/trades/new'), keywords: ['create', 'send'] },
    { id: 'transactions', label: 'Transactions', description: 'Buy & sell history', icon: <History size={16} />, action: () => navigate('/transactions'), keywords: ['history', 'buy', 'sell'] },
    { id: 'alerts', label: 'Alerts', description: 'Price alerts', icon: <Bell size={16} />, action: () => navigate('/alerts'), keywords: ['alert', 'notification', 'price'] },
    { id: 'settings', label: 'Settings', description: 'Account & preferences', icon: <Settings size={16} />, action: () => navigate('/settings'), keywords: ['account', 'premium', 'currency'] },
  ], []);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((item) =>
      item.label.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q) ||
      item.keywords?.some((k) => k.includes(q))
    );
  }, [query, items]);

  // Reset selection when filtered list changes
  useEffect(() => { setSelected(0); }, [filtered.length]);

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation inside palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && filtered[selected]) {
      filtered[selected].action();
    }
  };

  return (
    <>
      {/* Trigger hint in header area — optional, can be used elsewhere */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 400 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg mx-auto mt-[20vh] glass-strong rounded-2xl border border-border/50 overflow-hidden shadow-2xl"
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
                <Search size={18} className="text-muted shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search pages..."
                  className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted"
                />
                <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-surface-light text-[10px] text-muted font-mono">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-80 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted">No results</div>
                ) : (
                  filtered.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={item.action}
                      onMouseEnter={() => setSelected(i)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                        i === selected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-surface-light/50'
                      }`}
                    >
                      <span className={i === selected ? 'text-primary' : 'text-muted'}>{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{item.label}</span>
                        {item.description && (
                          <span className="text-xs text-muted ml-2">{item.description}</span>
                        )}
                      </div>
                      {i === selected && (
                        <kbd className="text-[10px] text-muted font-mono">Enter</kbd>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Footer hint */}
              <div className="px-4 py-2 border-t border-border/30 flex items-center gap-4 text-[10px] text-muted">
                <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-surface-light font-mono">↑↓</kbd> Navigate</span>
                <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-surface-light font-mono">Enter</kbd> Open</span>
                <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-surface-light font-mono">Esc</kbd> Close</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
