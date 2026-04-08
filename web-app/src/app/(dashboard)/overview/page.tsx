'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Wallet, Package, DollarSign, TrendingUp, TrendingDown, Users } from 'lucide-react';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { CardSkeleton } from '@/components/loading';
import { useIsDesktop, useSteamStatus } from '@/lib/use-desktop';
import { useAccounts, usePortfolioSummary } from '@/lib/hooks';
import { useFormatPrice, useFormatPriceChange } from '@/lib/utils';
import { api } from '@/lib/api';
import { useQueries } from '@tanstack/react-query';
import type { PortfolioSummary, SteamAccount } from '@/lib/types';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function OverviewPage() {
  const formatPrice = useFormatPrice();
  const formatPriceChange = useFormatPriceChange();
  const router = useRouter();
  const desktop = useIsDesktop();
  const { status: steamStatus } = useSteamStatus();
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: summary, isLoading: summaryLoading } = usePortfolioSummary();

  useEffect(() => {
    if (desktop === false) {
      router.replace('/portfolio');
    }
  }, [desktop, router]);

  // Fetch per-account summaries in parallel
  const accountSummaries = useQueries({
    queries: (accounts ?? []).map((acc) => ({
      queryKey: ['portfolio', 'summary', acc.id],
      queryFn: () => api.get<PortfolioSummary>(`/portfolio/summary?accountId=${acc.id}`),
      enabled: !!accounts && accounts.length > 1,
    })),
  });

  if (!desktop) return null;

  const isLoading = summaryLoading || accountsLoading;
  const steamBalance = steamStatus.wallet?.balance ?? 0;
  const steamCurrency = steamStatus.wallet?.currency ?? 'USD';
  const itemsValue = summary?.total_value ?? 0;
  const netWorth = steamBalance + itemsValue;

  return (
    <div>
      <Header title="Overview" />
      <div className="p-4 lg:p-6 space-y-6">
        {/* Stat cards */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4"
        >
          {isLoading ? (
            <><CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton /></>
          ) : (
            <>
              <motion.div variants={fadeUp}>
                <StatCard
                  label="Steam Balance"
                  value={formatPrice(steamBalance, steamCurrency)}
                  icon={<Wallet size={18} />}
                />
              </motion.div>
              <motion.div variants={fadeUp}>
                <StatCard
                  label="Items Value"
                  value={formatPrice(itemsValue)}
                  icon={<DollarSign size={18} />}
                />
              </motion.div>
              <motion.div variants={fadeUp}>
                <StatCard
                  label="Net Worth"
                  value={formatPrice(netWorth)}
                  icon={<TrendingUp size={18} />}
                />
              </motion.div>
              <motion.div variants={fadeUp}>
                <StatCard
                  label="Items"
                  value={String(summary?.item_count ?? 0)}
                  icon={<Package size={18} />}
                />
              </motion.div>
            </>
          )}
        </motion.div>

        {/* 24h / 7d change */}
        {summary && (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-3 lg:gap-4"
          >
            <motion.div variants={fadeUp}>
              <StatCard
                label="24h Change"
                value={formatPriceChange(summary.change_24h, summary.change_24h_pct)}
                positive={summary.change_24h >= 0}
                icon={summary.change_24h >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCard
                label="7d Change"
                value={formatPriceChange(summary.change_7d, summary.change_7d_pct)}
                positive={summary.change_7d >= 0}
                icon={summary.change_7d >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              />
            </motion.div>
          </motion.div>
        )}

        {/* Accounts grid */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-muted" />
            <h2 className="text-lg font-semibold">Steam Accounts</h2>
            <span className="text-sm text-muted">({accounts?.length ?? 0})</span>
          </div>

          {accountsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <CardSkeleton /><CardSkeleton /><CardSkeleton />
            </div>
          ) : accounts && accounts.length > 0 ? (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            >
              {accounts.map((acc, i) => {
                const accSummary = accountSummaries[i]?.data;
                const accLoading = accountSummaries[i]?.isLoading;
                return (
                  <motion.div
                    key={acc.id}
                    variants={fadeUp}
                    className="glass rounded-xl p-4 border border-border/50 hover:border-primary/20 transition-all group"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {acc.avatarUrl ? (
                        <img
                          src={acc.avatarUrl}
                          alt={acc.displayName}
                          className="w-10 h-10 rounded-full ring-2 ring-border/50 group-hover:ring-primary/30 transition-all"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-surface-light flex items-center justify-center text-sm font-bold text-muted">
                          {acc.displayName?.[0] || '?'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{acc.displayName}</p>
                        <div className="flex items-center gap-1.5">
                          {acc.isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-profit animate-pulse" />
                          )}
                          <span className="text-xs text-muted">
                            {acc.isActive ? 'Active' : 'Linked'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {accounts.length > 1 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted">Value</span>
                        <span className="font-medium">
                          {accLoading ? (
                            <span className="text-muted">...</span>
                          ) : accSummary ? (
                            formatPrice(accSummary.total_value)
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </span>
                      </div>
                    )}

                    {accounts.length > 1 && accSummary && (
                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-muted">Items</span>
                        <span className="font-medium">{accSummary.item_count}</span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <div className="glass rounded-xl p-8 border border-border/50 text-center">
              <Users size={32} className="mx-auto mb-3 text-muted" />
              <p className="text-muted">No accounts linked yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
