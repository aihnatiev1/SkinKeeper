import '../../styles/skinkeeper.css';
import {
  getSessionID, getWalletCurrency, readMarketListings,
  buyListing, createBuyOrder, getHighestBuyOrder,
  formatPriceViaSteam, getPriceAfterFees,
} from '../../shared/steam';
import { el, waitForElement } from '../../shared/dom';

const APP_ID = '730';

function extractName(): string | null {
  const m = window.location.pathname.match(/\/market\/listings\/730\/(.+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function init() {
  const itemName = extractName();
  if (!itemName) return;

  console.log(`[SkinKeeper] Market Listing: ${itemName}`);

  await waitForElement('.market_listing_row');

  addInstantBuyButtons();
  addBuyOrderButtons(itemName);
  addStickerInfo();

  // Re-run when Steam loads more listings
  const container = document.getElementById('searchResultsRows');
  if (container) {
    new MutationObserver(() => {
      addInstantBuyButtons();
      addStickerInfo();
    }).observe(container, { childList: true });
  }
}

// ─── Instant Buy on each listing ─────────────────────────────────────

function addInstantBuyButtons() {
  document.querySelectorAll('.market_listing_row.market_recent_listing_row').forEach((row) => {
    const htmlRow = row as HTMLElement;
    // Skip own listings
    if (htmlRow.parentElement?.id === 'tabContentsMyActiveMarketListingsRows') return;
    if (htmlRow.parentElement?.parentElement?.id === 'tabContentsMyListings') return;
    // Already added
    if (htmlRow.querySelector('.sk-instant-buy')) return;

    // Skip sold/removed listings (no Buy Now button or shows "Sold!")
    if (htmlRow.textContent?.includes('Sold!')) return;

    const buyBtn = htmlRow.querySelector('.market_listing_buy_button')
      || htmlRow.querySelector('[class*="buy_button"]')
      || htmlRow.querySelector('a.btn_green_white_innerfade');
    if (!buyBtn) return;

    const listingId = getListingId(htmlRow);
    if (!listingId) return;

    // Clone Steam's Buy Now button for consistent styling
    const buyLink = buyBtn.querySelector('a.btn_green_white_innerfade');
    if (!buyLink) return;

    const btn = buyLink.cloneNode(true) as HTMLElement;
    btn.className = 'sk-instant-buy item_market_action_button btn_green_white_innerfade btn_small';
    btn.removeAttribute('href');
    btn.style.cssText = 'cursor:pointer; margin-top:4px; display:block;';
    const span = btn.querySelector('span');
    if (span) {
      span.textContent = 'Instant Buy';
      span.title = 'Buy with one click (no dialog)';
    } else {
      btn.textContent = 'Instant Buy';
    }

    const setText = (text: string) => {
      const s = btn.querySelector('span');
      if (s) s.textContent = text;
      else btn.textContent = text;
    };

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      setText('Buying...');

      const listing = getListingData(listingId);
      if (!listing) { setText('No data'); return; }

      const ok = await buyListing(listing);
      if (ok) {
        setText('Confirm in app');
        btn.style.background = '#16a34a';
      } else {
        setText('Error');
        btn.style.background = '#dc2626';
      }
    });

    buyBtn.insertAdjacentElement('afterend', btn);
  });
}

function getListingId(row: HTMLElement): string | null {
  const idAttr = row.id; // e.g. "listing_12345"
  if (idAttr?.startsWith('listing_')) return idAttr.replace('listing_', '');
  // Fallback: find in buy button link
  const link = row.querySelector('a[href*="buylisting"]');
  const m = link?.getAttribute('href')?.match(/buylisting\/(\d+)/);
  return m ? m[1] : null;
}

function getListingData(listingId: string): { listingid: string; converted_price: number; converted_fee: number; converted_currencyid: number } | null {
  // Read from Steam's page variable g_rgListingInfo
  const script = `
    try {
      var l = g_rgListingInfo["${listingId}"];
      if (l) document.body.setAttribute('sk_listing', JSON.stringify({
        listingid: "${listingId}",
        converted_price: l.converted_price,
        converted_fee: l.converted_fee,
        converted_currencyid: l.converted_currencyid
      }));
    } catch(e) {}
  `;
  const div = document.createElement('div');
  div.setAttribute('onreset', script);
  div.dispatchEvent(new CustomEvent('reset'));
  div.remove();

  const raw = document.body.getAttribute('sk_listing');
  if (raw) {
    document.body.removeAttribute('sk_listing');
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

// ─── Buy Order Buttons ───────────────────────────────────────────────

function addBuyOrderButtons(itemName: string) {
  const buyOrderSection = document.getElementById('market_buyorder_info')
    || document.getElementById('market_activity_section');
  if (!buyOrderSection) return;

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;align-items:center;gap:8px;margin:8px 0;flex-wrap:wrap;';

  // Place highest order
  const highestBtn = document.createElement('a');
  highestBtn.className = 'btn_green_white_innerfade btn_small';
  highestBtn.style.cursor = 'pointer';
  highestBtn.innerHTML = '<span>Place highest order</span>';
  highestBtn.addEventListener('click', async () => {
    highestBtn.innerHTML = '<span>Loading...</span>';
    const walletCurr = getWalletCurrency();
    const highest = await getHighestBuyOrder(itemName, walletCurr);
    if (!highest) { highestBtn.innerHTML = '<span>No orders</span>'; return; }
    // Currencies without decimals (UAH, RUB, etc.): +1 whole unit, others: +1 cent
    const NO_DECIMALS: number[] = [5, 9, 10, 11, 14, 15, 17, 18, 29, 30, 37];
    const step = NO_DECIMALS.includes(walletCurr) ? 100 : 1;
    const newPrice = highest + step;
    if (!confirm(`Place buy order for ${formatPriceViaSteam(newPrice) || newPrice}?`)) {
      highestBtn.innerHTML = '<span>Place highest order</span>';
      return;
    }
    const res = await createBuyOrder(itemName, newPrice);
    if (res.success) {
      window.location.reload();
    } else {
      highestBtn.innerHTML = `<span style="color:#f87171">${res.message || 'Error'}</span>`;
    }
  });
  container.appendChild(highestBtn);

  // Quick-place order
  const quickBtn = document.createElement('a');
  quickBtn.className = 'btn_green_white_innerfade btn_small';
  quickBtn.style.cursor = 'pointer';
  quickBtn.innerHTML = '<span>Quick-place order</span>';

  const priceInput = document.createElement('input');
  priceInput.type = 'text';
  priceInput.placeholder = 'Price';
  priceInput.style.cssText = 'width:60px;padding:3px 6px;background:#1e1e2e;color:#fff;border:1px solid #30363d;border-radius:3px;font-size:12px;';

  // Auto-fill price from highest buy order
  const walletCurrAuto = getWalletCurrency();
  getHighestBuyOrder(itemName, walletCurrAuto).then((highest) => {
    if (highest) {
      const NO_DEC: number[] = [5, 9, 10, 11, 14, 15, 17, 18, 29, 30, 37];
      const step = NO_DEC.includes(walletCurrAuto) ? 100 : 1;
      const suggested = highest + step;
      priceInput.value = NO_DEC.includes(walletCurrAuto) ? String(suggested / 100) : (suggested / 100).toFixed(2);
      priceInput.title = `Highest order: ${formatPriceViaSteam(highest) || highest}`;
    }
  });

  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.value = '1';
  qtyInput.min = '1';
  qtyInput.style.cssText = 'width:40px;padding:3px 6px;background:#1e1e2e;color:#fff;border:1px solid #30363d;border-radius:3px;font-size:12px;';

  const priceLabel = document.createElement('span');
  priceLabel.textContent = 'Price:';
  priceLabel.style.cssText = 'color:#8b949e;font-size:12px';

  const qtyLabel = document.createElement('span');
  qtyLabel.textContent = 'Qty:';
  qtyLabel.style.cssText = 'color:#8b949e;font-size:12px';

  quickBtn.addEventListener('click', async () => {
    // Strip everything except digits, dots, commas, spaces
    const priceStr = priceInput.value.replace(/[^\d.,\s]/g, '').replace(/\s/g, '').replace(',', '.');
    const priceFloat = parseFloat(priceStr);
    if (!priceFloat || isNaN(priceFloat) || priceFloat <= 0) { alert('Enter a price (e.g. 85 or 1.23)'); return; }
    // For no-decimal currencies: input is whole units (85 UAH = 8500 kopecks)
    // For decimal currencies: input can be 1.23 USD = 123 cents
    const NO_DECIMALS: number[] = [5, 9, 10, 11, 14, 15, 17, 18, 29, 30, 37];
    const walletCurr = getWalletCurrency();
    const priceCents = NO_DECIMALS.includes(walletCurr)
      ? Math.round(priceFloat) * 100  // 85 → 8500
      : Math.round(priceFloat * 100); // 1.23 → 123
    const qty = parseInt(qtyInput.value) || 1;

    quickBtn.innerHTML = '<span>Placing...</span>';
    const res = await createBuyOrder(itemName, priceCents, qty);
    if (res.success) {
      window.location.reload();
    } else {
      quickBtn.innerHTML = `<span style="color:#f87171">${res.message || 'Error'}</span>`;
      setTimeout(() => { quickBtn.innerHTML = '<span>Quick-place order</span>'; }, 3000);
    }
  });

  container.append(highestBtn, quickBtn, priceLabel, priceInput, qtyLabel, qtyInput);
  buyOrderSection.firstElementChild?.insertAdjacentElement('afterend', container);
}

// ─── Sticker Info on Listings ────────────────────────────────────────

function addStickerInfo() {
  document.querySelectorAll('.market_listing_row.market_recent_listing_row').forEach((row) => {
    const htmlRow = row as HTMLElement;
    if (htmlRow.querySelector('.sk-sticker-row')) return;

    const listingId = getListingId(htmlRow);
    if (!listingId) return;

    // Read asset descriptions from Steam's page variables
    const stickerData = getStickerData(listingId);
    if (!stickerData || stickerData.length === 0) return;

    const stickerRow = document.createElement('div');
    stickerRow.className = 'sk-sticker-row';
    stickerRow.style.cssText = 'display:flex;gap:2px;padding:2px 0 0 70px;flex-wrap:wrap;align-items:center;';

    for (const sticker of stickerData) {
      const img = document.createElement('img');
      img.src = `https://steamcommunity-a.akamaihd.net/economy/image/${sticker.icon_url}/64x48`;
      img.style.cssText = 'width:32px;height:24px;';
      img.title = sticker.name;
      stickerRow.appendChild(img);
    }

    // Insert after the item image row
    const itemCell = htmlRow.querySelector('.market_listing_item_img_container, .market_listing_item_img');
    if (itemCell) {
      itemCell.parentElement?.insertAdjacentElement('afterend', stickerRow);
    } else {
      htmlRow.appendChild(stickerRow);
    }
  });
}

function getStickerData(listingId: string): Array<{ name: string; icon_url: string }> {
  const script = `
    try {
      var result = [];
      var assets = g_rgAssets;
      var listing = g_rgListingInfo["${listingId}"];
      if (listing && listing.asset) {
        var a = listing.asset;
        var assetData = assets[a.appid] && assets[a.appid][a.contextid] && assets[a.appid][a.contextid][a.id];
        if (assetData && assetData.descriptions) {
          for (var i = 0; i < assetData.descriptions.length; i++) {
            var d = assetData.descriptions[i];
            if (d.value && d.value.indexOf('sticker_info') !== -1) {
              var imgs = d.value.match(/src="[^"]*economy\\/image\\/([^/"]+)/g);
              var names = d.value.match(/Sticker: ([^<]+)/);
              if (names && names[1] && imgs) {
                var stickerNames = names[1].split(', ');
                for (var j = 0; j < stickerNames.length; j++) {
                  var iconMatch = imgs[j] ? imgs[j].match(/economy\\/image\\/([^/"]+)/) : null;
                  result.push({ name: stickerNames[j].trim(), icon_url: iconMatch ? iconMatch[1] : '' });
                }
              }
            }
          }
        }
      }
      document.body.setAttribute('sk_stickers', JSON.stringify(result));
    } catch(e) { document.body.setAttribute('sk_stickers', '[]'); }
  `;
  const div = document.createElement('div');
  div.setAttribute('onreset', script);
  div.dispatchEvent(new CustomEvent('reset'));
  div.remove();

  const raw = document.body.getAttribute('sk_stickers');
  if (raw) {
    document.body.removeAttribute('sk_stickers');
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

init();
