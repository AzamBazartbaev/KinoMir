const { test, expect } = require('@playwright/test');


test('история просмотра отображается и очищается на главной', async ({ page }) => {
  const username = `history_user_${Date.now()}`;
  const registration = await page.request.post('/api/auth/register/', {
    data: {username, email:`${username}@example.com`, password:'StrongE2ePass123!'},
  });
  expect(registration.ok()).toBeTruthy();
  const {token} = await registration.json();
  const headers = {Authorization:`Token ${token}`};

  const save = await page.request.put('/api/movies/аяш-1/progress/', {
    headers,
    data:{position_seconds:42, duration_seconds:120},
  });
  expect(save.ok()).toBeTruthy();
  await page.addInitScript(value => localStorage.setItem('kinomir_token', value), token);

  await page.goto('/#/');
  await expect(page.getByRole('heading', {name:'Продолжить просмотр'})).toBeVisible();
  const card = page.locator('.continue-card').filter({hasText:'Аяш 1'});
  await expect(card).toContainText('0:42');
  await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '35');

  await card.getByRole('button', {name:/Удалить из истории/}).click();
  await expect(page.getByRole('heading', {name:'Продолжить просмотр'})).toBeHidden();

  await page.request.put('/api/movies/аяш-1/progress/', {headers, data:{position_seconds:20, duration_seconds:100}});
  await page.reload();
  await expect(page.getByRole('heading', {name:'Продолжить просмотр'})).toBeVisible();
  await page.getByRole('button', {name:'Очистить историю'}).click();
  await expect(page.getByRole('heading', {name:'Продолжить просмотр'})).toBeHidden();
});
