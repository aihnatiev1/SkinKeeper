'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, Check, X } from 'lucide-react';
import { useWalletInfo, useSteamCurrencies, useSetWalletCurrency } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function CurrencyBanner() {
  const { data: walletInfo, isLoading } = useWalletInfo();
  const { data: currencies } = useSteamCurrencies();
  const setWalletCurrency = useSetWalletCurrency();

  const [showPicker, setShowPicker] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || dismissed) return null;
  if (walletInfo?.source === 'manual') return null;

  const handleSelect = (currencyId: number) => {
    setWalletCurrency.mutate(currencyId, {
      onSuccess: () => {
        setShowPicker(false);
        toast.success('Currency updated');
      },
    });
  };

  return (
    <div className="mx-4 lg:mx-6 mt-4">
      <div className="flex items-center gap-3 px-4 py-3 glass border-warning/20 rounded-xl text-sm">
        <AlertTriangle size={16} className="text-warning shrink-0" />
        <div className="flex-1">
          <span className="text-foreground">
            Steam wallet currency: <strong>{walletInfo?.code ?? 'USD'}</strong>
            {walletInfo?.source === 'auto' && ' (auto-detected)'}
            {walletInfo?.source === 'default' && ' (not detected)'}
          </span>
          <span className="text-muted ml-1 hidden sm:inline">
            — set it manually for accurate sell pricing
          </span>
        </div>

        {!showPicker ? (
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-warning/10 hover:bg-warning/20 text-warning rounded-lg text-xs font-semibold transition-colors"
          >
            Set Currency <ChevronDown size={12} />
          </button>
        ) : (
          <button
            onClick={() => setShowPicker(false)}
            className="p-1 text-muted hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        )}

        <button
          onClick={() => setDismissed(true)}
          className="p-1 text-muted hover:text-foreground transition-colors"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      {showPicker && currencies && (
        <div className="mt-2 p-3 glass rounded-xl">
          <div className="flex flex-wrap gap-2">
            {currencies.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelect(c.id)}
                disabled={setWalletCurrency.isPending}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all font-medium',
                  walletInfo?.currencyId === c.id
                    ? 'bg-primary/10 ring-1 ring-primary/30 text-primary'
                    : 'glass text-muted hover:text-foreground'
                )}
              >
                {c.symbol} {c.code}
                {walletInfo?.currencyId === c.id && <Check size={12} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
