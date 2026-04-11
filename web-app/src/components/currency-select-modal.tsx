'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';
import { CURRENCY_SYMBOLS } from '@/lib/constants';
import { useUIStore } from '@/lib/store';

const STORAGE_KEY = 'sk_currency_selected';
const ONBOARDING_KEY = 'sk_onboarding_complete';

// Top currencies shown as featured cards
const FEATURED = ['USD', 'EUR', 'GBP', 'UAH', 'PLN', 'TRY'];

// Currency display names
const CURRENCY_NAMES: Record<string, string> = {
  USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', RUB: 'Russian Ruble',
  UAH: 'Ukrainian Hryvnia', PLN: 'Polish Zloty', BRL: 'Brazilian Real',
  TRY: 'Turkish Lira', CNY: 'Chinese Yuan', JPY: 'Japanese Yen',
  AED: 'UAE Dirham', ARS: 'Argentine Peso', AUD: 'Australian Dollar',
  BGN: 'Bulgarian Lev', CAD: 'Canadian Dollar', CHF: 'Swiss Franc',
  CLP: 'Chilean Peso', COP: 'Colombian Peso', CRC: 'Costa Rican Colon',
  CZK: 'Czech Koruna', DKK: 'Danish Krone', HKD: 'Hong Kong Dollar',
  HUF: 'Hungarian Forint', IDR: 'Indonesian Rupiah', ILS: 'Israeli Shekel',
  INR: 'Indian Rupee', KRW: 'South Korean Won', KWD: 'Kuwaiti Dinar',
  KZT: 'Kazakh Tenge', MXN: 'Mexican Peso', MYR: 'Malaysian Ringgit',
  NOK: 'Norwegian Krone', NZD: 'New Zealand Dollar', PEN: 'Peruvian Sol',
  PHP: 'Philippine Peso', QAR: 'Qatari Riyal', RON: 'Romanian Leu',
  SAR: 'Saudi Riyal', SEK: 'Swedish Krona', SGD: 'Singapore Dollar',
  THB: 'Thai Baht', TWD: 'Taiwan Dollar', UYU: 'Uruguayan Peso',
  VND: 'Vietnamese Dong', ZAR: 'South African Rand',
};

// Currency flag emojis (country that primarily uses this currency)
const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', RUB: '🇷🇺', UAH: '🇺🇦', PLN: '🇵🇱',
  BRL: '🇧🇷', TRY: '🇹🇷', CNY: '🇨🇳', JPY: '🇯🇵', AED: '🇦🇪', ARS: '🇦🇷',
  AUD: '🇦🇺', BGN: '🇧🇬', CAD: '🇨🇦', CHF: '🇨🇭', CLP: '🇨🇱', COP: '🇨🇴',
  CRC: '🇨🇷', CZK: '🇨🇿', DKK: '🇩🇰', HKD: '🇭🇰', HUF: '🇭🇺', IDR: '🇮🇩',
  ILS: '🇮🇱', INR: '🇮🇳', KRW: '🇰🇷', KWD: '🇰🇼', KZT: '🇰🇿', MXN: '🇲🇽',
  MYR: '🇲🇾', NOK: '🇳🇴', NZD: '🇳🇿', PEN: '🇵🇪', PHP: '🇵🇭', QAR: '🇶🇦',
  RON: '🇷🇴', SAR: '🇸🇦', SEK: '🇸🇪', SGD: '🇸🇬', THB: '🇹🇭', TWD: '🇹🇼',
  UYU: '🇺🇾', VND: '🇻🇳', ZAR: '🇿🇦',
};

