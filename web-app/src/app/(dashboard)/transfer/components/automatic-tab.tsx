'use client';

import { useState, useEffect, useCallback } from 'react';
import { Zap, Plus, Trash2, Play, Eye, ToggleLeft, ToggleRight, ChevronRight, X, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDesktopAPI } from '@/lib/desktop';
import { useStorageUnits } from '@/lib/use-desktop';
import { StorageUnitSelector } from './storage-unit-selector';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface RuleCondition {
  field: 'name' | 'market_hash_name' | 'type' | 'rarity' | 'quality';
  operator: 'contains' | 'equals' | 'starts_with' | 'ends_with';
  value: string;
}

interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleCondition[];
  targetCasketId: string;
  action: 'deposit';
  lastRunAt: string | null;
  lastRunResult: { matched: number; moved: number } | null;
}

const FIELDS: { value: RuleCondition['field']; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'market_hash_name', label: 'Market Name' },
  { value: 'type', label: 'Type' },
  { value: 'rarity', label: 'Rarity' },
  { value: 'quality', label: 'Quality' },
];

const OPERATORS: { value: RuleCondition['operator']; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
];

export function AutomaticTab() {
  const api = getDesktopAPI();
  const { units, loading: unitsLoading, fetchUnits } = useStorageUnits();

  useEffect(() => { fetchUnits(); }, [fetchUnits]);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ matched: number; moved: number } | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  // Editor state
  const [editName, setEditName] = useState('');
  const [editConditions, setEditConditions] = useState<RuleCondition[]>([{ field: 'name', operator: 'contains', value: '' }]);
  const [editTarget, setEditTarget] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    const data = await api.automation.getRules();
    setRules(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const activeRule = rules.find((r) => r.id === selectedRule);

  const handleCreate = () => {
    setEditing(true);
    setSelectedRule(null);
    setEditName('');
    setEditConditions([{ field: 'name', operator: 'contains', value: '' }]);
    setEditTarget(null);
    setPreviewCount(null);
  };

  const handleEditRule = (rule: AutomationRule) => {
    setEditing(true);
    setSelectedRule(rule.id);
    setEditName(rule.name);
    setEditConditions([...rule.conditions]);
    setEditTarget(rule.targetCasketId);
    setPreviewCount(null);
  };

  const handleSave = async () => {
    if (!api || !editName.trim() || !editTarget || editConditions.some((c) => !c.value.trim())) {
      toast.error('Fill in all fields');
      return;
    }

    await api.automation.saveRule({
      id: selectedRule || undefined,
      name: editName,
      conditions: editConditions,
      targetCasketId: editTarget,
      enabled: true,
    });

    setEditing(false);
    fetchRules();
    toast.success(selectedRule ? 'Rule updated' : 'Rule created');
  };

  const handleDelete = async (id: string) => {
    if (!api) return;
    await api.automation.deleteRule(id);
    if (selectedRule === id) setSelectedRule(null);
    fetchRules();
    toast.success('Rule deleted');
  };

  const handleToggle = async (rule: AutomationRule) => {
    if (!api) return;
    await api.automation.saveRule({ ...rule, enabled: !rule.enabled });
    fetchRules();
  };

  const handleRunRule = async (ruleId: string) => {
    if (!api) return;
    setRunning(true);
    setRunResult(null);
    const result = await api.automation.runRule(ruleId);
    setRunning(false);
    setRunResult(result);
    fetchRules();
    if (result.moved > 0) toast.success(`Moved ${result.moved} items`);
    else toast.info(`Matched ${result.matched} items — already in storage or nothing to move`);
  };

  const handleRunAll = async () => {
    if (!api) return;
    setRunning(true);
    setRunResult(null);
    const results = await api.automation.runAll();
    setRunning(false);
    const total = results.reduce((sum, r) => sum + r.moved, 0);
    const matched = results.reduce((sum, r) => sum + r.matched, 0);
    setRunResult({ matched, moved: total });
    fetchRules();
    if (total > 0) toast.success(`Moved ${total} items across ${results.length} rules`);
    else toast.info(`Checked ${results.length} rules — nothing to move`);
  };

  const handlePreview = async () => {
    if (!api || editConditions.some((c) => !c.value.trim())) return;
    const matched = await api.automation.previewRule({
      id: '',
      name: editName,
      enabled: true,
      conditions: editConditions,
      targetCasketId: editTarget || '',
      action: 'deposit',
      lastRunAt: null,
      lastRunResult: null,
    });
    setPreviewCount(matched.length);
  };

  const addCondition = () => {
    setEditConditions([...editConditions, { field: 'name', operator: 'contains', value: '' }]);
  };

  const removeCondition = (i: number) => {
    setEditConditions(editConditions.filter((_, idx) => idx !== i));
  };

  const updateCondition = (i: number, patch: Partial<RuleCondition>) => {
    setEditConditions(editConditions.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Left: Rules list */}
      <div className="lg:col-span-3 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunAll}
            disabled={running || rules.filter((r) => r.enabled).length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-all disabled:opacity-40 shadow-lg shadow-primary/25"
          >
            <Zap size={16} />
            {running ? 'Running...' : 'Automate now'}
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl glass border border-border/50 hover:border-primary/20 text-sm font-medium transition-all"
          >
            <Plus size={16} />
            Create new rule
          </button>
        </div>

        {/* Run status */}
        {(running || runResult) && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm',
              running
                ? 'glass border-primary/20 text-muted'
                : runResult && runResult.moved > 0
                  ? 'bg-profit/8 border-profit/20 text-profit'
                  : 'bg-surface-light border-border/50 text-muted'
            )}
          >
            {running ? (
              <>
                <Zap size={14} className="animate-pulse text-primary shrink-0" />
                <span className="text-xs font-medium">Running automation rules...</span>
                <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden ml-2">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
              </>
            ) : runResult ? (
              <>
                <CheckCircle2 size={14} className={runResult.moved > 0 ? 'text-profit' : 'text-muted'} />
                <span className="text-xs font-medium">
                  {runResult.moved > 0
                    ? `Done — ${runResult.moved} item${runResult.moved > 1 ? 's' : ''} moved`
                    : `Done — ${runResult.matched} matched, nothing to move`}
                </span>
                <button
                  onClick={() => setRunResult(null)}
                  className="ml-auto text-muted hover:text-foreground transition-colors"
                >
                  <X size={12} />
                </button>
              </>
            ) : null}
          </motion.div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-surface-light/50 animate-pulse" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="glass rounded-xl p-12 border border-border/50 text-center">
            <Zap size={32} className="mx-auto mb-3 text-muted" />
            <p className="text-sm text-muted">No automation rules yet</p>
            <button onClick={handleCreate} className="text-sm text-primary font-medium mt-2">
              Create your first rule
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule, i) => (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl glass border transition-all cursor-pointer group',
                  selectedRule === rule.id ? 'border-primary/30' : 'border-border/50 hover:border-border'
                )}
                onClick={() => setSelectedRule(rule.id)}
              >
                <span className="text-xs text-muted font-mono w-6">#{i}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggle(rule); }}
                  className="shrink-0"
                >
                  {rule.enabled ? (
                    <ToggleRight size={22} className="text-profit" />
                  ) : (
                    <ToggleLeft size={22} className="text-muted" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{rule.name}</p>
                  <p className="text-xs text-muted truncate">
                    {rule.conditions.map((c) => `${c.field} ${c.operator} "${c.value}"`).join(' AND ')}
                  </p>
                </div>
                {rule.lastRunResult && (
                  <span className="text-xs text-muted shrink-0">
                    {rule.lastRunResult.moved} moved
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleRunRule(rule.id); }}
                  disabled={running}
                  className="p-1.5 rounded-lg hover:bg-surface-light text-muted hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Play size={14} />
                </button>
                <ChevronRight size={16} className="text-muted shrink-0" />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Detail / Editor */}
      <div className="lg:col-span-2 flex flex-col gap-4">
        <AnimatePresence mode="wait">
          {editing ? (
            <motion.div
              key="editor"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              className="glass rounded-xl p-4 border border-primary/20 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{selectedRule ? 'Edit Rule' : 'New Rule'}</h3>
                <button onClick={() => setEditing(false)} className="text-muted hover:text-foreground">
                  <X size={16} />
                </button>
              </div>

              {/* Name */}
              <input
                type="text"
                placeholder="Rule name..."
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg glass border border-border/50 text-sm focus:border-primary/30 focus:outline-none"
              />

              {/* Conditions */}
              <div className="space-y-2">
                <span className="text-xs text-muted font-medium">Conditions</span>
                {editConditions.map((cond, i) => (
                  <div key={i} className="rounded-lg bg-surface-light/50 border border-border/30 p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={cond.field}
                        onChange={(e) => updateCondition(i, { field: e.target.value as RuleCondition['field'] })}
                        className="flex-1 px-2 py-1 rounded-md bg-surface-light border border-border/50 text-xs"
                      >
                        {FIELDS.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                      <select
                        value={cond.operator}
                        onChange={(e) => updateCondition(i, { operator: e.target.value as RuleCondition['operator'] })}
                        className="flex-1 px-2 py-1 rounded-md bg-surface-light border border-border/50 text-xs"
                      >
                        {OPERATORS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {editConditions.length > 1 && (
                        <button onClick={() => removeCondition(i)} className="text-muted hover:text-loss shrink-0">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="Value..."
                      value={cond.value}
                      onChange={(e) => updateCondition(i, { value: e.target.value })}
                      className="w-full px-2 py-1 rounded-md bg-surface-light border border-border/50 text-xs focus:border-primary/30 focus:outline-none"
                    />
                  </div>
                ))}
                <button
                  onClick={addCondition}
                  className="text-xs text-primary font-medium hover:underline"
                >
                  + Add condition
                </button>
              </div>

              {/* Target */}
              <StorageUnitSelector
                units={units}
                selected={editTarget}
                onSelect={setEditTarget}
                label="Target Storage"
                loading={unitsLoading}
              />

              {/* Preview */}
              <button
                onClick={handlePreview}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg glass border border-border/50 hover:border-primary/20 text-sm transition-all"
              >
                <Eye size={14} className="text-muted" />
                Preview matches
                {previewCount !== null && (
                  <span className="ml-auto text-xs font-medium text-primary">{previewCount} items</span>
                )}
              </button>

              {/* Save */}
              <button
                onClick={handleSave}
                className="w-full px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold text-sm transition-all shadow-lg shadow-primary/25"
              >
                {selectedRule ? 'Update Rule' : 'Create Rule'}
              </button>
            </motion.div>
          ) : activeRule ? (
            <motion.div
              key="detail"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              className="glass rounded-xl p-4 border border-border/50 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{activeRule.name}</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEditRule(activeRule)}
                    className="p-1.5 rounded-lg hover:bg-surface-light text-muted hover:text-foreground transition-colors text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(activeRule.id)}
                    className="p-1.5 rounded-lg hover:bg-surface-light text-muted hover:text-loss transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Target storage */}
              <div>
                <span className="text-xs text-muted block mb-1">Target Storage</span>
                <div className="flex flex-wrap gap-2">
                  {units
                    .filter((u) => u.id === activeRule.targetCasketId)
                    .map((u) => (
                      <span key={u.id} className="px-2 py-1 rounded-lg bg-surface-light text-xs font-medium">
                        {u.name} ({u.item_count})
                      </span>
                    ))}
                </div>
              </div>

              {/* Conditions */}
              <div>
                <span className="text-xs text-muted block mb-1">Conditions</span>
                {activeRule.conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1">
                    <span className="text-muted">{c.field}:</span>
                    <span className="px-2 py-0.5 rounded bg-surface-light font-medium uppercase">{c.value}</span>
                  </div>
                ))}
              </div>

              {/* Last run */}
              {activeRule.lastRunResult && (
                <div className="text-xs text-muted">
                  Last run: {activeRule.lastRunResult.matched} matched, {activeRule.lastRunResult.moved} moved
                </div>
              )}

              <button
                onClick={() => handleRunRule(activeRule.id)}
                disabled={running}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold text-sm transition-all disabled:opacity-40 shadow-lg shadow-primary/25"
              >
                <Play size={16} />
                {running ? 'Running...' : 'Run this rule'}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass rounded-xl p-8 border border-border/50 text-center"
            >
              <Zap size={24} className="mx-auto mb-2 text-muted" />
              <p className="text-xs text-muted">Select a rule to view details</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
