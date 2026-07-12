import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { profileHandle, profileLabel } from '@/features/social/labels';
import { useFriends, useUnfriend } from '@/features/social/queries';
import { colors, radius, spacing } from '@/theme';

export function FriendsListScreen() {
  const router = useRouter();
  const friendsQuery = useFriends();
  const unfriend = useUnfriend();

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Back
        </Text>
      </View>

      <Text variant="title">Friends</Text>

      {friendsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : friendsQuery.isError ? (
        <View style={styles.center}>
          <Text color="danger">Couldn&apos;t load friends.</Text>
          <Button title="Retry" variant="secondary" onPress={() => friendsQuery.refetch()} />
        </View>
      ) : (friendsQuery.data?.length ?? 0) === 0 ? (
        <View style={styles.center}>
          <Text color="textMuted">No friends yet.</Text>
          <Button title="Find people" onPress={() => router.push('/people')} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {friendsQuery.data!.map((row) => (
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
              </Pressable>
              <Button
                title="Unfriend"
                variant="secondary"
                onPress={() => unfriend.mutate(row.id)}
                loading={unfriend.isPending}
              />
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingTop: spacing.md,
    marginBottom: spacing.sm,
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
