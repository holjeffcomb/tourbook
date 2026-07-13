import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useProfile } from '@/features/profile/queries';
import { NearMissListCard } from '@/features/social/NearMissListCard';
import { NearMissMap } from '@/features/social/NearMissMap';
import { profileLabel } from '@/features/social/labels';
import { useFriendNearMisses } from '@/features/social/useFriendNearMisses';
import type { NearMiss } from '@/features/stats/types';
import { formatShowDate } from '@/lib/date';
import { formatMiles } from '@/lib/geo';
import { colors, radius, spacing } from '@/theme';

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

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Back
        </Text>
      </View>

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
        <ScrollView contentContainerStyle={styles.body}>
          <Text variant="caption" color={isUpcoming(nearMiss) ? 'primary' : 'textMuted'}>
            {isUpcoming(nearMiss) ? 'Upcoming' : 'Past'} · {kindLabel(nearMiss.kind)} ·{' '}
            {formatMiles(nearMiss.milesApart)}
          </Text>
          <Text variant="title">With {theirName}</Text>

          <NearMissMap nearMiss={nearMiss} height={260} />

          <View style={styles.sides}>
            <SideCard
              title="You"
              venue={nearMiss.stopA.label}
              city={nearMiss.stopA.city}
              actName={nearMiss.stopA.actName}
              tourTitle={nearMiss.stopA.tourTitle}
              date={nearMiss.dateA}
              tourId={nearMiss.stopA.tourId}
              onTourPress={(tourId) =>
                router.push({ pathname: '/tours/[id]', params: { id: tourId } })
              }
            />
            <SideCard
              title={theirName}
              venue={nearMiss.stopB.label}
              city={nearMiss.stopB.city}
              actName={nearMiss.stopB.actName}
              tourTitle={nearMiss.stopB.tourTitle}
              date={nearMiss.dateB}
              tourId={nearMiss.stopB.tourId}
              onTourPress={(tourId) =>
                router.push({ pathname: '/tours/[id]', params: { id: tourId } })
              }
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
    paddingBottom: spacing.xl,
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
  },
});
