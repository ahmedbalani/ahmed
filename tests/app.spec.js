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
