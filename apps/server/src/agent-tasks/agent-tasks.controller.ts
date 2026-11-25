import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { AgentTasksService, AgentTaskView } from './agent-tasks.service';
import { CreateAgentTaskDto, ListAgentTasksQuery, UpdateAgentTaskDto } from './dto/agent-task.dto';

@Controller('agent-tasks')
export class AgentTasksController {
  constructor(private readonly tasks: AgentTasksService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAgentTaskDto): Promise<AgentTaskView> {
    return this.tasks.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListAgentTasksQuery): Promise<AgentTaskView[]> {
    return this.tasks.list(user.id, query);
  }

  /** Approve, reject or cancel; or edit a task that has not started. */
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgentTaskDto,
  ): Promise<AgentTaskView> {
    return this.tasks.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.tasks.remove(user.id, id);
  }
}
