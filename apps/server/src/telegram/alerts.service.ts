import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AlertEvent } from '@ownstream/shared';
import type { Subscription } from 'rxjs';
import { Repository } from 'typeorm';
import { AgentTaskEvent, AgentTasksService } from '../agent-tasks/agent-tasks.service';
import { AlertRulesService } from '../alert-rules/alert-rules.service';
import { DeviceEntity } from '../database/entities';
import { DeviceEvents } from '../devices/device-events.service';
import { SessionEvent, SessionsService } from '../sessions/sessions.service';
import { TelegramApi } from './telegram-api.service';
import { TelegramService } from './telegram.service';

/** "1 h 5 min", "12 min" or "40 s". */
export function formatLength(seconds: number | null): string {
  if (seconds === null) return 'an unknown time';
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function sessionAlert(event: SessionEvent, pc: string): { alert: AlertEvent; text: string } {
  const what = event.gameTitle ? `: ${event.gameTitle}` : '';
  if (event.kind === 'started') return { alert: 'new_device_session', text: `A session started on ${pc}${what}.` };
  const how = event.status === 'failed' ? 'stopped unexpectedly' : 'ended';
  return { alert: 'stream_ended', text: `The stream on ${pc}${what} ${how} after ${formatLength(event.lengthSeconds)}.` };
}

export function taskAlert(event: AgentTaskEvent): { alert: AlertEvent; text: string } {
  if (event.kind === 'waiting_approval') {
    return { alert: 'ai_task_waiting_approval', text: `AI task "${event.title}" is waiting for your approval on the website.` };
  }
  const result = event.status === 'done' ? 'finished' : 'failed';
  return { alert: 'ai_task_finished', text: `AI task "${event.title}" ${result}.` };
}

/**
 * Sends Telegram alerts (Implementation Plan section 13.2): host offline and online, a new session,
 * stream ended, AI task finished or waiting for approval. An alert goes out only if the user turned
 * it on (alert rules) and linked a chat. A failed send is logged and never breaks the action.
 */
@Injectable()
export class AlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Alerts');
  private readonly subscriptions: Subscription[] = [];

  constructor(
    private readonly api: TelegramApi,
    private readonly telegram: TelegramService,
    private readonly rules: AlertRulesService,
    private readonly deviceEvents: DeviceEvents,
    private readonly sessions: SessionsService,
    private readonly tasks: AgentTasksService,
    @InjectRepository(DeviceEntity) private readonly devices: Repository<DeviceEntity>,
  ) {}

  onModuleInit(): void {
    this.subscriptions.push(
      this.deviceEvents.hostOffline$.subscribe(({ userId, deviceId }) =>
        this.background(this.withPcName(deviceId, (pc) => this.notify(userId, 'host_offline', `${pc} is offline. It stopped answering.`))),
      ),
      this.deviceEvents.hostOnline$.subscribe(({ userId, deviceId }) =>
        this.background(this.withPcName(deviceId, (pc) => this.notify(userId, 'host_online', `${pc} is back online.`))),
      ),
      this.sessions.events$.subscribe((event) =>
        this.background(
          this.withPcName(event.hostDeviceId, (pc) => {
            const { alert, text } = sessionAlert(event, pc);
            return this.notify(event.userId, alert, text);
          }),
        ),
      ),
      this.tasks.events$.subscribe((event) => {
        const { alert, text } = taskAlert(event);
        this.background(this.notify(event.userId, alert, text));
      }),
    );
  }

  onModuleDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe());
  }

  /** Sends the alert if it is turned on and a chat is linked. Returns whether it was sent. */
  async notify(userId: string, alert: AlertEvent, text: string): Promise<boolean> {
    if (!this.api.enabled) return false;
    if (!(await this.rules.isEnabled(userId, alert))) return false;
    const chatId = await this.telegram.chatIdFor(userId);
    if (chatId === null) return false;
    const sent = await this.api.sendMessage(chatId, text);
    if (sent) this.logger.log(`Alert ${alert} sent`);
    return sent;
  }

  private async withPcName(deviceId: string, send: (pc: string) => Promise<boolean>): Promise<boolean> {
    const device = await this.devices.findOneBy({ id: deviceId });
    return send(device?.name ?? 'Your PC');
  }

  private background(work: Promise<unknown>): void {
    work.catch((err: Error) => this.logger.warn(`Alert not sent: ${err.message}`));
  }
}
