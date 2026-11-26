import type { AgentTool, AppMode, LaunchType, StreamEngine } from './enums';

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

export interface HostHelloPayload {
  /** The device token the host received when it was paired. */
  token: string;
  mode: AppMode;
}

export interface ViewerHelloPayload {
  /** The browser's Supabase access token. */
  token: string;
}

export interface ModeSetPayload {
  hostId: string;
  mode: AppMode;
}

export interface ChatPurgePayload {
  conversationId: string;
}

/** Every realtime acknowledgement has this shape. */
export type RealtimeAck<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Server to host: start an agent task (Implementation Plan section 12.4). */
export interface AgentRunPayload {
  taskId: string;
  title: string;
  instruction: string;
  tools: AgentTool[];
  workspaceFolder: string;
  maxSteps: number;
  timeLimitSeconds: number;
}

/** Host to server: a write_note or run_script step waits for the user's approval. */
export interface AgentApprovalPayload {
  taskId: string;
  tool: 'write_note' | 'run_script';
}

/** Server to host: the user's answer, or a cancel. */
export interface AgentDecisionPayload {
  taskId: string;
  decision: 'approve' | 'reject' | 'cancel';
}

/** Host to server: final status and a short summary, saved in Neon. */
export interface AgentFinishedPayload {
  taskId: string;
  status: 'done' | 'failed';
  summary: string;
}

/** Server to host: a viewer wants a session (Implementation Plan sections 9.2 and 10.7). */
export interface SessionRequestPayload {
  sessionId: string;
  engine: StreamEngine;
  /** The game to start, or null to share the desktop. The host only starts games saved in the user's library. */
  game: { id: string; title: string; launch: LaunchType; launchTarget: string } | null;
  profile: { width: number; height: number; frameRate: number; bitrateKbps: number } | null;
  /** An access rule asks the host to confirm the session on screen first. */
  needsApproval: boolean;
  /** End the session after this many idle minutes, if an access rule says so. */
  idleTimeoutMinutes: number | null;
}

/** Host to server: the host accepted the session (and launched the game). */
export interface SessionApprovePayload {
  sessionId: string;
}

/** Host to server: the host (or the person at it) refused the session. */
export interface SessionRejectPayload {
  sessionId: string;
  reason?: string;
}

/** Either side: the session closed. The host adds its averages when it has them. */
export interface SessionEndPayload {
  sessionId: string;
  avgFps?: number;
  avgLatencyMs?: number;
}

/** Server to browser: the session is active; ICE servers for the bonus WebRTC stream. */
export interface SessionReadyPayload {
  sessionId: string;
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
}
