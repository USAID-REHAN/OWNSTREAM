import type { RealtimeAck } from '@ownstream/shared';
import type { Socket } from 'socket.io';

/** Who a socket is, set by host:hello or viewer:hello. */
export type SocketIdentity = { kind: 'host'; deviceId: string; userId: string } | { kind: 'viewer'; userId: string };

export interface SocketData {
  identity?: SocketIdentity;
  helloAttempts?: number;
}

export const socketData = (client: Socket) => client.data as SocketData;

export function hostIdentity(client: Socket): { deviceId: string; userId: string } | null {
  const identity = socketData(client).identity;
  return identity?.kind === 'host' ? identity : null;
}

export function viewerIdentity(client: Socket): { userId: string } | null {
  const identity = socketData(client).identity;
  return identity?.kind === 'viewer' ? identity : null;
}

export const ackOk = <T extends object>(data: T = {} as T): RealtimeAck<T> => ({ ok: true, ...data });
export const ackFail = (error: string): RealtimeAck => ({ ok: false, error });
