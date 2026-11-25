import { ALERT_EVENTS, AlertEvent } from '@ownstream/shared';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

/** Turn on a Telegram alert for one event, for example host_offline. */
export class CreateAlertRuleDto {
  @IsIn(ALERT_EVENTS)
  event: AlertEvent;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** PATCH only turns an alert on or off. */
export class UpdateAlertRuleDto {
  @IsBoolean()
  enabled: boolean;
}
