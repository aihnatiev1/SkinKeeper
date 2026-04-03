const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const extPath = path.resolve(__dirname, '../dist');

  const context = await chromium.launchPersistentContext('/tmp/sk-chrome-profile', {
    headless: false,
    channel: 'chrome',
    viewport: null,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      '--start-maximized',
    ],
  });

  const page = context.pages()[0] || await context.newPage();

  await page.goto('https://steamcommunity.com/id/slavabuster/inventory/#730', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  // Wait for Steam inventory to load
  await page.waitForTimeout(8000);

  // Click first CS2 item
  const firstItem = await page.$('.item.app730.context2');
  if (firstItem) {
    await firstItem.click();
    console.log('Clicked first item');
  } else {
    console.log('No CS2 items found, trying any item...');
    const anyItem = await page.$('.item');
    if (anyItem) await anyItem.click();
  }

  await page.waitForTimeout(3000);

  await page.screenshot({
    path: '/tmp/skinkeeper-ext-1.png',
    fullPage: false
  });
  console.log('Screenshot 1 saved');

  // Scroll inventory panel
  await page.evaluate(() => {
    const el = document.querySelector('#inventories');
    if (el) el.scrollTop += 400;
  });
  await page.waitForTimeout(2000);

  await page.screenshot({
    path: '/tmp/skinkeeper-ext-2.png',
    fullPage: false
  });
  console.log('Screenshot 2 saved');

  // Keep open for 10 min
  await page.waitForTimeout(600000);
  await context.close();
})();
