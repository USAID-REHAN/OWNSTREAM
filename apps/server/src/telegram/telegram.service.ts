import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation } from '../common/db-errors';
import { EnvironmentVariables } from '../config/env.validation';
import { DeviceEntity, TelegramLinkCodeEntity } from '../database/entities';
import { HostRegistry } from '../realtime/host-registry.service';
import { SessionsService } from '../sessions/sessions.service';
import { SupabaseService } from '../supabase/supabase.service';
import { TelegramApi } from './telegram-api.service';

/** A link code works once, for 10 minutes (Implementation Plan section 13.2). */
export const LINK_CODE_TTL_MS = 10 * 60_000;
/** Wrong codes a chat may send before it has to wait, so codes cannot be guessed. */
export const MAX_WRONG_CODES = 5;
export const WRONG_CODE_WINDOW_MS = 10 * 60_000;

export interface LinkCodeView {
  code: string;
  expiresAt: Date;
  /** Opens the bot with the code filled in, when the bot's name is known. */
  link: string | null;
}

/** A reply sent back in the webhook response, so no second call to Telegram is needed. */
export interface WebhookReply {
  method: 'sendMessage';
  chat_id: number;
  text: string;
}

interface TelegramUpdate {
  message?: { text?: unknown; chat?: { id?: unknown; type?: unknown } };
}

export const HELP_TEXT = [
  'Ownstream bot commands:',
  '/start CODE - link this chat to your account (get the code on the website)',
  '/status - is your PC online, which mode, any session running',
  '/stop - end the running session',
  '/help - this list',
].join('\n');

const NOT_LINKED = 'This chat is not linked yet. On the Ownstream website, get a link code and send /start CODE here.';

/** Reads "/start 123456" or "/start@OwnstreamBot 123456" as { command: "start", arg: "123456" }. */
export function parseCommand(text: string): { command: string; arg: string } | null {
  const match = /^\/([a-z]+)(?:@\w+)?(?:\s+(.*))?$/i.exec(text.trim());
  return match ? { command: match[1].toLowerCase(), arg: (match[2] ?? '').trim() } : null;
}

/** Compares the webhook secret in constant time (hashing first hides the length). */
export function secretMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

const minutesAgo = (date: Date | null, now = Date.now()) => {
  if (!date) return 'never seen';
  const minutes = Math.round((now - date.getTime()) / 60_000);
  return minutes < 1 ? 'seen just now' : `last seen ${minutes} min ago`;
};

