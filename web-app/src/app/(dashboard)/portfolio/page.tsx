'use client';

import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { CardSkeleton } from '@/components/loading';
import { usePortfolioSummary, useProfitLoss, usePLItems } from '@/lib/hooks';
import { formatPrice, formatPriceChange } from '@/lib/utils';
import { TrendingUp, TrendingDown, Package, DollarSign } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useMemo } from 'react';
import { motion } from 'framer-motion';

export default function PortfolioPage() {
  const { data: summary, isLoading: summaryLoading } = usePortfolioSummary();
  const { data: pl } = useProfitLoss();
  const { data: itemsData } = usePLItems();

  const history = useMemo(() => summary?.history ?? [], [summary]);

  return (
    <div>
      <Header title="Portfolio" />
      <div className="p-6 space-y-6">
        {/* Stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryLoading ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : summary ? (
            <>
              <StatCard
                label="Total Value"
                value={formatPrice(summary.total_value)}
                icon={<DollarSign size={18} />}
              />
              <StatCard
                label="24h Change"
                value={formatPriceChange(summary.change_24h, summary.change_24h_pct)}
                positive={summary.change_24h >= 0}
                icon={summary.change_24h >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              />
              <StatCard
                label="7d Change"
                value={formatPriceChange(summary.change_7d, summary.change_7d_pct)}
                positive={summary.change_7d >= 0}
                icon={summary.change_7d >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              />
              <StatCard
                label="Items"
                value={String(summary.item_count)}
                icon={<Package size={18} />}
              />
            </>
          ) : null}
        </div>

        {/* P&L Summary */}
        {pl && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              label="Total Invested"
              value={formatPrice(pl.total_invested)}
            />
            <StatCard
              label="Current Value"
              value={formatPrice(pl.total_current)}
            />
            <StatCard
              label="Profit / Loss"
              value={formatPriceChange(pl.total_pl, pl.total_pl_pct)}
              positive={pl.total_pl >= 0}
            />
          </div>
        )}

        {/* Chart — uses history from summary response */}
        <div className="bg-surface rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Portfolio History</h2>
          </div>
          <div className="h-64">
            {history.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis
                    dataKey="date"
                    stroke="#64748B"
                    fontSize={12}
                    tickFormatter={(v: string) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis stroke="#64748B" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: '#111827',
                      border: '1px solid #1E293B',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                    labelFormatter={(v: string) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Value']}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#8B5CF6"
                    fill="url(#colorValue)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted text-sm">
                No history data yet. Check back after a day of tracking.
              </div>
            )}
          </div>
        </div>

        {/* Items P&L Table */}
        {itemsData?.items && itemsData.items.length > 0 && (
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold">Items P&L</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-left border-b border-border">
                    <th className="px-6 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 font-medium text-right">Qty</th>
                    <th className="px-4 py-3 font-medium text-right">Avg Cost</th>
                    <th className="px-4 py-3 font-medium text-right">Current</th>
                    <th className="px-4 py-3 font-medium text-right">P&L</th>
                    <th className="px-4 py-3 font-medium text-right">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsData.items.map((item) => (
                    <motion.tr
                      key={item.market_hash_name}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b border-border/50 hover:bg-surface-light transition-colors"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          {item.icon_url && (
                            <img
                              src={`https://community.akamai.steamstatic.com/economy/image/${item.icon_url}/64x64`}
                              alt=""
                              className="w-8 h-8 object-contain"
                            />
                          )}
                          <span className="truncate max-w-[200px]">
                            {item.market_hash_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{item.quantity}</td>
                      <td className="px-4 py-3 text-right">{formatPrice(item.avg_cost)}</td>
                      <td className="px-4 py-3 text-right">{formatPrice(item.current_price)}</td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          item.pl >= 0 ? 'text-profit' : 'text-loss'
                        }`}
                      >
                        {item.pl >= 0 ? '+' : ''}{formatPrice(item.pl)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right ${
                          item.pl_pct >= 0 ? 'text-profit' : 'text-loss'
                        }`}
                      >
                        {item.pl_pct >= 0 ? '+' : ''}{item.pl_pct.toFixed(1)}%
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
