const { test, expect } = require('@playwright/test');


test('каталог, поиск и открытие фильма', async ({ page }) => {
  await page.goto('/#/catalog');

  await expect(page.getByRole('heading', { name: 'Каталог фильмов' })).toBeVisible();
  await expect(page.locator('#catalog-grid .card')).not.toHaveCount(0);

  await page.getByPlaceholder('Название или описание').fill('Аяш');
  await page.getByRole('button', { name: 'Применить' }).click();

  await expect(page).toHaveURL(/#\/catalog\?.*q=/);
  const result = page.locator('#catalog-grid .card').filter({ hasText: 'Аяш 1' });
  await expect(result).toHaveCount(1);
  await result.click();

  await expect(page).toHaveURL(/#\/movie\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Аяш 1' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Информация о контенте' })).toBeVisible();
});
