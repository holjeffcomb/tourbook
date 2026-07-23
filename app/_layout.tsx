import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { initOnlineManager } from '@/lib/offline/onlineManager';
import { registerMutationDefaults } from '@/lib/offline/mutationDefaults';
import { resumeQueuedMutations } from '@/lib/offline/resumeQueue';
import { persistOptions } from '@/lib/persistOptions';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider, useColors } from '@/theme/ThemeProvider';

// Offline foundation. Runs once at module load, before any component renders, so
// that (a) TanStack knows the real online state via NetInfo and (b) the
// mutationFn/optimistic handlers for persisted mutations are registered *before*
// the cache is rehydrated and `resumePausedMutations()` is called.
initOnlineManager();
registerMutationDefaults(queryClient);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
            <AuthProvider>
              <StatusBar style="auto" />
              <RootNavigator />
            </AuthProvider>
          </PersistQueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, initializing } = useAuth();
  const colors = useColors();

  // Flush any mutations that were queued offline in a previous run, but only
  // once auth has settled and validated a session (AuthContext verifies the JWT
  // against the server). Replaying before that risks firing writes with a stale
  // token. `resumeQueuedMutations` also drops any queued write that belongs to a
  // different user before flushing (identity-validated replay — §4.9/F6), so a
  // shared-device account switch can't replay the previous user's queue.
  // Reconnect-triggered resumes are handled automatically by onlineManager.
  useEffect(() => {
    if (!initializing && session) {
      void resumeQueuedMutations(queryClient, session.user.id);
    }
  }, [initializing, session]);

  if (initializing) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
