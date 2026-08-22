const { test, expect } = require('@playwright/test');


test('LCP, CLS и INP остаются в пределах Core Web Vitals', async ({ page }) => {
  await page.addInitScript(() => {
    window.__kinomirVitals = {lcp:0, cls:0, inp:0, shifts:[]};
    new PerformanceObserver(list => {
      const entries = list.getEntries();
      window.__kinomirVitals.lcp = entries.at(-1)?.startTime || window.__kinomirVitals.lcp;
    }).observe({type:'largest-contentful-paint', buffered:true});
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__kinomirVitals.cls += entry.value;
          window.__kinomirVitals.shifts.push({value:entry.value, time:entry.startTime, sources:entry.sources.map(source => source.node?.id || source.node?.className || source.node?.tagName)});
        }
      }
    }).observe({type:'layout-shift', buffered:true});
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.interactionId) window.__kinomirVitals.inp = Math.max(window.__kinomirVitals.inp, entry.duration);
      }
    }).observe({type:'event', buffered:true, durationThreshold:16});
  });

  await page.goto('/#/');
  await expect(page.locator('#home-hero')).not.toHaveAttribute('aria-busy', 'true');
  await page.waitForTimeout(250);
  const loadVitals = await page.evaluate(() => ({...window.__kinomirVitals}));
  const selectedPosterUrl = await page.locator('.poster img').first().evaluate(image => image.currentSrc);
  console.log(`Responsive poster: ${selectedPosterUrl}`);
  expect(selectedPosterUrl).toContain('/poster/');
  await page.evaluate(() => { window.__kinomirVitals.cls = 0; });
  await page.locator('[data-route="catalog"]').click();
  await expect(page.locator('#catalog-grid')).toBeVisible();
  await page.waitForTimeout(250);

  const vitals = await page.evaluate(() => window.__kinomirVitals);
  console.log(`Core Web Vitals: LCP=${Math.round(loadVitals.lcp)}ms CLS=${loadVitals.cls.toFixed(3)} INP=${Math.round(vitals.inp)}ms SPA-CLS=${vitals.cls.toFixed(3)}`);
  console.log(`Layout shifts: ${JSON.stringify(loadVitals.shifts)}`);
  expect(loadVitals.lcp).toBeLessThan(2500);
  expect(loadVitals.cls).toBeLessThan(0.1);
  expect(vitals.cls).toBeLessThan(0.1);
  expect(vitals.inp).toBeLessThan(200);
});
