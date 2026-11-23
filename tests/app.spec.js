const { test, expect } = require('@playwright/test');

const DAY_KEYS = ['push', 'pull', 'legs', 'upper', 'lower'];

// Fresh phone every test: no saved logs. YouTube is blocked so tests don't depend on it.
test.beforeEach(async ({ page }) => {
  await page.route(/youtube(-nocookie)?\.com/, r => r.abort());
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.goto('./');
});

test.afterEach(async ({ page }) => {
  expect(page.errors, 'JavaScript errors on the page').toEqual([]);
});

test('app opens with all 5 day tabs', async ({ page }) => {
  await expect(page).toHaveTitle(/Lift/);
  const tabs = page.locator('#tabs .tab');
  await expect(tabs).toHaveCount(5);
  // Brand-new phone, no history: should start on Push.
  await expect(page.locator('#tabs .tab.on')).toHaveAttribute('data-day', 'push');
});

test('program rules: every exercise is 4 sets and has a form video', async ({ page }) => {
  const problems = await page.evaluate(() => {
    const out = [];
    for (const d of DAYS) for (const ex of d.ex) {
      if (ex.sets !== 4) out.push(`${ex.name}: ${ex.sets} sets (should be 4)`);
      if (!VID[ex.id]) out.push(`${ex.name}: no video`);
      if (!(ex.lo <= ex.hi)) out.push(`${ex.name}: bad rep range ${ex.lo}-${ex.hi}`);
    }
    const ids = DAYS.flatMap(d => d.ex.map(e => e.id));
    ids.filter((id, i) => ids.indexOf(id) !== i).forEach(id => out.push(`duplicate id ${id}`));
    return out;
  });
  expect(problems).toEqual([]);
});

for (const key of DAY_KEYS) {
  test(`${key} day: every exercise opens with log boxes, muscle map and video`, async ({ page }) => {
    await page.locator(`[data-day="${key}"]`).click();
    await expect(page.locator('#tabs .tab.on')).toHaveAttribute('data-day', key);

    const heads = page.locator('#day [data-open]');
    const n = await heads.count();
    expect(n).toBeGreaterThan(0);

    for (let i = 0; i < n; i++) {
      await page.locator('#day [data-open]').nth(i).click();
      const body = page.locator('#day .card .body');
      await expect(body).toHaveCount(1);
      await expect(body.locator('.set')).toHaveCount(4);
      await expect(body.locator('svg').first()).toBeVisible();          // muscle map
      await expect(body.locator('.video iframe')).toHaveCount(1);       // form video
      await page.locator('#day [data-open]').nth(i).click();            // close it
      await expect(body).toHaveCount(0);
    }
  });
}

test('logging a set starts the rest timer, updates progress, and survives a reload', async ({ page }) => {
  await page.locator('[data-day="push"]').click();
  await page.locator('#day [data-open]').first().click(); // Barbell Bench Press

  const set1 = page.locator('#day .set').first();
  await set1.locator('[data-f=w]').fill('135');
  await set1.locator('[data-f=r]').fill('8');
  await set1.locator('.ck').click();

  await expect(page.locator('#day .set').first()).toHaveClass(/ok/);
  await expect(page.locator('#timer')).toHaveClass(/show/);
  await expect(page.locator('#tlabel')).toContainText('set 2 next');
  await expect(page.locator('.prog')).toContainText('1 / 28 sets today');

  await page.reload();
  await page.locator('[data-day="push"]').click();
  await page.locator('#day [data-open]').first().click();
  await expect(page.locator('#day .set').first()).toHaveClass(/ok/);
  await expect(page.locator('.prog')).toContainText('1 / 28 sets today');
});

test('tapping ✓ on an empty set uses the target reps', async ({ page }) => {
  await page.locator('#day [data-open]').first().click();
  // First time ever: reps box shows the target as a hint, so ✓ uses it.
  await page.locator('#day .set .ck').first().click();
  await expect(page.locator('#day .set').first()).toHaveClass(/ok/);
});

test('hitting the top of the rep range on every set says to add weight next time', async ({ page }) => {
  // Fake last week's bench: 4 sets of 8 (top of 6-8).
  await page.evaluate(() => {
    const id = DAYS[0].ex[0].id;
    const s = Array(4).fill(0).map(() => ({ w: '135', r: '8', ok: true }));
    localStorage.setItem('lift5Logs', JSON.stringify({ [id]: [{ d: '2026-01-01', t: 1, s }] }));
  });
  await page.reload();
  await page.locator('[data-day="push"]').click();
  await page.locator('#day [data-open]').first().click();
  await expect(page.locator('#day .tip')).toContainText('add a little weight');
  await expect(page.locator('#day .last')).toContainText('135×8');
});

