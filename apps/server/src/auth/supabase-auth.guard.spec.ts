import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthCache } from './auth-cache.service';
import type { AuthenticatedRequest } from './auth-user';
import { SupabaseAuthGuard } from './supabase-auth.guard';

function httpContext(request: Partial<AuthenticatedRequest>, type: 'http' | 'ws' = 'http'): ExecutionContext {
  return {
    getType: () => type,
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function requestWith(authorization?: string): Partial<AuthenticatedRequest> {
  return { headers: authorization ? { authorization } : {} } as Partial<AuthenticatedRequest>;
}

describe('SupabaseAuthGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let getUser: jest.Mock;
  let guard: SupabaseAuthGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    getUser = jest.fn();
    const supabase = { admin: { auth: { getUser } } } as unknown as SupabaseService;
    guard = new SupabaseAuthGuard(reflector as unknown as Reflector, supabase, new AuthCache());
  });

  it('lets public routes through without a token', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(httpContext(requestWith()))).resolves.toBe(true);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('refuses a request without a bearer token', async () => {
    await expect(guard.canActivate(httpContext(requestWith()))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(httpContext(requestWith('Basic abc')))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(getUser).not.toHaveBeenCalled();
  });

  it('refuses a token that Supabase rejects', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } });

    await expect(guard.canActivate(httpContext(requestWith('Bearer bad')))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('puts the user on the request and reuses the cached answer', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@example.com' } }, error: null });
    const first = requestWith('Bearer good-token');
    const second = requestWith('Bearer good-token');

    await expect(guard.canActivate(httpContext(first))).resolves.toBe(true);
    await expect(guard.canActivate(httpContext(second))).resolves.toBe(true);

    expect(first.user).toEqual({ id: 'user-1', email: 'a@example.com' });
    expect(second.user).toEqual({ id: 'user-1', email: 'a@example.com' });
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('asks Supabase again once the cached answer is older than 60 seconds', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: null } }, error: null });
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await guard.canActivate(httpContext(requestWith('Bearer good-token')));
    now.mockReturnValue(1_000_000 + 60_001);
    await guard.canActivate(httpContext(requestWith('Bearer good-token')));

    expect(getUser).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('refuses non-HTTP contexts unless they are public', async () => {
    await expect(guard.canActivate(httpContext(requestWith('Bearer x'), 'ws'))).resolves.toBe(false);
  });
});