export function CurrencySelectModal() {
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const setCurrency = useUIStore((s) => s.setCurrency);

  useEffect(() => {
    const checkVisibility = () => {
      const onboardingDone = localStorage.getItem(ONBOARDING_KEY);
      const currencySelected = localStorage.getItem(STORAGE_KEY);
      if (onboardingDone && !currencySelected) {
        setVisible(true);
      }
    };

    checkVisibility();

    const handleStorage = () => checkVisibility();
    window.addEventListener('storage', handleStorage);

    const interval = setInterval(checkVisibility, 500);
    const timeout = setTimeout(() => clearInterval(interval), 10000);

    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  const handleConfirm = (code: string) => {
    setCurrency(code);
    localStorage.setItem(STORAGE_KEY, code);
    setVisible(false);
  };

  // All currencies sorted: featured first, then alphabetical
  const allCurrencies = useMemo(() => {
    return Object.entries(CURRENCY_SYMBOLS).sort(([a], [b]) => {
      const ai = FEATURED.indexOf(a);
      const bi = FEATURED.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, []);

  const filteredCurrencies = useMemo(() => {
    if (!search) return allCurrencies.filter(([code]) => !FEATURED.includes(code));
    const q = search.toLowerCase();
    return allCurrencies.filter(([code]) => {
      const name = CURRENCY_NAMES[code] || '';
      return code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    });
  }, [allCurrencies, search]);

  if (!visible) return null;

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
          className="relative w-full max-w-md overflow-hidden"
          style={{ background: '#13151c', borderRadius: 20, border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Header */}
          <div className="p-6 pb-4 text-center">
            <h2 className="text-xl font-bold mb-1.5">Choose your currency</h2>
            <p className="text-xs text-white/40">
              Match your Steam Wallet currency for accurate prices
            </p>
          </div>

          {/* Featured currencies */}
          <div className="px-5 pb-4">
            <div className="grid grid-cols-3 gap-2">
              {FEATURED.map((code) => {
                const symbol = CURRENCY_SYMBOLS[code] || code;
                const flag = CURRENCY_FLAGS[code] || '';
                const isSelected = selected === code;
                return (
                  <button
                    key={code}
                    onClick={() => setSelected(code)}
                    onDoubleClick={() => handleConfirm(code)}
                    className="relative flex flex-col items-center gap-1 py-3 rounded-xl transition-all"
                    style={{
                      background: isSelected ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                      border: isSelected ? '1.5px solid rgba(99,102,241,0.5)' : '1.5px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <span className="text-xl leading-none">{flag}</span>
                    <span className="text-sm font-bold" style={{ color: isSelected ? '#818cf8' : '#e2e8f0' }}>{code}</span>
                    <span className="text-[10px]" style={{ color: '#64748b' }}>{symbol}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search + other currencies */}
          <div className="px-5 pb-2">
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#475569' }} />
              <input
                type="text"
                placeholder="Search currency..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-lg text-xs focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0' }}
              />
            </div>
          </div>

          <div className="px-5 pb-4 max-h-[200px] overflow-y-auto scrollbar-thin">
            {filteredCurrencies.map(([code, symbol]) => {
              const flag = CURRENCY_FLAGS[code] || '';
              const name = CURRENCY_NAMES[code] || code;
              const isSelected = selected === code;
              return (
                <button
                  key={code}
                  onClick={() => setSelected(code)}
                  onDoubleClick={() => handleConfirm(code)}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors"
                  style={{
                    background: isSelected ? 'rgba(99,102,241,0.1)' : 'transparent',
                  }}
                >
                  <span className="text-base leading-none shrink-0">{flag}</span>
                  <div className="flex-1 text-left min-w-0">
                    <span className="text-sm font-medium" style={{ color: isSelected ? '#818cf8' : '#cbd5e1' }}>{code}</span>
                    <span className="text-[11px] ml-2" style={{ color: '#475569' }}>{name}</span>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: '#475569' }}>{symbol}</span>
                </button>
              );
            })}
            {filteredCurrencies.length === 0 && (
              <p className="text-center text-xs py-4" style={{ color: '#475569' }}>No currencies found</p>
            )}
          </div>

          {/* Confirm button */}
          <div className="p-5 pt-2">
            <button
              onClick={() => selected && handleConfirm(selected)}
              disabled={!selected}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-30"
              style={{ background: selected ? '#6366f1' : '#1e293b', color: '#fff' }}
            >
              {selected ? `Continue with ${selected}` : 'Select a currency'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
