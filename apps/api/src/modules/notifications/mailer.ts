import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { createTransport, type NodemailerError } from 'nodemailer';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import { PermanentFailure } from '../../platform/outbox/outbox-event.js';
import type { RenderedEmail } from './email-layout.js';

export interface Email extends RenderedEmail {
  readonly to: string;
  /** Kept the same when the email is sent again, so mail systems can drop the copy. */
  readonly messageId: string;
}

/** Sends email over SMTP: to Mailpit in development, to a real relay in production. */
@Injectable()
export class Mailer implements OnApplicationShutdown {
  private readonly from: string;
  private readonly transport: ReturnType<typeof createTransport>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.from = config.mail.from;
    this.transport = createTransport({
      url: config.mail.smtpUrl,
      // Well under the outbox lease, so a hung server fails the send before another worker
      // could take the event over.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  }

  /** Throws PermanentFailure when the server refuses the message for good (a 5xx reply). */
  async send(email: Email): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        messageId: email.messageId,
      });
    } catch (error) {
      if ((error as NodemailerError).permanent === true) {
        throw new PermanentFailure(`The mail server refused the email: ${String(error)}`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  onApplicationShutdown(): void {
    this.transport.close();
  }
}
