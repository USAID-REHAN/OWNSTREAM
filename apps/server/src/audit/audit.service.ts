import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../database/entities';

/** Writes security-relevant actions (pairing, sessions, rule changes, account deletion) to audit_log. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectRepository(AuditLogEntity) private readonly auditLog: Repository<AuditLogEntity>) {}

  async log(
    userId: string | null,
    action: string,
    entity: string | null = null,
    entityId: string | null = null,
    ip: string | null = null,
  ): Promise<void> {
    try {
      await this.auditLog.insert({ userId, action, entity, entityId, ip });
    } catch (err) {
      // A failed audit write must not undo the action it describes.
      this.logger.warn(`Could not write audit entry "${action}": ${(err as Error).message}`);
    }
  }
}
