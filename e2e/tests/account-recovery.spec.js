const { test, expect } = require('@playwright/test');


test('запрос восстановления и экран подтверждения email', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('link', { name: 'Забыли пароль?' }).click();
  await expect(page.getByRole('heading', { name: 'Восстановление пароля' })).toBeVisible();
  await page.getByLabel('Email').fill(`missing_${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Отправить инструкцию' }).click();
  await expect(page.getByText('Если аккаунт с таким email существует')).toBeVisible();

  await page.goto(`/#/email-confirm?token=${'invalid-token-'.repeat(3)}`);
  await expect(page.getByRole('heading', { name: 'Подтверждение адреса' })).toBeVisible();
  await page.getByRole('button', { name: 'Подтвердить email' }).click();
  await expect(page.getByText('Ссылка недействительна')).toBeVisible();
});
