import { z } from 'zod';
import { emailSchema } from './common.js';
import { propertyRoleSchema } from './properties.js';

/** `POST /v1/host/properties/:propertyId/members`. The person needs an account already. */
export const addMemberRequestSchema = z.object({
  email: emailSchema,
  role: propertyRoleSchema,
});

export type AddMemberRequest = z.infer<typeof addMemberRequestSchema>;

/** `PATCH /v1/host/properties/:propertyId/members/:userId` */
export const changeMemberRoleRequestSchema = z.object({
  role: propertyRoleSchema,
});

export type ChangeMemberRoleRequest = z.infer<typeof changeMemberRoleRequestSchema>;

export const memberResponseSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: propertyRoleSchema,
  /** When they joined the property. */
  since: z.iso.datetime(),
});

export type MemberResponse = z.infer<typeof memberResponseSchema>;

/** `GET /v1/host/properties/:propertyId/members` */
export const teamResponseSchema = z.object({
  members: z.array(memberResponseSchema),
});

export type TeamResponse = z.infer<typeof teamResponseSchema>;
