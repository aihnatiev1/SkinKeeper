import '../styles/skinkeeper.css';
import { el } from '../shared/dom';

async function init() {
  const searchBar = document.querySelector('.market_search_sidebar_contents, .market_tab_well_tabs');
  if (!searchBar) return;

  const banner = el('div', 'sk-market-banner');
  banner.style.marginBottom = '12px';

  const logo = el('div', 'sk-banner-logo');
  logo.style.cssText = 'width:28px;height:28px;font-size:11px';
  logo.textContent = 'SK';
  banner.appendChild(logo);

  const info = el('div');
  info.style.cssText = 'flex:1';
  const title = el('div');
  title.style.cssText = 'font-size:13px;font-weight:600;color:var(--sk-text)';
  title.textContent = 'SkinKeeper';
  const desc = el('div');
  desc.style.cssText = 'font-size:11px;color:var(--sk-text-dim)';
  desc.textContent = 'Track prices, P/L, and set alerts';
  info.append(title, desc);
  banner.appendChild(info);

  const cta = el('a', 'sk-banner-cta') as HTMLAnchorElement;
  cta.href = 'https://app.skinkeeper.store/portfolio';
  cta.target = '_blank';
  cta.style.fontSize = '11px';
  cta.textContent = 'Open Dashboard';
  banner.appendChild(cta);

  searchBar.parentElement?.insertBefore(banner, searchBar);
  console.log('[SkinKeeper] Market home loaded');
}

init();
