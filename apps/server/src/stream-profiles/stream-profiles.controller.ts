import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { StreamProfileEntity } from '../database/entities/stream-profile.entity';
import { CreateStreamProfileDto } from './dto/create-stream-profile.dto';
import { UpdateStreamProfileDto } from './dto/update-stream-profile.dto';
import { StreamProfilesService } from './stream-profiles.service';

@Controller('stream-profiles')
export class StreamProfilesController {
  constructor(private readonly streamProfiles: StreamProfilesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<StreamProfileEntity[]> {
    return this.streamProfiles.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStreamProfileDto): Promise<StreamProfileEntity> {
    return this.streamProfiles.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStreamProfileDto,
  ): Promise<StreamProfileEntity> {
    return this.streamProfiles.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.streamProfiles.remove(user.id, id);
  }
}
