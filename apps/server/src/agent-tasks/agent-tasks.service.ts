import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AgentApprovalPayload,
  AgentDecisionPayload,
  AgentFinishedPayload,
  AgentRunPayload,
  AgentTool,
  RealtimeEvent,
  TaskStatus,
} from '@ownstream/shared';
import { Observable, Subject, Subscription } from 'rxjs';
import { In, LessThan, Repository } from 'typeorm';
import { AgentTaskEntity, DeviceEntity } from '../database/entities';
import { DeviceEvents } from '../devices/device-events.service';
import { HostRegistry } from '../realtime/host-registry.service';
import { CreateAgentTaskDto, ListAgentTasksQuery, UpdateAgentTaskDto } from './dto/agent-task.dto';
import { workspaceFolderError } from './workspace-folder';

/** Limits from Implementation Plan section 12.4, sent to the host with every task. */
export const AGENT_MAX_STEPS = 8;
export const AGENT_TIME_LIMIT_SECONDS = 300;
export const MAX_OPEN_TASKS_PER_HOST = 20;
/** A task still "running" this long after it started gets marked failed. */
export const STALE_RUNNING_MS = 2 * AGENT_TIME_LIMIT_SECONDS * 1000;
const SWEEP_INTERVAL_MS = 60_000;
const MAX_SUMMARY = 1000;

const OPEN: TaskStatus[] = ['queued', 'running', 'waiting_approval'];
const ACTIVE: TaskStatus[] = ['running', 'waiting_approval'];
const DEFAULT_TOOLS: AgentTool[] = ['list_files', 'read_file'];

/** The task status flow. Anything not listed here is refused. */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['waiting_approval', 'done', 'failed', 'cancelled'],
  waiting_approval: ['running', 'failed', 'cancelled'],
  done: [],
  failed: [],
  cancelled: [],
};
export const canMove = (from: TaskStatus, to: TaskStatus) => TRANSITIONS[from].includes(to);

export interface AgentTaskView {
  id: string;
  hostDeviceId: string;
  title: string;
  instruction: string;
  allowedTools: string[];
  workspaceFolder: string;
  status: TaskStatus;
  resultSummary: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export function toAgentTaskView(t: AgentTaskEntity): AgentTaskView {
  return {
    id: t.id,
    hostDeviceId: t.hostDeviceId,
    title: t.title,
    instruction: t.instruction,
    allowedTools: t.allowedTools,
    workspaceFolder: t.workspaceFolder,
    status: t.status,
    resultSummary: t.resultSummary,
    createdAt: t.createdAt,
    startedAt: t.startedAt,
    finishedAt: t.finishedAt,
  };
}

/** Raised for the Telegram alerts (ai_task_waiting_approval and ai_task_finished). */
export interface AgentTaskEvent {
  kind: 'waiting_approval' | 'finished';
  userId: string;
  taskId: string;
  title: string;
  status: TaskStatus;
}

/**
 * F8 agent tasks. The server keeps the task list and status; the host runs the steps.
 * File contents and step logs never come here: they travel encrypted as agent:step.
 */
@Injectable()
export class AgentTasksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AgentTasks');
  private readonly events = new Subject<AgentTaskEvent>();
  private readonly subscriptions: Subscription[] = [];
  private timer: NodeJS.Timeout | null = null;

  readonly events$: Observable<AgentTaskEvent> = this.events.asObservable();

  constructor(
    @InjectRepository(AgentTaskEntity) private readonly tasks: Repository<AgentTaskEntity>,
    @InjectRepository(DeviceEntity) private readonly devices: Repository<DeviceEntity>,
    private readonly hosts: HostRegistry,
    private readonly deviceEvents: DeviceEvents,
  ) {}

  onModuleInit(): void {
    this.subscriptions.push(
      this.deviceEvents.hostOnline$.subscribe(({ deviceId }) => this.background(this.dispatchNext(deviceId))),
      this.deviceEvents.hostOffline$.subscribe(({ deviceId }) =>
        this.background(this.failActive({ hostDeviceId: deviceId }, 'The host went offline during the task')),
      ),
    );
    this.timer = setInterval(() => this.background(this.failStale()), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe());
    if (this.timer) clearInterval(this.timer);
  }

