import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  type SignInRequest,
  signInRequestSchema,
  type SignUpRequest,
  signUpRequestSchema,
  type UserResponse,
} from '@stay-flow/contracts';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { CurrentUser } from './current-user.js';
import { IdentityService, type SignedIn } from './identity.service.js';
import { SessionCookie } from './session-cookie.js';
import { SessionGuard } from './session.guard.js';
import type { User } from './user.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly identity: IdentityService,
    private readonly cookie: SessionCookie,
  ) {}

  @Post('sign-up')
  async signUp(
    @Body(new ZodValidationPipe(signUpRequestSchema)) body: SignUpRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserResponse> {
    return this.startSession(response, await this.identity.signUp(body, clientIp(request)));
  }

  @Post('sign-in')
  @HttpCode(200)
  async signIn(
    @Body(new ZodValidationPipe(signInRequestSchema)) body: SignInRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserResponse> {
    const signedIn = await this.identity.signIn(body, clientIp(request));
    // A new sign-in in this browser ends the session it had before.
    const previous = this.cookie.read(request);
    if (previous !== undefined) {
      await this.identity.signOut(previous);
    }
    return this.startSession(response, signedIn);
  }

  @Post('sign-out')
  @HttpCode(204)
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = this.cookie.read(request);
    if (token !== undefined) {
      await this.identity.signOut(token);
    }
    this.cookie.clear(response);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: User): UserResponse {
    return toUserResponse(user);
  }

  private startSession(response: Response, { user, session }: SignedIn): UserResponse {
    this.cookie.write(response, session.token, session.expiresAt);
    return toUserResponse(user);
  }
}

function toUserResponse(user: User): UserResponse {
  return { id: user.id, name: user.name, email: user.email };
}

// Behind a proxy this is the client's address only if TRUST_PROXY_HOPS counts the proxy.
function clientIp(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}
