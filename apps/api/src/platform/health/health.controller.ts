import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../database/database.js';
import { AppError } from '../errors/app-error.js';

interface HealthStatus {
  readonly status: 'ok';
}

@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The process is up. Never checks dependencies: a restart would not fix them. */
  @Get('live')
  live(): HealthStatus {
    return { status: 'ok' };
  }

  /** The process can serve traffic, which needs the database. */
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
