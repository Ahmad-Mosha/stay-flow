import { Controller, Get, Param } from '@nestjs/common';
import type { PropertyResponse } from '@stay-flow/contracts';
import { PropertiesService } from './properties.service.js';
import type { Property } from './property.js';

@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get(':slug')
  async get(@Param('slug') slug: string): Promise<PropertyResponse> {
    return toPropertyResponse(await this.properties.getBySlug(slug));
  }
}

function toPropertyResponse(property: Property): PropertyResponse {
  return {
    slug: property.slug,
    name: property.name,
    timeZone: property.timeZone,
    currency: property.currency,
    checkInTime: property.checkInTime.toString({ smallestUnit: 'minute' }),
    checkOutTime: property.checkOutTime.toString({ smallestUnit: 'minute' }),
    stayRules: property.stayRules,
  };
}
