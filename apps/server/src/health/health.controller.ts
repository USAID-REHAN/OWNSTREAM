import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Public } from '../auth/public.decorator';

export interface HealthResponse {
  status: 'ok';
  db: 'up' | 'down';
}

/** Used by Render's health check and by the team to see that the server and Neon are reachable. */
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', db: 'up' };
    } catch {
      return { status: 'ok', db: 'down' };
    }
  }
}
