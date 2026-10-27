import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  type CreateUnitTypeRequest,
  createUnitTypeRequestSchema,
  type HostUnitTypeListResponse,
  type HostUnitTypeResponse,
  type UpdateUnitTypeRequest,
  updateUnitTypeRequestSchema,
} from '@stay-flow/contracts';
import { z } from 'zod';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { CurrentAccess, type PropertyAccess } from '../access/property-access.js';
import { HostAccess } from '../access/property-access.guard.js';
import { HostInventoryService } from './host-inventory.service.js';
import { toHostUnitTypeResponse } from './inventory-response.js';

const unitTypeParamsSchema = z.object({ unitTypeId: z.uuid() });

type UnitTypeParams = z.infer<typeof unitTypeParamsSchema>;

@Controller('host/properties/:propertyId/unit-types')
export class UnitTypesController {
  constructor(private readonly inventory: HostInventoryService) {}

  @Get()
  @HostAccess('property.view')
  async list(@CurrentAccess() { propertyId }: PropertyAccess): Promise<HostUnitTypeListResponse> {
    const unitTypes = await this.inventory.listUnitTypes(propertyId);
    return { unitTypes: unitTypes.map(toHostUnitTypeResponse) };
  }

  @Post()
  @HostAccess('inventory.manage')
  async create(
    @CurrentAccess() { propertyId }: PropertyAccess,
    @Body(new ZodValidationPipe(createUnitTypeRequestSchema)) body: CreateUnitTypeRequest,
  ): Promise<HostUnitTypeResponse> {
    return toHostUnitTypeResponse(await this.inventory.createUnitType(propertyId, body));
  }

  @Patch(':unitTypeId')
  @HostAccess('inventory.manage')
  async update(
    @CurrentAccess() { propertyId }: PropertyAccess,
    @Param(new ZodValidationPipe(unitTypeParamsSchema)) { unitTypeId }: UnitTypeParams,
    @Body(new ZodValidationPipe(updateUnitTypeRequestSchema)) body: UpdateUnitTypeRequest,
  ): Promise<HostUnitTypeResponse> {
    return toHostUnitTypeResponse(
      await this.inventory.updateUnitType(propertyId, unitTypeId, body),
    );
  }
}
