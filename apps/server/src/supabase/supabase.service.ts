import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { EnvironmentVariables } from '../config/env.validation';

/**
 * Server-side Supabase client using the service role key.
 * The key bypasses row level security, so it never leaves the server.
 */
@Injectable()
export class SupabaseService {
  readonly admin: SupabaseClient;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.admin = createClient(
      config.get('SUPABASE_URL', { infer: true }),
      config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
}
