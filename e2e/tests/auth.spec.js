const { test, expect } = require('@playwright/test');


test('регистрация, выход и повторный вход', async ({ page }) => {
  const username = `e2e_user_${Date.now()}`;
  const email = `${username}@example.com`;
  const password = 'StrongE2ePass123!';

  await page.goto('/#/register');
  await page.getByLabel('Имя пользователя').fill(username);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByLabel('Повторите пароль').fill(password);
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();

  await expect(page).toHaveURL(/#\/profile/);
  await expect(page.getByRole('heading', { level: 1, name: username })).toBeVisible();

  const logoutResponse = page.waitForResponse(response =>
    response.url().includes('/api/auth/logout/') && response.status() === 204
  );
  await page.getByRole('button', { name: 'Выйти' }).click();
  await logoutResponse;
  await expect(page).toHaveURL(/#\/?$/);
  await expect(page.locator('#home-hero')).toBeVisible();
  await expect(page.locator('#home-hero')).not.toHaveAttribute('aria-busy', 'true');

  await page.goto('/#/login');
  await expect(page.getByRole('heading', { name: 'Вход', exact: true })).toBeVisible();
  await page.getByLabel('Имя пользователя').fill(username);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page).toHaveURL(/#\/profile/);
  await expect(page.getByRole('heading', { level: 1, name: username })).toBeVisible();
});
