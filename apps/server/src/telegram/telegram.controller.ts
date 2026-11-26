import { Body, Controller, Delete, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Audited } from '../audit/audited.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { LinkCodeView, TelegramService, WebhookReply } from './telegram.service';

/** F9 Telegram: link codes for the website, and the webhook Telegram calls. */
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Post('link-code')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Audited('telegram.link_code_created', 'telegram_link_code')
  createLinkCode(@CurrentUser() user: AuthUser): Promise<LinkCodeView> {
    return this.telegram.createLinkCode(user.id);
  }

  @Delete('link')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited('telegram.unlinked', 'profile')
  unlink(@CurrentUser() user: AuthUser): Promise<void> {
    return this.telegram.unlink(user.id);
  }

  /**
   * Telegram calls this for every message to the bot. No login: it is checked with the secret
   * header set by setWebhook instead. The reply goes back in the response body.
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: unknown,
  ): Promise<WebhookReply | Record<string, never>> {
    this.telegram.checkSecret(secret);
    return (await this.telegram.handleUpdate(update)) ?? {};
  }
}
