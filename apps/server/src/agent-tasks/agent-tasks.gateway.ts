import { SkipThrottle } from '@nestjs/throttler';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { AgentApprovalPayload, AgentFinishedPayload, REALTIME_NAMESPACE, RealtimeAck, RealtimeEvent } from '@ownstream/shared';
import type { Socket } from 'socket.io';
import { Public } from '../auth/public.decorator';
import { ackFail, ackOk, hostIdentity } from '../realtime/socket-identity';
import { AgentTasksService } from './agent-tasks.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseApproval(body: unknown): AgentApprovalPayload | null {
  if (!isObj(body) || typeof body.taskId !== 'string' || !UUID.test(body.taskId)) return null;
  if (body.tool !== 'write_note' && body.tool !== 'run_script') return null;
  return { taskId: body.taskId, tool: body.tool };
}

export function parseFinished(body: unknown): AgentFinishedPayload | null {
  if (!isObj(body) || typeof body.taskId !== 'string' || !UUID.test(body.taskId)) return null;
  if (body.status !== 'done' && body.status !== 'failed') return null;
  const summary = typeof body.summary === 'string' ? body.summary : '';
  return { taskId: body.taskId, status: body.status, summary };
}

/**
 * Host events about agent tasks (SCRUM-46), on the same /realtime namespace as the main gateway.
 * Only the host the task belongs to can change it; the step logs themselves travel encrypted
 * through the relay as agent:step and never come here.
 */
@Public()
@SkipThrottle()
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class AgentTasksGateway {
  constructor(private readonly tasks: AgentTasksService) {}

  @SubscribeMessage(RealtimeEvent.AgentApproval)
  async approval(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<RealtimeAck> {
    const host = hostIdentity(client);
    if (!host) return ackFail('Only a signed-in host can send agent:approval');
    const payload = parseApproval(body);
    if (!payload) return ackFail('Invalid agent:approval payload');
    return (await this.tasks.hostRequestsApproval(host.deviceId, payload)) ? ackOk() : ackFail('Unknown task or wrong status');
  }

  @SubscribeMessage(RealtimeEvent.AgentFinished)
  async finished(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<RealtimeAck> {
    const host = hostIdentity(client);
    if (!host) return ackFail('Only a signed-in host can send agent:finished');
    const payload = parseFinished(body);
    if (!payload) return ackFail('Invalid agent:finished payload');
    return (await this.tasks.hostFinished(host.deviceId, payload)) ? ackOk() : ackFail('Unknown task or wrong status');
  }
}
