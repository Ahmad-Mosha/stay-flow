import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { longDate } from './dates.js';
import { demo } from './demo.js';

export interface Guest {
  firstName: string;
  name: string;
  email: string;
}

/** A guest that no other test, and no earlier run, has used. */
export function newGuest(firstName: string): Guest {
  const id = randomUUID().slice(0, 8);
  return {
    firstName,
    name: `${firstName} Tester ${id}`,
    email: `${firstName.toLowerCase()}.${id}@example.com`,
  };
}

/** Picks a day on the booking calendar, paging forward to its month first. */
export async function pickDay(page: Page, date: string): Promise<void> {
  const calendar = page.getByRole('application', { name: /^Stay dates/ });
  const month = longDate(date).replace(/^\d+ /, '');
  for (let pages = 0; pages < 12; pages += 1) {
    if ((await calendar.getByRole('heading').textContent())?.endsWith(month)) break;
    await calendar.getByRole('button', { name: 'Next' }).first().click();
  }
  await calendar.getByRole('button', { name: longDate(date) }).click();
}

/** Fills in the guest's details on checkout and confirms the held room. */
export async function confirmBooking(page: Page, guest: Guest): Promise<void> {
  await page.getByRole('textbox', { name: 'Full name' }).fill(guest.name);
  await page.getByRole('textbox', { name: 'Email' }).fill(guest.email);
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(
    page.getByRole('heading', { name: `You are booked, ${guest.firstName}.` }),
  ).toBeVisible();
}

/** Books the first room on offer for these nights, as a guest who follows a shared search link. */
export async function bookStay(
  page: Page,
  guest: Guest,
  nights: { checkIn: string; checkOut: string },
): Promise<void> {
  const search = new URLSearchParams({ ...nights, guests: '2' });
  await page.goto(`/stay/${demo.property}?${search.toString()}`);
  await page.getByRole('button', { name: 'Reserve', disabled: false }).first().click();
  await confirmBooking(page, guest);
}
