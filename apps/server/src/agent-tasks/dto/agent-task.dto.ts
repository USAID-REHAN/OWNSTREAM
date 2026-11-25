import { AGENT_TOOLS, AgentTool, TASK_STATUSES, TaskStatus } from '@ownstream/shared';
import { Transform } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateAgentTaskDto {
  /** The paired host that runs the task. */
  @IsUUID()
  hostDeviceId: string;

  @Transform(trim)
  @IsString()
  @Length(1, 100)
  title: string;

  /** What the agent should do, in plain words. */
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  instruction: string;

  /** Defaults to list_files and read_file, which never need approval. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(AGENT_TOOLS, { each: true })
  allowedTools?: AgentTool[];

  @Transform(trim)
  @IsString()
  @MaxLength(240)
  workspaceFolder: string;
}

export const TASK_ACTIONS = ['approve', 'reject', 'cancel'] as const;
export type TaskAction = (typeof TASK_ACTIONS)[number];

/**
 * PATCH /api/agent-tasks/:id: either an action (approve, reject or cancel),
 * or edits to a task that has not started yet.
 */
export class UpdateAgentTaskDto {
  @IsOptional()
  @IsIn(TASK_ACTIONS)
  action?: TaskAction;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  instruction?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(AGENT_TOOLS, { each: true })
  allowedTools?: AgentTool[];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(240)
  workspaceFolder?: string;
}

export class ListAgentTasksQuery {
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;
}
