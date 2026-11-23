import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from './auth-user';

/** The signed-in user that SupabaseAuthGuard put on the request. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.user) {
    throw new UnauthorizedException();
  }
  return request.user;
});
