/**
 * Discord webhook integration for trade offer notifications.
 * Sends formatted embeds with item details and P/L.
 */
import type { ParsedOffer } from './tradeRules';

export async function sendDiscordWebhook(webhookUrl: string, offer: ParsedOffer): Promise<boolean> {
  if (!webhookUrl) return false;

  const isProfit = offer.profit >= 0;
  const color = isProfit ? 0x4ade80 : 0xf87171; // green / red

  const givingList = offer.givingItems.slice(0, 10).map(i =>
    `${i.market_hash_name}${i.price > 0 ? ` ($${i.price.toFixed(2)})` : ''}`
  ).join('\n') || 'Nothing';

  const receivingList = offer.receivingItems.slice(0, 10).map(i =>
    `${i.market_hash_name}${i.price > 0 ? ` ($${i.price.toFixed(2)})` : ''}`
  ).join('\n') || 'Nothing';

  const sign = isProfit ? '+' : '';

  const embed = {
    title: `Trade Offer #${offer.offerId}`,
    color,
    fields: [
      { name: `Giving (${offer.givingItems.length} items)`, value: givingList.substring(0, 1024), inline: true },
      { name: `Receiving (${offer.receivingItems.length} items)`, value: receivingList.substring(0, 1024), inline: true },
      { name: 'P/L', value: `${sign}$${offer.profit.toFixed(2)} (${sign}${offer.profitPct.toFixed(1)}%)`, inline: false },
    ],
    footer: { text: 'SkinKeeper Trade Monitor' },
    timestamp: new Date().toISOString(),
  };

  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
