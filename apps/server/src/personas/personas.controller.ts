import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreatePersonaDto } from './dto/create-persona.dto';
import { UpdatePersonaDto } from './dto/update-persona.dto';
import { PersonasService, PersonaView } from './personas.service';

@Controller('personas')
export class PersonasController {
  constructor(private readonly personas: PersonasService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePersonaDto): Promise<PersonaView> {
    return this.personas.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<PersonaView[]> {
    return this.personas.list(user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePersonaDto,
  ): Promise<PersonaView> {
    return this.personas.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.personas.remove(user.id, id);
  }
}
