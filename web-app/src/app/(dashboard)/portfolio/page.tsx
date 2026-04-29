'use client';

import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { CardSkeleton } from '@/components/loading';
import { PremiumGate, ProBadge } from '@/components/premium-gate';
import { PortfolioSelector } from '@/components/portfolio-selector';
import { usePortfolioSummary, useProfitLoss, usePLItems } from '@/lib/hooks';
import { useFormatPrice, useFormatPriceChange } from '@/lib/utils';
import { useAuthStore, useUIStore } from '@/lib/store';
import { TrendingUp, TrendingDown, Package, DollarSign, Wallet, BarChart3, Download } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { EcosystemTip } from '@/components/ecosystem-tip';

function cents(v: number) { return v / 100; }

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function PortfolioPage() {
  const formatPrice = useFormatPrice();
  const formatPriceChange = useFormatPriceChange();
  const currency = useUIStore((s) => s.currency);
  const user = useAuthStore((s) => s.user);
  const { data: summary, isLoading: summaryLoading } = usePortfolioSummary();
  const { data: pl } = useProfitLoss();
  const { data: itemsData } = usePLItems();

  const history = useMemo(() => summary?.history ?? [], [summary]);

  return (
    <div>
      <Header title="Portfolio" />
      <div className="p-4 lg:p-6 space-y-6">
        <EcosystemTip
          id="portfolio-mobile-app"
          icon="📱"
          message="Your portfolio changes while you sleep. Get price alerts straight to your phone."
          ctaText="Get the App"
          ctaUrl="https://apps.apple.com/us/app/skinkeeper/id6760600231"
        />
        {/* Portfolio selector */}
        <PortfolioSelector />

        {/* Stats grid */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4"
        >
          {summaryLoading ? (
            <><CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton /></>
          ) : summary ? (
            <>
              <motion.div variants={fadeUp}>
                <StatCard
                  label="Total Value"
                  value={formatPrice(summary.total_value)}
                  icon={<DollarSign size={18} />}
                />
              </motion.div>
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
              <motion.div variants={fadeUp}>
                <StatCard
                  label="Items"
                  value={String(summary.item_count)}
                  icon={<Package size={18} />}
                />
              </motion.div>
            </>
          ) : null}
        </motion.div>

        {/* P&L Summary (premium) */}
        <PremiumGate feature="Profit & Loss Analytics">
          {pl && (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-4"
            >
              <motion.div variants={fadeUp}>
                <StatCard
                  label="Total Invested"
                  value={formatPrice(cents(pl.totalInvestedCents))}
                  icon={<Wallet size={18} />}
                />
              </motion.div>
              <motion.div variants={fadeUp}>
                <StatCard
                  label="Current Value"
                  value={formatPrice(cents(pl.totalCurrentValueCents))}
                  icon={<BarChart3 size={18} />}
                />
              </motion.div>
              <motion.div variants={fadeUp}>
                <StatCard
                  label="Profit / Loss"
                  value={formatPriceChange(cents(pl.totalProfitCents), pl.totalProfitPct)}
                  positive={pl.totalProfitCents >= 0}
                  icon={pl.totalProfitCents >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                />
              </motion.div>
            </motion.div>
          )}
        </PremiumGate>

        {/* Chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl border border-border/50 p-4 lg:p-6"
        >
          <h2 className="text-lg font-bold mb-4">Portfolio History</h2>
          <div className="h-48 sm:h-64 lg:h-80">
            {history.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                      <stop offset="50%" stopColor="#8B5CF6" stopOpacity={0.05} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,41,59,0.5)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#64748B"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis
                    stroke="#64748B"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatPrice(Number(v))}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(17,24,39,0.95)',
                      border: '1px solid rgba(30,41,59,0.5)',
                      borderRadius: '12px',
                      fontSize: '13px',
                      backdropFilter: 'blur(12px)',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                    }}
                    labelFormatter={(v) => new Date(String(v)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    formatter={(value) => [formatPrice(Number(value)), 'Value']}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#8B5CF6"
                    fill="url(#colorValue)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, stroke: '#8B5CF6', strokeWidth: 2, fill: '#111827' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted">
                <BarChart3 size={40} className="mb-3 opacity-30" />
                <p className="text-sm">No history data yet</p>
                <p className="text-xs mt-1">Check back after a day of tracking</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Items P&L Table (premium) */}
        {itemsData?.items && itemsData.items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-2xl border border-border/50 overflow-hidden"
          >
            <div className="px-4 lg:px-6 py-4 border-b border-border/30 flex items-center justify-between">
              <h2 className="text-lg font-bold">Items P&L</h2>
              <button
                onClick={() => {
                  if (!itemsData?.items) return;
                  const header = 'Item,Holding,Avg Cost,Current Price,P&L ($),P&L (%)\n';
                  const rows = itemsData.items.map((i) =>
                    `"${i.marketHashName}",${i.currentHolding},${(i.avgBuyPriceCents/100).toFixed(2)},${(i.currentPriceCents/100).toFixed(2)},${(i.totalProfitCents/100).toFixed(2)},${i.profitPct.toFixed(1)}`
                  ).join('\n');
                  const blob = new Blob([header + rows], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `skinkeeper-pl-${new Date().toISOString().slice(0,10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors"
              >
                <Download size={12} /> Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-left border-b border-border/30">
                    <th className="px-4 lg:px-6 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 font-medium text-right">Holding</th>
                    <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Avg Cost</th>
                    <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Current</th>
                    <th className="px-4 py-3 font-medium text-right">P&L</th>
                    <th className="px-4 py-3 font-medium text-right">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsData.items.map((item, i) => (
                    <motion.tr
                      key={item.marketHashName}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-border/20 hover:bg-surface-light/30 transition-colors"
                    >
                      <td className="px-4 lg:px-6 py-3">
                        <div className="flex items-center gap-3">
                          {item.iconUrl && (
                            <img
                              src={`https://community.akamai.steamstatic.com/economy/image/${item.iconUrl}/64x64`}
                              alt=""
                              className="w-8 h-8 object-contain"
                            />
                          )}
                          <span className="truncate max-w-[180px] lg:max-w-[250px]">{item.marketHashName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{item.currentHolding}</td>
                      <td className="px-4 py-3 text-right text-muted hidden sm:table-cell">{formatPrice(cents(item.avgBuyPriceCents))}</td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">{formatPrice(cents(item.currentPriceCents))}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${item.totalProfitCents >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {item.totalProfitCents >= 0 ? '+' : ''}{formatPrice(cents(item.totalProfitCents))}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${item.profitPct >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {item.profitPct >= 0 ? '+' : ''}{item.profitPct.toFixed(1)}%
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
