/**
 * Trade offer rule engine — ported from CSGO Trader's evaluateCondition/evaluateRule/evaluateOffers.
 * Evaluates incoming trade offers against user-defined rules and returns verdicts.
 */

export interface TradeCondition {
  type: 'profit_over' | 'profit_under' | 'profit_pct_over' | 'profit_pct_under'
    | 'receiving_over' | 'giving_over' | 'has_message' | 'item_count_over' | 'item_count_under';
  value: number | string;
}

export interface TradeRule {
  id: string;
  active: boolean;
  label: string;
  conditions: TradeCondition[];
  verdict: 'accept' | 'decline' | 'notify' | 'notify_discord';
}

export interface ParsedOffer {
  offerId: string;
  partnerSteamId: string;
  partnerName?: string;
  partnerAvatar?: string;
  givingItems: ParsedItem[];
  receivingItems: ParsedItem[];
  givingTotal: number;
  receivingTotal: number;
  profit: number;
  profitPct: number;
  message?: string;
}

export interface ParsedItem {
  market_hash_name: string;
  appid: string;
  assetid: string;
  price: number;
}

export function evaluateCondition(offer: ParsedOffer, condition: TradeCondition): boolean {
  const numVal = typeof condition.value === 'number' ? condition.value : parseFloat(condition.value as string) || 0;

  switch (condition.type) {
    case 'profit_over':
      return offer.profit > numVal;
    case 'profit_under':
      return offer.profit < numVal;
    case 'profit_pct_over':
      return offer.profitPct > numVal;
    case 'profit_pct_under':
      return offer.profitPct < numVal;
    case 'receiving_over':
      return offer.receivingTotal > numVal;
    case 'giving_over':
      return offer.givingTotal > numVal;
    case 'has_message':
      return !!offer.message && offer.message.length > 0;
    case 'item_count_over':
      return (offer.givingItems.length + offer.receivingItems.length) > numVal;
    case 'item_count_under':
      return (offer.givingItems.length + offer.receivingItems.length) < numVal;
    default:
      return false;
  }
}

export function evaluateRule(offer: ParsedOffer, rule: TradeRule): boolean {
  if (!rule.active || rule.conditions.length === 0) return false;
  // All conditions must match (AND logic)
  return rule.conditions.every(c => evaluateCondition(offer, c));
}

export function evaluateOffer(offer: ParsedOffer, rules: TradeRule[]): string | null {
  for (const rule of rules) {
    if (evaluateRule(offer, rule)) {
      return rule.verdict;
    }
  }
  return null;
}

/**
 * Parse a Steam API trade offer response into our ParsedOffer format.
 */
export function parseApiOffer(
  offer: any,
  descriptions: Record<string, any>,
  getPrice: (name: string) => number,
): ParsedOffer {
  const givingItems: ParsedItem[] = [];
  const receivingItems: ParsedItem[] = [];
  let givingTotal = 0;
  let receivingTotal = 0;

  if (offer.items_to_give) {
    for (const item of offer.items_to_give) {
      const key = `${item.classid}_${item.instanceid}`;
      const desc = descriptions[key];
      const name = desc?.market_hash_name || desc?.name || '';
      const price = name ? getPrice(name) : 0;
      givingTotal += price;
      givingItems.push({ market_hash_name: name, appid: item.appid, assetid: item.assetid, price });
    }
  }

  if (offer.items_to_receive) {
    for (const item of offer.items_to_receive) {
      const key = `${item.classid}_${item.instanceid}`;
      const desc = descriptions[key];
      const name = desc?.market_hash_name || desc?.name || '';
      const price = name ? getPrice(name) : 0;
      receivingTotal += price;
      receivingItems.push({ market_hash_name: name, appid: item.appid, assetid: item.assetid, price });
    }
  }

  const profit = receivingTotal - givingTotal;
  const profitPct = givingTotal > 0 ? (profit / givingTotal) * 100 : 0;

  return {
    offerId: offer.tradeofferid,
    partnerSteamId: offer.accountid_other?.toString() || '',
    message: offer.message || '',
    givingItems, receivingItems,
    givingTotal, receivingTotal,
    profit, profitPct,
  };
}
