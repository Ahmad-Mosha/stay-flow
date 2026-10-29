import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { demo, hostSession } from '../support/demo.js';

/** Checks the page once it has loaded its data, against WCAG 2.2 A and AA. */
async function expectAccessible(page: Page, skipRules: string[] = []) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(skipRules)
    .analyze();
  expect(
    violations.map((violation) => ({
      rule: violation.id,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
}

test('the booking page meets WCAG 2.2 AA', async ({ page }) => {
  await page.goto(`/stay/${demo.property}`);
  // React Aria names each calendar day by its date. The nightly price printed under the date is
  // extra information, not part of the day's label, so the label-in-name heuristic misreads it.
  await expectAccessible(page, ['label-content-name-mismatch']);
});

const guestPages = {
  'sign-in page': '/sign-in',
  'sign-up page': '/sign-up',
  'manage booking page': '/manage',
};

for (const [name, path] of Object.entries(guestPages)) {
  test(`the ${name} meets WCAG 2.2 AA`, async ({ page }) => {
    await page.goto(path);
    await expectAccessible(page);
  });
}

test.describe('the host dashboard', () => {
  test.use({ storageState: hostSession });

  const sections = ['today', 'calendar', 'reservations', 'rooms', 'rates', 'team', 'settings'];
  for (const theme of ['light', 'dark']) {
    for (const section of sections) {
      test(`${section}, in the ${theme} theme, meets WCAG 2.2 AA`, async ({ page, baseURL }) => {
        await page
          .context()
          .addCookies([{ name: 'stay-flow-theme', value: theme, url: baseURL ?? '' }]);
        await page.goto(`/host/${demo.property}/${section}`);
        await expectAccessible(page);
      });
    }
  }
});
