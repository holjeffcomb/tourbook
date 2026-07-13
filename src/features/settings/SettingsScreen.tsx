import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthContext';
import { usePendingFriendships, useFriends } from '@/features/social/queries';
import { useUpcomingCrossedPaths } from '@/features/social/useUpcomingCrossedPaths';
import { colors, radius, spacing } from '@/theme';

function SettingsRow({ label, detail, onPress }: { label: string; detail?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text variant="body">{label}</Text>
      {!!detail && (
        <Text variant="caption" color="textMuted">
          {detail}
        </Text>
      )}
    </Pressable>
  );
}

export function SettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const friendsQuery = useFriends();
  const pendingQuery = usePendingFriendships();
  const crossedPaths = useUpcomingCrossedPaths();

  const incomingCount =
    pendingQuery.data?.filter((friendship) => friendship.direction === 'incoming').length ?? 0;

  const isLoading = friendsQuery.isLoading || pendingQuery.isLoading;

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Back
        </Text>
      </View>

      <AppHeader title="Settings" showProfileMenu={false} />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text variant="heading">People</Text>
          <SettingsRow label="Find people" onPress={() => router.push('/people')} />
          <SettingsRow
            label="Friend requests"
            detail={incomingCount > 0 ? `${incomingCount} waiting` : undefined}
            onPress={() => router.push('/people/requests')}
          />
          <SettingsRow
            label="Friends"
            detail={
              friendsQuery.data ? `${friendsQuery.data.length} friends` : undefined
            }
            onPress={() => router.push('/people/friends')}
          />
          {crossedPaths.count > 0 && (
            <SettingsRow
              label="Upcoming crossed paths"
              detail={`${crossedPaths.count} upcoming`}
              onPress={() => router.push('/people/crossed-paths')}
            />
          )}
          {session?.user.id && (
            <SettingsRow
              label="View my public profile"
              onPress={() =>
                router.push({ pathname: '/people/[id]', params: { id: session.user.id } })
              }
            />
          )}

          <Text variant="heading" style={styles.sectionGap}>
            Account
          </Text>
          <Text color="textMuted">{session?.user.email ?? '—'}</Text>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingTop: spacing.md,
  },
  body: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  sectionGap: {
    marginTop: spacing.lg,
  },
  row: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  rowPressed: {
    opacity: 0.7,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
