import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuditInterceptor, auditedEntityId } from './audit.interceptor';
import { AuditService } from './audit.service';
import { AUDIT_KEY, Audited } from './audited.decorator';

class RulesController {
  @Audited('access_rule.deleted', 'access_rule')
  remove() {}

  list() {}
}

describe('AuditInterceptor', () => {
  let audit: { log: jest.Mock };
  let interceptor: AuditInterceptor;

  const context = (handler: () => void, params: Record<string, string> = {}, type = 'http') =>
    ({
      getType: () => type,
      getHandler: () => handler,
      getClass: () => RulesController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'user-1' }, params, ip: '203.0.113.5' }) }),
    }) as unknown as ExecutionContext;
  const handle = (reply: unknown): CallHandler => ({ handle: () => of(reply) });

  beforeEach(() => {
    audit = { log: jest.fn(async () => undefined) };
    interceptor = new AuditInterceptor(new Reflector(), audit as unknown as AuditService);
  });

  it('logs a successful call with the user, record ID and IP, and passes the reply through', async () => {
    const reply = await firstValueFrom(interceptor.intercept(context(RulesController.prototype.remove, { id: 'r1' }), handle(undefined)));

    expect(reply).toBeUndefined();
    expect(audit.log).toHaveBeenCalledWith('user-1', 'access_rule.deleted', 'access_rule', 'r1', '203.0.113.5');
  });

  it('takes the record ID from the reply when the route made a new record', () => {
    expect(auditedEntityId({ id: 'new-1', name: 'x' }, {})).toBe('new-1');
    expect(auditedEntityId(undefined, { id: 'r1' })).toBe('r1');
    expect(auditedEntityId([1, 2], {})).toBeNull();
  });

  it('does not log failed calls', async () => {
    const failing: CallHandler = { handle: () => throwError(() => new Error('404')) };
    await expect(firstValueFrom(interceptor.intercept(context(RulesController.prototype.remove), failing))).rejects.toThrow('404');
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('ignores routes without @Audited, and sockets', async () => {
    await firstValueFrom(interceptor.intercept(context(RulesController.prototype.list), handle([])));
    await firstValueFrom(interceptor.intercept(context(RulesController.prototype.remove, {}, 'ws'), handle(null)));
    expect(audit.log).not.toHaveBeenCalled();
    expect(Reflect.getMetadata(AUDIT_KEY, RulesController.prototype.remove)).toEqual({ action: 'access_rule.deleted', entity: 'access_rule' });
  });
});
