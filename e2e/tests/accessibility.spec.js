const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;


async function expectNoSeriousViolations(page) {
  const results = await new AxeBuilder({page})
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(item => ['critical', 'serious'].includes(item.impact));
  expect(serious, serious.map(item => `${item.id}: ${item.help}`).join('\n')).toEqual([]);
}

test('основные страницы не имеют серьёзных axe-ошибок', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('#home-hero')).not.toHaveAttribute('aria-busy', 'true');
  await expectNoSeriousViolations(page);

  await page.locator('[data-route="catalog"]').click();
  await expect(page.locator('#catalog-grid')).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.locator('#auth-controls a[href="#/login"]').click();
  await expect(page.locator('.auth-card h1')).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('клавиатура, skip-link, фокус SPA и reduced motion работают', async ({ page }) => {
  await page.goto('/#/');
  await page.keyboard.press('Tab');
  await expect(page.locator('#skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toBeFocused();

  await page.getByRole('link', {name:'Каталог', exact:true}).click();
  await expect(page.locator('#app')).toBeFocused();
  await expect(page.locator('[data-route="catalog"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('Поиск фильмов')).toBeVisible();

  await page.emulateMedia({reducedMotion:'reduce'});
  const motion = await page.locator('.card').first().evaluate(node => getComputedStyle(node).transitionDuration);
  expect(Number.parseFloat(motion)).toBeLessThanOrEqual(0.001);
});
