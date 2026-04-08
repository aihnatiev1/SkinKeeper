'use client';

import { useState } from 'react';
import { Header } from '@/components/header';
import { PremiumGate } from '@/components/premium-gate';
import {
  usePortfolios,
  useCreatePortfolio,
  useDeletePortfolio,
  useProfitLoss,
  usePortfolioPL,
  usePortfolioPLItems,
} from '@/lib/hooks';
import { useFormatPrice } from '@/lib/utils';
import { useAuthStore } from '@/lib/store';
import type { Portfolio, PLItem } from '@/lib/types';
import { AddTransactionForm } from '@/components/add-transaction-form';
import {
  Plus,
  BarChart3,
  Trash2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  Wallet,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F97316', '#22C55E', '#06B6D4'];

function cents(v: number) { return v / 100; }

export default function PortfoliosPage() {
  const formatPrice = useFormatPrice();
  const user = useAuthStore((s) => s.user);
  const { data: portfolios, isLoading } = usePortfolios();
  const { data: totalPL } = useProfitLoss();
  const createPortfolio = useCreatePortfolio();
  const deletePortfolio = useDeletePortfolio();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [addingToId, setAddingToId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createPortfolio.mutate(
      { name: newName.trim(), color: newColor },
      {
        onSuccess: () => {
          toast.success('Portfolio created');
          setNewName('');
          setShowCreate(false);
        },
        onError: () => toast.error('Failed to create'),
      }
    );
  };

  const handleDelete = (id: number) => {
    deletePortfolio.mutate(id, {
      onSuccess: () => {
        toast.success('Portfolio deleted');
        setDeleteConfirm(null);
        if (expandedId === id) setExpandedId(null);
      },
      onError: () => toast.error('Failed to delete'),
    });
  };

  return (
    <div>
      <Header title="Portfolios" />
      <div className="p-4 lg:p-6 space-y-6">
        <PremiumGate feature="Investment Portfolios">
          {/* All Holdings summary */}
          {totalPL && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl border border-border/50 p-5"
            >
              <h3 className="text-sm font-bold text-muted mb-3">All Holdings</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wider">Invested</p>
                  <p className="text-lg font-bold">{formatPrice(cents(totalPL.totalInvestedCents))}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wider">Current Value</p>
                  <p className="text-lg font-bold">{formatPrice(cents(totalPL.totalCurrentValueCents))}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wider">Profit / Loss</p>
                  <p className={`text-lg font-bold ${totalPL.totalProfitCents >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {totalPL.totalProfitCents >= 0 ? '+' : ''}{formatPrice(cents(totalPL.totalProfitCents))}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wider">Return</p>
                  <p className={`text-lg font-bold ${totalPL.totalProfitPct >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {totalPL.totalProfitPct >= 0 ? '+' : ''}{totalPL.totalProfitPct.toFixed(1)}%
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Create button + form */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Your Portfolios</h2>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98]"
            >
              {showCreate ? <X size={14} /> : <Plus size={14} />}
              {showCreate ? 'Cancel' : 'Create'}
            </button>
          </div>

          <AnimatePresence>
            {showCreate && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="glass rounded-xl border border-border/50 p-4 space-y-3">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    placeholder="Portfolio name"
                    autoFocus
                    className="w-full px-3 py-2.5 glass rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    maxLength={50}
                  />
                  <div className="flex items-center gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewColor(c)}
                        className="w-7 h-7 rounded-full transition-all"
                        style={{
                          backgroundColor: c,
                          outline: newColor === c ? `2px solid ${c}` : 'none',
                          outlineOffset: 2,
                        }}
                      />
                    ))}
                    <button
                      onClick={handleCreate}
                      disabled={!newName.trim() || createPortfolio.isPending}
                      className="ml-auto px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-all"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Portfolio cards */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass rounded-2xl border border-border/50 p-5 h-32 animate-pulse" />
              ))}
            </div>
          ) : !portfolios?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <BarChart3 size={48} className="mb-3 opacity-30" />
              <p className="text-sm">No portfolios yet</p>
              <p className="text-xs mt-1">Create one to start tracking your investments</p>
            </div>
          ) : (
            <div className="space-y-3">
              {portfolios.map((p) => (
                <PortfolioCard
                  key={p.id}
                  portfolio={p}
                  expanded={expandedId === p.id}
                  onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  adding={addingToId === p.id}
                  onAddToggle={() => setAddingToId(addingToId === p.id ? null : p.id)}
                  onDelete={() => setDeleteConfirm(p.id)}
                  deleteConfirm={deleteConfirm === p.id}
                  onDeleteConfirm={() => handleDelete(p.id)}
                  onDeleteCancel={() => setDeleteConfirm(null)}
                  formatPrice={formatPrice}
                />
              ))}
            </div>
          )}
        </PremiumGate>
      </div>
    </div>
  );
}

// ─── Portfolio Card ──────────────────────────────────────────────────

interface PortfolioCardProps {
  portfolio: Portfolio;
  expanded: boolean;
  onToggle: () => void;
  adding: boolean;
  onAddToggle: () => void;
  onDelete: () => void;
  deleteConfirm: boolean;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  formatPrice: (price: number) => string;
}

