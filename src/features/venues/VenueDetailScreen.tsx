import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthContext';
import { PointMap } from '@/features/maps/PointMap';
import { profileHandle, profileLabel } from '@/features/social/labels';
import { useVenue, useVenuePlayers } from '@/features/venues/queries';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

export function VenueDetailScreen() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const venueQuery = useVenue(id);
  const playersQuery = useVenuePlayers(id);

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Back
        </Text>
      </View>

      {venueQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : venueQuery.isError || !venueQuery.data ? (
        <View style={styles.center}>
          <Text color="danger">Couldn&apos;t load this venue.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text variant="title">{venueQuery.data.name}</Text>
          <Text color="textMuted">{venueQuery.data.city}</Text>
          {!!venueQuery.data.address && (
            <Text variant="caption" color="textMuted">
              {venueQuery.data.address}
            </Text>
          )}

          <View style={styles.map}>
            <PointMap
              latitude={venueQuery.data.latitude}
              longitude={venueQuery.data.longitude}
              label={venueQuery.data.name}
            />
          </View>

          <Text variant="heading" style={styles.section}>
            Who&apos;s played here
          </Text>
          <Text color="textMuted" style={styles.hint}>
            From tours you can see. Friends are listed first.
          </Text>

          {playersQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (playersQuery.data?.length ?? 0) === 0 ? (
            <Text color="textMuted">No one yet on tours you can see.</Text>
          ) : (
            playersQuery.data!.map((player) => {
              const isYou = player.userId === session?.user.id;
              const label = isYou
                ? 'You'
                : profileLabel({
                    display_name: player.displayName,
                    username: player.username,
                  });
              return (
                <Pressable
                  key={player.userId}
                  onPress={() =>
                    router.push({ pathname: '/people/[id]', params: { id: player.userId } })
                  }
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={styles.rowText}>
                    <Text variant="body">
                      {label}
                      {player.isFriend && !isYou ? ' · Friend' : ''}
                    </Text>
                    {!!profileHandle({ username: player.username }) && !isYou && (
                      <Text variant="caption" color="textMuted">
                        {profileHandle({ username: player.username })}
                      </Text>
                    )}
                    <Text variant="caption" color="textMuted">
                      {player.showCount} stop{player.showCount === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Text color="primary">View</Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
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
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  map: {
    marginTop: spacing.sm,
  },
  section: {
    marginTop: spacing.lg,
  },
  hint: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  pressed: {
    opacity: 0.7,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
