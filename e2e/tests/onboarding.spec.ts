import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('a new host signs up, adds a room, and opens the booking page', async ({ page }) => {
  const id = randomUUID().slice(0, 8);
  const slug = `lotus-house-${id}`;

  await page.goto('/sign-up');
  await page.getByRole('textbox', { name: 'Your name' }).fill('Laila Mansour');
  await page.getByRole('textbox', { name: 'Email' }).fill(`laila.${id}@example.com`);
  await page.getByRole('textbox', { name: 'Password' }).fill('river view rooms by the nile');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL('/host/new');
  await page.getByRole('textbox', { name: 'Property name' }).fill(`Lotus House ${id}`);
  await expect(page.getByRole('textbox', { name: 'Booking page address' })).toHaveValue(slug);
  await page.getByRole('combobox', { name: 'Currency' }).fill('Egyptian');
  await page.getByRole('option', { name: /Egyptian Pound/ }).click();
  await page.getByRole('button', { name: 'Create property' }).click();

  await expect(page).toHaveURL(`/host/${slug}/today`);
  await expect(
    page.getByRole('heading', { name: 'A few steps to your first booking' }),
  ).toBeVisible();

  await page.goto(`/stay/${slug}`);
  await expect(page.getByRole('heading', { name: 'Not taking bookings yet' })).toBeVisible();

  await page.goBack();
  await page.getByRole('link', { name: 'Add rooms' }).click();
  await page.getByRole('button', { name: 'Add room type', exact: true }).click();
  const roomType = page.getByRole('dialog', { name: 'Add a room type' });
  await roomType.getByRole('textbox', { name: 'Name', exact: true }).fill('Garden Room');
  await roomType.getByRole('textbox', { name: 'Base rate a night' }).fill('1800');
  await roomType.getByRole('button', { name: 'Add room type' }).click();
  await expect(roomType).toBeHidden();

  await page.getByRole('button', { name: 'Add a Garden Room room' }).click();
  const room = page.getByRole('dialog', { name: 'Add a room' });
  await room.getByRole('textbox', { name: 'Room name' }).fill('1');
  await room.getByRole('button', { name: 'Add room' }).click();
  await expect(room).toBeHidden();

  await page.goto(`/stay/${slug}`);
  await expect(page.getByRole('application', { name: /^Stay dates/ })).toBeVisible();
});
