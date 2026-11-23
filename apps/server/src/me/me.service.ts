import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthCache } from '../auth/auth-cache.service';
import type { AuthUser } from '../auth/auth-user';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { USER_DATA_DELETE_STEPS } from './user-data-deletion';

const PROFILE_COLUMNS = 'id, display_name, avatar_url, telegram_chat_id, created_at, updated_at';

interface ProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  telegram_chat_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface MeResponse {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  telegramLinked: boolean;
  createdAt: string;
  updatedAt: string;
}

function toMe(row: ProfileRow, email: string | null): MeResponse {
  return {
    id: row.id,
    email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    telegramLinked: row.telegram_chat_id !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Module F1: the signed-in user's own profile (Supabase) and account deletion (Neon and Supabase). */
@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly authCache: AuthCache,
  ) {}

  async getProfile(user: AuthUser): Promise<MeResponse> {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', user.id)
      .maybeSingle();
    if (error) this.profileServiceFailed(error.message);
    if (!data) throw new NotFoundException('Profile not found');
    return toMe(data as ProfileRow, user.email);
  }

  async updateProfile(user: AuthUser, dto: UpdateMeDto): Promise<MeResponse> {
    const changes: Partial<Pick<ProfileRow, 'display_name' | 'avatar_url'>> = {};
    if (dto.displayName !== undefined) changes.display_name = dto.displayName.trim();
    if (dto.avatarUrl !== undefined) changes.avatar_url = dto.avatarUrl;
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    const { data, error } = await this.supabase.admin
      .from('profiles')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (error) this.profileServiceFailed(error.message);
    if (!data) throw new NotFoundException('Profile not found');
    return toMe(data as ProfileRow, user.email);
  }

  /**
   * Deletes all of the user's Neon rows in one transaction, then the Supabase login
   * (the profiles row goes with it through its foreign key).
   */
  async deleteAccount(user: AuthUser, ip: string | null): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      for (const step of USER_DATA_DELETE_STEPS) {
        await manager.query(step.sql, [user.id]);
      }
    });

    const { error } = await this.supabase.admin.auth.admin.deleteUser(user.id);
    if (error) {
      this.logger.error(`Supabase user deletion failed: ${error.message}`);
      throw new BadGatewayException('Your data was removed, but the login could not be deleted. Please try again.');
    }

    this.authCache.evictUser(user.id);
    await this.audit.log(null, 'account.deleted', 'account', null, ip);
  }

  private profileServiceFailed(reason: string): never {
    this.logger.error(`Supabase profile request failed: ${reason}`);
    throw new ServiceUnavailableException('Profile service is unavailable');
  }
}
