'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Check } from 'lucide-react';
import { CURRENCY_SYMBOLS } from '@/lib/constants';
import { useUIStore } from '@/lib/store';

const STORAGE_KEY = 'sk_currency_selected';
const ONBOARDING_KEY = 'sk_onboarding_complete';

// Most popular Steam currencies first
const TOP_CURRENCIES = ['USD', 'EUR', 'GBP', 'RUB', 'UAH', 'PLN', 'BRL', 'TRY', 'CNY', 'JPY'];

export function CurrencySelectModal() {
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const setCurrency = useUIStore((s) => s.setCurrency);

  useEffect(() => {
    // Only show after onboarding is complete and currency hasn't been selected yet
    const checkVisibility = () => {
      const onboardingDone = localStorage.getItem(ONBOARDING_KEY);
      const currencySelected = localStorage.getItem(STORAGE_KEY);
      if (onboardingDone && !currencySelected) {
        setVisible(true);
      }
    };

    // Check immediately
    checkVisibility();

    // Also listen for onboarding completion (storage event from same page)
    const handleStorage = () => checkVisibility();
    window.addEventListener('storage', handleStorage);

    // Poll briefly in case onboarding just finished in the same tab
    const interval = setInterval(checkVisibility, 500);
    const timeout = setTimeout(() => clearInterval(interval), 10000);

    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  const handleSelect = (code: string) => {
    setSelected(code);
  };

  const handleConfirm = () => {
    if (!selected) return;
    setCurrency(selected);
    localStorage.setItem(STORAGE_KEY, selected);
    setVisible(false);
  };

  if (!visible) return null;

  // Sort: top currencies first, then the rest alphabetically
  const sortedCurrencies = Object.entries(CURRENCY_SYMBOLS).sort(([a], [b]) => {
    const aIdx = TOP_CURRENCIES.indexOf(a);
    const bIdx = TOP_CURRENCIES.indexOf(b);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.localeCompare(b);
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md glass-strong rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 pb-3 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Globe size={28} className="text-primary" />
              </div>
            </div>
            <h2 className="text-lg font-bold mb-2">Select your Steam currency</h2>
            <p className="text-sm text-muted leading-relaxed">
              Choose the currency set in your Steam client for more accurate price display.
              You can change this later in <span className="text-foreground font-medium">Settings</span>.
            </p>
          </div>

          {/* Currency grid */}
          <div className="px-6 pb-2 max-h-[300px] overflow-y-auto scrollbar-thin">
            <div className="grid grid-cols-3 gap-2">
              {sortedCurrencies.map(([code, symbol]) => (
                <button
                  key={code}
                  onClick={() => handleSelect(code)}
                  className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    selected === code
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
                      : 'glass text-muted hover:text-foreground hover:bg-surface-light'
                  }`}
                >
                  <span className="text-base">{symbol}</span>
                  <span>{code}</span>
                  {selected === code && (
                    <Check size={14} className="absolute top-1.5 right-1.5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 pt-4">
            <button
              onClick={handleConfirm}
              disabled={!selected}
              className="w-full px-5 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {selected ? `Continue with ${selected}` : 'Select a currency'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
