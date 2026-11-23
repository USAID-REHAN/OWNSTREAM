import { AccessRuleEntity } from './access-rule.entity';
import { AgentTaskEntity } from './agent-task.entity';
import { AlertRuleEntity } from './alert-rule.entity';
import { AuditLogEntity } from './audit-log.entity';
import { ConversationEntity } from './conversation.entity';
import { DeviceEntity } from './device.entity';
import { GameEntity } from './game.entity';
import { PairingCodeEntity } from './pairing-code.entity';
import { PersonaEntity } from './persona.entity';
import { StreamProfileEntity } from './stream-profile.entity';
import { StreamSessionEntity } from './stream-session.entity';
import { TelegramLinkCodeEntity } from './telegram-link-code.entity';

export {
  AccessRuleEntity,
  AgentTaskEntity,
  AlertRuleEntity,
  AuditLogEntity,
  ConversationEntity,
  DeviceEntity,
  GameEntity,
  PairingCodeEntity,
  PersonaEntity,
  StreamProfileEntity,
  StreamSessionEntity,
  TelegramLinkCodeEntity,
};

/** Every table in db/neon_schema.sql. */
export const ALL_ENTITIES = [
  DeviceEntity,
  PairingCodeEntity,
  StreamProfileEntity,
  GameEntity,
  StreamSessionEntity,
  PersonaEntity,
  ConversationEntity,
  AgentTaskEntity,
  AlertRuleEntity,
  AccessRuleEntity,
  TelegramLinkCodeEntity,
  AuditLogEntity,
];
