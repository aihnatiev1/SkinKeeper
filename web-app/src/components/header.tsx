'use client';

import { useAuthStore, useUIStore } from '@/lib/store';
import { useAccounts } from '@/lib/hooks';
import { ChevronDown, Users } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export function Header({ title }: { title: string }) {
  const user = useAuthStore((s) => s.user);
  const { data: accounts } = useAccounts();
  const { accountScope, setAccountScope } = useUIStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const scopedAccount = accounts?.find((a) => a.id === accountScope);
  const isAllScope = accountScope === null;

  return (
    <header className="flex items-center justify-between h-16 px-4 lg:px-6 border-b border-border/30 glass-strong sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {/* Spacer for mobile menu button */}
        <div className="w-8 lg:hidden" />
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      </div>

      {/* Account scope switcher */}
      {accounts && accounts.length > 1 && (
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass hover:bg-surface-light transition-all text-sm"
          >
            {isAllScope ? (
              <div className="relative w-6 h-6">
                {accounts.slice(0, 2).map((acc, i) => (
                  <img
                    key={acc.id}
                    src={acc.avatarUrl}
                    alt=""
                    className={`w-5 h-5 rounded-full ring-2 ring-surface absolute ${i === 0 ? 'top-0 left-0 z-10' : 'bottom-0 right-0'}`}
                  />
                ))}
              </div>
            ) : (
              scopedAccount?.avatarUrl && (
                <img
                  src={scopedAccount.avatarUrl}
                  alt=""
                  className="w-6 h-6 rounded-full ring-2 ring-primary/20"
                />
              )
            )}
            <span className="hidden sm:inline">
              {isAllScope ? 'All accounts' : scopedAccount?.displayName || 'Select account'}
            </span>
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-60 glass-strong rounded-xl shadow-2xl z-50 py-1 border border-border/50">
              {/* All accounts option */}
              <button
                onClick={() => {
                  setAccountScope(null);
                  setOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-surface-light transition-colors"
              >
                <Users size={18} className="text-muted shrink-0" />
                <span className="flex-1 text-left">All accounts</span>
                {isAllScope && (
                  <span className="w-2 h-2 rounded-full bg-profit animate-pulse" />
                )}
              </button>

              <div className="h-px bg-border/30 mx-3 my-1" />

              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => {
                    setAccountScope(acc.id);
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-surface-light transition-colors"
                >
                  {acc.avatarUrl && (
                    <img src={acc.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                  )}
                  <span className="flex-1 text-left truncate">{acc.displayName}</span>
                  {accountScope === acc.id && (
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
