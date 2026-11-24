import { Injectable } from '@nestjs/common';
import type { AppMode } from '@ownstream/shared';
import type { Namespace, Socket } from 'socket.io';

export interface HostConnection {
  deviceId: string;
  userId: string;
  socket: Socket;
  mode: AppMode;
}

/** Every browser socket of a user joins this room, so presence events reach all their tabs. */
export const userRoom = (userId: string) => `user:${userId}`;

/** In-memory list of the hosts connected to this server, one socket per host. */
@Injectable()
export class HostRegistry {
  private readonly hosts = new Map<string, HostConnection>();
  private server: Namespace | null = null;

  attach(server: Namespace): void {
    this.server = server;
  }

  /** Registers a host socket. Returns the connection it replaced, if the host was already connected. */
  register(connection: HostConnection): HostConnection | undefined {
    const previous = this.hosts.get(connection.deviceId);
    this.hosts.set(connection.deviceId, connection);
    return previous;
  }

  get(deviceId: string): HostConnection | undefined {
    return this.hosts.get(deviceId);
  }

  /** Removes the host only if socketId is still its current socket, so a replaced socket cannot remove the new one. */
  unregister(deviceId: string, socketId: string): HostConnection | undefined {
    const current = this.hosts.get(deviceId);
    if (!current || current.socket.id !== socketId) return undefined;
    this.hosts.delete(deviceId);
    return current;
  }

  setMode(deviceId: string, mode: AppMode): void {
    const current = this.hosts.get(deviceId);
    if (current) current.mode = mode;
  }

  onlineFor(userId: string): HostConnection[] {
    return [...this.hosts.values()].filter((h) => h.userId === userId);
  }

  emitToHost(deviceId: string, event: string, payload: unknown): boolean {
    const host = this.hosts.get(deviceId);
    if (!host) return false;
    host.socket.emit(event, payload);
    return true;
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  emitToSocket(socketId: string, event: string, payload: unknown): boolean {
    const socket = this.server?.sockets.get(socketId);
    if (!socket) return false;
    socket.emit(event, payload);
    return true;
  }
}
