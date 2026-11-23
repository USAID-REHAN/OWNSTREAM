import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvironmentVariables } from '../config/env.validation';
import { ALL_ENTITIES } from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        type: 'postgres',
        url: config.get('NEON_DATABASE_URL', { infer: true }),
        ssl: config.get('DB_SSL', { infer: true }),
        entities: ALL_ENTITIES,
        autoLoadEntities: true,
        // The schema is owned by db/neon_schema.sql; TypeORM never changes it.
        synchronize: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
