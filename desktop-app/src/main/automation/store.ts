import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ─────────────────────────────────────────────────────────────

export interface RuleCondition {
  field: 'name' | 'market_hash_name' | 'type' | 'rarity' | 'quality';
  operator: 'contains' | 'equals' | 'starts_with' | 'ends_with';
  value: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleCondition[];
  targetCasketId: string;
  action: 'deposit';
  createdAt: string;
  lastRunAt: string | null;
  lastRunResult: { matched: number; moved: number } | null;
}

// ─── Store ─────────────────────────────────────────────────────────────

let rules: AutomationRule[] = [];
let filePath: string;

function getFilePath() {
  if (!filePath) {
    filePath = path.join(app.getPath('userData'), 'automation-rules.json');
  }
  return filePath;
}

function load() {
  try {
    if (fs.existsSync(getFilePath())) {
      rules = JSON.parse(fs.readFileSync(getFilePath(), 'utf-8'));
    }
  } catch {
    rules = [];
  }
}

function save() {
  try {
    fs.writeFileSync(getFilePath(), JSON.stringify(rules, null, 2));
  } catch {
    // Ignore write errors
  }
}

export function getRules(): AutomationRule[] {
  if (rules.length === 0) load();
  return rules;
}

export function getRule(id: string): AutomationRule | undefined {
  return getRules().find((r) => r.id === id);
}

export function saveRule(rule: Partial<AutomationRule> & { name: string; conditions: RuleCondition[]; targetCasketId: string }): AutomationRule {
  load();
  const existing = rule.id ? rules.findIndex((r) => r.id === rule.id) : -1;

  if (existing >= 0) {
    rules[existing] = { ...rules[existing], ...rule };
    save();
    return rules[existing];
  }

  const newRule: AutomationRule = {
    id: randomId(),
    name: rule.name,
    enabled: rule.enabled ?? true,
    conditions: rule.conditions,
    targetCasketId: rule.targetCasketId,
    action: 'deposit',
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    lastRunResult: null,
  };
  rules.push(newRule);
  save();
  return newRule;
}

export function deleteRule(id: string): boolean {
  load();
  const before = rules.length;
  rules = rules.filter((r) => r.id !== id);
  save();
  return rules.length < before;
}

export function updateRuleResult(id: string, result: { matched: number; moved: number }) {
  const rule = getRule(id);
  if (rule) {
    rule.lastRunAt = new Date().toISOString();
    rule.lastRunResult = result;
    save();
  }
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
