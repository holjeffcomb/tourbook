import type { User } from '@supabase/supabase-js';

// Startup session decision for the AuthContext cold-start check.
//   'valid'   — the server confirmed a live user; use the cached session.
//   'network' — we couldn't reach the server (offline / transient / 5xx / rate
//               limit). We DON'T know if the session is bad, so keep the cached
//               session and, crucially, preserve any queued offline writes.
//   'invalid' — the server gave a definitive auth failure (token invalid/expired/
//               revoked, or no session). Sign out and clear local state.
export type StartupSessionDecision = 'valid' | 'network' | 'invalid';

// Distinguish a *definitive* auth failure from a *transport* failure. Fails open:
// only a clearly-auth error returns true; anything ambiguous is treated as network,
// so a valid cached session + queued offline writes survive an offline relaunch. A
// genuinely bad token that slips through here still fails closed under RLS on the
// next authed call and is caught by a later online cold start.
function isDefiniteAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; status?: number };
  // Supabase wraps offline/5xx/429 as AuthRetryableFetchError — explicitly NOT auth.
  if (e.name === 'AuthRetryableFetchError') return false;
  // Definitive auth error classes from supabase-js.
  if (e.name === 'AuthApiError' || e.name === 'AuthSessionMissingError') return true;
  // Unauthorized / forbidden from the auth endpoint.
  if (e.status === 401 || e.status === 403) return true;
  return false;
}

// Classify the result of `supabase.auth.getUser()` at startup. `user` is
// `userData.user` and `error` is the accompanying error (if any).
export function classifyStartupSession(
  user: User | null | undefined,
  error: unknown,
): StartupSessionDecision {
  if (error) return isDefiniteAuthError(error) ? 'invalid' : 'network';
  // No error: the server answered. A user means valid; no user means truly signed out.
  return user ? 'valid' : 'invalid';
}
