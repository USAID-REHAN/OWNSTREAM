import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { DeviceEntity } from '../database/entities';
import { DeviceAuthService } from './device-auth.service';

export type DeviceRequest = Request & { device?: DeviceEntity };

/** Reads "Authorization: Device <token>". */
export function deviceTokenFrom(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'device' && token ? token : null;
}

/**
 * Guard for routes the host app calls with its device token. Use together with @Public(),
 * because these requests carry no Supabase login.
 */
@Injectable()
export class DeviceGuard implements CanActivate {
  constructor(private readonly deviceAuth: DeviceAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceRequest>();
    const token = deviceTokenFrom(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing device token');
    }

    const device = await this.deviceAuth.authenticate(token);
    if (!device) {
      throw new UnauthorizedException('Unknown or unpaired device');
    }

    request.device = device;
    return true;
  }
}
