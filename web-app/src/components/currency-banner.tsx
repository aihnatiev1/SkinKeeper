'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, Check, X } from 'lucide-react';
import { useWalletInfo, useSteamCurrencies, useSetWalletCurrency } from '@/lib/hooks';
import { cn } from '@/lib/utils';

export function CurrencyBanner() {
  const { data: walletInfo, isLoading } = useWalletInfo();
  const { data: currencies } = useSteamCurrencies();
  const setWalletCurrency = useSetWalletCurrency();

  const [showPicker, setShowPicker] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Don't show if: loading, manually set, or user dismissed
  if (isLoading || dismissed) return null;
  if (walletInfo?.source === 'manual') return null;

  const handleSelect = (currencyId: number) => {
    setWalletCurrency.mutate(currencyId, {
      onSuccess: () => setShowPicker(false),
    });
  };

  return (
    <div className="mx-6 mt-4">
      <div className="flex items-center gap-3 px-4 py-3 bg-warning/10 border border-warning/20 rounded-lg text-sm">
        <AlertTriangle size={16} className="text-warning shrink-0" />
        <div className="flex-1">
          <span className="text-foreground">
            Steam wallet currency: <strong>{walletInfo?.code ?? 'USD'}</strong>
            {walletInfo?.source === 'auto' && ' (auto-detected)'}
            {walletInfo?.source === 'default' && ' (not detected)'}
          </span>
          <span className="text-muted ml-1">
            — set it manually for accurate sell pricing
          </span>
        </div>

        {!showPicker ? (
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1 px-3 py-1 bg-warning/20 hover:bg-warning/30 text-warning rounded-md text-xs font-medium transition-colors"
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
        <div className="mt-2 p-3 bg-surface border border-border rounded-lg">
          <div className="flex flex-wrap gap-2">
            {currencies.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelect(c.id)}
                disabled={setWalletCurrency.isPending}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors',
                  walletInfo?.currencyId === c.id
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'border-border text-muted hover:text-foreground hover:border-foreground/30'
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
