import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { DeviceEntity } from '../database/entities';
import type { DeviceAuthService } from './device-auth.service';
import { DeviceGuard, DeviceRequest, deviceTokenFrom } from './device.guard';

function contextWith(request: Partial<DeviceRequest>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('DeviceGuard', () => {
  let authenticate: jest.Mock;
  let guard: DeviceGuard;

  beforeEach(() => {
    authenticate = jest.fn(async () => null);
    guard = new DeviceGuard({ authenticate } as unknown as DeviceAuthService);
  });

  it('reads only the "Device" authorization scheme', () => {
    expect(deviceTokenFrom('Device abc')).toBe('abc');
    expect(deviceTokenFrom('device abc')).toBe('abc');
    expect(deviceTokenFrom('Bearer abc')).toBeNull();
    expect(deviceTokenFrom('Device')).toBeNull();
    expect(deviceTokenFrom(undefined)).toBeNull();
  });

  it('refuses a request without a device token', async () => {
    await expect(guard.canActivate(contextWith({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('refuses an unknown or unpaired token', async () => {
    const request = { headers: { authorization: 'Device old-token' } };

    await expect(guard.canActivate(contextWith(request))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authenticate).toHaveBeenCalledWith('old-token');
  });

  it('puts the paired device on the request', async () => {
    const device = { id: 'd1', userId: 'user-1' } as DeviceEntity;
    authenticate.mockResolvedValue(device);
    const request: Partial<DeviceRequest> = { headers: { authorization: 'Device good-token' } };

    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    expect(request.device).toBe(device);
  });
});
