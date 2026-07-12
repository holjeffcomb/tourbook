import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useActSearch } from '@/features/acts/queries';
import { ActAutocomplete } from '@/features/acts/ActAutocomplete';
import type { TourSearchResult } from '@/features/tours/api';
import { useJoinTourById, useTours, useTourSearch } from '@/features/tours/queries';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { formatDateRange } from '@/lib/date';
import { colors, radius, spacing } from '@/theme';

function ExistingTourRow({
  tour,
  isMember,
  onPress,
}: {
  tour: TourSearchResult;
  isMember: boolean;
  onPress: () => void;
}) {
  const dateRange = formatDateRange(tour.start_date, tour.end_date);
  const creator = tour.creator?.display_name;
  const memberLabel = `${tour.memberCount} ${tour.memberCount === 1 ? 'member' : 'members'}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowText}>
        <Text variant="body" style={styles.rowTitle}>
          {tour.title || 'Untitled tour'}
        </Text>
        {!!dateRange && (
          <Text variant="caption" color="textMuted">
            {dateRange}
          </Text>
        )}
        <Text variant="caption" color="textMuted">
          {memberLabel}
          {creator ? ` · by ${creator}` : ''}
        </Text>
      </View>
      <Text variant="body" color="primary">
        {isMember ? 'Open' : 'Join'}
      </Text>
    </Pressable>
  );
}

export function AddTourScreen() {
  const router = useRouter();
  const [actName, setActName] = useState('');
  const debounced = useDebouncedValue(actName, 250);

  const { data: actMatches } = useActSearch(debounced);

  // Resolve the typed act to a known act id (via exact match or an explicit
  // selection) so we can surface existing tours for it.
  const actId = useMemo(() => {
    const term = actName.trim().toLowerCase();
    if (term.length < 2) return null;
    const match = (actMatches ?? []).find((act) => act.name.trim().toLowerCase() === term);
    return match?.id ?? null;
  }, [actMatches, actName]);

  const searchQuery = useTourSearch(actId);
  const myTours = useTours();
  const joinTour = useJoinTourById();

  const myTourIds = useMemo(
    () => new Set((myTours.data ?? []).map((tour) => tour.id)),
    [myTours.data],
  );

  const results = searchQuery.data ?? [];
  const canCreate = actName.trim().length >= 2;

  const openTour = async (tour: TourSearchResult) => {
    if (!myTourIds.has(tour.id)) {
      try {
        await joinTour.mutateAsync(tour.id);
      } catch {
        // Fall through to open the tour; the detail screen shows a Join action.
      }
    }
    router.replace({ pathname: '/tours/[id]', params: { id: tour.id } });
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Cancel
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="title">Add a tour</Text>
          <Text color="textMuted">
            Search for the act. If the tour already exists, join it so everyone shares one record.
          </Text>

          <Button
            title="Paste tour text (AI import)"
            variant="secondary"
            onPress={() => router.push('/tours/import')}
          />

          <ActAutocomplete
            value={actName}
            onChangeText={setActName}
            onSelectAct={(act) => setActName(act.name)}
          />

          {actId && (
            <View style={styles.results}>
              {searchQuery.isLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : results.length > 0 ? (
                <>
                  <Text variant="heading">Existing tours</Text>
                  {results.map((tour) => (
                    <ExistingTourRow
                      key={tour.id}
                      tour={tour}
                      isMember={myTourIds.has(tour.id)}
                      onPress={() => openTour(tour)}
                    />
                  ))}
                </>
              ) : (
                <Text color="textMuted">No tours logged for this act yet.</Text>
              )}
            </View>
          )}

          {canCreate && (
            <Button
              title="Create a new tour"
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/tours/create', params: { act: actName.trim() } })
              }
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    paddingTop: spacing.md,
  },
  flex: {
    flex: 1,
  },
  body: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  results: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  rowTitle: {
    fontWeight: '600',
  },
});
