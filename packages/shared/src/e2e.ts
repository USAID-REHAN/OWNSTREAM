// End-to-end encryption for AI chat and agent logs (Implementation Plan v3, section 12.2).
// Runs unchanged in the browser and in Node 22+, which both provide globalThis.crypto.subtle.
import type { SealedMessage } from './realtime';

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf: ArrayBuffer) => {
  let s = '';
  for (const x of new Uint8Array(buf)) s += String.fromCharCode(x);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function newKeyPair() {
  const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const publicKey = b64(await subtle.exportKey('raw', kp.publicKey));
  return { kp, publicKey };
}

export async function deriveKey(kp: CryptoKeyPair, peerPublicKey: string, channelId: string) {
  const peer = await subtle.importKey('raw', unb64(peerPublicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await subtle.deriveBits({ name: 'ECDH', public: peer }, kp.privateKey, 256);
  const hkdf = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(channelId), info: enc.encode('ownstream-chat-v1') },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(key: CryptoKey, data: unknown): Promise<SealedMessage> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
  return { iv: b64(iv.buffer), ct: b64(ct) };
}

export async function open<T>(key: CryptoKey, msg: SealedMessage): Promise<T> {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(msg.iv) }, key, unb64(msg.ct));
  return JSON.parse(dec.decode(pt)) as T;
}

/**
 * Six-digit code both sides can show so the user can compare them.
 * It is derived from the two public keys and does not depend on their order.
 */
export async function safetyCode(publicKeyA: string, publicKeyB: string): Promise<string> {
  const [first, second] = [publicKeyA, publicKeyB].sort();
  const digest = new Uint8Array(await subtle.digest('SHA-256', enc.encode(`${first}|${second}`)));
  const value = ((digest[0] << 16) | (digest[1] << 8) | digest[2]) % 1_000_000;
  return value.toString().padStart(6, '0');
}
