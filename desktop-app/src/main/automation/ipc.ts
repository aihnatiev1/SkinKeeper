import { ipcMain } from 'electron';
import { getRules, saveRule, deleteRule, updateRuleResult, type AutomationRule, type RuleCondition } from './store';
import { previewRule, executeRule } from './engine';
import type { SteamClient } from '../steam/client';

export function registerAutomationIPC(steam: SteamClient) {

  ipcMain.handle('automation:get-rules', async () => {
    return getRules();
  });

  ipcMain.handle('automation:save-rule', async (_event, rule: Partial<AutomationRule> & { name: string; conditions: RuleCondition[]; targetCasketId: string }) => {
    return saveRule(rule);
  });

  ipcMain.handle('automation:delete-rule', async (_event, id: string) => {
    return deleteRule(id);
  });

  ipcMain.handle('automation:preview-rule', async (_event, rule: AutomationRule) => {
    const inventory = await steam.getInventory();
    return previewRule(inventory, rule);
  });

  ipcMain.handle('automation:run-rule', async (_event, ruleId: string) => {
    const rules = getRules();
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return { matched: 0, moved: 0, error: 'Rule not found' };

    const inventory = await steam.getInventory();
    const result = await executeRule(steam, inventory, rule);

    updateRuleResult(ruleId, result);
    return result;
  });

  ipcMain.handle('automation:run-all', async () => {
    const rules = getRules().filter((r) => r.enabled);
    const inventory = await steam.getInventory();
    const results: { ruleId: string; ruleName: string; matched: number; moved: number }[] = [];

    for (const rule of rules) {
      const result = await executeRule(steam, inventory, rule);
      updateRuleResult(rule.id, result);
      results.push({ ruleId: rule.id, ruleName: rule.name, ...result });
    }

    return results;
  });
}
