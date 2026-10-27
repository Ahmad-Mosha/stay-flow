import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import {
  type BlockResponse,
  type CreateBlockRequest,
  createBlockRequestSchema,
} from '@stay-flow/contracts';
import { z } from 'zod';
import { fromNights, toNights } from '../../platform/time/nights.js';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { CurrentAccess, type PropertyAccess } from '../access/property-access.js';
import { HostAccess } from '../access/property-access.guard.js';
import { BlocksService } from './blocks.service.js';

const blockParamsSchema = z.object({ blockId: z.uuid() });

type BlockParams = z.infer<typeof blockParamsSchema>;

@Controller('host/properties/:propertyId/blocks')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Post()
  @HostAccess('blocks.manage')
  async create(
    @CurrentAccess() { propertyId }: PropertyAccess,
    @Body(new ZodValidationPipe(createBlockRequestSchema)) body: CreateBlockRequest,
  ): Promise<BlockResponse> {
    const block = await this.blocks.block(propertyId, {
      unitId: body.unitId,
      nights: fromNights(body.nights),
      reason: body.reason,
    });
    return {
      id: block.id,
      unitId: block.unitId,
      nights: toNights(block.nights),
      reason: block.reason,
    };
  }

  @Delete(':blockId')
  @HttpCode(204)
  @HostAccess('blocks.manage')
  async remove(
    @CurrentAccess() { propertyId }: PropertyAccess,
    @Param(new ZodValidationPipe(blockParamsSchema)) { blockId }: BlockParams,
  ): Promise<void> {
    await this.blocks.unblock(propertyId, blockId);
  }
}
