import { Injectable } from '@nestjs/common';
import { RealtimeEvent } from '@ownstream/shared';
import { randomUUID } from 'node:crypto';

/** One encrypted chat channel between one browser tab and one host. */
export interface RelayChannel {
  channelId: string;
  userId: string;
  hostId: string;
  hostSocketId: string;
  viewerSocketId: string;
}

export type RelayDirection = 'toHost' | 'toViewer';

/** Which way each relayed event may travel. Anything else is refused. */
export const RELAY_DIRECTIONS: Readonly<Record<string, RelayDirection>> = {
  [RealtimeEvent.ChatMsg]: 'toHost',
  [RealtimeEvent.AgentLogFetch]: 'toHost',
  [RealtimeEvent.ChatChunk]: 'toViewer',
  [RealtimeEvent.ChatDone]: 'toViewer',
  [RealtimeEvent.ChatError]: 'toViewer',
  [RealtimeEvent.AgentStep]: 'toViewer',
};

export const MAX_CHANNELS_PER_VIEWER = 10;

/**
 * Relay rule (Implementation Plan section 9.2): keeps channel ID -> user, host socket and browser
 * socket, and forwards encrypted payloads only between those two sockets. It never sees keys or text.
 */
@Injectable()
export class RelayService {
  private readonly channels = new Map<string, RelayChannel>();

  /** Returns null when the browser tab already has too many open channels. */
  open(userId: string, hostId: string, hostSocketId: string, viewerSocketId: string): RelayChannel | null {
    const openForViewer = [...this.channels.values()].filter((c) => c.viewerSocketId === viewerSocketId).length;
    if (openForViewer >= MAX_CHANNELS_PER_VIEWER) return null;

    const channel = { channelId: randomUUID(), userId, hostId, hostSocketId, viewerSocketId };
    this.channels.set(channel.channelId, channel);
    return channel;
  }

  /**
   * The channel, if senderSocketId is the side allowed to send in this direction.
   * Returns the socket ID to forward to, or null for an unknown channel or the wrong sender.
   */
  route(channelId: string, senderSocketId: string, direction: RelayDirection): { channel: RelayChannel; to: string } | null {
    const channel = this.channels.get(channelId);
    if (!channel) return null;
    if (direction === 'toHost' && channel.viewerSocketId === senderSocketId) {
      return { channel, to: channel.hostSocketId };
    }
    if (direction === 'toViewer' && channel.hostSocketId === senderSocketId) {
      return { channel, to: channel.viewerSocketId };
    }
    return null;
  }

  /** Drops every channel that uses this socket (either side disconnected). */
  dropForSocket(socketId: string): RelayChannel[] {
    return this.dropWhere((c) => c.hostSocketId === socketId || c.viewerSocketId === socketId);
  }

  /** Drops every channel of a host (it went offline, left AI mode or was unpaired). */
  dropForHost(hostId: string): RelayChannel[] {
    return this.dropWhere((c) => c.hostId === hostId);
  }

  get size(): number {
    return this.channels.size;
  }

  private dropWhere(match: (c: RelayChannel) => boolean): RelayChannel[] {
    const dropped: RelayChannel[] = [];
    for (const [id, channel] of this.channels) {
      if (match(channel)) {
        this.channels.delete(id);
        dropped.push(channel);
      }
    }
    return dropped;
  }
}
