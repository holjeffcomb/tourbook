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
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

function ExistingTourRow({
  tour,
  isMember,
  onPress,
}: {
  tour: TourSearchResult;
  isMember: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
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

function MethodOption({
  title,
  description,
  onPress,
}: {
  title: string;
  description: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.methodCard, pressed && styles.rowPressed]}
    >
      <Text variant="body" style={styles.rowTitle}>
        {title}
      </Text>
      <Text variant="caption" color="textMuted">
        {description}
      </Text>
    </Pressable>
  );
}

export function AddTourScreen() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const router = useRouter();
  const [phase, setPhase] = useState<'act' | 'method'>('act');
  const [actName, setActName] = useState('');
  const debounced = useDebouncedValue(actName, 250);

  const { data: actMatches } = useActSearch(debounced);

  // Resolve the typed act to a known act id (via exact match or an explicit
  // selection) so we can surface existing tours and tie to that exact act.
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
  const trimmedAct = actName.trim();
  const canContinue = trimmedAct.length >= 2;
  const isNewAct = canContinue && !actId;

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

  const goToMethod = (pathname: '/tours/create' | '/tours/import') => {
    router.push({
      pathname,
      params: actId ? { act: trimmedAct, actId } : { act: trimmedAct },
    });
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text
          variant="body"
          color="primary"
          onPress={() => (phase === 'method' ? setPhase('act') : router.back())}
        >
          {phase === 'method' ? 'Back' : 'Cancel'}
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
          {phase === 'act' ? (
            <>
              <Text variant="title">Add a tour</Text>
              <Text color="textMuted">
                Who&apos;s the act? Pick an existing one so everyone shares a record — or add a new
                act.
              </Text>

              <ActAutocomplete
                value={actName}
                onChangeText={setActName}
                onSelectAct={(act) => setActName(act.name)}
              />

              {isNewAct && (
                <View style={styles.newActNotice}>
                  <Text variant="caption" color="primary" style={styles.noticeLabel}>
                    New act
                  </Text>
                  <Text variant="caption" color="textMuted">
                    “{trimmedAct}” isn&apos;t in the database yet — it&apos;ll be created when you add
                    this tour.
                  </Text>
                </View>
              )}

              {actId && (
                <View style={styles.results}>
                  {searchQuery.isLoading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : results.length > 0 ? (
                    <>
                      <Text variant="heading">Existing tours</Text>
                      <Text variant="caption" color="textMuted">
                        Already logged for this act — join instead of duplicating.
                      </Text>
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

              <Button
                title="Continue"
                onPress={() => setPhase('method')}
                disabled={!canContinue}
              />
            </>
          ) : (
            <>
              <Text variant="title">How do you want to add it?</Text>
              <View style={styles.chosenAct}>
                <View style={styles.rowText}>
                  <Text variant="caption" color="textMuted">
                    Act
                  </Text>
                  <Text variant="body" style={styles.rowTitle}>
                    {trimmedAct}
                    {isNewAct ? ' (new)' : ''}
                  </Text>
                </View>
                <Text variant="body" color="primary" onPress={() => setPhase('act')}>
                  Change
                </Text>
              </View>

              <MethodOption
                title="Enter dates manually"
                description="Create the tour, then add shows and off days one at a time."
                onPress={() => goToMethod('/tours/create')}
              />
              <MethodOption
                title="Paste tour text (AI import)"
                description="Paste dates from a poster, listing, or email and we'll pull out the venues and dates."
                onPress={() => goToMethod('/tours/import')}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
  newActNotice: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
  },
  noticeLabel: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chosenAct: {
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
  methodCard: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
});