/**
 * F9 Telegram linking and bot commands (SCRUM-54). The chat ID is saved in the user's Supabase
 * profile; only a linked chat gets answers about an account.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger('Telegram');
  private readonly webhookSecret: string | undefined;
  private readonly wrongCodes = new Map<number, number[]>();

  constructor(
    @InjectRepository(TelegramLinkCodeEntity) private readonly codes: Repository<TelegramLinkCodeEntity>,
    @InjectRepository(DeviceEntity) private readonly devices: Repository<DeviceEntity>,
    private readonly supabase: SupabaseService,
    private readonly api: TelegramApi,
    private readonly hosts: HostRegistry,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.webhookSecret = config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true }) || undefined;
  }

  // ---- Website ------------------------------------------------------------------------------------

  /** POST /api/telegram/link-code. A new code replaces any unused one. */
  async createLinkCode(userId: string): Promise<LinkCodeView> {
    if (!this.api.enabled) throw new ServiceUnavailableException('Telegram is not set up on this server');
    await this.codes.delete({ userId, usedAt: IsNull() });

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
      try {
        await this.codes.insert({ userId, code, expiresAt });
        const bot = await this.api.botUsername();
        return { code, expiresAt, link: bot ? `https://t.me/${bot}?start=${code}` : null };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new ServiceUnavailableException('Could not make a code, please try again');
  }

  /** DELETE /api/telegram/link: stop sending alerts to the linked chat. */
  async unlink(userId: string): Promise<void> {
    const { error } = await this.supabase.admin.from('profiles').update({ telegram_chat_id: null }).eq('id', userId);
    if (error) this.profileFailed(error.message);
  }

  /** The chat that gets a user's alerts, or null. */
  async chatIdFor(userId: string): Promise<number | null> {
    const { data, error } = await this.supabase.admin.from('profiles').select('telegram_chat_id').eq('id', userId).maybeSingle();
    if (error) this.profileFailed(error.message);
    const chatId = (data as { telegram_chat_id: number | string | null } | null)?.telegram_chat_id;
    return chatId === null || chatId === undefined ? null : Number(chatId);
  }

  // ---- Webhook ------------------------------------------------------------------------------------

  /** Refuses any update without the secret header set with setWebhook (security checklist item 15). */
  checkSecret(header: string | undefined): void {
    if (!this.webhookSecret) throw new ServiceUnavailableException('Telegram webhook is not set up');
    if (!secretMatches(header, this.webhookSecret)) {
      this.logger.warn('Telegram webhook call with a wrong or missing secret was refused');
      throw new UnauthorizedException('Wrong webhook secret');
    }
  }

  /** Handles one update. Returns the reply, or null when there is nothing to answer. */
  async handleUpdate(update: unknown, now = Date.now()): Promise<WebhookReply | null> {
    const message = (update as TelegramUpdate | null)?.message;
    const chatId = message?.chat?.id;
    // Only private chats with a text message; group chats are ignored.
    if (typeof chatId !== 'number' || message?.chat?.type !== 'private' || typeof message.text !== 'string') return null;

    const command = parseCommand(message.text);
    const reply = (text: string): WebhookReply => ({ method: 'sendMessage', chat_id: chatId, text });
    if (!command) return reply('Send /help to see what I can do.');
    if (command.command === 'start') return reply(await this.link(chatId, command.arg, now));
    if (command.command === 'help') return reply(HELP_TEXT);

    const userId = await this.userForChat(chatId);
    if (!userId) return reply(NOT_LINKED);
    if (command.command === 'status') return reply(await this.status(userId, now));
    if (command.command === 'stop') {
      if (command.arg.toLowerCase() !== 'confirm') return reply('Send /stop confirm to end the running session.');
      const ended = await this.sessions.endAllFor(userId);
      return reply(ended > 0 ? 'The session was ended.' : 'No session is running.');
    }
    return reply('Unknown command. Send /help.');
  }

  /** /start CODE: the code says which account; the chat is saved in that profile. */
  private async link(chatId: number, code: string, now: number): Promise<string> {
    if (!/^\d{6}$/.test(code)) {
      return (await this.userForChat(chatId))
        ? 'This chat is already linked. Send /help to see the commands.'
        : 'Send /start with the 6 digit code from the Ownstream website.';
    }
    if (this.tooManyWrongCodes(chatId, now)) return 'Too many wrong codes. Wait 10 minutes and try again.';

    // Marks the code used only if it is still unused and not expired, so it works once.
    const result = await this.codes
      .createQueryBuilder()
      .update()
      .set({ usedAt: () => 'now()' })
      .where('code = :code AND used_at IS NULL AND expires_at > :now', { code, now: new Date(now) })
      .returning('user_id')
      .execute();
    const userId = (result.raw as Array<{ user_id: string }>)[0]?.user_id;
    if (!userId) {
      this.noteWrongCode(chatId, now);
      return 'That code is wrong or has expired. Get a new one on the Ownstream website.';
    }

    // One chat belongs to one account: unlink it from any other profile first.
    const profiles = this.supabase.admin.from('profiles');
    const cleared = await profiles.update({ telegram_chat_id: null }).eq('telegram_chat_id', chatId).neq('id', userId);
    if (cleared.error) this.profileFailed(cleared.error.message);
    const saved = await this.supabase.admin.from('profiles').update({ telegram_chat_id: chatId }).eq('id', userId);
    if (saved.error) this.profileFailed(saved.error.message);

    this.wrongCodes.delete(chatId);
    await this.audit.log(userId, 'telegram.linked', 'profile', userId, null);
    return 'Linked. Ownstream alerts will come to this chat. Choose which alerts you want on the website.';
  }

  private async status(userId: string, now: number): Promise<string> {
    const pcs = await this.devices.find({ where: { userId, role: 'host' }, order: { createdAt: 'ASC' } });
    if (pcs.length === 0) return 'No PC is paired yet.';
    const lines = pcs.map((pc) => {
      const live = this.hosts.get(pc.id);
      return live ? `${pc.name}: online, ${live.mode === 'ai' ? 'AI' : 'streaming'} mode` : `${pc.name}: offline, ${minutesAgo(pc.lastSeenAt, now)}`;
    });
    const open = await this.sessions.openFor(userId);
    for (const s of open) {
      const name = pcs.find((pc) => pc.id === s.hostDeviceId)?.name ?? 'your PC';
      const what = s.gameTitle ?? 'desktop';
      lines.push(s.status === 'active' ? `Session running on ${name}: ${what}` : `Session waiting for ${name} to answer: ${what}`);
    }
    if (open.length === 0) lines.push('No session is running.');
    return lines.join('\n');
  }

  private async userForChat(chatId: number): Promise<string | null> {
    const { data, error } = await this.supabase.admin.from('profiles').select('id').eq('telegram_chat_id', chatId).maybeSingle();
    if (error) this.profileFailed(error.message);
    return (data as { id: string } | null)?.id ?? null;
  }

  private tooManyWrongCodes(chatId: number, now: number): boolean {
    const recent = (this.wrongCodes.get(chatId) ?? []).filter((t) => now - t < WRONG_CODE_WINDOW_MS);
    this.wrongCodes.set(chatId, recent);
    return recent.length >= MAX_WRONG_CODES;
  }

  private noteWrongCode(chatId: number, now: number): void {
    // Forget chats whose wrong codes are all old, so the map cannot grow without end.
    if (this.wrongCodes.size > 10_000) {
      for (const [id, times] of this.wrongCodes) if (times.every((t) => now - t >= WRONG_CODE_WINDOW_MS)) this.wrongCodes.delete(id);
    }
    this.wrongCodes.set(chatId, [...(this.wrongCodes.get(chatId) ?? []), now]);
  }

  private profileFailed(reason: string): never {
    this.logger.error(`Supabase profile request failed: ${reason}`);
    throw new ServiceUnavailableException('Profile service is unavailable');
  }
}
