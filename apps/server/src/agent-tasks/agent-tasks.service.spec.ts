import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RealtimeEvent, TaskStatus } from '@ownstream/shared';
import type { Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { AgentTaskEntity, DeviceEntity } from '../database/entities';
import { DeviceEvents } from '../devices/device-events.service';
import { HostRegistry } from '../realtime/host-registry.service';
import { parseApproval, parseFinished } from './agent-tasks.gateway';
import { AGENT_MAX_STEPS, AgentTaskEvent, AgentTasksService, canMove, MAX_OPEN_TASKS_PER_HOST } from './agent-tasks.service';
import { workspaceFolderError } from './workspace-folder';

const HOST = '11111111-1111-4111-8111-111111111111';
const TASK = '22222222-2222-4222-8222-222222222222';

/** A tiny in-memory agent_tasks table, enough to follow the status flow. */
function fakeTasks() {
  const rows = new Map<string, AgentTaskEntity>();
  const matches = (row: AgentTaskEntity, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const value = (row as unknown as Record<string, unknown>)[k];
      if (v && typeof v === 'object' && '_type' in (v as object)) {
        const op = v as { _type: string; _value: unknown };
        if (op._type === 'in') return (op._value as unknown[]).includes(value);
        if (op._type === 'lessThan') return value instanceof Date && value < (op._value as Date);
      }
      return value === v;
    });
  let next = 0;
  return {
    rows,
    findOneBy: jest.fn(async (where: Record<string, unknown>) => [...rows.values()].find((r) => matches(r, where)) ?? null),
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => [...rows.values()].find((r) => matches(r, where)) ?? null),
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) => [...rows.values()].filter((r) => matches(r, where))),
    count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => [...rows.values()].filter((r) => matches(r, where)).length),
    create: jest.fn((d: Partial<AgentTaskEntity>) => ({ ...d }) as AgentTaskEntity),
    save: jest.fn(async (d: AgentTaskEntity) => {
      const defaults = { createdAt: new Date(Date.now() + next++), startedAt: null, finishedAt: null, resultSummary: null };
      const row = Object.assign(defaults, d, { id: d.id ?? (next === 1 ? TASK : `t${next}`) }) as AgentTaskEntity;
      rows.set(row.id, row);
      return row;
    }),
    update: jest.fn(async (where: Record<string, unknown>, changes: Partial<AgentTaskEntity>) => {
      let affected = 0;
      for (const row of rows.values()) {
        if (matches(row, where)) {
          Object.assign(row, changes);
          affected++;
        }
      }
      return { affected };
    }),
    delete: jest.fn(async () => ({ affected: 1 })),
  };
}

