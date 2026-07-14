import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import type { FriendsTourEntry } from '@/features/social/useFriendsTours';
import { useFriendsTours } from '@/features/social/useFriendsTours';
import { formatDateRange } from '@/lib/date';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

function friendSummary(friends: FriendsTourEntry['friends']): string {
  if (friends.length === 1) return friends[0].name;
  if (friends.length === 2) return `${friends[0].name} and ${friends[1].name}`;
  return `${friends[0].name} and ${friends.length - 1} others`;
}

function TourRow({
  entry,
  alsoOnTour,
  onPress,
}: {
  entry: FriendsTourEntry;
  alsoOnTour: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const dateRange = formatDateRange(entry.startDate, entry.endDate);
  const leadFriend = entry.friends[0];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowTop}>
        <Avatar name={leadFriend.name} size={40} />
        <View style={styles.rowBody}>
          <Text variant="heading">{entry.actName}</Text>
          {!!entry.title && <Text color="textMuted">{entry.title}</Text>}
          <Text variant="caption" color="textMuted">
            {friendSummary(entry.friends)}
          </Text>
          {!!dateRange && (
            <Text variant="caption" color="textMuted">
              {dateRange}
            </Text>
          )}
          {alsoOnTour && (
            <Text variant="caption" color="primary">
              You&apos;re on this tour too
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export function FriendsToursScreen() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const router = useRouter();
  const { entries, myTourIds, friendCount, isLoading, isError, refetch, isRefetching } =
    useFriendsTours();

  return (
    <Screen>
      <AppHeader title="Friends' Tours" subtitle="Tours your friends are on" />

      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text color="danger">Couldn&apos;t load friends&apos; tours.</Text>
            <Button title="Retry" variant="secondary" onPress={() => refetch()} />
          </View>
        ) : friendCount === 0 ? (
          <View style={styles.center}>
            <Text variant="heading">No friends yet</Text>
            <Text color="textMuted" style={styles.emptyHint}>
              Add friends to see the tours they&apos;re on.
            </Text>
            <Button title="Find people" onPress={() => router.push('/people')} />
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.center}>
            <Text variant="heading">No tours to show</Text>
            <Text color="textMuted" style={styles.emptyHint}>
              When friends join tours you can see, they&apos;ll show up here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(entry) => entry.id}
            renderItem={({ item }) => (
              <TourRow
                entry={item}
                alsoOnTour={myTourIds.has(item.id)}
                onPress={() => router.push({ pathname: '/tours/[id]', params: { id: item.id } })}
              />
            )}
            contentContainerStyle={styles.list}
            onRefresh={refetch}
            refreshing={isRefetching}
          />
        )}
      </View>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  content: {
    flex: 1,
  },
  list: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyHint: {
    textAlign: 'center',
  },
  row: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowTop: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowBody: {
    flex: 1,
    gap: spacing.xs,
  },
  });
