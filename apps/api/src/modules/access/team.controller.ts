import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  type AddMemberRequest,
  addMemberRequestSchema,
  type ChangeMemberRoleRequest,
  changeMemberRoleRequestSchema,
  type MemberResponse,
  type TeamResponse,
} from '@stay-flow/contracts';
import { z } from 'zod';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { CurrentAccess, type PropertyAccess } from './property-access.js';
import { HostAccess } from './property-access.guard.js';
import { type Member, TeamService } from './team.service.js';

const memberParamsSchema = z.object({ userId: z.uuid() });

type MemberParams = z.infer<typeof memberParamsSchema>;

@Controller('host/properties/:propertyId/members')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  @HostAccess('team.view')
  async list(@CurrentAccess() { propertyId }: PropertyAccess): Promise<TeamResponse> {
    return { members: (await this.team.list(propertyId)).map(toMemberResponse) };
  }

  @Post()
  @HostAccess('team.manage')
  async add(
    @CurrentAccess() { propertyId }: PropertyAccess,
    @Body(new ZodValidationPipe(addMemberRequestSchema)) body: AddMemberRequest,
  ): Promise<MemberResponse> {
    return toMemberResponse(await this.team.add(propertyId, body.email, body.role));
  }

  @Patch(':userId')
  @HostAccess('team.manage')
  async changeRole(
    @CurrentAccess() { propertyId }: PropertyAccess,
    @Param(new ZodValidationPipe(memberParamsSchema)) { userId }: MemberParams,
    @Body(new ZodValidationPipe(changeMemberRoleRequestSchema)) body: ChangeMemberRoleRequest,
  ): Promise<MemberResponse> {
    return toMemberResponse(await this.team.changeRole(propertyId, userId, body.role));
  }

  @Delete(':userId')
  @HttpCode(204)
  @HostAccess('team.manage')
  async remove(
    @CurrentAccess() { propertyId }: PropertyAccess,
    @Param(new ZodValidationPipe(memberParamsSchema)) { userId }: MemberParams,
  ): Promise<void> {
    await this.team.remove(propertyId, userId);
  }
}

function toMemberResponse(member: Member): MemberResponse {
  return {
    userId: member.userId,
    name: member.name,
    email: member.email,
    role: member.role,
    since: member.since.toISOString(),
  };
}
