import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { DeviceEntity } from '../database/entities';
import type { DeviceRequest } from './device.guard';

/** The paired host that DeviceGuard put on the request. */
export const CurrentDevice = createParamDecorator((_data: unknown, ctx: ExecutionContext): DeviceEntity => {
  const request = ctx.switchToHttp().getRequest<DeviceRequest>();
  if (!request.device) {
    throw new UnauthorizedException();
  }
  return request.device;
});
