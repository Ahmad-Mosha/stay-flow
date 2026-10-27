import { Controller, Get, Query } from '@nestjs/common';
import {
  type RoomCalendarQuery,
  roomCalendarQuerySchema,
  type RoomCalendarResponse,
  type TodayResponse,
} from '@stay-flow/contracts';
import { fromNights } from '../../platform/time/nights.js';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { CurrentAccess, type PropertyAccess } from '../access/property-access.js';
import { HostAccess } from '../access/property-access.guard.js';
import { toRoomCalendarResponse, toTodayResponse } from './frontdesk-response.js';
import { FrontdeskService } from './frontdesk.service.js';

@Controller('host/properties/:propertyId')
export class FrontdeskController {
  constructor(private readonly frontdesk: FrontdeskService) {}

  @Get('calendar')
  @HostAccess('property.view')
  async calendar(
    @CurrentAccess() { propertyId }: PropertyAccess,
    @Query(new ZodValidationPipe(roomCalendarQuerySchema)) query: RoomCalendarQuery,
  ): Promise<RoomCalendarResponse> {
    return toRoomCalendarResponse(await this.frontdesk.calendar(propertyId, fromNights(query)));
  }

  @Get('today')
  @HostAccess('property.view')
  async today(@CurrentAccess() { propertyId }: PropertyAccess): Promise<TodayResponse> {
    return toTodayResponse(await this.frontdesk.today(propertyId));
  }
}
