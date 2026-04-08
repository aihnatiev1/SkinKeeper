export {};

const DEFAULT_SETTINGS: Record<string, any> = {
  showPrices: true,
  priceSource: 'buff',
  showRatio: true,
  showVelocity: true,
  currency: 'USD',
  showFloats: true,
  showPhases: true,
  showStickerSP: true,
  showBlueGems: true,
  showPL: true,
  showArbitrage: true,
  showTradePL: true,
  stackDuplicates: true,
  showTradeLock: true,
  quickSell: true,
  collectPrices: true,
  conflictDetection: true,
  apiKeyGuard: true,
  autoSkipAge: true,
  autoAcceptSSA: true,
  marketListingFloats: true,
};

let currentSettings: Record<string, any> = {};
let dirty = false;

async function init() {
  // Load settings
  const { sk_settings = {} } = await chrome.storage.local.get('sk_settings');
  currentSettings = { ...DEFAULT_SETTINGS, ...sk_settings };

  // Apply to UI
  applySettingsToUI();

  // Load account info
  loadAccount();

  // Setup event listeners
  setupToggles();
  setupSelects();
  setupSaveBar();

  // Version
  const manifest = chrome.runtime.getManifest();
  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = manifest.version;
}

function applySettingsToUI() {
  // Toggles
  document.querySelectorAll<HTMLButtonElement>('.toggle[data-setting]').forEach((btn) => {
    const key = btn.dataset.setting!;
    if (currentSettings[key] === false) {
      btn.classList.remove('active');
    } else {
      btn.classList.add('active');
    }
  });

  // Selects
  document.querySelectorAll<HTMLSelectElement>('select[data-setting]').forEach((sel) => {
    const key = sel.dataset.setting!;
    if (currentSettings[key]) {
      sel.value = currentSettings[key];
    }
  });
}

function setupToggles() {
  document.querySelectorAll<HTMLButtonElement>('.toggle[data-setting]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const key = btn.dataset.setting!;
      currentSettings[key] = btn.classList.contains('active');
      markDirty();
    });
  });
}

function setupSelects() {
  document.querySelectorAll<HTMLSelectElement>('select[data-setting]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const key = sel.dataset.setting!;
      currentSettings[key] = sel.value;
      markDirty();
    });
  });
}

function markDirty() {
  dirty = true;
  document.getElementById('save-bar')?.classList.add('visible');
  const status = document.getElementById('save-status');
  if (status) status.textContent = '';
}

function setupSaveBar() {
  document.getElementById('save-btn')?.addEventListener('click', async () => {
    await chrome.storage.local.set({ sk_settings: currentSettings });
    dirty = false;
    const status = document.getElementById('save-status');
    if (status) status.textContent = 'Saved!';
    setTimeout(() => {
      document.getElementById('save-bar')?.classList.remove('visible');
    }, 1500);
  });
}

async function loadAccount() {
  const content = document.getElementById('account-content')!;
  const { sk_token } = await chrome.storage.local.get('sk_token');

  if (!sk_token) {
    content.innerHTML = `
      <p style="font-size:13px;color:#94a3b8;margin-bottom:12px">Connect your SkinKeeper account for portfolio tracking, P/L data, and alerts.</p>
      <a href="https://app.skinkeeper.store/login?source=extension" target="_blank"
        style="display:inline-flex;align-items:center;gap:8px;padding:8px 20px;border-radius:10px;background:linear-gradient(135deg,#6366F1,#8B5CF6);color:#fff;font-weight:600;font-size:13px;text-decoration:none">
        Sign in with SkinKeeper
      </a>
    `;
    return;
  }

  // Fetch user
  const user = await chrome.runtime.sendMessage({ type: 'GET_USER' });
  if (!user) {
    content.innerHTML = `<p style="color:#f87171;font-size:12px">Session expired. <a href="https://app.skinkeeper.store/login?source=extension" target="_blank" style="color:#818cf8">Sign in again</a></p>`;
    return;
  }

  content.innerHTML = `
    <div class="account-section">
      ${user.avatar_url ? `<img class="account-avatar" src="${user.avatar_url}" />` : ''}
      <div>
        <div class="account-name">${user.display_name} ${user.is_premium ? '<span style="color:#fbbf24;font-size:10px">★ PRO</span>' : ''}</div>
        <a class="account-link" href="https://app.skinkeeper.store/portfolio" target="_blank">Open SkinKeeper Dashboard →</a>
      </div>
      <button class="btn-disconnect" id="disconnect-btn">Disconnect</button>
    </div>
  `;

  document.getElementById('disconnect-btn')?.addEventListener('click', async () => {
    await chrome.storage.local.remove('sk_token');
    loadAccount();
  });
}

init();
