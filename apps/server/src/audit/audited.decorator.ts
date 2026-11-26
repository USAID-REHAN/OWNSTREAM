import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'ownstream:audit';

export interface AuditMeta {
  /** For example "access_rule.created". */
  action: string;
  /** The table the action is about, for example "access_rule". */
  entity: string;
}

/**
 * Marks a route whose successful calls go to audit_log (SCRUM-55). The entry holds the user, the
 * action, the record ID (from the reply, or the :id in the path) and the IP address. Nothing from
 * the request body is stored.
 */
export const Audited = (action: string, entity: string) => SetMetadata(AUDIT_KEY, { action, entity } satisfies AuditMeta);
