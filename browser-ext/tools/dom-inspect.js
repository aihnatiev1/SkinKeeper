const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const extPath = path.resolve(__dirname, '../dist');
  const context = await chromium.launchPersistentContext('/tmp/sk-chrome-profile2', {
    headless: false,
    channel: 'chrome',
    viewport: null,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
    ],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://steamcommunity.com/id/slavabuster/inventory/#730', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  await page.waitForTimeout(8000);

  // Click first item
  const item = await page.$('.item.app730.context2');
  if (item) await item.click();
  await page.waitForTimeout(2000);

  // Dump the detail panel DOM structure
  const dom = await page.evaluate(() => {
    const panels = ['iteminfo0', 'iteminfo1'].map(id => {
      const p = document.getElementById(id);
      if (!p || p.style.display === 'none') return null;
      return {
        id,
        children: Array.from(p.children).map(c => ({
          tag: c.tagName,
          class: c.className,
          id: c.id,
          children: Array.from(c.children).slice(0, 5).map(cc => ({
            tag: cc.tagName,
            class: cc.className,
            id: cc.id,
          }))
        }))
      };
    }).filter(Boolean);
    return JSON.stringify(panels, null, 2);
  });

  require('fs').writeFileSync('/tmp/sk-dom.json', dom);
  console.log('DOM structure saved to /tmp/sk-dom.json');
  console.log(dom);

  await context.close();
})();
