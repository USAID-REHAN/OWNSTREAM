import type { SupabaseService } from '../supabase/supabase.service';
import type { AuthCache } from './auth-cache.service';
import type { AuthUser } from './auth-user';

/**
 * Asks Supabase who a token belongs to, with the 60 second cache in front.
 * Shared by the HTTP guard and the realtime gateway (viewer:hello). Returns null for a bad token.
 */
export async function verifySupabaseToken(
  supabase: SupabaseService,
  cache: AuthCache,
  token: string,
): Promise<AuthUser | null> {
  const cached = cache.get(token);
  if (cached) return cached;

  const { data, error } = await supabase.admin.auth.getUser(token);
  if (error || !data.user) return null;

  const user = { id: data.user.id, email: data.user.email ?? null };
  cache.set(token, user);
  return user;
}
