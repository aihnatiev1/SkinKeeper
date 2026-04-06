'use client';

import { usePortfolios, useCreatePortfolio, useUpdatePortfolio, useDeletePortfolio } from '@/lib/hooks';
import { useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const PRESET_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

export function PortfolioSelector() {
  const { data: portfolios } = usePortfolios();
  const { portfolioScope, setPortfolioScope } = useUIStore();
  const createPortfolio = useCreatePortfolio();
  const updatePortfolio = useUpdatePortfolio();
  const deletePortfolio = useDeletePortfolio();

  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const handleCreate = () => {
    if (!name.trim()) return;
    createPortfolio.mutate({ name: name.trim(), color }, {
      onSuccess: () => {
        toast.success('Portfolio created');
        setShowCreate(false);
        setName('');
        setColor(PRESET_COLORS[0]);
      },
      onError: () => toast.error('Failed to create portfolio'),
    });
  };

  const handleUpdate = () => {
    if (!editId || !name.trim()) return;
    updatePortfolio.mutate({ id: editId, name: name.trim(), color }, {
      onSuccess: () => {
        toast.success('Portfolio updated');
        setEditId(null);
        setName('');
      },
      onError: () => toast.error('Failed to update portfolio'),
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm('Delete this portfolio? Transactions will become untagged.')) return;
    deletePortfolio.mutate(id, {
      onSuccess: () => {
        toast.success('Portfolio deleted');
        if (portfolioScope === id) setPortfolioScope(null);
      },
      onError: () => toast.error('Failed to delete portfolio'),
    });
  };

  const startEdit = (p: { id: number; name: string; color: string }) => {
    setEditId(p.id);
    setName(p.name);
    setColor(p.color);
    setShowCreate(false);
  };

  return (
    <div className="space-y-3">
      {/* Portfolio pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setPortfolioScope(null)}
          className={cn(
            'px-3 py-1.5 rounded-xl text-sm font-medium transition-all',
            portfolioScope === null
              ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
              : 'glass text-muted hover:text-foreground'
          )}
        >
          All
        </button>

        {portfolios?.map((p) => (
          <div key={p.id} className="group relative">
            <button
              onClick={() => setPortfolioScope(portfolioScope === p.id ? null : p.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all',
                portfolioScope === p.id
                  ? 'ring-1 ring-current/30'
                  : 'glass hover:bg-surface-light'
              )}
              style={portfolioScope === p.id ? { backgroundColor: `${p.color}15`, color: p.color } : undefined}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              {p.name}
            </button>
            {/* Edit/delete on hover */}
            <div className="absolute -top-1 -right-1 hidden group-hover:flex items-center gap-0.5">
              <button
                onClick={(e) => { e.stopPropagation(); startEdit(p); }}
                className="w-5 h-5 flex items-center justify-center rounded-full bg-surface border border-border/50 text-muted hover:text-foreground transition-colors"
              >
                <Pencil size={8} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                className="w-5 h-5 flex items-center justify-center rounded-full bg-surface border border-border/50 text-muted hover:text-loss transition-colors"
              >
                <Trash2 size={8} />
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={() => { setShowCreate(true); setEditId(null); setName(''); setColor(PRESET_COLORS[0]); }}
          className="flex items-center gap-1 px-2.5 py-1.5 glass rounded-xl text-xs text-muted hover:text-foreground transition-colors"
        >
          <Plus size={12} />
          New
        </button>
      </div>

      {/* Create/edit form */}
      {(showCreate || editId) && (
        <div className="flex items-end gap-3 glass rounded-xl p-3 border border-primary/20">
          <div className="flex-1 min-w-[120px]">
            <label className="text-[10px] text-muted block mb-1">
              {editId ? 'Edit portfolio' : 'Portfolio name'}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My skins"
              className="w-full px-3 py-1.5 glass rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              onKeyDown={(e) => e.key === 'Enter' && (editId ? handleUpdate() : handleCreate())}
              autoFocus
            />
          </div>
          <div className="flex gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  'w-6 h-6 rounded-full transition-transform',
                  color === c ? 'scale-125 ring-2 ring-white/50' : 'hover:scale-110'
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            onClick={editId ? handleUpdate : handleCreate}
            disabled={createPortfolio.isPending || updatePortfolio.isPending}
            className="p-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <Check size={14} />
          </button>
          <button
            onClick={() => { setShowCreate(false); setEditId(null); }}
            className="p-2 glass rounded-lg text-muted hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
