import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import {
  type CreateUnitRequest,
  createUnitRequestSchema,
  type UnitResponse,
  type UpdateUnitRequest,
  updateUnitRequestSchema,
} from '@stay-flow/contracts';
import { z } from 'zod';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { CurrentAccess, type PropertyAccess } from '../access/property-access.js';
import { HostAccess } from '../access/property-access.guard.js';
import { HostInventoryService } from './host-inventory.service.js';
import { toUnitResponse } from './inventory-response.js';

const unitParamsSchema = z.object({ unitId: z.uuid() });

type UnitParams = z.infer<typeof unitParamsSchema>;

@Controller('host/properties/:propertyId/units')
export class UnitsController {
  constructor(private readonly inventory: HostInventoryService) {}

  @Post()
  @HostAccess('inventory.manage')
  async create(
    @CurrentAccess() { propertyId }: PropertyAccess,
    @Body(new ZodValidationPipe(createUnitRequestSchema)) body: CreateUnitRequest,
  ): Promise<UnitResponse> {
    return toUnitResponse(await this.inventory.createUnit(propertyId, body.unitTypeId, body.name));
  }

  @Patch(':unitId')
  @HostAccess('inventory.manage')
  async rename(
    @CurrentAccess() { propertyId }: PropertyAccess,
    @Param(new ZodValidationPipe(unitParamsSchema)) { unitId }: UnitParams,
    @Body(new ZodValidationPipe(updateUnitRequestSchema)) body: UpdateUnitRequest,
  ): Promise<UnitResponse> {
    return toUnitResponse(await this.inventory.renameUnit(propertyId, unitId, body.name));
  }
}
