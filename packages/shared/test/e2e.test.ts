import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveKey, newKeyPair, open, safetyCode, seal } from '../src/e2e';

async function pairOfKeys(channelId = 'channel-1') {
  const browser = await newKeyPair();
  const host = await newKeyPair();
  const browserKey = await deriveKey(browser.kp, host.publicKey, channelId);
  const hostKey = await deriveKey(host.kp, browser.publicKey, channelId);
  return { browser, host, browserKey, hostKey };
}

describe('e2e', () => {
  it('round trips a message between the two sides', async () => {
    const { browserKey, hostKey } = await pairOfKeys();
    const message = { conversationId: 'c1', text: 'Explain WebRTC in one sentence.', creativity: 0.7 };

    const sealed = await seal(browserKey, message);

    assert.deepEqual(await open(hostKey, sealed), message);
  });

  it('uses a fresh IV for every message', async () => {
    const { browserKey } = await pairOfKeys();
    const a = await seal(browserKey, 'same text');
    const b = await seal(browserKey, 'same text');

    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.ct, b.ct);
  });

  it('cannot be opened with a key from another channel', async () => {
    const { browserKey } = await pairOfKeys('channel-1');
    const { hostKey: otherKey } = await pairOfKeys('channel-2');
    const sealed = await seal(browserKey, 'secret');

    await assert.rejects(open(otherKey, sealed));
  });

  it('rejects a tampered ciphertext', async () => {
    const { browserKey, hostKey } = await pairOfKeys();
    const sealed = await seal(browserKey, 'secret');
    const bytes = Buffer.from(sealed.ct, 'base64');
    bytes[0] ^= 0x01;

    await assert.rejects(open(hostKey, { iv: sealed.iv, ct: bytes.toString('base64') }));
  });

  it('gives both sides the same six-digit safety code', async () => {
    const { browser, host } = await pairOfKeys();
    const onBrowser = await safetyCode(browser.publicKey, host.publicKey);
    const onHost = await safetyCode(host.publicKey, browser.publicKey);

    assert.match(onBrowser, /^\d{6}$/);
    assert.equal(onBrowser, onHost);
  });
});