test('rest timer +30s and Done buttons work', async ({ page }) => {
  await page.locator('#day [data-open]').first().click();
  await page.locator('#day .set .ck').first().click();
  await expect(page.locator('#timer')).toHaveClass(/show/);
  const before = await page.locator('#tclock').textContent();
  await page.locator('#tplus').click();
  const toSec = t => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
  expect(toSec(await page.locator('#tclock').textContent())).toBeGreaterThan(toSec(before));
  await page.locator('#tskip').click();
  await expect(page.locator('#timer')).not.toHaveClass(/show/);
});

test('Save backup downloads a JSON file with your logs', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit handles file downloads differently');
  await page.locator('#day [data-open]').first().click();
  await page.locator('#day .set .ck').first().click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#bkbtn').click()]);
  expect(dl.suggestedFilename()).toMatch(/\.json$/);
  const data = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
  expect(JSON.stringify(data)).toContain('barbell-bench-press');
});

test('fits an iPhone screen (no sideways scrolling)', async ({ page }) => {
  await page.locator('#day [data-open]').first().click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test.describe('backups', () => {
  const oneLog = () => {
    const id = DAYS[0].ex[0].id;
    localStorage.setItem('lift5Logs', JSON.stringify({ [id]: [{ d: '2026-01-01', t: 1, s: [{ w: '135', r: '8', ok: true }] }] }));
  };

  test('no reminder before anything is logged', async ({ page }) => {
    await expect(page.locator('#bkwarn')).toBeHidden();
  });

  test('reminds you when you have logs but no backup, and the button backs up', async ({ page, browserName }) => {
    await page.evaluate(oneLog);
    await page.reload();
    await expect(page.locator('#bkwarn')).toBeVisible();
    await expect(page.locator('#bkwarn')).toContainText("haven't saved a backup");
    test.skip(browserName === 'webkit', 'WebKit handles file downloads differently');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#bkwarnbtn').click()]);
    expect(dl.suggestedFilename()).toMatch(/\.json$/);
    await expect(page.locator('#bkwarn')).toBeHidden();
  });

  test('reminds you when the last backup is over a week old', async ({ page }) => {
    await page.evaluate(oneLog);
    await page.evaluate(() => localStorage.setItem('lift5LastBackup', JSON.stringify('2020-01-01')));
    await page.reload();
    await expect(page.locator('#bkwarn')).toContainText('days ago');
  });

  test('inside the iPhone app: auto-saves after logging, no reminder, and restores when storage is empty', async ({ page }) => {
    // Pretend to be the iPhone app: record what the page sends to it.
    await page.addInitScript(() => {
      window.__sent = [];
      window.webkit = { messageHandlers: { lift: { postMessage: m => {
        window.__sent.push(m);
        if (m.type === 'autosave') setTimeout(() => window.liftAutosaved(), 0);
      } } } };
    });
    await page.reload();
    const ready = await page.evaluate(() => window.__sent.find(m => m.type === 'ready'));
    expect(ready).toEqual({ type: 'ready', empty: true });

    await page.locator('#day [data-open]').first().click();
    await page.locator('#day .set .ck').first().click();
    await expect.poll(() => page.evaluate(() => window.__sent.filter(m => m.type === 'autosave').length)).toBeGreaterThan(0);
    const saved = await page.evaluate(() => JSON.parse(window.__sent.filter(m => m.type === 'autosave').pop().json));
    expect(Object.keys(saved.logs)).toContain('push-barbell-bench-press');
    await expect(page.locator('#bkinfo')).toContainText('Auto-saved');
    await expect(page.locator('#bkwarn')).toBeHidden();

    // Storage wiped → the app hands the backup back.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.evaluate(j => window.liftRestore(j), JSON.stringify(saved));
    await page.locator('[data-day="push"]').click();
    await expect(page.locator('.prog')).toContainText('1 / 28 sets today');
  });
});

test('iPhone app offline copy is the same as the website', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-chrome', 'file check only needs to run once');
  const fs = require('fs'), path = require('path');
  const root = path.join(__dirname, '..');
  const site = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'iOS/Lift/index.html'), 'utf8');
  expect(app === site, 'iOS/Lift/index.html is out of date — copy index.html over it').toBe(true);
});
