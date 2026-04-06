// ─── Popup Logic ──────────────────────────────────────────────────────
export {};

async function init() {
  const loginSection = document.getElementById('login-section')!;
  const dashboard = document.getElementById('dashboard')!;

  // Check if logged in
  const { sk_token } = await chrome.storage.local.get('sk_token');

  if (!sk_token) {
    loginSection.style.display = 'block';
    dashboard.style.display = 'none';
    return;
  }

  loginSection.style.display = 'none';
  dashboard.style.display = 'block';

  // Fetch user data
  const user = await chrome.runtime.sendMessage({ type: 'GET_USER' });
  const portfolio = await chrome.runtime.sendMessage({ type: 'GET_PORTFOLIO' });

  if (!user) {
    // Token expired
    loginSection.style.display = 'block';
    dashboard.style.display = 'none';
    return;
  }

  renderUser(user);
  renderStats(portfolio);
  setupQuickLinks();
  setupToggles();
}

// Login removed — popup links to skinkeeper.store for info

function renderUser(user: any) {
  const row = document.getElementById('user-row')!;
  row.innerHTML = `
    ${user.avatar_url ? `<img class="user-avatar" src="${user.avatar_url}" />` : ''}
    <div>
      <div class="user-name">
        ${user.display_name}
        ${user.is_premium ? '<span class="user-pro">&#9733; PRO</span>' : ''}
      </div>
      <div class="user-steamid">${user.steam_id}</div>
    </div>
  `;
}

function renderStats(portfolio: any) {
  const grid = document.getElementById('stats-grid')!;
  if (!portfolio) {
    grid.innerHTML = '<div class="stat-card" style="grid-column:1/-1;text-align:center;color:#64748b;font-size:12px">Portfolio data unavailable</div>';
    return;
  }

  const changeClass = portfolio.change_24h >= 0 ? 'positive' : 'negative';
  const changeSign = portfolio.change_24h >= 0 ? '+' : '';

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Portfolio Value</div>
      <div class="stat-value">$${portfolio.total_value.toFixed(2)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">24h Change</div>
      <div class="stat-value ${changeClass}">${changeSign}$${portfolio.change_24h.toFixed(2)}</div>
      <div class="stat-change ${changeClass}">${changeSign}${portfolio.change_24h_pct.toFixed(1)}%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Items</div>
      <div class="stat-value">${portfolio.item_count}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">7d Change</div>
      <div class="stat-value ${portfolio.change_7d >= 0 ? 'positive' : 'negative'}">${portfolio.change_7d >= 0 ? '+' : ''}$${portfolio.change_7d.toFixed(2)}</div>
    </div>
  `;
}

function setupQuickLinks() {
  document.querySelectorAll('.quick-link[data-path]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const path = btn.getAttribute('data-path');
      if (path) {
        chrome.tabs.create({ url: `https://app.skinkeeper.store${path}` });
      }
    });
  });
}

async function setupToggles() {
  const { sk_settings = {} } = await chrome.storage.local.get('sk_settings');

  const pricesToggle = document.getElementById('toggle-prices')!;
  const collectToggle = document.getElementById('toggle-collect')!;

  if (sk_settings.showPrices === false) pricesToggle.classList.remove('active');
  if (sk_settings.collectPrices === false) collectToggle.classList.remove('active');

  pricesToggle.addEventListener('click', async () => {
    pricesToggle.classList.toggle('active');
    const { sk_settings = {} } = await chrome.storage.local.get('sk_settings');
    sk_settings.showPrices = pricesToggle.classList.contains('active');
    await chrome.storage.local.set({ sk_settings });
  });

  collectToggle.addEventListener('click', async () => {
    collectToggle.classList.toggle('active');
    const { sk_settings = {} } = await chrome.storage.local.get('sk_settings');
    sk_settings.collectPrices = collectToggle.classList.contains('active');
    await chrome.storage.local.set({ sk_settings });
  });

  const nsfwToggle = document.getElementById('toggle-nsfw');
  if (nsfwToggle) {
    if (sk_settings.nsfwMode) nsfwToggle.classList.add('active');
    nsfwToggle.addEventListener('click', async () => {
      nsfwToggle.classList.toggle('active');
      const { sk_settings = {} } = await chrome.storage.local.get('sk_settings');
      sk_settings.nsfwMode = nsfwToggle.classList.contains('active');
      await chrome.storage.local.set({ sk_settings });
    });
  }
}

init();
