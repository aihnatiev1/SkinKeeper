import '../styles/skinkeeper.css';
import { el, waitForElement, sendMessage } from '../shared/dom';
import { injectMiniCard } from '../shared/miniCard';

async function init() {
  const header = document.querySelector('.profile_header_actions');
  if (!header) return;

  // SK button
  const btn = el('a', 'sk-profile-btn') as HTMLAnchorElement;
  btn.href = 'https://app.skinkeeper.store/portfolio';
  btn.target = '_blank';
  btn.style.marginLeft = '8px';
  btn.innerHTML = '<span style="font-weight:800;font-size:10px;letter-spacing:-0.5px">SK</span> SkinKeeper';
  header.appendChild(btn);

  // +Rep button
  const repBtn = el('button', 'sk-profile-btn');
  repBtn.style.cssText += 'margin-left:6px;background:linear-gradient(135deg,#059669,#10b981)';
  repBtn.textContent = '+Rep';
  repBtn.addEventListener('click', addRep);
  header.appendChild(repBtn);

  // Fetch ban/scam status + copy link
  const steamId = extractSteamId();
  if (steamId) {
    // Copy permanent profile link button
    const copyLinkBtn = el('button', 'sk-profile-btn');
    copyLinkBtn.style.cssText += 'margin-left:6px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#818cf8';
    copyLinkBtn.textContent = '🔗 Permanent Link';
    copyLinkBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(`https://steamcommunity.com/profiles/${steamId}`).then(() => {
        copyLinkBtn.textContent = '✓ Copied!';
        setTimeout(() => { copyLinkBtn.textContent = '🔗 Permanent Link'; }, 2000);
      });
    });
    header.appendChild(copyLinkBtn);

    checkBanStatus(steamId);
    checkSteamRepStatus(steamId);
    showRealChatStatus(steamId);
  }

  console.log('[SkinKeeper] Profile loaded');
}

// ─── Real Chat Status (ported from CSGO Trader) ─────────────────────
// Steam only shows "Online" but actual state could be Away, Snooze, etc.
// personastate: 0=Offline, 1=Online, 2=Busy, 3=Away, 4=Snooze, 5=LookingToTrade, 6=LookingToPlay

const PERSONA_STATES: Record<number, [string, string]> = {
  0: ['Offline', '#898989'],
  1: ['Online', '#57cbde'],
  2: ['Busy', '#f44336'],
  3: ['Away', '#ffc107'],
  4: ['Snooze', '#ff9800'],
  5: ['Looking to Trade', '#4ade80'],
  6: ['Looking to Play', '#4ade80'],
};

async function showRealChatStatus(steamId: string) {
  try {
    // Use Steam's own GetPlayerSummaries proxy (requires steam API key from page)
    // Alternative: parse from page's embedded persona data
    const statusEl = document.querySelector('.profile_in_game_header, .profile_persona');
    if (!statusEl) return;

    // Steam pages embed persona state in the profile_in_game block
    const inGameEl = document.querySelector('.profile_in_game_name');
    const personaEl = document.querySelector('.profile_in_game_header');

    // Check if Steam shows just "Currently Online" — we can enhance
    if (personaEl?.textContent?.trim() === 'Currently Online') {
      // Try to get detailed state from miniprofile data
      const miniprofile = document.querySelector('[data-miniprofile]');
      if (miniprofile) {
        const mpId = miniprofile.getAttribute('data-miniprofile');
        if (mpId) {
          const data = await sendMessage({ type: 'FETCH_JSON', url: `https://steamcommunity.com/miniprofile/${mpId}/json` });
          if (data?.persona_state != null && data.persona_state !== 1) {
            const [label, color] = PERSONA_STATES[data.persona_state] || ['Online', '#57cbde'];
            const badge = el('span');
            badge.style.cssText = `color:${color};font-weight:600;font-size:12px;margin-left:6px;font-family:var(--sk-font)`;
            badge.textContent = `(${label})`;
            personaEl.appendChild(badge);
          }
        }
      }
    }
  } catch {}
}

function extractSteamId(): string | null {
  // Try from page data attributes or scripts
  const scripts = document.querySelectorAll('script');
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    const match = script.textContent?.match(/g_steamID\s*=\s*"(\d{17})"/);
    if (match) return match[1];
  }
  // Try from profile URL data
  const profileData = document.querySelector('[data-steamid]');
  if (profileData) return profileData.getAttribute('data-steamid');
  // Try from miniprofile
  const mp = document.querySelector('.playerAvatar[data-miniprofile]');
  if (mp) {
    const id = document.querySelector('[data-steamid]');
    if (id) return id.getAttribute('data-steamid');
  }
  return null;
}

// ─── +Rep ─────────────────────────────────────────────────────────────

function addRep() {
  const commentBox = document.querySelector('#commentthread_entry_area textarea, .commentthread_entry_area textarea') as HTMLTextAreaElement | null;
  if (commentBox) {
    commentBox.value = '+rep';
    commentBox.focus();
    commentBox.dispatchEvent(new Event('input', { bubbles: true }));
    // Try to click submit
    const submitBtn = document.querySelector('.btn_green_white_innerfade.btn_small, [onclick*="PostComment"]') as HTMLElement | null;
    if (submitBtn) {
      setTimeout(() => submitBtn.click(), 100);
    }
  } else {
    // Scroll to comments
    const comments = document.querySelector('.commentthread_area, .profile_comment_area');
    if (comments) comments.scrollIntoView({ behavior: 'smooth' });
  }
}

