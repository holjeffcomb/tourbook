import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { NearMissListCard } from '@/features/social/NearMissListCard';
import { useUpcomingCrossedPaths } from '@/features/social/useUpcomingCrossedPaths';
import { colors, spacing } from '@/theme';

export function UpcomingCrossedPathsScreen() {
  const router = useRouter();
  const { items, isLoading, count } = useUpcomingCrossedPaths();

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Back
        </Text>
      </View>

      <Text variant="title">Upcoming crossed paths</Text>
      <Text color="textMuted" style={styles.subtitle}>
        Friends you&apos;ll be near on overlapping dates. Past overlaps stay on each friend&apos;s
        Crossed paths screen.
      </Text>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : count === 0 ? (
        <View style={styles.center}>
          <Text color="textMuted">No upcoming crossed paths with friends right now.</Text>
          <Button title="Friends" variant="secondary" onPress={() => router.push('/people/friends')} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {items.map((item) => {
            const n = item.nearMiss;
            return (
              <NearMissListCard
                key={`${item.friendId}-${n.stopA.stopId}:${n.stopB.stopId}`}
                nearMiss={n}
                upcoming
                theirName={item.friendName}
                withFriend={item.friendName}
                onPress={() =>
                  router.push({
                    pathname: '/people/[id]/crossed-path',
                    params: {
                      id: item.friendId,
                      stopA: n.stopA.stopId,
                      stopB: n.stopB.stopId,
                    },
                  })
                }
              />
            );
          })}
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
  subtitle: {
    marginBottom: spacing.md,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
