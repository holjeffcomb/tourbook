import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { MapScreenScaffold } from '@/features/maps/MapScreenScaffold';
import { type Coord, type MapScene } from '@/features/maps/mapScene';
import { useProfile } from '@/features/profile/queries';
import { NearMissListCard } from '@/features/social/NearMissListCard';
import { profileLabel } from '@/features/social/labels';
import { useFriendNearMisses } from '@/features/social/useFriendNearMisses';
import type { NearMiss } from '@/features/stats/types';
import { formatShowDate } from '@/lib/date';
import { formatMiles } from '@/lib/geo';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

function kindLabel(kind: NearMiss['kind']) {
  if (kind === 'same_venue') return 'Same venue';
  if (kind === 'same_city') return 'Same city';
  return 'Nearby';
}

function SideCard({
  title,
  venue,
  city,
  actName,
  tourTitle,
  date,
  tourId,
  onTourPress,
}: {
  title: string;
  venue: string;
  city: string;
  actName: string;
  tourTitle: string | null;
  date: string;
  tourId: string;
  onTourPress: (tourId: string) => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.sideCard}>
      <Text variant="caption" color="textMuted">
        {title}
      </Text>
      <Text variant="heading">{venue}</Text>
      {!!city && <Text color="textMuted">{city}</Text>}
      <Text variant="caption" color="textMuted">
        {formatShowDate(date)}
      </Text>
      <Pressable onPress={() => onTourPress(tourId)} style={styles.tourLink}>
        <Text color="primary">
          {actName}
          {tourTitle ? ` · ${tourTitle}` : ''}
        </Text>
        <Text variant="caption" color="primary">
          View tour
        </Text>
      </Pressable>
    </View>
  );
}

export function NearMissDetailScreen() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id, stopA, stopB } = useLocalSearchParams<{
    id: string;
    stopA: string;
    stopB: string;
  }>();
  const router = useRouter();
  const friendProfile = useProfile(id);
  const {
    areFriends,
    areFriendsLoading,
    isLoading,
    findByPair,
    upcoming,
    isUpcoming,
  } = useFriendNearMisses(id);

  const theirName = profileLabel(friendProfile.data);
  const nearMiss = stopA && stopB ? findByPair(stopA, stopB) : null;
  const upcomingOthers = nearMiss
    ? upcoming.filter(
        (n) =>
          !(n.stopA.stopId === nearMiss.stopA.stopId && n.stopB.stopId === nearMiss.stopB.stopId),
      )
    : upcoming;

  const scene = useMemo<MapScene>(() => {
    const contentInsets = { top: insets.top + 56, left: spacing.md, right: spacing.md };
    if (!nearMiss) return { key: `nearmiss-${id}`, contentInsets };
    const a: Coord = [nearMiss.stopA.lng, nearMiss.stopA.lat];
    const b: Coord = [nearMiss.stopB.lng, nearMiss.stopB.lat];
    const same = a[0] === b[0] && a[1] === b[1];
    return {
      key: `nearmiss-${nearMiss.stopA.stopId}-${nearMiss.stopB.stopId}`,
      markers: [
        { id: 'a', coordinate: a, kind: 'you', label: 'You' },
        { id: 'b', coordinate: b, kind: 'them', label: 'Them' },
      ],
      lines: same ? [] : [{ id: 'connector', segments: [[a, b]], style: 'dashed', color: 'primary' }],
      focus: same ? [a] : [a, b],
      singleZoom: 11,
      contentInsets,
    };
  }, [nearMiss, id, insets.top]);

  const notReady = (!areFriendsLoading && !areFriends) || isLoading || !nearMiss;

  const sheetHeader = nearMiss ? (
    <View style={styles.sheetHeader}>
      <Text variant="caption" color={isUpcoming(nearMiss) ? 'primary' : 'textMuted'}>
        {isUpcoming(nearMiss) ? 'Upcoming' : 'Past'} · {kindLabel(nearMiss.kind)} ·{' '}
        {formatMiles(nearMiss.milesApart)}
      </Text>
      <Text variant="title">With {theirName}</Text>
    </View>
  ) : null;

  return (
    <MapScreenScaffold
      scene={scene}
      onBack={() => router.back()}
      topInset={insets.top}
      sheetHeader={notReady ? undefined : sheetHeader}
    >
      {!areFriendsLoading && !areFriends ? (
        <View style={styles.center}>
          <Text color="textMuted">Crossed paths are available for friends only.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !nearMiss ? (
        <View style={styles.center}>
          <Text color="danger">Couldn&apos;t find this crossed path.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        >
          <View style={styles.sides}>
            <SideCard
              title="You"
              venue={nearMiss.stopA.label}
              city={nearMiss.stopA.city}
              actName={nearMiss.stopA.actName}
              tourTitle={nearMiss.stopA.tourTitle}
              date={nearMiss.dateA}
              tourId={nearMiss.stopA.tourId}
              onTourPress={(tourId) => router.push({ pathname: '/tours/[id]', params: { id: tourId } })}
            />
            <SideCard
              title={theirName}
              venue={nearMiss.stopB.label}
              city={nearMiss.stopB.city}
              actName={nearMiss.stopB.actName}
              tourTitle={nearMiss.stopB.tourTitle}
              date={nearMiss.dateB}
              tourId={nearMiss.stopB.tourId}
              onTourPress={(tourId) => router.push({ pathname: '/tours/[id]', params: { id: tourId } })}
            />
          </View>

          {upcomingOthers.length > 0 && (
            <View style={styles.section}>
              <Text variant="heading">More upcoming with {theirName}</Text>
              {upcomingOthers.map((item) => (
                <NearMissListCard
                  key={`${item.stopA.stopId}:${item.stopB.stopId}`}
                  nearMiss={item}
                  upcoming
                  theirName={theirName}
                  onPress={() =>
                    router.push({
                      pathname: '/people/[id]/crossed-path',
                      params: {
                        id,
                        stopA: item.stopA.stopId,
                        stopB: item.stopB.stopId,
                      },
                    })
                  }
                />
              ))}
            </View>
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
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
    },
    sides: {
      gap: spacing.sm,
    },
    sideCard: {
      gap: spacing.xs,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    tourLink: {
      marginTop: spacing.xs,
      gap: 2,
    },
    section: {
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: spacing.xl,
    },
  });
