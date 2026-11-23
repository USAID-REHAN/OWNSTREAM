import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthCache } from './auth-cache.service';
import type { AuthenticatedRequest } from './auth-user';
import { IS_PUBLIC_KEY } from './public.decorator';

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * Global guard: every HTTP route needs a valid Supabase access token unless it is marked @Public().
 * Non-HTTP contexts (the realtime gateway) are refused here unless public; sockets authenticate
 * when they connect.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
    private readonly cache: AuthCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    if (context.getType() !== 'http') return false;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const cached = this.cache.get(token);
    if (cached) {
      request.user = cached;
      return true;
    }

    const { data, error } = await this.supabase.admin.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = { id: data.user.id, email: data.user.email ?? null };
    this.cache.set(token, user);
    request.user = user;
    return true;
  }
}
