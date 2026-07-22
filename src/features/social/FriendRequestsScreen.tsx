import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { QueryBoundary } from '@/components/QueryBoundary';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { profileHandle, profileLabel } from '@/features/social/labels';
import {
  useAcceptFriendRequest,
  useCancelFriendRequest,
  useDeclineFriendRequest,
  usePendingFriendships,
} from '@/features/social/queries';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

export function FriendRequestsScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const pendingQuery = usePendingFriendships();
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const cancel = useCancelFriendRequest();

  const incoming = pendingQuery.data?.filter((f) => f.direction === 'incoming') ?? [];
  const outgoing = pendingQuery.data?.filter((f) => f.direction === 'outgoing') ?? [];

  return (
    <Screen>
      <ScreenHeader title="Connection requests" />

      <QueryBoundary
        isLoading={pendingQuery.isLoading}
        isError={pendingQuery.isError}
        errorMessage="Couldn't load requests."
        onRetry={() => pendingQuery.refetch()}
        containerStyle={styles.center}
      >
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
