import type { User } from '@supabase/supabase-js';
import { classifyStartupSession } from '@/features/auth/startupSession';

const USER = { id: 'user-1' } as User;

// The AuthContext cold start branches on this: 'invalid' => sign out + clear the
// query/mutation caches + persisted client; 'valid'/'network' => keep the cached
// session and preserve the offline queue.

describe('classifyStartupSession', () => {
  describe('transient network / transport failures -> session preserved, queue kept', () => {
    it('treats an AuthRetryableFetchError (offline) as network', () => {
      const error = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' };
      expect(classifyStartupSession(null, error)).toBe('network');
    });

    it('treats a raw fetch/TypeError as network', () => {
      expect(classifyStartupSession(null, new TypeError('Network request failed'))).toBe('network');
    });

    it('treats 5xx and rate-limit (wrapped as retryable) as network', () => {
      expect(
        classifyStartupSession(null, { name: 'AuthRetryableFetchError', status: 503 }),
      ).toBe('network');
      expect(
        classifyStartupSession(null, { name: 'AuthRetryableFetchError', status: 429 }),
      ).toBe('network');
    });

    it('fails open: an unknown/ambiguous error is treated as network, not a sign-out', () => {
      expect(classifyStartupSession(null, { message: 'something weird' })).toBe('network');
      expect(classifyStartupSession(null, {})).toBe('network');
    });
  });

  describe('definitive auth failures -> sign out + clear', () => {
    it('treats an AuthApiError 401 as invalid', () => {
      const error = { name: 'AuthApiError', status: 401, message: 'invalid JWT' };
      expect(classifyStartupSession(null, error)).toBe('invalid');
    });

    it('treats a missing session as invalid', () => {
      const error = { name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' };
      expect(classifyStartupSession(null, error)).toBe('invalid');
    });

    it('treats a 403 from the auth endpoint as invalid', () => {
      expect(classifyStartupSession(null, { name: 'AuthApiError', status: 403 })).toBe('invalid');
    });

    it('treats a server "no user" (no error) as invalid — truly signed out', () => {
      expect(classifyStartupSession(null, null)).toBe('invalid');
      expect(classifyStartupSession(undefined, null)).toBe('invalid');
    });
  });

  describe('healthy session', () => {
    it('is valid when the server confirms a user and no error', () => {
      expect(classifyStartupSession(USER, null)).toBe('valid');
    });
  });
});
