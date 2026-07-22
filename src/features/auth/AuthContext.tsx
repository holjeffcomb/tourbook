import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { asyncStoragePersister } from '@/lib/persister';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

type SignUpParams = {
  email: string;
  password: string;
  displayName: string;
};

type AuthContextValue = {
  session: Session | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: SignUpParams) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = use(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return value;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    void (async () => {
      // Validate against the server — getSession() alone can return a stale JWT
      // after `supabase db reset` wiped auth.users while AsyncStorage kept the session.
      const { data: userData, error } = await supabase.auth.getUser();
      if (error || !userData.user) {
        await supabase.auth.signOut();
        queryClient.clear();
        queryClient.getMutationCache().clear();
        await asyncStoragePersister.removeClient();
        setSession(null);
      } else {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
      }
      setInitializing(false);
    })();

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signUp: async ({ email, password, displayName }) => {
        // display_name flows into the profiles row via the handle_new_user trigger.
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName } },
        });
        if (error) throw error;
      },
      signOut: async () => {
        // Best-effort server revocation. If it fails (e.g. offline), fall back to a
        // local-scope sign-out so the session is still cleared on this device.
        const { error } = await supabase.auth.signOut();
        if (error) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
        // Always drop cached personal data AND any queued offline mutations locally —
        // even when the server was unreachable — so nothing can leak to, or replay
        // under, the next user on a shared device (design §4.9, offline sign-out).
        queryClient.clear();
        queryClient.getMutationCache().clear();
        await asyncStoragePersister.removeClient();
      },
    }),
    [session, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
