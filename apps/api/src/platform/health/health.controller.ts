import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../database/database.js';
import { AppError } from '../errors/app-error.js';

interface HealthStatus {
  readonly status: 'ok';
}

/**
 * Liveness: the process is up and serving HTTP. A failure means "restart me".
 * Readiness: the process can do useful work, which needs the database. A failure means
 * "stop sending me traffic", without a restart that would not fix a database outage.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get('live')
  live(): HealthStatus {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<HealthStatus> {
    try {
      await sql`select 1`.execute(this.db);
    } catch (error) {
      throw new AppError('SERVICE_UNAVAILABLE', 'The database is not reachable.', {
        cause: error,
      });
    }
    return { status: 'ok' };
  }
}