// ─── Ban Status ───────────────────────────────────────────────────────

async function checkBanStatus(steamId: string) {
  // Extract ban info from Steam profile page itself
  const banInfo = document.querySelector('.profile_ban_status, .profile_ban');
  const tradeBan = document.querySelector('.profile_in_game.persona_name_text_content');

  const badges: Array<{ text: string; color: string; bg: string }> = [];

  // Check for VAC ban
  if (document.body.textContent?.includes('VAC ban')) {
    badges.push({ text: 'VAC BAN', color: '#fff', bg: '#dc2626' });
  }

  // Check for trade ban
  if (document.body.textContent?.includes('trade ban') || document.body.textContent?.includes('Trade Banned')) {
    badges.push({ text: 'TRADE BAN', color: '#fff', bg: '#dc2626' });
  }

  // Check for community ban
  if (document.body.textContent?.includes('Community Ban')) {
    badges.push({ text: 'COMMUNITY BAN', color: '#fff', bg: '#dc2626' });
  }

  // Check for game ban
  if (document.body.textContent?.match(/\d+ game ban/i)) {
    badges.push({ text: 'GAME BAN', color: '#fff', bg: '#f97316' });
  }

  if (badges.length > 0) {
    injectBanBadges(badges);
  }
}

// ─── SteamRep Check ───────────────────────────────────────────────────

async function checkSteamRepStatus(steamId: string) {
  try {
    const data = await sendMessage({
      type: 'FETCH_JSON',
      url: `https://steamrep.com/api/beta4/reputation/${steamId}?json=1`,
    });

    if (!data?.steamrep?.reputation?.summary) return;

    const summary = data.steamrep.reputation.summary.toLowerCase();

    if (summary.includes('scammer')) {
      injectScammerWarning(summary);
    } else if (summary.includes('caution')) {
      injectCautionBadge();
    }
  } catch {
    // SteamRep API might be down — silently fail
  }
}

function injectScammerWarning(summary: string) {
  const header = document.querySelector('.profile_header');
  if (!header || document.querySelector('.sk-scammer-banner')) return;

  const banner = el('div', 'sk-scammer-banner');
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:8px;
      background:rgba(220,38,38,0.15);border:2px solid rgba(220,38,38,0.5);
      font-family:var(--sk-font);margin:8px 0">
      <div style="font-size:24px;font-weight:900;color:#dc2626;flex-shrink:0">SCAMMER</div>
      <div>
        <div style="color:#fca5a5;font-size:13px;font-weight:700">SteamRep Banned</div>
        <div style="color:#94a3b8;font-size:11px">This user is marked as a scammer on SteamRep. Do NOT trade with them.</div>
      </div>
    </div>
  `;

  header.parentElement?.insertBefore(banner, header);
}

function injectCautionBadge() {
  const badges = document.querySelector('.profile_header_actions');
  if (!badges) return;

  const badge = el('span', 'sk-profile-btn');
  badge.style.cssText += 'margin-left:6px;background:linear-gradient(135deg,#d97706,#f59e0b);font-size:10px';
  badge.textContent = 'CAUTION';
  badge.title = 'SteamRep: This user has caution flags';
  badges.appendChild(badge);
}

function injectBanBadges(badges: Array<{ text: string; color: string; bg: string }>) {
  const actions = document.querySelector('.profile_header_actions');
  if (!actions) return;

  for (const b of badges) {
    const badge = el('span', 'sk-profile-btn');
    badge.style.cssText += `margin-left:6px;background:${b.bg};color:${b.color};font-size:10px;cursor:default`;
    badge.textContent = b.text;
    actions.appendChild(badge);
  }
}

// ─── Auto-detect spam comments (ported from CSGO Trader) ─────────────

const SPAM_PATTERNS = [
  /free\s*(skin|knife|item|cs2|csgo)/i,
  /giveaway.*click/i,
  /discord\.gg\//i,
  /bit\.ly\//i,
  /t\.me\//i,
  /click\s*(here|link|my)/i,
  /csgo.*free/i,
  /skin.*free/i,
  /trade.*link.*below/i,
  /this\s*site\s*gives/i,
  /won\s*(a|the)\s*(skin|knife)/i,
  /check\s*(my|this)\s*(inventory|profile)/i,
];

function flagSpamComments() {
  const comments = document.querySelectorAll('.commentthread_comment');
  comments.forEach((comment) => {
    const text = comment.querySelector('.commentthread_comment_text')?.textContent || '';
    const isSpam = SPAM_PATTERNS.some(p => p.test(text));
    if (isSpam && !comment.querySelector('.sk-spam-flag')) {
      const flag = el('span', 'sk-spam-flag');
      flag.style.cssText = 'color:#f87171;font-size:10px;font-weight:700;font-family:var(--sk-font);margin-left:6px;background:rgba(248,113,113,0.1);padding:1px 5px;border-radius:3px;border:1px solid rgba(248,113,113,0.2)';
      flag.textContent = '⚠ Likely spam';
      const header = comment.querySelector('.commentthread_comment_author');
      if (header) header.appendChild(flag);
    }
  });
}

// Run spam check after page loads
setTimeout(flagSpamComments, 2000);

init();
injectMiniCard();
