import { Controller, Get, Param } from '@nestjs/common';
import type { PropertyResponse } from '@stay-flow/contracts';
import { PropertiesService } from './properties.service.js';
import { toPropertyResponse } from './property-response.js';

@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get(':slug')
  async get(@Param('slug') slug: string): Promise<PropertyResponse> {
    return toPropertyResponse(await this.properties.getBySlug(slug));
  }
}
