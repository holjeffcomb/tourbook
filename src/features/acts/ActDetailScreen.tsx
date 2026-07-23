import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAct, useActCrew } from '@/features/acts/queries';
import { useAuth } from '@/features/auth/AuthContext';
import { profileHandle, profileLabel } from '@/features/social/labels';
import { useTourSearch } from '@/features/tours/queries';
import { formatDateRange } from '@/lib/date';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

export function ActDetailScreen() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const actQuery = useAct(id);
  const toursQuery = useTourSearch(id);
  const crewQuery = useActCrew(id);

  const friends = (crewQuery.data ?? []).filter((m) => m.isFriend);
  const others = (crewQuery.data ?? []).filter(
    (m) => !m.isFriend && m.userId !== session?.user.id,
  );

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Back
        </Text>
      </View>

      {actQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : actQuery.isError || !actQuery.data ? (
        <View style={styles.center}>
          <Text color="danger">Couldn&apos;t load this act.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text variant="title">{actQuery.data.name}</Text>

          <Text variant="heading" style={styles.section}>
            Tours
          </Text>
          {toursQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (toursQuery.data?.length ?? 0) === 0 ? (
            <Text color="textMuted">No visible tours yet.</Text>
          ) : (
            toursQuery.data!.map((tour) => {
              const dateRange = formatDateRange(tour.start_date, tour.end_date);
              return (
                <Pressable
                  key={tour.id}
                  onPress={() =>
                    router.push({ pathname: '/tours/[id]', params: { id: tour.id } })
                  }
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Text variant="body">{tour.title || 'Untitled tour'}</Text>
                  {!!dateRange && (
                    <Text variant="caption" color="textMuted">
                      {dateRange}
                    </Text>
                  )}
                  <Text variant="caption" color="textMuted">
                    {tour.memberCount} member{tour.memberCount === 1 ? '' : 's'}
                    {tour.creator?.display_name ? ` · by ${tour.creator.display_name}` : ''}
                  </Text>
                </Pressable>
              );
            })
          )}

          <Text variant="heading" style={styles.section}>
            Connections who worked this act
          </Text>
          {crewQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : friends.length === 0 ? (
            <Text color="textMuted">None of your connections yet.</Text>
          ) : (
            friends.map((member) => (
              <Pressable
                key={member.userId}
                onPress={() =>
                  router.push({ pathname: '/people/[id]', params: { id: member.userId } })
                }
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Text variant="body">
                  {profileLabel({
                    display_name: member.displayName,
                    username: member.username,
                  })}
                </Text>
                {!!profileHandle({ username: member.username }) && (
                  <Text variant="caption" color="textMuted">
                    {profileHandle({ username: member.username })}
                  </Text>
                )}
                <Text variant="caption" color="textMuted">
                  {member.tourCount} tour{member.tourCount === 1 ? '' : 's'}
                  {member.role ? ` · ${member.role}` : ''}
                </Text>
              </Pressable>
            ))
          )}

          {others.length > 0 && (
            <>
              <Text variant="heading" style={styles.section}>
                Others on visible tours
              </Text>
              {others.slice(0, 30).map((member) => (
                <Pressable
                  key={member.userId}
                  onPress={() =>
                    router.push({ pathname: '/people/[id]', params: { id: member.userId } })
                  }
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Text variant="body">
                    {profileLabel({
                      display_name: member.displayName,
                      username: member.username,
                    })}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {member.tourCount} tour{member.tourCount === 1 ? '' : 's'}
                    {member.role ? ` · ${member.role}` : ''}
                  </Text>
                </Pressable>
              ))}
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
  body: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  section: {
    marginTop: spacing.lg,
  },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
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
