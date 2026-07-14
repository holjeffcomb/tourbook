import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useProfile } from '@/features/profile/queries';
import { NearMissListCard } from '@/features/social/NearMissListCard';
import { profileLabel } from '@/features/social/labels';
import { useFriendNearMisses } from '@/features/social/useFriendNearMisses';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

const DISTANCE_PRESETS = [50, 100, 250] as const;
const WINDOW_PRESETS = [0, 1, 2] as const;

export function NearMissScreen() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [maxMiles, setMaxMiles] = useState<(typeof DISTANCE_PRESETS)[number]>(100);
  const [dateWindowDays, setDateWindowDays] = useState<(typeof WINDOW_PRESETS)[number]>(0);

  const friendProfile = useProfile(id);
  const {
    areFriends,
    areFriendsLoading,
    isLoading,
    nearMisses,
    upcoming,
    past,
  } = useFriendNearMisses(id, { maxMiles, dateWindowDays });

  const theirName = profileLabel(friendProfile.data);

  const openDetail = (stopA: string, stopB: string) => {
    router.push({
      pathname: '/people/[id]/crossed-path',
      params: { id, stopA, stopB },
    });
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Back
        </Text>
      </View>

      <Text variant="title">Crossed paths</Text>
      <Text color="textMuted" style={styles.subtitle}>
        With {theirName}
      </Text>

      {!areFriendsLoading && !areFriends ? (
        <View style={styles.center}>
          <Text color="textMuted">Crossed paths are available for friends only.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.filters}>
            <Text variant="caption" color="textMuted">
              Distance
            </Text>
            <View style={styles.chips}>
              {DISTANCE_PRESETS.map((miles) => (
                <Pressable
                  key={miles}
                  onPress={() => setMaxMiles(miles)}
                  style={[styles.chip, maxMiles === miles && styles.chipSelected]}
                >
                  <Text color={maxMiles === miles ? 'primary' : 'text'}>{miles} mi</Text>
                </Pressable>
              ))}
            </View>
            <Text variant="caption" color="textMuted">
              Date window
            </Text>
            <View style={styles.chips}>
              {WINDOW_PRESETS.map((days) => (
                <Pressable
                  key={days}
                  onPress={() => setDateWindowDays(days)}
                  style={[styles.chip, dateWindowDays === days && styles.chipSelected]}
                >
                  <Text color={dateWindowDays === days ? 'primary' : 'text'}>
                    {days === 0 ? 'Same day' : `±${days} day${days === 1 ? '' : 's'}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {nearMisses.length === 0 ? (
            <Text color="textMuted">
              No crossed paths with these filters. Try a wider distance or date window.
            </Text>
          ) : (
            <>
              <View style={styles.section}>
                <Text variant="heading">Upcoming ({upcoming.length})</Text>
                {upcoming.length === 0 ? (
                  <Text color="textMuted">No upcoming overlaps with these filters.</Text>
                ) : (
                  upcoming.map((item) => (
                    <NearMissListCard
                      key={`${item.stopA.stopId}:${item.stopB.stopId}`}
                      nearMiss={item}
                      upcoming
                      theirName={theirName}
                      onPress={() => openDetail(item.stopA.stopId, item.stopB.stopId)}
                    />
                  ))
                )}
              </View>

              <View style={styles.section}>
                <Text variant="heading">Past ({past.length})</Text>
                {past.length === 0 ? (
                  <Text color="textMuted">No past overlaps with these filters.</Text>
                ) : (
                  past.map((item) => (
                    <NearMissListCard
                      key={`${item.stopA.stopId}:${item.stopB.stopId}`}
                      nearMiss={item}
                      upcoming={false}
                      theirName={theirName}
                      onPress={() => openDetail(item.stopA.stopId, item.stopB.stopId)}
                    />
                  ))
                )}
              </View>
            </>
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
      subtitle: {
      marginBottom: spacing.md,
    },
    body: {
      gap: spacing.md,
      paddingBottom: spacing.xl,
    },
    filters: {
      gap: spacing.sm,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    chipSelected: {
      borderColor: colors.primary,
    },
    section: {
      gap: spacing.sm,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
  });
