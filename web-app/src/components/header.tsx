'use client';

import { useAuthStore } from '@/lib/store';
import { useAccounts, useSwitchAccount } from '@/lib/hooks';
import { ChevronDown, RefreshCw } from 'lucide-react';
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
    <header className="flex items-center justify-between h-16 px-6 border-b border-border bg-surface/50 backdrop-blur-sm">
      <h1 className="text-xl font-semibold">{title}</h1>

      {/* Account switcher */}
      {accounts && accounts.length > 1 && (
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-light hover:bg-border transition-colors text-sm"
          >
            {activeAccount?.avatarUrl && (
              <img
                src={activeAccount.avatarUrl}
                alt=""
                className="w-5 h-5 rounded-full"
              />
            )}
            <span>{activeAccount?.displayName || 'Select account'}</span>
            <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-surface border border-border rounded-lg shadow-xl z-50 py-1">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => {
                    switchAccount.mutate(acc.id);
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2 text-sm hover:bg-surface-light transition-colors"
                >
                  {acc.avatarUrl && (
                    <img src={acc.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                  )}
                  <span className="flex-1 text-left truncate">{acc.displayName}</span>
                  {acc.isActive && (
                    <span className="w-2 h-2 rounded-full bg-profit" />
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