  // ---- Website (REST) -------------------------------------------------------------------------

  async list(userId: string, query: ListAgentTasksQuery): Promise<AgentTaskView[]> {
    const rows = await this.tasks.find({
      where: query.status ? { userId, status: query.status } : { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toAgentTaskView);
  }

  async create(userId: string, dto: CreateAgentTaskDto): Promise<AgentTaskView> {
    this.assertFolder(dto.workspaceFolder);
    const device = await this.devices.findOneBy({ id: dto.hostDeviceId, userId });
    if (!device) throw new NotFoundException('Device not found');
    const open = await this.tasks.count({ where: { hostDeviceId: dto.hostDeviceId, status: In(OPEN) } });
    if (open >= MAX_OPEN_TASKS_PER_HOST) {
      throw new BadRequestException(`A host can have at most ${MAX_OPEN_TASKS_PER_HOST} open tasks`);
    }

    const task = await this.tasks.save(
      this.tasks.create({
        userId,
        hostDeviceId: dto.hostDeviceId,
        title: dto.title,
        instruction: dto.instruction,
        allowedTools: dto.allowedTools ?? DEFAULT_TOOLS,
        workspaceFolder: dto.workspaceFolder,
        status: 'queued',
      }),
    );
    await this.dispatchNext(dto.hostDeviceId);
    return toAgentTaskView((await this.tasks.findOneBy({ id: task.id })) ?? task);
  }

  /** Approve, reject or cancel; or edit a task that has not started. */
  async update(userId: string, id: string, dto: UpdateAgentTaskDto): Promise<AgentTaskView> {
    const task = await this.findOwned(userId, id);
    const edits = dto.title ?? dto.instruction ?? dto.allowedTools ?? dto.workspaceFolder;
    if (dto.action && edits !== undefined) throw new BadRequestException('Send either an action or edits, not both');

    if (dto.action === 'approve' || dto.action === 'reject') {
      if (task.status !== 'waiting_approval') throw new ConflictException('This task is not waiting for approval');
      if (!this.sendDecision(task, dto.action)) throw new ConflictException('The host is offline; try again when it is back');
      await this.move(task, 'running');
    } else if (dto.action === 'cancel') {
      if (!OPEN.includes(task.status)) throw new ConflictException('This task has already ended');
      if (ACTIVE.includes(task.status)) this.sendDecision(task, 'cancel');
      await this.move(task, 'cancelled', { finishedAt: new Date() });
      await this.dispatchNext(task.hostDeviceId);
    } else if (edits !== undefined) {
      if (task.status !== 'queued') throw new ConflictException('Only a task that has not started can be edited');
      if (dto.workspaceFolder !== undefined) this.assertFolder(dto.workspaceFolder);
      if (dto.title !== undefined) task.title = dto.title;
      if (dto.instruction !== undefined) task.instruction = dto.instruction;
      if (dto.allowedTools !== undefined) task.allowedTools = dto.allowedTools;
      if (dto.workspaceFolder !== undefined) task.workspaceFolder = dto.workspaceFolder;
      await this.tasks.save(task);
    } else {
      throw new BadRequestException('Nothing to change');
    }
    return toAgentTaskView((await this.tasks.findOneBy({ id: task.id })) ?? task);
  }

  async remove(userId: string, id: string): Promise<void> {
    const task = await this.findOwned(userId, id);
    if (ACTIVE.includes(task.status)) throw new ConflictException('Cancel the task before deleting it');
    await this.tasks.delete({ id, userId });
  }

  // ---- Host (realtime) --------------------------------------------------------------------------

  /** agent:approval: the host asks before a write_note or run_script step. */
  async hostRequestsApproval(deviceId: string, payload: AgentApprovalPayload): Promise<boolean> {
    const task = await this.tasks.findOneBy({ id: payload.taskId, hostDeviceId: deviceId });
    if (!task || !canMove(task.status, 'waiting_approval')) return false;
    if (!(await this.move(task, 'waiting_approval'))) return false;

    this.hosts.emitToUser(task.userId, RealtimeEvent.AgentApproval, { taskId: task.id, tool: payload.tool });
    this.events.next({ kind: 'waiting_approval', userId: task.userId, taskId: task.id, title: task.title, status: 'waiting_approval' });
    return true;
  }

  /** agent:finished: final status and a short summary. */
  async hostFinished(deviceId: string, payload: AgentFinishedPayload): Promise<boolean> {
    const task = await this.tasks.findOneBy({ id: payload.taskId, hostDeviceId: deviceId });
    if (!task || !canMove(task.status, payload.status)) return false;
    const summary = payload.summary.slice(0, MAX_SUMMARY);
    if (!(await this.move(task, payload.status, { resultSummary: summary, finishedAt: new Date() }))) return false;

    this.hosts.emitToUser(task.userId, RealtimeEvent.AgentFinished, { taskId: task.id, status: payload.status, summary });
    this.events.next({ kind: 'finished', userId: task.userId, taskId: task.id, title: task.title, status: payload.status });
    await this.dispatchNext(deviceId);
    return true;
  }

  // ---- Internals --------------------------------------------------------------------------------

  /**
   * Sends the oldest queued task to the host, one task at a time per host. Needs the host online
   * and in AI mode (the agent uses the local model).
   */
  async dispatchNext(deviceId: string): Promise<void> {
    const host = this.hosts.get(deviceId);
    if (!host || host.mode !== 'ai') return;
    const busy = await this.tasks.count({ where: { hostDeviceId: deviceId, status: In(ACTIVE) } });
    if (busy > 0) return;

    const next = await this.tasks.findOne({ where: { hostDeviceId: deviceId, status: 'queued' }, order: { createdAt: 'ASC' } });
    if (!next) return;
    // Only one caller can move it from queued to running, so a task is never sent twice.
    if (!(await this.move(next, 'running', { startedAt: new Date() }))) return;

    const run: AgentRunPayload = {
      taskId: next.id,
      title: next.title,
      instruction: next.instruction,
      tools: next.allowedTools as AgentTool[],
      workspaceFolder: next.workspaceFolder,
      maxSteps: AGENT_MAX_STEPS,
      timeLimitSeconds: AGENT_TIME_LIMIT_SECONDS,
    };
    host.socket.emit(RealtimeEvent.AgentRun, run);
  }

  /** Changes the status only if it is still what we read, so two updates cannot both win. */
  private async move(task: AgentTaskEntity, to: TaskStatus, extra: Partial<AgentTaskEntity> = {}): Promise<boolean> {
    if (!canMove(task.status, to)) return false;
    const result = await this.tasks.update({ id: task.id, status: task.status }, { status: to, ...extra });
    if (!result.affected) return false;
    Object.assign(task, { status: to, ...extra });
    return true;
  }

  private sendDecision(task: AgentTaskEntity, decision: AgentDecisionPayload['decision']): boolean {
    const payload: AgentDecisionPayload = { taskId: task.id, decision };
    return this.hosts.emitToHost(task.hostDeviceId, RealtimeEvent.AgentDecision, payload);
  }

  private async failActive(where: { hostDeviceId: string }, summary: string): Promise<void> {
    await this.tasks.update(
      { ...where, status: In(ACTIVE) },
      { status: 'failed', resultSummary: summary, finishedAt: new Date() },
    );
  }

  /** Tasks the host stopped answering about (it must finish within 5 minutes). */
  private async failStale(): Promise<void> {
    await this.tasks.update(
      { status: 'running', startedAt: LessThan(new Date(Date.now() - STALE_RUNNING_MS)) },
      { status: 'failed', resultSummary: 'No answer from the host within the time limit', finishedAt: new Date() },
    );
  }

  private async findOwned(userId: string, id: string): Promise<AgentTaskEntity> {
    const task = await this.tasks.findOneBy({ id, userId });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private assertFolder(folder: string): void {
    const error = workspaceFolderError(folder);
    if (error) throw new BadRequestException(error);
  }

  private background(work: Promise<unknown>): void {
    work.catch((err: Error) => this.logger.warn(err.message));
  }
}
