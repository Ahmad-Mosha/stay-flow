import { expect, test } from '@playwright/test';
import { addDays, hotelToday } from '../support/dates.js';
import { demo } from '../support/demo.js';
import { confirmBooking, newGuest, pickDay } from '../support/guests.js';
import { linkTo, waitForEmail } from '../support/mailpit.js';

test('a guest books a stay, gets the email, and cancels from its link', async ({
  page,
  request,
}) => {
  const guest = newGuest('Nour');
  const checkIn = addDays(hotelToday(), 21);

  await page.goto(`/stay/${demo.property}`);
  await pickDay(page, checkIn);
  await pickDay(page, addDays(checkIn, 2));
  await expect(page.getByRole('heading', { name: /^2 nights, / })).toBeVisible();
  await page.getByRole('button', { name: 'Reserve', disabled: false }).first().click();
  await confirmBooking(page, guest);

  const confirmation = await waitForEmail(request, guest.email, /^Booking confirmed: /);
  const reference = /\((?<reference>\w+)\)$/.exec(confirmation.Subject)?.groups?.reference;
  await expect(page.getByText(reference ?? 'a booking reference', { exact: true })).toBeVisible();

  await page.goto(linkTo(confirmation, '/manage'));
  await expect(
    page.getByRole('heading', { name: new RegExp(`^See you on .+, ${guest.firstName}\\.$`) }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await page
    .getByRole('alertdialog', { name: 'Cancel your stay?' })
    .getByRole('button', { name: 'Cancel booking' })
    .click();

  await expect(page.getByRole('heading', { name: 'This booking is cancelled' })).toBeVisible();
  await waitForEmail(request, guest.email, /^Booking cancelled: /);
});
