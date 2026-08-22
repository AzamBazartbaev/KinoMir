const { test, expect } = require('@playwright/test');


test('SEO-метаданные, sitemap и индексируемая страница фильма', async ({ page }) => {
  const robots = await page.request.get('/robots.txt');
  expect(robots.ok()).toBeTruthy();
  await expect(robots.text()).resolves.toContain('Sitemap: http://127.0.0.1:3000/sitemap.xml');

  const sitemap = await page.request.get('/sitemap.xml');
  expect(sitemap.ok()).toBeTruthy();
  await expect(sitemap.text()).resolves.toContain('/films/%D0%B0%D1%8F%D1%88-1/');

  const prerender = await page.request.get('/films/%D0%B0%D1%8F%D1%88-1/');
  const prerenderHtml = await prerender.text();
  expect(prerender.ok()).toBeTruthy();
  expect(prerenderHtml).toContain('<meta property="og:type" content="video.movie">');
  expect(prerenderHtml).toContain('<link rel="canonical"');

  await page.goto('/#/catalog?q=%D0%90%D1%8F%D1%88');
  await page.locator('#catalog-grid .card').filter({hasText:'Аяш 1'}).click();
  await expect(page).toHaveTitle(/Аяш 1 .* КиноОрдо/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/films\/%D0%B0%D1%8F%D1%88-1\/$/);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'video.movie');
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
});
