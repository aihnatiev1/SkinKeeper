(function() {
  // ─── Inventory extraction (existing) ─────────────────────────────────
  function checkInventory() {
    try {
      if (typeof UserYou !== 'undefined' && UserYou.getInventory) {
        const inv = UserYou.getInventory(730, 2);
        if (inv && inv.m_rgAssets && Object.keys(inv.m_rgAssets).length > 0) {
          const items = [];
          const allProps = inv.m_rgAssetProperties || {};

          for (const key in inv.m_rgAssets) {
            const asset = inv.m_rgAssets[key];
            if (asset && asset.description) {
              const item = {
                assetid: asset.assetid,
                name: asset.description.market_hash_name || asset.description.name,
                type: asset.description.type,
                rarity_color: (asset.description.tags || []).find(t => t.category === 'Rarity')?.color,
                float: null,
                paintSeed: null,
                paintIndex: null
              };

              const props = allProps[asset.assetid];
              if (props && Array.isArray(props)) {
                props.forEach(p => {
                  if (p.propertyid === 2 && p.float_value) item.float = parseFloat(p.float_value);
                  if (p.propertyid === 1 && p.int_value) item.paintSeed = parseInt(p.int_value);
                  if (p.propertyid === 3 && p.int_value) item.paintIndex = parseInt(p.int_value);
                });
              }

              items.push(item);
            }
          }

          window.dispatchEvent(new CustomEvent('sk_inventory_ready', {
            detail: {
              count: items.length,
              currency: typeof g_rgWalletInfo !== 'undefined' ? g_rgWalletInfo.wallet_currency : 1,
              items: items
            }
          }));
          return true;
        }
      }
    } catch (e) {
      console.error('[SkinKeeper Inject] Error:', e);
    }
    return false;
  }

  const timer = setInterval(() => { if (checkInventory()) clearInterval(timer); }, 500);
  setTimeout(() => clearInterval(timer), 15000);

  // ─── Steam fetch/XHR interception ───────────────────────────────────
  // Passively intercept Steam API responses the user already triggers.
  // Zero extra requests — we only read responses that Steam returns.

  const walletCurrency = (typeof g_rgWalletInfo !== 'undefined') ? g_rgWalletInfo.wallet_currency : 1;

  // Dispatch intercepted data to content script via CustomEvent
  function emitPrice(data) {
    window.dispatchEvent(new CustomEvent('sk_price_intercepted', { detail: data }));
  }

  // ── Intercept fetch() ────────────────────────────────────────────────
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';

      // priceoverview — Steam returns lowest_price, median_price, volume
      if (url.includes('market/priceoverview')) {
        const clone = response.clone();
        clone.json().then(data => {
          if (!data || !data.success) return;
          const params = new URL(url, location.origin).searchParams;
          const name = params.get('market_hash_name');
          if (!name) return;

          const prices = [];
          if (data.lowest_price) {
            const cents = parseSteamPrice(data.lowest_price);
            if (cents > 0) prices.push({ market_hash_name: name, price_cents: cents, currency_id: walletCurrency, source: 'steam_listing', timestamp: Date.now() });
          }
          if (data.volume) {
            const vol = parseInt(data.volume.replace(/[^0-9]/g, ''));
            if (vol > 0 && prices.length > 0) prices[0].volume = vol;
          }
          if (prices.length > 0) emitPrice({ type: 'priceoverview', prices });
        }).catch(() => {});
      }

      // itemordershistogram — buy/sell order book
      if (url.includes('itemordershistogram')) {
        const clone = response.clone();
        clone.json().then(data => {
          if (!data || !data.success) return;
          const prices = [];
          // Extract item name from the page context
          const name = document.querySelector('.market_listing_nav a:last-child')?.textContent?.trim();
          if (!name) return;

          if (data.highest_buy_order) {
            prices.push({ market_hash_name: name, price_cents: parseInt(data.highest_buy_order), currency_id: walletCurrency, source: 'steam_buyorder', timestamp: Date.now() });
          }
          if (data.lowest_sell_order) {
            prices.push({ market_hash_name: name, price_cents: parseInt(data.lowest_sell_order), currency_id: walletCurrency, source: 'steam_listing', timestamp: Date.now() });
          }
          if (prices.length > 0) emitPrice({ type: 'histogram', prices });
        }).catch(() => {});
      }

      // myhistory (market transaction history) — completed sales
      if (url.includes('market/myhistory')) {
        const clone = response.clone();
        clone.json().then(data => {
          if (!data || !data.success || !data.assets || !data.assets['730']) return;
          const prices = [];
          const assets = data.assets['730']['2'] || {};
          const events = data.events || [];
          for (const ev of events) {
            if (ev.event_type === 4 || ev.event_type === 3) { // 3=listing created, 4=listing sold
              const asset = assets[ev.listingid] || assets[ev.purchaseid] || {};
              const name = asset.market_hash_name;
              if (name && ev.price) {
                prices.push({ market_hash_name: name, price_cents: ev.price + (ev.fee || 0), currency_id: walletCurrency, source: 'steam_sale', timestamp: Date.now() });
              }
            }
          }
          if (prices.length > 0) emitPrice({ type: 'myhistory', prices });
        }).catch(() => {});
      }

    } catch (e) { /* silent — never break Steam pages */ }
    return response;
  };

  // ── Intercept XMLHttpRequest ──────────────────────────────────────────
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._sk_url = typeof url === 'string' ? url : url?.toString() || '';
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      try {
        const url = this._sk_url || '';

        if (url.includes('market/priceoverview') || url.includes('itemordershistogram') || url.includes('market/myhistory')) {
          let data;
          try { data = JSON.parse(this.responseText); } catch { return; }
          if (!data || !data.success) return;

          if (url.includes('market/priceoverview')) {
            const params = new URL(url, location.origin).searchParams;
            const name = params.get('market_hash_name');
            if (!name) return;
            const prices = [];
            if (data.lowest_price) {
              const cents = parseSteamPrice(data.lowest_price);
              if (cents > 0) prices.push({ market_hash_name: name, price_cents: cents, currency_id: walletCurrency, source: 'steam_listing', timestamp: Date.now() });
            }
            if (prices.length > 0) emitPrice({ type: 'priceoverview', prices });
          }

          if (url.includes('itemordershistogram')) {
            const name = document.querySelector('.market_listing_nav a:last-child')?.textContent?.trim();
            if (!name) return;
            const prices = [];
            if (data.highest_buy_order) prices.push({ market_hash_name: name, price_cents: parseInt(data.highest_buy_order), currency_id: walletCurrency, source: 'steam_buyorder', timestamp: Date.now() });
            if (data.lowest_sell_order) prices.push({ market_hash_name: name, price_cents: parseInt(data.lowest_sell_order), currency_id: walletCurrency, source: 'steam_listing', timestamp: Date.now() });
            if (prices.length > 0) emitPrice({ type: 'histogram', prices });
          }
        }
      } catch (e) { /* silent */ }
    });
    return originalXHRSend.apply(this, args);
  };

  // ── Parse Steam price strings like "$12.34", "12,34€", "1 234,56₽", "$1,234.56" ──
  function parseSteamPrice(str) {
    if (!str) return 0;
    // Remove all non-numeric except dots and commas
    var cleaned = str.replace(/[^\d.,]/g, '');
    if (!cleaned) return 0;

    // Detect format: if last separator is comma and has 2 digits after → European (12,34)
    // If last separator is dot and has 2 digits after → US/standard (12.34)
    var lastComma = cleaned.lastIndexOf(',');
    var lastDot = cleaned.lastIndexOf('.');

    if (lastComma > lastDot) {
      // European: "1.234,56" or "12,34" — comma is decimal
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma) {
      // US/standard: "1,234.56" or "12.34" — dot is decimal
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // Only one type or none — try as-is
      cleaned = cleaned.replace(/,/g, '.');
    }

    var val = parseFloat(cleaned);
    return isNaN(val) ? 0 : Math.round(val * 100);
  }
})();
