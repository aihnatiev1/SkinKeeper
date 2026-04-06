'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X, LayoutDashboard, Backpack, ArrowLeftRight, Users, Crown } from 'lucide-react';
import Link from 'next/link';

const STORAGE_KEY = 'sk_onboarding_complete';

const SLIDES = [
  {
    icon: <LayoutDashboard size={48} className="text-primary" />,
    title: 'Portfolio & P/L Dashboard',
    description: 'Track your total value and profit across all your skins in real time. See 24h and 7d changes at a glance.',
    color: 'from-primary/20 to-primary/5',
  },
  {
    icon: <Backpack size={48} className="text-accent" />,
    title: 'Full Inventory Control',
    description: 'Float values, doppler phases, sticker premiums, wear badges. All the data you need on every item.',
    color: 'from-accent/20 to-accent/5',
  },
  {
    icon: <ArrowLeftRight size={48} className="text-profit" />,
    title: 'Easy Trade Offers',
    description: 'Send and accept trades, transfer items between your accounts, and sell on Steam Market — all from here.',
    color: 'from-profit/20 to-profit/5',
  },
  {
    icon: <Users size={48} className="text-warning" />,
    title: 'Multiple Steam Accounts',
    description: 'Switch between accounts instantly. See combined portfolio or filter by account. All inventory in one place.',
    color: 'from-warning/20 to-warning/5',
  },
  {
    icon: <Crown size={48} className="text-warning" />,
    title: 'Unlock PRO',
    description: 'Multi-source prices, profit tracking, bulk sell, CSV export, 20 alerts, named portfolios. Available on all platforms.',
    color: 'from-warning/20 to-orange-500/5',
    isPremium: true,
  },
];

export function Onboarding() {
  const [visible, setVisible] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, '1');
  };

  const next = () => {
    if (page < SLIDES.length - 1) setPage(page + 1);
    else dismiss();
  };

  const prev = () => {
    if (page > 0) setPage(page - 1);
  };

  if (!visible) return null;

  const slide = SLIDES[page];
  const isLast = page === SLIDES.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      >
        <motion.div
          key={page}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md glass-strong rounded-2xl overflow-hidden"
        >
          {/* Skip button */}
          <button
            onClick={dismiss}
            className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition-colors"
          >
            <X size={18} />
          </button>

          {/* Content */}
          <div className={`p-8 pt-12 text-center bg-gradient-to-b ${slide.color}`}>
            <div className="flex justify-center mb-6">
              {slide.icon}
            </div>
            <h2 className="text-xl font-bold mb-3">{slide.title}</h2>
            <p className="text-sm text-muted leading-relaxed">{slide.description}</p>
          </div>

          {/* Footer */}
          <div className="p-6 pt-4">
            {/* Dots */}
            <div className="flex justify-center gap-1.5 mb-5">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === page ? 'bg-primary w-6' : 'bg-muted/30 hover:bg-muted/50'
                  }`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-3">
              {page > 0 ? (
                <button
                  onClick={prev}
                  className="flex items-center gap-1 px-4 py-2.5 glass rounded-xl text-sm font-medium hover:bg-surface-light transition-colors"
                >
                  <ChevronLeft size={14} /> Back
                </button>
              ) : (
                <button
                  onClick={dismiss}
                  className="px-4 py-2.5 text-sm text-muted hover:text-foreground transition-colors"
                >
                  Skip
                </button>
              )}

              <div className="flex-1" />

              {slide.isPremium ? (
                <div className="flex gap-2">
                  <button
                    onClick={dismiss}
                    className="px-4 py-2.5 glass rounded-xl text-sm font-medium hover:bg-surface-light transition-colors"
                  >
                    Maybe Later
                  </button>
                  <Link
                    href="/settings#premium"
                    onClick={dismiss}
                    className="px-5 py-2.5 bg-gradient-to-r from-warning to-orange-500 text-white rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-warning/25 transition-all"
                  >
                    Try PRO Free
                  </Link>
                </div>
              ) : (
                <button
                  onClick={next}
                  className="flex items-center gap-1 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25"
                >
                  {isLast ? 'Get Started' : 'Next'} <ChevronRight size={14} />
                </button>
              )}
            </div>

            {/* Ecosystem hint */}
            <p className="text-center text-[10px] text-muted mt-4">
              Also available on iOS, Android, Chrome Extension &amp; Desktop
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
