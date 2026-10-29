import { expect, test as setup } from '@playwright/test';
import { demo, hostSession } from '../support/demo.js';

setup('the demo host signs in', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(demo.host.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(demo.host.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page).toHaveURL(`/host/${demo.property}/today`);
  await page.context().storageState({ path: hostSession });
});
