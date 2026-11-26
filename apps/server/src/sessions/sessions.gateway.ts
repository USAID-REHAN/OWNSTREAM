import { SkipThrottle } from '@nestjs/throttler';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import {
  REALTIME_NAMESPACE,
  RealtimeAck,
  RealtimeEvent,
  SessionApprovePayload,
  SessionEndPayload,
  SessionRejectPayload,
} from '@ownstream/shared';
import type { Socket } from 'socket.io';
import { AuditService } from '../audit/audit.service';
import { Public } from '../auth/public.decorator';
import { ackFail, ackOk, hostIdentity, viewerIdentity } from '../realtime/socket-identity';
import { SessionsService } from './sessions.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const inRange = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export function parseSessionId(body: unknown): SessionApprovePayload | null {
  return isObj(body) && typeof body.sessionId === 'string' && UUID.test(body.sessionId) ? { sessionId: body.sessionId } : null;
}

export function parseReject(body: unknown): SessionRejectPayload | null {
  const id = parseSessionId(body);
  if (!id || !isObj(body)) return null;
  if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 200)) return null;
  return body.reason === undefined ? id : { ...id, reason: body.reason };
}

/** The host's averages are optional; values outside a sane range are refused. */
export function parseEnd(body: unknown): SessionEndPayload | null {
  const id = parseSessionId(body);
  if (!id || !isObj(body)) return null;
  const end: SessionEndPayload = { ...id };
  if (body.avgFps !== undefined) {
    if (!inRange(body.avgFps, 0, 999)) return null;
    end.avgFps = Math.round(body.avgFps * 10) / 10;
  }
  if (body.avgLatencyMs !== undefined) {
    if (!inRange(body.avgLatencyMs, 0, 60_000)) return null;
    end.avgLatencyMs = Math.round(body.avgLatencyMs);
  }
  return end;
}

/**
 * Session events on the /realtime namespace (SCRUM-51). Only the host a session was sent to can
 * approve, reject or end it; a browser can end only its own user's sessions. Anything else is
 * dropped and written to the audit log (Implementation Plan section 9.2).
 */
@Public()
@SkipThrottle()
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class SessionsGateway {
  constructor(
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  @SubscribeMessage(RealtimeEvent.SessionApprove)
  async approve(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<RealtimeAck> {
    const host = hostIdentity(client);
    if (!host) return ackFail('Only a signed-in host can send session:approve');
    const payload = parseSessionId(body);
    if (!payload) return ackFail('Invalid session:approve payload');
    if (await this.sessions.hostApproved(host.deviceId, payload)) return ackOk();
    return this.denied(host.userId, RealtimeEvent.SessionApprove, payload.sessionId);
  }

  @SubscribeMessage(RealtimeEvent.SessionReject)
  async reject(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<RealtimeAck> {
    const host = hostIdentity(client);
    if (!host) return ackFail('Only a signed-in host can send session:reject');
    const payload = parseReject(body);
    if (!payload) return ackFail('Invalid session:reject payload');
    if (await this.sessions.hostRejected(host.deviceId, payload)) return ackOk();
    return this.denied(host.userId, RealtimeEvent.SessionReject, payload.sessionId);
  }

  /** Either side can end a session. */
  @SubscribeMessage(RealtimeEvent.SessionEnd)
  async end(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<RealtimeAck> {
    const host = hostIdentity(client);
    const viewer = viewerIdentity(client);
    const userId = host?.userId ?? viewer?.userId;
    if (!userId) return ackFail('Say host:hello or viewer:hello first');
    const payload = parseEnd(body);
    if (!payload) return ackFail('Invalid session:end payload');

    const ended = host
      ? await this.sessions.hostEnded(host.deviceId, payload)
      : await this.sessions.viewerEnded(userId, payload.sessionId);
    if (ended) return ackOk();
    return this.denied(userId, RealtimeEvent.SessionEnd, payload.sessionId);
  }

  /** The session is unknown, someone else's, or already past that step. */
  private async denied(userId: string, event: string, sessionId: string): Promise<RealtimeAck> {
    await this.audit.log(userId, `realtime.denied:${event}`, 'stream_session', sessionId, null);
    return ackFail('Unknown session or wrong status');
  }
}
