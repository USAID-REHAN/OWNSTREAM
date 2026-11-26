import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';

const API = 'https://api.telegram.org';
const TIMEOUT_MS = 5000;

/**
 * The few Telegram Bot API calls the server makes (sendMessage and getMe). The bot token is part of
 * the URL, so URLs and replies are never logged; only the method name and HTTP status are.
 */
@Injectable()
export class TelegramApi implements OnModuleInit {
  private readonly logger = new Logger('Telegram');
  private readonly token: string | undefined;
  private username: string | null = null;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.token = config.get('TELEGRAM_BOT_TOKEN', { infer: true }) || undefined;
  }

  onModuleInit(): void {
    if (!this.token) this.logger.warn('TELEGRAM_BOT_TOKEN is not set, so Telegram alerts are off');
  }

  get enabled(): boolean {
    return Boolean(this.token);
  }

  /** Sends a plain text message. Returns false (and logs the status) if Telegram refused it. */
  async sendMessage(chatId: number, text: string): Promise<boolean> {
    const result = await this.call<unknown>('sendMessage', { chat_id: chatId, text });
    return result !== null;
  }

  /** The bot's @username, for the t.me link shown next to the link code. Cached after the first call. */
  async botUsername(): Promise<string | null> {
    if (this.username) return this.username;
    const me = await this.call<{ username?: string }>('getMe', {});
    this.username = me?.username ?? null;
    return this.username;
  }

  private async call<T>(method: string, body: object): Promise<T | null> {
    if (!this.token) return null;
    try {
      const res = await fetch(`${API}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Telegram ${method} failed with status ${res.status}`);
        return null;
      }
      const json = (await res.json()) as { ok?: boolean; result?: T };
      return json.ok ? (json.result ?? null) : null;
    } catch (err) {
      this.logger.warn(`Telegram ${method} failed: ${(err as Error).name}`);
      return null;
    }
  }
}
