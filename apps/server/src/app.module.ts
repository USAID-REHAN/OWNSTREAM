import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AgentTasksModule } from './agent-tasks/agent-tasks.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { SupabaseAuthGuard } from './auth/supabase-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { validateEnv } from './config/env.validation';
import { ConversationsModule } from './conversations/conversations.module';
import { DatabaseModule } from './database/database.module';
import { DevicesModule } from './devices/devices.module';
import { GamesModule } from './games/games.module';
import { HealthModule } from './health/health.module';
import { MeModule } from './me/me.module';
import { PersonasModule } from './personas/personas.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RulesModule } from './rules/rules.module';
import { StreamProfilesModule } from './stream-profiles/stream-profiles.module';
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
    DevicesModule,
    RealtimeModule,
    ConversationsModule,
    GamesModule,
    AgentTasksModule,
    RulesModule,
    PersonasModule,
    StreamProfilesModule,
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
