import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonaEntity } from '../database/entities';
import { PersonasController } from './personas.controller';
import { PersonasService } from './personas.service';

/** F7: personas (saved system prompts) and the three starter personas. */
@Module({
  imports: [TypeOrmModule.forFeature([PersonaEntity])],
  controllers: [PersonasController],
  providers: [PersonasService],
})
export class PersonasModule {}