describe('AgentTasksService', () => {
  let tasks: ReturnType<typeof fakeTasks>;
  let devices: { findOneBy: jest.Mock };
  let registry: HostRegistry;
  let hostSocket: { id: string; emit: jest.Mock };
  let toUser: Array<[string, string, unknown]>;
  let events: DeviceEvents;
  let service: AgentTasksService;
  let raised: AgentTaskEvent[];

  const create = () =>
    service.create('user-1', { hostDeviceId: HOST, title: 'Tidy notes', instruction: 'Sort my notes', workspaceFolder: 'D:\\Notes' });
  const statusOf = (id = TASK): TaskStatus | undefined => tasks.rows.get(id)?.status;

  beforeEach(() => {
    tasks = fakeTasks();
    devices = { findOneBy: jest.fn(async ({ userId }: { userId: string }) => (userId === 'user-1' ? { id: HOST } : null)) };
    registry = new HostRegistry();
    toUser = [];
    jest.spyOn(registry, 'emitToUser').mockImplementation((u, e, p) => void toUser.push([u, e, p]));
    hostSocket = { id: 's1', emit: jest.fn() };
    events = new DeviceEvents();
    service = new AgentTasksService(
      tasks as unknown as Repository<AgentTaskEntity>,
      devices as unknown as Repository<DeviceEntity>,
      registry,
      events,
    );
    service.onModuleInit();
    raised = [];
    service.events$.subscribe((e) => raised.push(e));
  });

  afterEach(() => service.onModuleDestroy());

  const hostOnline = (mode: 'ai' | 'streaming' = 'ai') =>
    registry.register({ deviceId: HOST, userId: 'user-1', socket: hostSocket as unknown as Socket, mode });

  it('only allows the documented status changes', () => {
    expect(canMove('queued', 'running')).toBe(true);
    expect(canMove('running', 'waiting_approval')).toBe(true);
    expect(canMove('waiting_approval', 'running')).toBe(true);
    expect(canMove('done', 'running')).toBe(false);
    expect(canMove('queued', 'done')).toBe(false);
    expect(canMove('cancelled', 'running')).toBe(false);
  });

  it('keeps a task queued while the host is offline, and sends it when the host comes online', async () => {
    const task = await create();
    expect(task.status).toBe('queued');

    hostOnline();
    events.hostCameOnline({ deviceId: HOST, userId: 'user-1' });
    await new Promise((r) => setImmediate(r));

    expect(statusOf()).toBe('running');
    expect(hostSocket.emit).toHaveBeenCalledWith(
      RealtimeEvent.AgentRun,
      expect.objectContaining({ taskId: TASK, tools: ['list_files', 'read_file'], workspaceFolder: 'D:\\Notes', maxSteps: AGENT_MAX_STEPS }),
    );
  });

  it('does not send tasks while the host is in streaming mode', async () => {
    hostOnline('streaming');
    await create();
    expect(statusOf()).toBe('queued');
    expect(hostSocket.emit).not.toHaveBeenCalled();
  });

  it('runs the full approval flow: approval request, approve, finish', async () => {
    hostOnline();
    await create();

    expect(await service.hostRequestsApproval(HOST, { taskId: TASK, tool: 'write_note' })).toBe(true);
    expect(statusOf()).toBe('waiting_approval');
    expect(toUser).toContainEqual(['user-1', RealtimeEvent.AgentApproval, { taskId: TASK, tool: 'write_note' }]);
    expect(raised.map((e) => e.kind)).toEqual(['waiting_approval']);

    await service.update('user-1', TASK, { action: 'approve' });
    expect(hostSocket.emit).toHaveBeenCalledWith(RealtimeEvent.AgentDecision, { taskId: TASK, decision: 'approve' });
    expect(statusOf()).toBe('running');

    expect(await service.hostFinished(HOST, { taskId: TASK, status: 'done', summary: 'Sorted 12 notes' })).toBe(true);
    expect(tasks.rows.get(TASK)).toMatchObject({ status: 'done', resultSummary: 'Sorted 12 notes' });
    expect(toUser).toContainEqual(['user-1', RealtimeEvent.AgentFinished, { taskId: TASK, status: 'done', summary: 'Sorted 12 notes' }]);
    expect(raised.map((e) => e.kind)).toEqual(['waiting_approval', 'finished']);
  });

  it('refuses to approve a task that is not waiting, or while the host is offline', async () => {
    await create();
    await expect(service.update('user-1', TASK, { action: 'approve' })).rejects.toBeInstanceOf(ConflictException);

    tasks.rows.get(TASK)!.status = 'waiting_approval';
    await expect(service.update('user-1', TASK, { action: 'reject' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancels a running task and tells the host', async () => {
    hostOnline();
    await create();

    await service.update('user-1', TASK, { action: 'cancel' });

    expect(statusOf()).toBe('cancelled');
    expect(hostSocket.emit).toHaveBeenCalledWith(RealtimeEvent.AgentDecision, { taskId: TASK, decision: 'cancel' });
    expect(await service.hostFinished(HOST, { taskId: TASK, status: 'done', summary: 'late' })).toBe(false);
  });

  it('lets only the task’s own host report on it', async () => {
    hostOnline();
    await create();
    const otherHost = '33333333-3333-4333-8333-333333333333';

    expect(await service.hostRequestsApproval(otherHost, { taskId: TASK, tool: 'run_script' })).toBe(false);
    expect(await service.hostFinished(otherHost, { taskId: TASK, status: 'failed', summary: 'x' })).toBe(false);
    expect(statusOf()).toBe('running');
  });

  it('only edits a task that has not started, and never deletes an active one', async () => {
    await create();
    await expect(service.update('user-1', TASK, { title: 'Renamed' })).resolves.toMatchObject({ title: 'Renamed' });
    await expect(service.update('user-1', TASK, { action: 'cancel', title: 'x' })).rejects.toBeInstanceOf(BadRequestException);

    tasks.rows.get(TASK)!.status = 'running';
    await expect(service.update('user-1', TASK, { title: 'Again' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('user-1', TASK)).rejects.toBeInstanceOf(ConflictException);
  });

  it('marks active tasks failed when the host goes offline', async () => {
    hostOnline();
    await create();

    events.hostWentOffline({ deviceId: HOST, userId: 'user-1' });
    await new Promise((r) => setImmediate(r));

    expect(tasks.rows.get(TASK)).toMatchObject({ status: 'failed', resultSummary: 'The host went offline during the task' });
  });

  it("refuses another user's host, unsafe folders and too many open tasks", async () => {
    await expect(
      service.create('user-2', { hostDeviceId: HOST, title: 'x', instruction: 'y', workspaceFolder: 'D:\\Notes' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.create('user-1', { hostDeviceId: HOST, title: 'x', instruction: 'y', workspaceFolder: 'C:\\Windows\\System32' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    tasks.count.mockResolvedValueOnce(MAX_OPEN_TASKS_PER_HOST);
    await expect(create()).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns 404 for another user's task", async () => {
    await create();
    await expect(service.update('user-2', TASK, { action: 'cancel' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('agent task checks', () => {
  it.each(['D:\\Notes', 'C:\\Users\\Usaid\\Documents\\Study', 'E:\\Work\\'])('accepts the workspace folder %s', (folder) => {
    expect(workspaceFolderError(folder)).toBeNull();
  });

  it.each([
    'C:\\',
    'Notes',
    'D:\\Notes\\..\\..\\Windows',
    'C:\\Windows\\Temp',
    'C:\\Program Files\\App',
    'C:\\Users\\Usaid\\AppData\\Roaming',
    'D:\\Bad|Name',
  ])('refuses the workspace folder %s', (folder) => {
    expect(workspaceFolderError(folder)).not.toBeNull();
  });

  it('checks host payloads', () => {
    expect(parseApproval({ taskId: TASK, tool: 'write_note' })).toEqual({ taskId: TASK, tool: 'write_note' });
    expect(parseApproval({ taskId: TASK, tool: 'read_file' })).toBeNull();
    expect(parseFinished({ taskId: TASK, status: 'done', summary: 'ok', extra: 1 })).toEqual({ taskId: TASK, status: 'done', summary: 'ok' });
    expect(parseFinished({ taskId: 'nope', status: 'done' })).toBeNull();
  });
});
