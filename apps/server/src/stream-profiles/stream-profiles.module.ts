import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreamProfileEntity } from '../database/entities/stream-profile.entity';
import { StreamProfilesController } from './stream-profiles.controller';
import { StreamProfilesService } from './stream-profiles.service';

@Module({
  imports: [TypeOrmModule.forFeature([StreamProfileEntity])],
  controllers: [StreamProfilesController],
  providers: [StreamProfilesService],
})
export class StreamProfilesModule {}
