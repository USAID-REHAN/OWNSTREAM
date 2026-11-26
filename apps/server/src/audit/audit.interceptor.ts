import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { concatMap, Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../auth/auth-user';
import { AUDIT_KEY, AuditMeta } from './audited.decorator';
import { AuditService } from './audit.service';

/** The record an audited call was about: the reply's id, or the :id in the path. */
export function auditedEntityId(reply: unknown, params: Record<string, unknown> | undefined): string | null {
  if (typeof reply === 'object' && reply !== null && typeof (reply as { id?: unknown }).id === 'string') {
    return (reply as { id: string }).id;
  }
  return typeof params?.id === 'string' ? params.id : null;
}

/**
 * Writes one audit_log row after each successful call to a route marked with @Audited.
 * Failed calls (4xx and 5xx) are not logged here; the services log the refusals that matter,
 * such as a session refused by an access rule.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta | undefined>(AUDIT_KEY, [context.getHandler(), context.getClass()]);
    if (!meta || context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return next.handle().pipe(
      concatMap(async (reply: unknown) => {
        // AuditService.log never throws, so a failed write cannot turn a success into an error.
        await this.audit.log(request.user?.id ?? null, meta.action, meta.entity, auditedEntityId(reply, request.params), request.ip ?? null);
        return reply;
      }),
    );
  }
}
