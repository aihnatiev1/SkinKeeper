import { apiRequest, isLoggedIn } from '../shared/api';
import { CollectedPrice, PriceBatch, DEFAULT_SETTINGS, type ExtSettings, type MessageType } from '../shared/types';
import { postToPostHog } from '../shared/analytics';
import { evaluateOffer, parseApiOffer, type TradeRule, type ParsedOffer } from '../shared/tradeRules';
import { sendDiscordWebhook } from '../shared/discord';

// ─── Price Data Pipeline ──────────────────────────────────────────────
// Batch collected prices and send to SkinKeeper API every 30 seconds

let priceBatch: CollectedPrice[] = [];
const BATCH_INTERVAL_MS = 30_000;
const MAX_BATCH_SIZE = 200;

async function flushPriceBatch() {
  if (priceBatch.length === 0) return;

  const settings = await getSettings();
  if (!settings.collectPrices) {
    priceBatch = [];
    return;
  }

  // Deduplicate: keep latest price per item
  const deduped = new Map<string, CollectedPrice>();
  for (const p of priceBatch) {
    const key = `${p.market_hash_name}:${p.source}`;
    const existing = deduped.get(key);
    if (!existing || p.timestamp > existing.timestamp) {
      deduped.set(key, p);
    }
  }

  const items = Array.from(deduped.values());
  priceBatch = [];

  try {
    // Try authenticated request first (logged in users)
    const loggedIn = await isLoggedIn();
    if (loggedIn) {
      await apiRequest('/ext/prices', {
        method: 'POST',
        body: { items },
      });
    } else {
      // Anonymous crowdsource — no auth header, use public endpoint
      await fetch('https://api.skinkeeper.store/api/ext/prices/anon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
    }
  } catch {
    // Re-queue failed items (up to limit)
    if (priceBatch.length < MAX_BATCH_SIZE) {
      priceBatch.push(...items.slice(0, MAX_BATCH_SIZE - priceBatch.length));
    }
  }
}

// ─── Settings ─────────────────────────────────────────────────────────

async function getSettings(): Promise<ExtSettings> {
  const { sk_settings } = await chrome.storage.local.get('sk_settings');
  return { ...DEFAULT_SETTINGS, ...(sk_settings || {}) };
}

// ─── Price cache ──────────────────────────────────────────────────────

interface CachedPrices {
  data: Record<string, { steam?: number; buff?: number; csfloat?: number; skinport?: number }>;
  fetchedAt: number;
}

let priceCache: CachedPrices | null = null;
const PRICE_CACHE_TTL = 5 * 60_000; // 5 minutes

async function getPrices(names: string[]): Promise<Record<string, any>> {
  // Check cache
  if (priceCache && Date.now() - priceCache.fetchedAt < PRICE_CACHE_TTL) {
    const result: Record<string, any> = {};
    for (const name of names) {
      if (priceCache.data[name]) result[name] = priceCache.data[name];
    }
    if (Object.keys(result).length === names.length) return result;
  }

  // Fetch from API
  const data = await apiRequest<Record<string, any>>('/ext/prices/bulk', {
    method: 'POST',
    body: { names },
  });

  if (data) {
    if (!priceCache) priceCache = { data: {}, fetchedAt: Date.now() };
    Object.assign(priceCache.data, data);
    priceCache.fetchedAt = Date.now();
  }

  return data || {};
}

// ─── Message handler ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: MessageType, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse);
  return true; // async response
});

