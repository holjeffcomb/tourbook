import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { profileHandle, profileLabel } from '@/features/social/labels';
import {
  useAcceptFriendRequest,
  useCancelFriendRequest,
  useDeclineFriendRequest,
  usePendingFriendships,
} from '@/features/social/queries';
import { colors, radius, spacing } from '@/theme';

export function FriendRequestsScreen() {
  const router = useRouter();
  const pendingQuery = usePendingFriendships();
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const cancel = useCancelFriendRequest();

  const incoming = pendingQuery.data?.filter((f) => f.direction === 'incoming') ?? [];
  const outgoing = pendingQuery.data?.filter((f) => f.direction === 'outgoing') ?? [];

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Back
        </Text>
      </View>

      <Text variant="title">Friend requests</Text>

      {pendingQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : pendingQuery.isError ? (
        <View style={styles.center}>
          <Text color="danger">Couldn&apos;t load requests.</Text>
          <Button title="Retry" variant="secondary" onPress={() => pendingQuery.refetch()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text variant="heading">Incoming</Text>
          {incoming.length === 0 ? (
            <Text color="textMuted">No pending requests.</Text>
          ) : (
            incoming.map((row) => (
              <View key={row.id} style={styles.card}>
                <Pressable
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
                <View style={styles.actions}>
                  <Button
                    title="Accept"
                    onPress={() => accept.mutate(row.id)}
                    loading={accept.isPending}
                  />
                  <Button
                    title="Decline"
                    variant="secondary"
                    onPress={() => decline.mutate(row.id)}
                    loading={decline.isPending}
                  />
                </View>
              </View>
            ))
          )}

          <Text variant="heading" style={styles.section}>
            Sent
          </Text>
          {outgoing.length === 0 ? (
            <Text color="textMuted">No outgoing requests.</Text>
          ) : (
            outgoing.map((row) => (
              <View key={row.id} style={styles.card}>
                <Pressable
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
                  title="Cancel"
                  variant="secondary"
                  onPress={() => cancel.mutate(row.id)}
                  loading={cancel.isPending}
                />
              </View>
            ))
          )}
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
  body: {
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  section: {
    marginTop: spacing.md,
  },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
