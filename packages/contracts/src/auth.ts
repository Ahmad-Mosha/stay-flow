import { z } from 'zod';
import { emailSchema } from './common.js';

/** NIST SP 800-63B asks for at least 15 characters when a password is the only factor. */
const newPasswordSchema = z.string().min(15).max(128);

/** `POST /v1/auth/sign-up` */
export const signUpRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: newPasswordSchema,
});

export type SignUpRequest = z.infer<typeof signUpRequestSchema>;

/** `POST /v1/auth/sign-in` */
export const signInRequestSchema = z.object({
  email: emailSchema,
  // No length rule beyond a bound: an account may predate the current password rules.
  password: z.string().min(1).max(128),
});

export type SignInRequest = z.infer<typeof signInRequestSchema>;

/** The signed-in host, returned by sign-up, sign-in and `GET /v1/auth/me`. */
export const userResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;
