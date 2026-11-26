import type { SessionReadyPayload } from '@ownstream/shared';

export interface IceSettings {
  STUN_URLS?: string;
  TURN_URL?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
}

/** STUN and TURN details sent with session:ready (used only by the bonus WebRTC stream). */
export function iceServersFrom(settings: IceSettings): SessionReadyPayload['iceServers'] {
  const servers: SessionReadyPayload['iceServers'] = [];
  const stun = (settings.STUN_URLS ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  if (stun.length > 0) servers.push({ urls: stun });
  if (settings.TURN_URL && settings.TURN_USERNAME && settings.TURN_CREDENTIAL) {
    servers.push({ urls: settings.TURN_URL, username: settings.TURN_USERNAME, credential: settings.TURN_CREDENTIAL });
  }
  return servers;
}
