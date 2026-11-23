import { Global, Module } from '@nestjs/common';
import { AuthCache } from './auth-cache.service';
import { SupabaseAuthGuard } from './supabase-auth.guard';

@Global()
@Module({
  providers: [AuthCache, SupabaseAuthGuard],
  exports: [AuthCache, SupabaseAuthGuard],
})
export class AuthModule {}
