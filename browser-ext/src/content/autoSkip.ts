/**
 * Auto-skip Steam age verification and SSA agreement
 * QoL feature — saves clicks on every market purchase
 */
export {};

async function initAutoSkip() {
  const { sk_settings } = await chrome.storage.local.get('sk_settings');
  if (sk_settings?.autoSkipAge !== false) skipAgeCheck();
  if (sk_settings?.autoAcceptSSA !== false) autoAcceptSSA();
}

function skipAgeCheck() {
  // Look for age gate elements
  const yearSelect = document.getElementById('ageYear') as HTMLSelectElement
    || document.querySelector('.agegate_birthday_selector select[name="ageYear"]') as HTMLSelectElement;

  if (yearSelect) {
    yearSelect.value = '1990';
    yearSelect.dispatchEvent(new Event('change', { bubbles: true }));

    // Also set month and day if present
    const monthSelect = document.querySelector('select[name="ageMonth"]') as HTMLSelectElement;
    const daySelect = document.querySelector('select[name="ageDay"]') as HTMLSelectElement;
    if (monthSelect) { monthSelect.value = '1'; monthSelect.dispatchEvent(new Event('change', { bubbles: true })); }
    if (daySelect) { daySelect.value = '1'; daySelect.dispatchEvent(new Event('change', { bubbles: true })); }

    // Click submit after a brief delay
    setTimeout(() => {
      const btn = document.getElementById('view_product_page_btn')
        || document.querySelector('.agegate_text_container .btnv6_blue_hoverfade')
        || document.querySelector('.agegate_text_container a[href]')
        || document.querySelector('#agecheck_form button[type="submit"]')
        || document.querySelector('.btn_medium a');
      if (btn) (btn as HTMLElement).click();
    }, 100);

    console.log('[SkinKeeper] Age check auto-skipped');
  }
}

function autoAcceptSSA() {
  // SSA checkbox in market buy dialog
  const observer = new MutationObserver(() => {
    // Market buy dialog SSA
    const ssaCheck = document.getElementById('market_buynow_dialog_accept_ssa') as HTMLInputElement
      || document.getElementById('accept_ssa') as HTMLInputElement;
    if (ssaCheck && !ssaCheck.checked) {
      ssaCheck.checked = true;
      ssaCheck.dispatchEvent(new Event('change', { bubbles: true }));
      ssaCheck.dispatchEvent(new Event('click', { bubbles: true }));
      console.log('[SkinKeeper] SSA auto-accepted');
    }

    // Also handle the "I agree to the terms" checkbox in various Steam dialogs
    const checkboxes = document.querySelectorAll('input[type="checkbox"][name*="ssa"], input[type="checkbox"][id*="ssa"]');
    checkboxes.forEach((cb) => {
      const input = cb as HTMLInputElement;
      if (!input.checked) {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// Run immediately
initAutoSkip();
