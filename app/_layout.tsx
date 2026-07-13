import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { asyncStoragePersister } from '@/lib/persister';
import { CACHE_MAX_AGE, queryClient } from '@/lib/queryClient';
import { ThemeProvider, useColors } from '@/theme/ThemeProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: asyncStoragePersister, maxAge: CACHE_MAX_AGE }}
        >
          <AuthProvider>
            <StatusBar style="auto" />
            <RootNavigator />
          </AuthProvider>
        </PersistQueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, initializing } = useAuth();
  const colors = useColors();

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
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
