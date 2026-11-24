import { MAX_CHANNELS_PER_VIEWER, RelayService } from './relay.service';
import {
  MAX_CIPHERTEXT_LENGTH,
  parseE2eHello,
  parseHeartbeat,
  parseHostHello,
  parseModeSet,
  parseSealed,
} from './payloads';

const HOST = '11111111-1111-4111-8111-111111111111';
const CHANNEL = '22222222-2222-4222-8222-222222222222';

describe('RelayService', () => {
  let relay: RelayService;

  beforeEach(() => {
    relay = new RelayService();
  });

  it('routes each direction only from the right socket', () => {
    const channel = relay.open('user-1', HOST, 'host-socket', 'viewer-socket')!;

    expect(relay.route(channel.channelId, 'viewer-socket', 'toHost')?.to).toBe('host-socket');
    expect(relay.route(channel.channelId, 'host-socket', 'toViewer')?.to).toBe('viewer-socket');
    expect(relay.route(channel.channelId, 'host-socket', 'toHost')).toBeNull();
    expect(relay.route(channel.channelId, 'someone-else', 'toHost')).toBeNull();
    expect(relay.route(CHANNEL, 'viewer-socket', 'toHost')).toBeNull();
  });

  it('gives every channel a fresh random ID', () => {
    const a = relay.open('user-1', HOST, 'h', 'v')!;
    const b = relay.open('user-1', HOST, 'h', 'v')!;

    expect(a.channelId).not.toEqual(b.channelId);
  });

  it('drops channels when a socket closes or the host goes away', () => {
    relay.open('user-1', HOST, 'h', 'v1');
    relay.open('user-1', HOST, 'h', 'v2');
    relay.open('user-1', 'other-host', 'h2', 'v1');

    expect(relay.dropForSocket('v1')).toHaveLength(2);
    expect(relay.dropForHost(HOST)).toHaveLength(1);
    expect(relay.size).toBe(0);
  });

  it('limits the channels one browser tab can open', () => {
    for (let i = 0; i < MAX_CHANNELS_PER_VIEWER; i++) relay.open('user-1', HOST, 'h', 'v');

    expect(relay.open('user-1', HOST, 'h', 'v')).toBeNull();
  });
});

describe('realtime payload checks', () => {
  it('keeps only { channelId, iv, ct } from relayed messages', () => {
    expect(parseSealed({ channelId: CHANNEL, iv: 'AAAAAAAAAAAAAAAA', ct: 'Y3Q=', text: 'leak' })).toEqual({
      channelId: CHANNEL,
      iv: 'AAAAAAAAAAAAAAAA',
      ct: 'Y3Q=',
    });
  });

  it('refuses malformed or oversized relayed messages', () => {
    expect(parseSealed({ channelId: 'not-a-uuid', iv: 'AAAA', ct: 'Y3Q=' })).toBeNull();
    expect(parseSealed({ channelId: CHANNEL, iv: 'AAAA', ct: 'not base64!' })).toBeNull();
    expect(parseSealed({ channelId: CHANNEL, iv: 'AAAA', ct: 'A'.repeat(MAX_CIPHERTEXT_LENGTH + 4) })).toBeNull();
    expect(parseSealed('text')).toBeNull();
    expect(parseSealed(null)).toBeNull();
  });

  it('checks the key exchange payload', () => {
    expect(parseE2eHello({ hostId: HOST, publicKey: 'QUJD' })).toEqual({ hostId: HOST, publicKey: 'QUJD' });
    expect(parseE2eHello({ hostId: HOST, publicKey: 'A'.repeat(500) })).toBeNull();
  });

  it('defaults a host to AI mode and checks heartbeat numbers', () => {
    expect(parseHostHello({ token: 't' })).toEqual({ token: 't', mode: 'ai' });
    expect(parseHostHello({ token: 't', mode: 'gaming' })).toBeNull();
    expect(parseHeartbeat({ cpu: 5, ram: 30, mode: 'ai' })).toEqual({ cpu: 5, gpu: null, ram: 30, mode: 'ai' });
    expect(parseHeartbeat({ cpu: -1, ram: 30, mode: 'ai' })).toBeNull();
    expect(parseHeartbeat({ cpu: 5, gpu: 'hot', ram: 30, mode: 'ai' })).toBeNull();
    expect(parseModeSet({ hostId: HOST, mode: 'streaming' })).toEqual({ hostId: HOST, mode: 'streaming' });
  });
});
