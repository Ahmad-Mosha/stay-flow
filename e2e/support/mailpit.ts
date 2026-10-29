import { setTimeout as sleep } from 'node:timers/promises';
import type { APIRequestContext } from '@playwright/test';

const mailpitUrl = process.env.MAILPIT_URL ?? 'http://localhost:8025';

export interface Email {
  Subject: string;
  Text: string;
}

interface Search {
  messages: { ID: string; Subject: string }[];
}

/**
 * Waits for the worker to send an email to this address with a matching subject. Booking emails
 * leave through the outbox, a moment after the request that caused them.
 */
export async function waitForEmail(
  request: APIRequestContext,
  to: string,
  subject: RegExp,
): Promise<Email> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await request.get(`${mailpitUrl}/api/v1/search`, {
      params: { query: `to:"${to}"` },
    });
    const { messages } = (await response.json()) as Search;
    const found = messages.find((message) => subject.test(message.Subject));
    if (found) {
      const message = await request.get(`${mailpitUrl}/api/v1/message/${found.ID}`);
      return (await message.json()) as Email;
    }
    await sleep(250);
  }
  throw new Error(`No email to ${to} with a subject like ${String(subject)}.`);
}

/** The first link in an email that goes to this path of the app. */
export function linkTo(email: Email, path: string): string {
  const link = new RegExp(`https?://\\S+${path}\\S*`).exec(email.Text)?.[0];
  if (!link) throw new Error(`The email "${email.Subject}" has no link to ${path}.`);
  return link;
}
