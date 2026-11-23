import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../../auth/auth-user';

/** Rate limits per signed-in user, and per IP address for public routes. Runs after the auth guard. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as AuthenticatedRequest;
    return request.user?.id ?? request.ip ?? 'unknown';
  }
}
