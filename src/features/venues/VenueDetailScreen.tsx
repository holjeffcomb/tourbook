import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthContext';
import { MapScreenScaffold } from '@/features/maps/MapScreenScaffold';
import { type MapScene } from '@/features/maps/mapScene';
import { profileHandle, profileLabel } from '@/features/social/labels';
import { useVenue, useVenuePlayers } from '@/features/venues/queries';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

export function VenueDetailScreen() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const venueQuery = useVenue(id);
  const playersQuery = useVenuePlayers(id);

  const venue = venueQuery.data;
  const hasCoords = venue?.latitude != null && venue?.longitude != null;

  const scene = useMemo<MapScene>(() => {
    const contentInsets = { top: insets.top + 56, left: spacing.md, right: spacing.md };
    if (!venue || !hasCoords) return { key: `venue-${id}`, contentInsets };
    const coord: [number, number] = [venue.longitude as number, venue.latitude as number];
    return {
      key: `venue-${id}`,
      // Full street basemap so nearby businesses/POIs read around the venue.
      variant: 'streets',
      markers: [{ id: 'venue', coordinate: coord, kind: 'venue', label: venue.name }],
      focus: [coord],
      singleZoom: 15,
      contentInsets,
    };
  }, [venue, hasCoords, id, insets.top]);

  const sheetHeader = venue ? (
    <View style={styles.sheetHeader}>
      <Text variant="title" numberOfLines={1}>
        {venue.name}
      </Text>
      {!!venue.city && (
        <Text color="textMuted" numberOfLines={1}>
          {venue.city}
        </Text>
      )}
    </View>
  ) : null;

  return (
    <MapScreenScaffold
      scene={scene}
      onBack={() => router.back()}
      topInset={insets.top}
      sheetHeader={sheetHeader}
    >
      {venueQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : venueQuery.isError || !venue ? (
        <View style={styles.center}>
          <Text color="danger">Couldn&apos;t load this venue.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        >
          {!!venue.address && (
            <Text variant="caption" color="textMuted">
              {venue.address}
            </Text>
          )}

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
    </MapScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    sheetHeader: {
      paddingBottom: spacing.sm,
      gap: 2,
    },
    body: {
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
    },
    section: {
      marginTop: spacing.md,
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
      padding: spacing.xl,
    },
  });
