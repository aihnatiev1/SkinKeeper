import type { AutomationRule, RuleCondition } from './store';
import type { SteamClient } from '../steam/client';

/**
 * Test if an inventory item matches a single condition.
 */
function matchCondition(item: any, condition: RuleCondition): boolean {
  const fieldValue = (item[condition.field] || '').toLowerCase();
  const testValue = condition.value.toLowerCase();

  switch (condition.operator) {
    case 'contains':
      return fieldValue.includes(testValue);
    case 'equals':
      return fieldValue === testValue;
    case 'starts_with':
      return fieldValue.startsWith(testValue);
    case 'ends_with':
      return fieldValue.endsWith(testValue);
    default:
      return false;
  }
}

/**
 * Test if an item matches ALL conditions of a rule (AND logic).
 */
function matchesRule(item: any, rule: AutomationRule): boolean {
  if (rule.conditions.length === 0) return false;
  return rule.conditions.every((c) => matchCondition(item, c));
}

/**
 * Preview: return items that match a rule without moving anything.
 */
export function previewRule(inventory: any[], rule: AutomationRule): any[] {
  return inventory.filter((item) => matchesRule(item, rule));
}

/**
 * Execute a rule: match items from inventory and move to target storage unit.
 */
export async function executeRule(
  steam: SteamClient,
  inventory: any[],
  rule: AutomationRule,
): Promise<{ matched: number; moved: number }> {
  const matched = inventory.filter((item) => matchesRule(item, rule));

  if (matched.length === 0) {
    return { matched: 0, moved: 0 };
  }

  const itemIds = matched.map((item) => item.id);

  const result = await steam.moveToStorageUnit(itemIds, rule.targetCasketId);

  return { matched: matched.length, moved: result.moved };
}
