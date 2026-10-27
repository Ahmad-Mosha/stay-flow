import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  type CreateRateOverrideRequest,
  createRateOverrideRequestSchema,
  type RateOverrideListResponse,
  type RateOverrideResponse,
} from '@stay-flow/contracts';
import { z } from 'zod';
import { fromNights } from '../../platform/time/nights.js';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { CurrentAccess, type PropertyAccess } from '../access/property-access.js';
import { HostAccess } from '../access/property-access.guard.js';
import { HostInventoryService } from './host-inventory.service.js';
import { toRateOverrideResponse } from './inventory-response.js';

const rateOverrideParamsSchema = z.object({ rateOverrideId: z.uuid() });

type RateOverrideParams = z.infer<typeof rateOverrideParamsSchema>;

@Controller('host/properties/:propertyId/rate-overrides')
export class RateOverridesController {
  constructor(private readonly inventory: HostInventoryService) {}

  @Get()
  @HostAccess('property.view')
  async list(@CurrentAccess() { propertyId }: PropertyAccess): Promise<RateOverrideListResponse> {
    const overrides = await this.inventory.listRateOverrides(propertyId);
    return { rateOverrides: overrides.map(toRateOverrideResponse) };
  }

  @Post()
  @HostAccess('inventory.manage')
  async create(
    @CurrentAccess() { propertyId }: PropertyAccess,
    @Body(new ZodValidationPipe(createRateOverrideRequestSchema)) body: CreateRateOverrideRequest,
  ): Promise<RateOverrideResponse> {
    const override = await this.inventory.createRateOverride(propertyId, {
      ...body,
      nights: fromNights(body.nights),
    });
    return toRateOverrideResponse(override);
  }

  @Delete(':rateOverrideId')
  @HttpCode(204)
  @HostAccess('inventory.manage')
  async remove(
    @CurrentAccess() { propertyId }: PropertyAccess,
    @Param(new ZodValidationPipe(rateOverrideParamsSchema)) { rateOverrideId }: RateOverrideParams,
  ): Promise<void> {
    await this.inventory.deleteRateOverride(propertyId, rateOverrideId);
  }
}
