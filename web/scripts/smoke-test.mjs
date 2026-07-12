import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--disable-gpu', '--use-angle=swiftshader', '--window-size=1600,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 3000)); // let the globe initialize

// 1. Header stats show real data
const stats = await page.$$eval('.stat-value', (els) => els.map((e) => e.textContent));
console.log('stats [bots, active, countries]:', stats);

// 2. Search for Tombstone
await page.type('.search-box input', 'tombst');
await page.waitForSelector('.search-results button', { timeout: 5000 });
const results = await page.$$eval('.search-results .result-bot', (els) =>
  els.map((e) => e.textContent),
);
console.log('search results:', results);

// 3. Click the first result -> panel should open and camera fly
await page.click('.search-results button');
await page.waitForSelector('.team-panel', { timeout: 5000 });
const panel = await page.$eval('.team-panel', (el) => ({
  bot: el.querySelector('.panel-bot')?.textContent,
  team: el.querySelector('.panel-team')?.textContent,
  status: el.querySelector('.panel-status')?.textContent?.trim(),
  photo: el.querySelector('.panel-photo')?.getAttribute('src'),
  facts: [...el.querySelectorAll('.fact dt')].map((d) => d.textContent),
}));
console.log('panel:', JSON.stringify(panel));
if (panel.photo) {
  const status = await page.evaluate(
    (src) => fetch(src).then((r) => r.status),
    panel.photo,
  );
  console.log('panel photo HTTP status:', status);
}

await new Promise((r) => setTimeout(r, 1800)); // camera flight

// 3b. Hover the selected team's point (camera centered on it) -> photo tooltip.
// The point sits at screen center after the flight; probe a small grid around it.
let tip = null;
outer: for (const dy of [0, -6, 6, -12, 12, -20, 20]) {
  for (const dx of [0, -6, 6, -12, 12, -20, 20]) {
    await page.mouse.move(800 + dx, 450 + dy);
    await new Promise((r) => setTimeout(r, 120));
    tip = await page
      .$eval('.globe-tip', (el) => ({
        bot: el.querySelector('.globe-tip-bot')?.textContent,
        photo: el.querySelector('.globe-tip-photo')?.getAttribute('src'),
      }))
      .catch(() => null);
    if (tip) break outer;
  }
}
console.log('hover tooltip:', JSON.stringify(tip));
await page.screenshot({ path: 'scripts/last-smoke.png' });

// 4. Close panel
await page.click('.panel-close');
const panelGone = (await page.$('.team-panel')) === null;
console.log('panel closed:', panelGone);

// 5. Search by city (international team)
await page.type('.search-box input', 'auckland');
await page.waitForSelector('.search-results button', { timeout: 5000 });
const intl = await page.$$eval('.search-results .result-bot', (els) =>
  els.map((e) => e.textContent),
);
console.log('auckland results:', intl);

// 6. No console errors
await browser.close();
console.log('ALL INTERACTION CHECKS DONE');
