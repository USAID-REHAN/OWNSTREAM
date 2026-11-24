import {
  APP_MODES,
  AppMode,
  E2eHelloPayload,
  E2eWelcomePayload,
  HostHeartbeatPayload,
  HostHelloPayload,
  ModeSetPayload,
  RelayedPayload,
} from '@ownstream/shared';

/**
 * Hand-written checks for socket payloads. Each returns a clean copy with only the expected
 * fields, or null. Nothing here logs the payload.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export const MAX_TOKEN_LENGTH = 4096;
/** A raw P-256 public key is 65 bytes, 88 characters in base64. */
export const MAX_PUBLIC_KEY_LENGTH = 200;
/** A 12 byte IV is 16 characters in base64. */
export const MAX_IV_LENGTH = 32;
export const MAX_CIPHERTEXT_LENGTH = 256 * 1024;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isBase64 = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max && BASE64.test(v);
const isMode = (v: unknown): v is AppMode => typeof v === 'string' && (APP_MODES as readonly string[]).includes(v);
const isPercent = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

export function parseToken(body: unknown): string | null {
  if (!isObj(body)) return null;
  const { token } = body;
  return typeof token === 'string' && token.length > 0 && token.length <= MAX_TOKEN_LENGTH ? token : null;
}

export function parseHostHello(body: unknown): HostHelloPayload | null {
  const token = parseToken(body);
  if (!token || !isObj(body)) return null;
  const mode = body.mode === undefined ? 'ai' : body.mode;
  return isMode(mode) ? { token, mode } : null;
}

export function parseHeartbeat(body: unknown): HostHeartbeatPayload | null {
  if (!isObj(body)) return null;
  const { cpu, gpu, ram, mode } = body;
  if (!isPercent(cpu) || !isPercent(ram) || !isMode(mode)) return null;
  if (gpu !== null && gpu !== undefined && !isPercent(gpu)) return null;
  return { cpu, gpu: gpu ?? null, ram, mode };
}

export function parseModeSet(body: unknown): ModeSetPayload | null {
  if (!isObj(body) || !isUuid(body.hostId) || !isMode(body.mode)) return null;
  return { hostId: body.hostId, mode: body.mode };
}

export function parseMode(body: unknown): AppMode | null {
  return isObj(body) && isMode(body.mode) ? body.mode : null;
}

export function parseE2eHello(body: unknown): E2eHelloPayload | null {
  if (!isObj(body) || !isUuid(body.hostId) || !isBase64(body.publicKey, MAX_PUBLIC_KEY_LENGTH)) return null;
  return { hostId: body.hostId, publicKey: body.publicKey };
}

export function parseE2eWelcome(body: unknown): E2eWelcomePayload | null {
  if (!isObj(body) || !isUuid(body.channelId) || !isBase64(body.publicKey, MAX_PUBLIC_KEY_LENGTH)) return null;
  return { channelId: body.channelId, publicKey: body.publicKey };
}

/** { channelId, iv, ct }: an encrypted message the server forwards without reading. */
export function parseSealed(body: unknown): RelayedPayload | null {
  if (!isObj(body) || !isUuid(body.channelId)) return null;
  if (!isBase64(body.iv, MAX_IV_LENGTH) || !isBase64(body.ct, MAX_CIPHERTEXT_LENGTH)) return null;
  return { channelId: body.channelId, iv: body.iv, ct: body.ct };
}