async function handleMessage(msg: any): Promise<any> {
  // CORS proxy — fetch any URL through background (with timeout)
  if (msg.type === 'FETCH_JSON' && msg.url) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(msg.url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        console.warn(`[SkinKeeper] FETCH_JSON failed: ${res.status} for ${msg.url}`);
        return null;
      }
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('json')) return res.json();
      return res.text(); // Support HTML responses (for market listing page scraping)
    } catch (err) {
      console.warn(`[SkinKeeper] FETCH_JSON error for ${msg.url}:`, err);
      return null;
    }
  }

  switch (msg.type) {
    case 'GET_PRICES':
      return getPrices(msg.names);

    case 'SUBMIT_PRICES':
      priceBatch.push(...msg.batch.items);
      if (priceBatch.length >= MAX_BATCH_SIZE) {
        flushPriceBatch();
      }
      return { ok: true };

    case 'GET_USER':
      return apiRequest('/auth/me');

    case 'GET_PORTFOLIO':
      return apiRequest('/portfolio/summary');

    case 'GET_PRICES_FULL':
      return apiRequest('/ext/prices/full', {
        method: 'POST',
        body: { names: msg.names },
      });

    case 'GET_ITEM_PL':
      return apiRequest(`/portfolio/pl/items?name=${encodeURIComponent(msg.market_hash_name)}`);

    case 'GET_FLOAT':
      return apiRequest('/ext/float', {
        method: 'POST',
        body: { inspectLink: msg.inspectLink },
      });

    case 'GET_STICKER_PRICES':
      return apiRequest('/ext/sticker-prices', {
        method: 'POST',
        body: { names: msg.names },
      });

    case 'CREATE_ALERT':
      return apiRequest('/alerts', {
        method: 'POST',
        body: {
          market_hash_name: msg.market_hash_name,
          condition: msg.condition,
          threshold: msg.threshold,
          icon_url: msg.icon_url || null,
        },
      });

    case 'GET_INVENTORY':
      return apiRequest(`/inventory?limit=5000&offset=0&sort=price-desc`);

    case 'SYNC_ITEMS':
      // Push float/seed/paint data from Steam to backend
      if (Array.isArray(msg.items) && msg.items.length > 0) {
        console.log(`[SkinKeeper BG] Syncing ${msg.items.length} items to /ext/items/enrich`);
        const syncResult = await apiRequest('/ext/items/enrich', {
          method: 'POST',
          body: { items: msg.items },
        });
        console.log('[SkinKeeper BG] Sync response:', syncResult);
        return syncResult;
      }
      return { ok: false };

    case 'GET_PL_ITEMS':
      return apiRequest(`/portfolio/pl/items?limit=500&offset=0`);

    case 'OPEN_APP':
      chrome.tabs.create({ url: `https://app.skinkeeper.store${msg.path}` });
      return { ok: true };

    case 'GET_SETTINGS':
      return getSettings();

    case 'GET_BLUEGEM_DATA': {
      try {
        const url = chrome.runtime.getURL('data/bluegem.json.gz');
        const res = await fetch(url);
        if (!res.ok) return null;
        const compressed = await res.arrayBuffer();
        // Decompress gzip in background (has DecompressionStream)
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(new Uint8Array(compressed));
        writer.close();
        const reader = ds.readable.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const totalLen = chunks.reduce((a, c) => a + c.length, 0);
        const merged = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of chunks) { merged.set(c, offset); offset += c.length; }
        const json = new TextDecoder().decode(merged);
        return JSON.parse(json);
      } catch (e) {
        console.warn('[SkinKeeper] Blue gem background load failed:', e);
        return null;
      }
    }

    // ── Bookmark system (ported from CSGO Trader) ──
    case 'ADD_BOOKMARK': {
      const { sk_bookmarks: existing } = await chrome.storage.local.get('sk_bookmarks');
      const bookmarks = existing || [];
      const bm = msg.bookmark;
      bookmarks.push(bm);
      await chrome.storage.local.set({ sk_bookmarks: bookmarks });

      // Set alarm if item has trade lock date
      if (bm.tradeLockDate) {
        const when = new Date(bm.tradeLockDate).valueOf();
        if (when > Date.now()) {
          chrome.alarms.create(`sk_${bm.assetid}_${bm.added}`, { when });
        }
      }
      return { ok: true, count: bookmarks.length };
    }

    case 'REMOVE_BOOKMARK': {
      const { sk_bookmarks: all } = await chrome.storage.local.get('sk_bookmarks');
      const filtered = (all || []).filter((b: any) => b.assetid !== msg.assetid);
      await chrome.storage.local.set({ sk_bookmarks: filtered });
      // Clear alarm
      chrome.alarms.clear(`sk_${msg.assetid}_${msg.added}`);
      return { ok: true, count: filtered.length };
    }

    case 'GET_BOOKMARKS': {
      const { sk_bookmarks: bms } = await chrome.storage.local.get('sk_bookmarks');
      return { bookmarks: bms || [] };
    }

    // ── Friend request rules ──
    case 'SET_FRIEND_RULES': {
      await chrome.storage.local.set({
        sk_friend_rules: msg.rules,
        sk_monitor_friends: msg.enabled ?? true,
      });
      return { ok: true };
    }

    case 'GET_FRIEND_RULES': {
      const { sk_friend_rules: fr, sk_monitor_friends: mf } = await chrome.storage.local.get(['sk_friend_rules', 'sk_monitor_friends']);
      return { rules: fr || DEFAULT_FRIEND_RULES, enabled: mf ?? false };
    }

    case 'TRACK_EVENT':
      postToPostHog(msg.event, msg.properties || {});
      return { ok: true };

    // ── Trade Monitor ──
    case 'SET_TRADE_RULES': {
      await chrome.storage.local.set({
        sk_trade_rules: msg.rules,
        sk_trade_monitor: msg.enabled ?? true,
        sk_steam_api_key: msg.apiKey || undefined,
        sk_discord_webhook: msg.webhookUrl || undefined,
      });
      return { ok: true };
    }
    case 'GET_TRADE_RULES': {
      const { sk_trade_rules: tr, sk_trade_monitor: tm, sk_steam_api_key: ak, sk_discord_webhook: dw } =
        await chrome.storage.local.get(['sk_trade_rules', 'sk_trade_monitor', 'sk_steam_api_key', 'sk_discord_webhook']);
      return { rules: tr || [], enabled: tm ?? false, apiKey: ak || '', webhookUrl: dw || '' };
    }

    default:
      return null;
  }
}

