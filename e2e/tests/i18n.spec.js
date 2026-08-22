const { test, expect } = require('@playwright/test');


test('переключение языка сохраняется и локализует каталог', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'КЫР' }).click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'ky');
  await expect(page.getByRole('link', { name: 'Башкы бет' })).toBeVisible();

  await page.goto('/#/catalog');
  await expect(page.getByRole('heading', { name: 'Тасмалар каталогу' })).toBeVisible();
  await page.getByPlaceholder('Аталышы же сүрөттөмөсү').fill('Асманга');
  await page.getByRole('button', { name: 'Колдонуу' }).click();
  await expect(page.locator('#catalog-grid .card').filter({ hasText: 'Асманга чуркоо' })).toHaveCount(1);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ky');
  await expect(page.getByRole('heading', { name: 'Тасмалар каталогу' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'КЫР' })).toHaveAttribute('aria-pressed', 'true');
});
