import type { AppMode } from './enums';

export const REALTIME_NAMESPACE = '/realtime';

/** Every Socket.IO event used on the /realtime namespace (Implementation Plan v3, section 9.2). */
export const RealtimeEvent = {
  HostHello: 'host:hello',
  HostHeartbeat: 'host:heartbeat',
  ViewerHello: 'viewer:hello',
  HostOffline: 'host:offline',
  HostOnline: 'host:online',
  ModeSet: 'mode:set',
  ModeChanged: 'mode:changed',

  E2eHello: 'e2e:hello',
  E2eWelcome: 'e2e:welcome',
  ChatMsg: 'chat:msg',
  ChatChunk: 'chat:chunk',
  ChatDone: 'chat:done',
  ChatError: 'chat:error',
  ChatPurge: 'chat:purge',

  AgentRun: 'agent:run',
  AgentStep: 'agent:step',
  AgentLogFetch: 'agent:log_fetch',
  AgentApproval: 'agent:approval',
  AgentDecision: 'agent:decision',
  AgentFinished: 'agent:finished',

  SessionRequest: 'session:request',
  SessionApprove: 'session:approve',
  SessionReject: 'session:reject',
  SessionEnd: 'session:end',
  SessionReady: 'session:ready',
  RtcOffer: 'rtc:offer',
  RtcAnswer: 'rtc:answer',
  RtcIce: 'rtc:ice',
} as const;

export type RealtimeEventName = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

/** Events whose payload the server forwards unchanged between a user's browser and host. Never logged or stored. */
export const RELAYED_EVENTS: readonly RealtimeEventName[] = [
  RealtimeEvent.E2eHello,
  RealtimeEvent.E2eWelcome,
  RealtimeEvent.ChatMsg,
  RealtimeEvent.ChatChunk,
  RealtimeEvent.ChatDone,
  RealtimeEvent.ChatError,
  RealtimeEvent.AgentStep,
  RealtimeEvent.AgentLogFetch,
];

export interface SealedMessage {
  iv: string;
  ct: string;
}

export interface E2eHelloPayload {
  hostId: string;
  publicKey: string;
}

export interface E2eWelcomePayload {
  channelId: string;
  publicKey: string;
}

export interface RelayedPayload extends SealedMessage {
  channelId: string;
}

export interface HostHeartbeatPayload {
  cpu: number;
  gpu: number | null;
  ram: number;
  mode: AppMode;
}
