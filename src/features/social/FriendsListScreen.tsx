import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { profileHandle, profileLabel } from '@/features/social/labels';
import { useFriends, useUnfriend } from '@/features/social/queries';
import { useUpcomingCrossedPaths } from '@/features/social/useUpcomingCrossedPaths';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

export function FriendsListScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const friendsQuery = useFriends();
  const unfriend = useUnfriend();
  const crossedPaths = useUpcomingCrossedPaths();

  return (
    <Screen>
      <ScreenHeader title="Connections" />

      {crossedPaths.count > 0 && (
        <Pressable
          onPress={() => router.push('/people/crossed-paths')}
          style={({ pressed }) => [styles.alert, pressed && styles.pressed]}
        >
          <Text variant="body" color="primary">
            {crossedPaths.count === 1
              ? '1 upcoming crossed path'
              : `${crossedPaths.count} upcoming crossed paths`}
          </Text>
          <Text variant="caption" color="textMuted">
            Tap to review who you&apos;ll be near
          </Text>
        </Pressable>
      )}

      <QueryBoundary
        isLoading={friendsQuery.isLoading}
        isError={friendsQuery.isError}
        errorMessage="Couldn't load connections."
        onRetry={() => friendsQuery.refetch()}
        containerStyle={styles.center}
      >
        {(friendsQuery.data?.length ?? 0) === 0 ? (
          <View style={styles.center}>
            <Text color="textMuted">No connections yet.</Text>
            <Button title="Find people" onPress={() => router.push('/people')} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {friendsQuery.data!.map((row) => {
            const upcomingCount = crossedPaths.countByFriendId.get(row.other.id) ?? 0;
            return (
              <View key={row.id} style={styles.row}>
                <Pressable
                  style={styles.rowText}
                  onPress={() =>
                    router.push({ pathname: '/people/[id]', params: { id: row.other.id } })
                  }
                >
                  <Text variant="body">{profileLabel(row.other)}</Text>
                  {!!profileHandle(row.other) && (
                    <Text variant="caption" color="textMuted">
                      {profileHandle(row.other)}
                    </Text>
                  )}
                  {upcomingCount > 0 && (
                    <Text variant="caption" color="primary">
                      {upcomingCount === 1
                        ? '1 upcoming crossed path'
                        : `${upcomingCount} upcoming crossed paths`}
                    </Text>
                  )}
                </Pressable>
                <Button
                  title="Remove"
                  variant="secondary"
                  onPress={() => unfriend.mutate(row.id)}
                  loading={unfriend.isPending}
                />
              </View>
            );
          })}
          </ScrollView>
        )}
      </QueryBoundary>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  topBar: {
    paddingTop: spacing.md,
    marginBottom: spacing.sm,
  },
  alert: {
    marginTop: spacing.md,
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
  },
  pressed: {
    opacity: 0.7,
  },
  list: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  });