function PortfolioCard({
  portfolio,
  expanded,
  onToggle,
  adding,
  onAddToggle,
  onDelete,
  deleteConfirm,
  onDeleteConfirm,
  onDeleteCancel,
  formatPrice,
}: PortfolioCardProps) {
  const { data: pl } = usePortfolioPL(portfolio.id);
  const { data: itemsData } = usePortfolioPLItems(expanded ? portfolio.id : null);

  const items = itemsData?.items ?? [];
  const hasPL = !!pl;
  const profit = pl ? pl.totalProfitCents : 0;
  const profitPct = pl ? pl.totalProfitPct : 0;
  const invested = pl ? cents(pl.totalInvestedCents) : 0;
  const currentValue = pl ? cents(pl.totalCurrentValueCents) : 0;
  const itemCount = pl ? pl.holdingCount : 0;

  return (
    <motion.div
      layout
      className="glass rounded-2xl border border-border/50 overflow-hidden"
    >
      {/* Card header */}
      <button
        onClick={onToggle}
        className="w-full p-5 text-left hover:bg-surface-light/20 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: portfolio.color }} />
            <div className="min-w-0">
              <h3 className="font-bold text-sm truncate">{portfolio.name}</h3>
              {hasPL && (
                <p className="text-xs text-muted mt-0.5">
                  {itemCount} items · {formatPrice(currentValue)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {hasPL && (
              <div className="text-right">
                <p className={`text-sm font-bold ${profit >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {profit >= 0 ? '+' : ''}{profitPct.toFixed(1)}%
                </p>
                <p className={`text-xs ${profit >= 0 ? 'text-profit/70' : 'text-loss/70'}`}>
                  {profit >= 0 ? '+' : ''}{formatPrice(cents(profit))}
                </p>
              </div>
            )}
            {expanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/30">
              {/* Stats row */}
              {hasPL && (
                <div className="grid grid-cols-3 gap-3 p-4 border-b border-border/20">
                  <div className="text-center">
                    <p className="text-[10px] text-muted uppercase">Invested</p>
                    <p className="text-sm font-semibold">{formatPrice(invested)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted uppercase">Current</p>
                    <p className="text-sm font-semibold">{formatPrice(currentValue)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted uppercase">P/L</p>
                    <p className={`text-sm font-semibold ${profit >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {profit >= 0 ? '+' : ''}{formatPrice(cents(profit))}
                    </p>
                  </div>
                </div>
              )}

              {/* Items table */}
              {items.length > 0 ? (
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted text-left border-b border-border/20">
                        <th className="px-4 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 font-medium text-right">Qty</th>
                        <th className="px-3 py-2 font-medium text-right hidden sm:table-cell">Avg Cost</th>
                        <th className="px-3 py-2 font-medium text-right">Current</th>
                        <th className="px-3 py-2 font-medium text-right">P/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <ItemRow key={item.marketHashName} item={item} formatPrice={formatPrice} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : !adding ? (
                <div className="p-6 text-center text-muted">
                  <Package size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No items yet</p>
                </div>
              ) : null}

              {/* Add transaction form */}
              {adding && (
                <AddTransactionForm portfolioId={portfolio.id} onDone={onAddToggle} />
              )}

              {/* Actions */}
              <div className="p-3 border-t border-border/20 flex justify-between">
                <button
                  onClick={onAddToggle}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                    adding ? 'text-foreground' : 'text-primary hover:text-primary-hover'
                  }`}
                >
                  {adding ? <><X size={12} /> Close</> : <><Plus size={12} /> Add Item</>}
                </button>
                {deleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">Delete?</span>
                    <button onClick={onDeleteConfirm} className="px-3 py-1.5 bg-loss/20 text-loss rounded-lg text-xs font-semibold hover:bg-loss/30">
                      Yes
                    </button>
                    <button onClick={onDeleteCancel} className="px-3 py-1.5 glass rounded-lg text-xs text-muted hover:text-foreground">
                      No
                    </button>
                  </div>
                ) : (
                  <button onClick={onDelete} className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted hover:text-loss transition-colors">
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Item Row ────────────────────────────────────────────────────────

function ItemRow({ item, formatPrice }: { item: PLItem; formatPrice: (p: number) => string }) {
  const profit = item.totalProfitCents;
  return (
    <tr className="border-b border-border/10 hover:bg-surface-light/20 transition-colors">
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          {item.iconUrl && (
            <img
              src={`https://community.akamai.steamstatic.com/economy/image/${item.iconUrl}/48x48`}
              alt=""
              className="w-6 h-6 object-contain"
            />
          )}
          <span className="truncate max-w-[150px] lg:max-w-[220px]">{item.marketHashName}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-right font-medium">{item.currentHolding}</td>
      <td className="px-3 py-2 text-right text-muted hidden sm:table-cell">{formatPrice(cents(item.avgBuyPriceCents))}</td>
      <td className="px-3 py-2 text-right">{formatPrice(cents(item.currentPriceCents))}</td>
      <td className={`px-3 py-2 text-right font-semibold ${profit >= 0 ? 'text-profit' : 'text-loss'}`}>
        {profit >= 0 ? '+' : ''}{item.profitPct.toFixed(1)}%
      </td>
    </tr>
  );
}
