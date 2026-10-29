import { expect, test } from '@playwright/test';
import { addDays, hotelToday } from '../support/dates.js';
import { demo, hostSession } from '../support/demo.js';
import { bookStay, newGuest } from '../support/guests.js';

test('the front desk checks in a guest who booked tonight', async ({ page, browser }) => {
  const guest = newGuest('Karim');
  const tonight = hotelToday();
  await bookStay(page, guest, { checkIn: tonight, checkOut: addDays(tonight, 1) });

  const desk = await browser.newContext({ storageState: hostSession });
  const host = await desk.newPage();
  await host.goto(`/host/${demo.property}/today`);
  const arrivals = host.getByRole('region', { name: /^Arrivals/ });
  const checkIn = arrivals.getByRole('button', { name: `Check in ${guest.name}` });
  await checkIn.click();

  await expect(checkIn).toBeHidden();
  await expect(host.getByRole('region', { name: /^In house/ })).toContainText(guest.name);
  await desk.close();
});
