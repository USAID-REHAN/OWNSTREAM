import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceEntity, GameEntity, StreamProfileEntity } from '../database/entities';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { RawgService } from './rawg.service';

/** F3: the game library, RAWG search and launch target checks. */
@Module({
  imports: [TypeOrmModule.forFeature([GameEntity, DeviceEntity, StreamProfileEntity])],
  controllers: [GamesController],
  providers: [GamesService, RawgService],
  exports: [GamesService],
})
export class GamesModule {}
