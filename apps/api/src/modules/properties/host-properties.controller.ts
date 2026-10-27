import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type CreatePropertyRequest,
  createPropertyRequestSchema,
  type HostPropertyListResponse,
  type HostPropertyResponse,
  type UpdatePropertyRequest,
  updatePropertyRequestSchema,
} from '@stay-flow/contracts';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { CurrentAccess, type PropertyAccess } from '../access/property-access.js';
import { HostAccess } from '../access/property-access.guard.js';
import { CurrentUser } from '../identity/current-user.js';
import { SessionGuard } from '../identity/session.guard.js';
import type { User } from '../identity/user.js';
import { PropertiesService } from './properties.service.js';
import { toHostPropertyResponse } from './property-response.js';

@Controller('host/properties')
export class HostPropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get()
  @UseGuards(SessionGuard)
  async list(@CurrentUser() user: User): Promise<HostPropertyListResponse> {
    const memberProperties = await this.properties.listForMember(user.id);
    return {
      properties: memberProperties.map(({ property, role }) => ({
        id: property.id,
        slug: property.slug,
        name: property.name,
        role,
      })),
    };
  }

  @Post()
  @UseGuards(SessionGuard)
  async create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createPropertyRequestSchema)) body: CreatePropertyRequest,
  ): Promise<HostPropertyResponse> {
    return toHostPropertyResponse(await this.properties.create(body, user.id), 'owner');
  }

  @Get(':propertyId')
  @HostAccess('property.view')
  async get(@CurrentAccess() { propertyId, role }: PropertyAccess): Promise<HostPropertyResponse> {
    return toHostPropertyResponse(await this.properties.getById(propertyId), role);
  }

  @Patch(':propertyId')
  @HostAccess('property.manage')
  async update(
    @CurrentAccess() { propertyId, role }: PropertyAccess,
    @Body(new ZodValidationPipe(updatePropertyRequestSchema)) body: UpdatePropertyRequest,
  ): Promise<HostPropertyResponse> {
    const { stayRules, ...settings } = body;
    const property = await this.properties.update(propertyId, { ...settings, ...stayRules });
    return toHostPropertyResponse(property, role);
  }
}