// ─── Alarms ───────────────────────────────────────────────────────────

chrome.alarms.create('flushPrices', { periodInMinutes: 0.5 });
chrome.alarms.create('friendRequestMonitor', { periodInMinutes: 5 });
chrome.alarms.create('tradeOfferMonitor', { periodInMinutes: 2 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'flushPrices') {
    flushPriceBatch();
    return;
  }

  // ── Friend request monitoring (ported from CSGO Trader) ──
  if (alarm.name === 'friendRequestMonitor') {
    monitorFriendRequests();
    return;
  }

  // ── Trade offer monitoring (ported from CSGO Trader) ──
  if (alarm.name === 'tradeOfferMonitor') {
    monitorTradeOffers();
    return;
  }

  // ── Bookmark trade-lock notification (any other alarm = bookmark) ──
  // Ported from CSGO Trader: alarm fires when item becomes tradable
  chrome.storage.local.get('sk_bookmarks', (result) => {
    const bookmarks: any[] = result.sk_bookmarks || [];
    const bookmark = bookmarks.find((b: any) => {
      const alarmName = `sk_${b.assetid}_${b.added}`;
      return alarmName === alarm.name;
    });

    if (!bookmark) return;

    // Update badge count
    chrome.action.getBadgeText({}).then((text) => {
      const count = parseInt(text) || 0;
      chrome.action.setBadgeText({ text: String(count + 1) });
      chrome.action.setBadgeBackgroundColor({ color: '#4ade80' });
    });

    // Show Chrome notification with item icon
    const iconUrl = bookmark.icon_url
      ? `https://community.fastly.steamstatic.com/economy/image/${bookmark.icon_url}/128x128`
      : 'icons/icon128.png';

    chrome.notifications.create(alarm.name, {
      type: 'basic',
      iconUrl,
      title: `${bookmark.name} is tradable!`,
      message: `Your ${bookmark.name} is now available for trading.`,
    });
  });
});

// ─── Trade Offer Monitor (ported from CSGO Trader) ──────────────────

