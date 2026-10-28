import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../database/database.js';
import { AppError } from '../errors/app-error.js';
import { GracefulShutdown } from './graceful-shutdown.js';

interface HealthStatus {
  readonly status: 'ok';
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly shutdown: GracefulShutdown,
  ) {}

  /** The process is up. Never checks dependencies: a restart would not fix them. */
  @Get('live')
  live(): HealthStatus {
    return { status: 'ok' };
  }

  /** The process can serve traffic: it is not shutting down, and it can reach the database. */
  @Get('ready')
  async ready(): Promise<HealthStatus> {
    if (!this.shutdown.ready) {
      throw new AppError('SERVICE_UNAVAILABLE', 'The server is shutting down.');
    }
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
