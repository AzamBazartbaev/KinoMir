const { test, expect } = require('@playwright/test');


test('избранное, рейтинг и комментарий', async ({ page }) => {
  const username = `social_user_${Date.now()}`;
  const password = 'StrongE2ePass123!';
  const comment = `Отличное кыргызское кино — E2E ${Date.now()}`;

  await page.goto('/#/register');
  await page.getByLabel('Имя пользователя').fill(username);
  await page.getByLabel('Email').fill(`${username}@example.com`);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByLabel('Повторите пароль').fill(password);
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await expect(page).toHaveURL(/#\/profile/);

  await page.goto('/#/catalog?q=%D0%90%D1%8F%D1%88');
  await page.locator('#catalog-grid .card').filter({ hasText: 'Аяш 1' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Аяш 1' })).toBeVisible();

  await page.getByRole('button', { name: 'В избранное' }).click();
  await expect(page.getByRole('button', { name: '✓ В избранном' })).toBeVisible();

  await page.getByRole('button', { name: '5 из 5' }).click();
  await expect(page.getByRole('heading', { name: '5 из 5' })).toBeVisible();

  await page.getByLabel('Ваш комментарий').fill(comment);
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.locator('.comment').filter({ hasText: comment })).toBeVisible();
  await expect(page.locator('.comment').filter({ hasText: username })).toBeVisible();

  await page.goto('/#/favorites');
  await expect(page.locator('.card').filter({ hasText: 'Аяш 1' })).toBeVisible();
});
