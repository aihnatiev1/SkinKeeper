'use client';

import { useAuthStore } from '@/lib/store';
import { useAccounts, useSwitchAccount } from '@/lib/hooks';
import { ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export function Header({ title }: { title: string }) {
  const user = useAuthStore((s) => s.user);
  const { data: accounts } = useAccounts();
  const switchAccount = useSwitchAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const activeAccount = accounts?.find((a) => a.isActive);

  return (
    <header className="flex items-center justify-between h-16 px-4 lg:px-6 border-b border-border/30 glass-strong sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {/* Spacer for mobile menu button */}
        <div className="w-8 lg:hidden" />
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      </div>

      {/* Account switcher */}
      {accounts && accounts.length > 1 && (
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass hover:bg-surface-light transition-all text-sm"
          >
            {activeAccount?.avatarUrl && (
              <img
                src={activeAccount.avatarUrl}
                alt=""
                className="w-6 h-6 rounded-full ring-2 ring-primary/20"
              />
            )}
            <span className="hidden sm:inline">{activeAccount?.displayName || 'Select account'}</span>
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-60 glass-strong rounded-xl shadow-2xl z-50 py-1 border border-border/50">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => {
                    switchAccount.mutate(acc.id);
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-surface-light transition-colors"
                >
                  {acc.avatarUrl && (
                    <img src={acc.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                  )}
                  <span className="flex-1 text-left truncate">{acc.displayName}</span>
                  {acc.isActive && (
                    <span className="w-2 h-2 rounded-full bg-profit animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