async function monitorTradeOffers() {
  const { sk_trade_monitor: enabled, sk_trade_rules: rules, sk_steam_api_key: apiKey,
          sk_discord_webhook: webhookUrl, sk_seen_offers: seenRaw } = await chrome.storage.local.get([
    'sk_trade_monitor', 'sk_trade_rules', 'sk_steam_api_key', 'sk_discord_webhook', 'sk_seen_offers',
  ]);
  if (!enabled || !apiKey) return;

  const activeRules: TradeRule[] = (rules || []).filter((r: TradeRule) => r.active);
  const seenOffers: Set<string> = new Set(seenRaw || []);

  try {
    // Fetch incoming active trade offers via Steam Web API
    const url = `https://api.steampowered.com/IEconService/GetTradeOffers/v1/?key=${apiKey}&get_received_offers=1&active_only=1&get_descriptions=1`;
    const resp = await fetch(url);
    if (!resp.ok) return;
    const data = await resp.json();

    const offers = data?.response?.trade_offers_received || [];
    if (offers.length === 0) return;

    // Build description map
    const descriptions: Record<string, any> = {};
    for (const desc of (data?.response?.descriptions || [])) {
      descriptions[`${desc.classid}_${desc.instanceid}`] = desc;
    }

    // Load bulk prices for evaluation
    const priceData = await loadPricesForMonitor();
    const getPrice = (name: string): number => {
      const entry = priceData[name];
      if (!entry) return 0;
      if (typeof entry === 'number') return entry;
      return entry.last_24h ?? entry.last_7d ?? entry.last_30d ?? 0;
    };

    // Update badge with offer count
    chrome.action.setBadgeText({ text: offers.length > 0 ? String(offers.length) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });

    // Process new offers
    const newSeenIds: string[] = [...seenOffers];
    for (const offer of offers) {
      if (seenOffers.has(offer.tradeofferid)) continue;
      newSeenIds.push(offer.tradeofferid);

      const parsed = parseApiOffer(offer, descriptions, getPrice);

      // Notify about new offer
      chrome.notifications.create(`sk_offer_${offer.tradeofferid}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'New Trade Offer',
        message: `Giving: $${parsed.givingTotal.toFixed(2)} | Receiving: $${parsed.receivingTotal.toFixed(2)} | P/L: ${parsed.profit >= 0 ? '+' : ''}$${parsed.profit.toFixed(2)}`,
      });

      // Evaluate rules
      if (activeRules.length > 0) {
        const verdict = evaluateOffer(parsed, activeRules);
        if (verdict) {
          await executeVerdict(verdict, offer.tradeofferid, apiKey, parsed, webhookUrl);
        }
      }
    }

    // Keep only last 500 seen offer IDs
    const trimmed = newSeenIds.slice(-500);
    chrome.storage.local.set({ sk_seen_offers: trimmed });
  } catch (err) {
    console.error('[SkinKeeper] Trade monitor error:', err);
  }
}

async function loadPricesForMonitor(): Promise<Record<string, any>> {
  try {
    const resp = await fetch('https://prices.csgotrader.app/latest/steam.json');
    if (!resp.ok) return {};
    return await resp.json();
  } catch { return {}; }
}

async function executeVerdict(verdict: string, offerId: string, apiKey: string, parsed: ParsedOffer, webhookUrl?: string) {
  const sessionId = ''; // Can't get sessionid from background — accept/decline requires content script

  switch (verdict) {
    case 'notify':
      // Already notified above
      break;
    case 'notify_discord':
      if (webhookUrl) await sendDiscordWebhook(webhookUrl, parsed);
      break;
    case 'decline':
      // Open offer page and decline via content script
      chrome.tabs.create({
        url: `https://steamcommunity.com/tradeoffer/${offerId}/`,
        active: false,
      });
      break;
    case 'accept':
      // Open offer page with auto-accept param
      chrome.tabs.create({
        url: `https://steamcommunity.com/tradeoffer/${offerId}/?sk_accept=true`,
        active: false,
      });
      break;
  }
}

// ─── Friend Request Rules (ported from CSGO Trader) ──────────────────
// Scrapes /my/friends/pending, evaluates rules, executes accept/ignore/block

interface FriendRule {
  active: boolean;
  condition: { type: string; value?: any };
  action: 'accept' | 'ignore' | 'block' | 'no_action';
}

const DEFAULT_FRIEND_RULES: FriendRule[] = [
  { active: true, condition: { type: 'profile_private' }, action: 'ignore' },
  { active: true, condition: { type: 'steam_level_under', value: 3 }, action: 'ignore' },
  { active: false, condition: { type: 'vac_banned' }, action: 'ignore' },
  { active: false, condition: { type: 'trade_banned' }, action: 'ignore' },
];

