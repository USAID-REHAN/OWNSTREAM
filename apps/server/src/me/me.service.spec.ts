import { BadGatewayException, BadRequestException, Logger } from '@nestjs/common';
import { DataSource, getMetadataArgsStorage } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthCache } from '../auth/auth-cache.service';
import { ALL_ENTITIES } from '../database/entities';
import { SupabaseService } from '../supabase/supabase.service';
import { MeService } from './me.service';
import { USER_DATA_DELETE_STEPS } from './user-data-deletion';

describe('MeService', () => {
  const user = { id: 'user-1', email: 'a@example.com' };
  let calls: string[];
  let query: jest.Mock;
  let deleteUser: jest.Mock;
  let audit: { log: jest.Mock };
  let cache: { evictUser: jest.Mock };
  let service: MeService;

  beforeEach(() => {
    calls = [];
    query = jest.fn(async (sql: string) => {
      calls.push(sql);
      return [];
    });
    const dataSource = {
      transaction: jest.fn(async (work: (manager: { query: jest.Mock }) => Promise<void>) => {
        calls.push('BEGIN');
        await work({ query });
        calls.push('COMMIT');
      }),
    } as unknown as DataSource;
    deleteUser = jest.fn(async () => {
      calls.push('SUPABASE DELETE USER');
      return { error: null };
    });
    const supabase = { admin: { auth: { admin: { deleteUser } } } } as unknown as SupabaseService;
    audit = { log: jest.fn() };
    cache = { evictUser: jest.fn() };
    service = new MeService(supabase, dataSource, audit as unknown as AuditService, cache as unknown as AuthCache);
  });

  describe('deleteAccount', () => {
    it('deletes Neon rows child-first in one transaction, then the Supabase login', async () => {
      await service.deleteAccount(user, '203.0.113.7');

      expect(calls).toEqual(['BEGIN', ...USER_DATA_DELETE_STEPS.map((s) => s.sql), 'COMMIT', 'SUPABASE DELETE USER']);
      for (const [, params] of query.mock.calls) {
        expect(params).toEqual(['user-1']);
      }
      expect(deleteUser).toHaveBeenCalledWith('user-1');
      expect(cache.evictUser).toHaveBeenCalledWith('user-1');
      expect(audit.log).toHaveBeenCalledWith(null, 'account.deleted', 'account', null, '203.0.113.7');
    });

    it('removes referencing rows before the rows they point to', () => {
      const order = USER_DATA_DELETE_STEPS.map((s) => s.table);
      const before = (child: string, parent: string) => expect(order.indexOf(child)).toBeLessThan(order.indexOf(parent));

      before('stream_sessions', 'games');
      before('stream_sessions', 'stream_profiles');
      before('stream_sessions', 'devices');
      before('games', 'stream_profiles');
      before('games', 'devices');
      before('conversations', 'personas');
      before('conversations', 'devices');
      before('agent_tasks', 'devices');
      before('pairing_codes', 'devices');
    });

    it('covers every Neon table', () => {
      const tables = getMetadataArgsStorage()
        .tables.filter((t) => ALL_ENTITIES.includes(t.target as (typeof ALL_ENTITIES)[number]))
        .map((t) => t.name)
        .sort();

      expect(USER_DATA_DELETE_STEPS.map((s) => s.table).sort()).toEqual(tables);
    });

    it('reports a failed Supabase deletion and keeps the cache untouched', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      deleteUser.mockResolvedValueOnce({ error: { message: 'network' } });

      await expect(service.deleteAccount(user, null)).rejects.toBeInstanceOf(BadGatewayException);
      expect(cache.evictUser).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('refuses an empty update', async () => {
      await expect(service.updateProfile(user, {})).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
