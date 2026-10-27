import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { simpleParser } from 'mailparser';
import { SMTPServer, type SMTPServerError } from 'smtp-server';

export interface ReceivedEmail {
  /** With its angle brackets, such as `<0199…@stay-flow>`. */
  readonly messageId: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** A message the sink has read in full but not yet answered. */
export interface HeldMessage {
  /** Resolves once the message is waiting for its answer. */
  readonly arrived: Promise<void>;
  /** Answers it: accepted keeps it, otherwise it is never answered, as if lost in transit. */
  release(accepted: boolean): void;
}

interface Hold {
  remaining: number;
  arrive(): void;
  decision: Promise<boolean>;
}

/**
 * An SMTP server for tests, standing in for Mailpit. It keeps what it accepts, and on cue it
 * refuses a recipient or holds a message unanswered, to test failures and crashes mid-send.
 */
export class SmtpSink {
  readonly received: ReceivedEmail[] = [];
  private readonly refusals = new Map<string, number>();
  private hold: Hold | undefined;
  private readonly server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS', 'AUTH'],
    logger: false,
    onRcptTo: (address, _session, callback) => {
      const code = this.refusals.get(address.address);
      if (code === undefined) {
        callback();
        return;
      }
      const error: SMTPServerError = Object.assign(new Error('Mailbox unavailable'), {
        responseCode: code,
      });
      callback(error);
    },
    onData: (stream, _session, callback) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        void this.answer(Buffer.concat(chunks), callback);
      });
    },
  });

  static async start(): Promise<SmtpSink> {
    const sink = new SmtpSink();
    sink.server.listen(0, '127.0.0.1');
    await once(sink.server.server, 'listening');
    return sink;
  }

  get url(): string {
    const { port } = this.server.server.address() as AddressInfo;
    return `smtp://127.0.0.1:${String(port)}`;
  }

  /** Answers mail to `address` with `code`, such as 451 (try later) or 550 (no such mailbox). */
  refuse(address: string, code: number): void {
    this.refusals.set(address, code);
  }

  accept(address: string): void {
    this.refusals.delete(address);
  }

  /** Holds the message after the next `skip` ones, without answering it. */
  holdAfter(skip: number): HeldMessage {
    const arrived = deferred<undefined>();
    const decision = deferred<boolean>();
    this.hold = {
      remaining: skip,
      arrive: () => {
        arrived.resolve(undefined);
      },
      decision: decision.promise,
    };
    return { arrived: arrived.promise, release: decision.resolve };
  }

  /** What arrived for the given Message-IDs, in order of arrival. */
  emailsWithIds(messageIds: readonly string[]): ReceivedEmail[] {
    const wanted = new Set(messageIds);
    return this.received.filter((email) => wanted.has(email.messageId));
  }

  emailsTo(address: string): ReceivedEmail[] {
    return this.received.filter((email) => email.to === address);
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  private async answer(raw: Buffer, callback: (error?: Error | null) => void): Promise<void> {
    const hold = this.hold;
    if (hold !== undefined && hold.remaining-- === 0) {
      this.hold = undefined;
      hold.arrive();
      if (!(await hold.decision)) {
        return;
      }
    }
    const parsed = await simpleParser(raw);
    const to = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
    this.received.push({
      messageId: parsed.messageId ?? '',
      to: to?.value[0]?.address ?? '',
      subject: parsed.subject ?? '',
      text: parsed.text ?? '',
      html: parsed.html === false ? '' : (parsed.html ?? ''),
    });
    callback();
  }
}

/** A promise with its resolve function, like ES2024's Promise.withResolvers. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
