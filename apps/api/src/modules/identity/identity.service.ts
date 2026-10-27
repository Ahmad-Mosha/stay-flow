import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../platform/database/database.js';
import { AppError } from '../../platform/errors/app-error.js';
import { type RateLimit, RateLimiter } from '../../platform/rate-limit/rate-limiter.js';
import { hashPassword, needsRehash, verifyPassword } from './password.js';
import { hashSessionToken, newSessionToken } from './session-token.js';
import { SessionsRepository } from './sessions.repository.js';
import type { User } from './user.js';
import { UsersRepository } from './users.repository.js';

const SIGN_UPS_PER_IP: RateLimit = { name: 'sign-up', limit: 10, windowSeconds: 60 * 60 };
const SIGN_INS_PER_IP: RateLimit = { name: 'sign-in', limit: 50, windowSeconds: 15 * 60 };
// Keyed by client and email, so a stranger cannot lock an account by failing on its email.
const SIGN_INS_PER_ACCOUNT: RateLimit = {
  name: 'sign-in-account',
  limit: 5,
  windowSeconds: 15 * 60,
};

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export interface NewAccount extends Credentials {
  readonly name: string;
}

/** The token for the browser's cookie, and when it expires. */
export interface SessionGrant {
  readonly token: string;
  readonly expiresAt: Date;
}

export interface SignedIn {
  readonly user: User;
  readonly session: SessionGrant;
}

export interface Authenticated {
  readonly user: User;
  /** The new expiry when this request extended the session, so the cookie is sent again. */
  readonly renewedUntil: Date | undefined;
}

@Injectable()
export class IdentityService {
  // Checked when no account matches, so an unknown email takes as long as a wrong password.
  private readonly unknownUserHash = hashPassword(randomUUID());

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async signUp(account: NewAccount, clientIp: string): Promise<SignedIn> {
    await this.rateLimiter.consume(SIGN_UPS_PER_IP, clientIp);
    // Hashed before the transaction opens: it takes CPU time, not a database connection.
    const passwordHash = await hashPassword(account.password);

    return this.db.transaction().execute(async (trx) => {
      const user = await this.users.insert(trx, {
        name: account.name,
        email: account.email,
        passwordHash,
      });
      if (user === undefined) {
        throw new AppError(
          'EMAIL_TAKEN',
          'An account with this email already exists. Sign in instead.',
        );
      }
      return { user, session: await this.startSession(user.id, trx) };
    });
  }

  async signIn(credentials: Credentials, clientIp: string): Promise<SignedIn> {
    const email = credentials.email.toLowerCase();
    await this.rateLimiter.consume(SIGN_INS_PER_IP, clientIp);
    await this.rateLimiter.consume(SIGN_INS_PER_ACCOUNT, `${clientIp}:${email}`);

    const user = await this.users.findByEmail(email);
    const passwordHash = user?.passwordHash ?? (await this.unknownUserHash);
    const passwordMatches = await verifyPassword(passwordHash, credentials.password);
    if (user === undefined || !passwordMatches) {
      throw new AppError('INVALID_CREDENTIALS', 'The email or password is incorrect.');
    }

    if (needsRehash(user.passwordHash)) {
      await this.users.updatePasswordHash(user.id, await hashPassword(credentials.password));
    }
    return { user: toUser(user), session: await this.startSession(user.id) };
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const user = await this.users.findByEmail(email);
    return user === undefined ? undefined : toUser(user);
  }

  async findUsers(ids: readonly string[]): Promise<User[]> {
    return this.users.findByIds(ids);
  }

  async signOut(token: string): Promise<void> {
    await this.sessions.delete(hashSessionToken(token));
  }

  /** The user a session token belongs to, or undefined if it is unknown or expired. */
  async authenticate(token: string): Promise<Authenticated | undefined> {
    const session = await this.sessions.findActive(hashSessionToken(token));
    if (session === undefined) {
      return undefined;
    }
    const renewedUntil = session.renewalDue ? await this.sessions.renew(session.id) : undefined;
    return { user: session.user, renewedUntil };
  }

  private async startSession(userId: string, db?: Database): Promise<SessionGrant> {
    const token = newSessionToken();
    const expiresAt = await this.sessions.insert(userId, hashSessionToken(token), db);
    return { token, expiresAt };
  }
}

function toUser({ id, name, email }: User): User {
  return { id, name, email };
}
