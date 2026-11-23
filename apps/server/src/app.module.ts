import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { SupabaseAuthGuard } from './auth/supabase-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MeModule } from './me/me.module';
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    SupabaseModule,
    AuthModule,
    AuditModule,
    HealthModule,
    MeModule,
  ],
  providers: [
    // Guard order matters: authentication first, so rate limits can be counted per user.
    { provide: APP_GUARD, useExisting: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