async function monitorFriendRequests() {
  const { sk_friend_rules: rules, sk_monitor_friends: enabled } = await chrome.storage.local.get(['sk_friend_rules', 'sk_monitor_friends']);
  if (!enabled) return;

  const activeRules: FriendRule[] = (rules || DEFAULT_FRIEND_RULES).filter((r: FriendRule) => r.active);
  if (activeRules.length === 0) return;

  try {
    // Scrape pending friend requests page
    const res = await fetch('https://steamcommunity.com/my/friends/pending');
    if (!res.ok) return;
    const html = await res.text();

    // Check if logged in
    if (html.includes('login/home/')) return;

    // Parse invites — extract steamID, level, name from HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const inviteRows = doc.querySelectorAll('.invite_row, [data-steamid]');

    // Get our session ID from page
    const sessionMatch = html.match(/g_sessionID\s*=\s*"([^"]+)"/);
    const sessionId = sessionMatch?.[1];
    const steamIdMatch = html.match(/g_steamID\s*=\s*"(\d{17})"/);
    const mySteamId = steamIdMatch?.[1];
    if (!sessionId || !mySteamId) return;

    for (const row of Array.from(inviteRows)) {
      const targetSteamId = row.getAttribute('data-steamid');
      if (!targetSteamId) continue;

      const levelEl = row.querySelector('.friendPlayerLevelNum');
      const level = parseInt(levelEl?.textContent || '0');
      const nameEl = row.querySelector('.invite_block_name a, .invite_block_name');
      const name = nameEl?.textContent?.trim() || '';

      // Simple profile visibility check: if no profile link with inventory, treat as private
      const profileLink = row.querySelector('.playerAvatar a') as HTMLAnchorElement | null;
      const isPrivate = !profileLink?.href;

      // Evaluate rules (first match wins)
      let action: string = 'no_action';
      for (const rule of activeRules) {
        const cond = rule.condition;
        let match = false;

        switch (cond.type) {
          case 'profile_private': match = isPrivate; break;
          case 'steam_level_under': match = level <= (cond.value || 5); break;
          case 'steam_level_over': match = level > (cond.value || 50); break;
          case 'vac_banned': match = false; break; // Would need API call — skip for basic version
          case 'trade_banned': match = false; break;
          case 'name_includes': match = name.toLowerCase().includes(String(cond.value || '').toLowerCase()); break;
          case 'all_users': match = true; break;
        }

        if (match) { action = rule.action; break; }
      }

      if (action === 'no_action') continue;

      // Execute action via Steam's friend action endpoint
      const actionMap: Record<string, string> = {
        'accept': 'accept',
        'ignore': 'ignore_invite',
        'block': 'block',
      };
      const steamAction = actionMap[action];
      if (!steamAction) continue;

      try {
        await fetch(`https://steamcommunity.com/profiles/${mySteamId}/friends/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: `sessionid=${sessionId}&steamid=${mySteamId}&ajax=1&action=${steamAction}&steamids%5B%5D=${targetSteamId}`,
        });
        console.log(`[SkinKeeper] Friend request from "${name}" (lvl ${level}): ${action}`);
      } catch {}
    }
  } catch (err) {
    console.warn('[SkinKeeper] Friend request monitoring error:', err);
  }
}

// ─── Notification click → open inventory ──────────────────────────────

chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.action.setBadgeText({ text: '' });
  // Open trade offer if notification was from trade monitor
  const match = notificationId.match(/^sk_offer_(\d+)$/);
  if (match) {
    chrome.tabs.create({ url: `https://steamcommunity.com/tradeoffer/${match[1]}/` });
  }
});

// ─── Install / Update ─────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open welcome/onboarding page
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
    postToPostHog('extension_installed', {});
  }

  // Clear stale price cache on update to avoid format mismatches
  if (details.reason === 'update') {
    chrome.storage.local.remove('sk_prices');
    console.log('[SkinKeeper] Cleared price cache after extension update');
  }
});

// ─── Steam Session Extraction ────────────────────────────────────────

async function saveSteamSession(): Promise<{ ok: boolean; error?: string }> {
  try {
    const loggedIn = await isLoggedIn();
    if (!loggedIn) return { ok: false, error: 'Not logged in to SkinKeeper. Open app.skinkeeper.store and log in first.' };

    const slsCookie = await chrome.cookies.get({ url: 'https://steamcommunity.com', name: 'steamLoginSecure' });
    if (!slsCookie?.value) return { ok: false, error: 'Not logged in to Steam. Open steamcommunity.com and sign in.' };

    const sidCookie = await chrome.cookies.get({ url: 'https://steamcommunity.com', name: 'sessionid' });

    const result = await apiRequest<{ status: string }>('/session/token', {
      method: 'POST',
      body: {
        steamLoginSecure: slsCookie.value,
        sessionId: sidCookie?.value || undefined,
      },
    });

    if (!result) return { ok: false, error: 'Failed to save session. Try again.' };
    if (result.status === 'authenticated') {
      console.log('[SkinKeeper] Steam session saved via extension');
      return { ok: true };
    }
    return { ok: false, error: 'Unexpected response from server.' };
  } catch (e: any) {
    console.error('[SkinKeeper] saveSteamSession error:', e);
    return { ok: false, error: e.message || 'Unknown error' };
  }
}

// ─── External messages (from skinkeeper.store) ────────────────────────

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (sender.origin === 'https://app.skinkeeper.store' || sender.origin === 'https://skinkeeper.store') {
    if (msg.type === 'SET_TOKEN' && msg.token) {
      chrome.storage.local.set({ sk_token: msg.token }).then(() => {
        sendResponse({ ok: true });
      });
      return true;
    }

    if (msg.type === 'CONNECT_STEAM_SESSION') {
      saveSteamSession().then((result) => {
        sendResponse(result);
      });
      return true; // keep channel open for async response
    }

    if (msg.type === 'PING') {
      sendResponse({ ok: true, extensionId: chrome.runtime.id });
      return true;
    }
  }
  sendResponse({ error: 'unknown' });
});
