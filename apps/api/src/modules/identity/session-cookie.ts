import { Inject, Injectable } from '@nestjs/common';
import { parseCookie } from 'cookie';
import type { CookieOptions, Request, Response } from 'express';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';

/** Reads and writes the session cookie. */
@Injectable()
export class SessionCookie {
  private readonly name: string;
  private readonly options: CookieOptions;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    // Secure cookies need HTTPS. With it, the __Host- prefix also stops a subdomain from
    // planting its own session cookie.
    const secure = config.env === 'production';
    this.name = secure ? '__Host-session' : 'session';
    // HttpOnly hides the token from scripts; Lax keeps it off cross-site POSTs.
    this.options = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
  }

  read(request: Request): string | undefined {
    const header = request.header('cookie');
    return header === undefined ? undefined : parseCookie(header)[this.name];
  }

  write(response: Response, token: string, expires: Date): void {
    response.cookie(this.name, token, { ...this.options, expires });
  }

  clear(response: Response): void {
    response.clearCookie(this.name, this.options);
  }
}
