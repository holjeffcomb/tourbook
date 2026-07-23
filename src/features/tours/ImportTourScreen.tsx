import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useCreateImportedTour, useParseTour } from '@/features/tours/queries';
import {
  resolveImportStop,
  resolveImportStopByAddress,
  type ImportStop,
  type ParsedTour,
  type VenueMatchConfidence,
  type VenueMatchSource,
} from '@/features/tours/import';
import { VenueAutocomplete } from '@/features/venues/VenueAutocomplete';
import { formatShowDate } from '@/lib/date';
import { getErrorMessage } from '@/lib/errors';
import { newId } from '@/lib/uuid';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

/** Translucent tint from a hex colour — adapts over light or dark surfaces. */
function withAlpha(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type EditableStop = {
  key: string;
  // Stable client-generated show id, minted once when the row is created and kept
  // across edits/re-taps, so re-submitting the import upserts the same show row
  // (idempotent) instead of duplicating it.
  showId: string;
  date: string;
  venueName: string;
  city: string;
  address: string;
  confidence?: VenueMatchConfidence;
  mapboxPlace?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Where the match came from — 'catalog' gets its own "In your venues" badge. */
  source?: VenueMatchSource;
  /** Set for catalog matches so the created show reuses that exact venue row. */
  venueId?: string | null;
  /** Business name Mapbox lists at a resolved address, offered to adopt. */
  mapboxName?: string | null;
  resolving?: boolean;
  /** Matched stops collapse to a compact row; expand to edit them. */
  expanded?: boolean;
};

let stopCounter = 0;
function makeStop(partial: Partial<EditableStop> = {}): EditableStop {
  stopCounter += 1;
  return {
    key: `stop-${stopCounter}`,
    showId: newId(),
    date: '',
    venueName: '',
    city: '',
    address: '',
    ...partial,
  };
}

function isValidStop(stop: EditableStop): stop is EditableStop & { date: string } {
  return (
    ISO_DATE.test(stop.date) &&
    !Number.isNaN(Date.parse(stop.date)) &&
    stop.venueName.trim().length > 0 &&
    stop.city.trim().length > 0
  );
}

function toEditable(parsed: ParsedTour): EditableStop[] {
  return parsed.stops.map((stop) =>
    makeStop({ date: stop.date ?? '', venueName: stop.venueName, city: stop.city }),
  );
}

function matchBadge(stop: EditableStop): {
  label: string;
  tone: 'ok' | 'warn' | 'bad' | 'busy' | 'idle';
  detail: string;
} | null {
  if (stop.resolving) {
    return {
      label: 'Looking up…',
      tone: 'busy',
      detail: 'Searching Mapbox for this venue name in the city above.',
    };
  }
  if (!isValidStop(stop)) return null;

  switch (stop.confidence) {
    case 'confirmed':
      if (stop.source === 'catalog') {
        return {
          label: 'In your venues',
          tone: 'ok',
          detail: `Reused a venue you've saved before in ${stop.mapboxPlace || stop.city}.`,
        };
      }
      if (stop.source === 'address') {
        return {
          label: 'Located by address',
          tone: 'ok',
          detail: stop.mapboxName
            ? `Pinned from the address — Mapbox lists it as "${stop.mapboxName}".`
            : `Pinned from the address in ${stop.mapboxPlace || stop.city}.`,
        };
      }
      return {
        label: 'Matched',
        tone: 'ok',
        detail: stop.address
          ? `Found on map in ${stop.mapboxPlace || stop.city}: ${stop.address}`
          : `Found on map in ${stop.mapboxPlace || stop.city}.`,
      };
    case 'needs_review':
      return {
        label: 'Needs review',
        tone: 'warn',
        detail: stop.mapboxPlace
          ? `Mapbox suggested "${stop.mapboxPlace}" — tap the Map target to pick the right place, or add a street address.`
          : 'Match is uncertain — tap the Map target to search, or add a street address.',
      };
    case 'unresolved':
      return {
        label: 'Not found',
        tone: 'bad',
        detail:
          'No Mapbox hit for this venue + city. Tap the Map target to search, or type a street address.',
      };
    default:
      return {
        label: 'Not checked',
        tone: 'idle',
        detail: 'Edit venue or city, then tap away to look it up — or tap the Map target to search.',
      };
  }
}

function badgeStyles(
  tone: 'ok' | 'warn' | 'bad' | 'busy' | 'idle',
  styles: ReturnType<typeof createStyles>,
) {
  switch (tone) {
    case 'ok':
      return { wrap: styles.badgeOk, text: 'success' as const };
    case 'warn':
      return { wrap: styles.badgeWarn, text: 'warning' as const };
    case 'bad':
      return { wrap: styles.badgeBad, text: 'danger' as const };
    case 'busy':
      return { wrap: styles.badgeBusy, text: 'textMuted' as const };
    default:
      return { wrap: styles.badgeIdle, text: 'textMuted' as const };
  }
}

function stopCardStyle(stop: EditableStop, styles: ReturnType<typeof createStyles>) {
  if (stop.resolving || !isValidStop(stop)) return styles.stopCard;
  if (stop.confidence === 'needs_review') return [styles.stopCard, styles.stopNeedsReview];
  if (stop.confidence === 'unresolved') return [styles.stopCard, styles.stopUnresolved];
  return styles.stopCard;
}

/** A confirmed, valid stop — rendered as a compact row (collapsible) once matched. */
function isMatched(stop: EditableStop): boolean {
  return !stop.resolving && isValidStop(stop) && stop.confidence === 'confirmed';
}

// Shift the year of an ISO date, preserving month/day (clamps Feb 29 in a
// non-leap target year). Leaves non-ISO/blank dates untouched.
function shiftDateYear(date: string, delta: number): string {
  if (!ISO_DATE.test(date)) return date;
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year + delta, month - 1, day));
  // Overflow (e.g. Feb 29 -> Mar 1) means the day doesn't exist that year; clamp.
  if (target.getUTCMonth() !== month - 1) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

// The distinct years currently across the valid stop dates, sorted.
function yearsInStops(stops: EditableStop[]): number[] {
  const years = new Set<number>();
  for (const stop of stops) {
    if (ISO_DATE.test(stop.date)) years.add(Number(stop.date.slice(0, 4)));
  }
  return [...years].sort((a, b) => a - b);
}

export function ImportTourScreen() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const router = useRouter();
  const parse = useParseTour();
  const create = useCreateImportedTour();

  // The act is chosen up front (in AddTourScreen) and locked here, so the AI
  // prompt only extracts venues and dates and the tour ties to that exact act.
  const { act, actId } = useLocalSearchParams<{ act?: string; actId?: string }>();
  const actName = (act ?? '').trim();

  const [rawText, setRawText] = useState('');
  const [phase, setPhase] = useState<'input' | 'review'>('input');
  const [tourTitle, setTourTitle] = useState('');
  const [stops, setStops] = useState<EditableStop[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Stable tour id for this import session, minted once when a parse produces the
  // review list. Reused across re-taps (e.g. after a failed/lost-ack commit) so the
  // idempotent RPC converges to a single tour instead of creating a duplicate.
  const tourIdRef = useRef<string | null>(null);

  const resolveStop = useCallback(async (key: string, stop: EditableStop) => {
    if (!isValidStop(stop)) return;

    setStops((prev) =>
      prev.map((s) => (s.key === key ? { ...s, resolving: true } : s)),
    );

    try {
      const resolved = await resolveImportStop(
        stop.venueName,
        stop.city,
        stop.address || null,
      );
      setStops((prev) =>
        prev.map((s) =>
          s.key === key
            ? {
                ...s,
                confidence: resolved.confidence,
                mapboxPlace: resolved.mapboxPlace,
                country: resolved.country,
                latitude: resolved.latitude,
                longitude: resolved.longitude,
                source: resolved.source,
                venueId: resolved.venueId,
                mapboxName: null,
                // Keep a user-typed street; only fill when empty.
                address: s.address.trim() ? s.address : (resolved.address ?? ''),
                resolving: false,
              }
            : s,
        ),
      );
    } catch {
      setStops((prev) =>
        prev.map((s) =>
          s.key === key
            ? { ...s, confidence: 'unresolved', source: 'none', venueId: null, resolving: false }
            : s,
        ),
      );
    }
  }, []);

  // Manual fallback: geocode the typed street address directly, pin it, and
  // surface the business name Mapbox lists there. Leaves the venue name alone.
  const resolveStopByAddress = useCallback(async (key: string, stop: EditableStop) => {
    setStops((prev) => prev.map((s) => (s.key === key ? { ...s, resolving: true } : s)));
    try {
      const resolved = await resolveImportStopByAddress(stop.address, stop.city);
      setStops((prev) =>
        prev.map((s) =>
          s.key === key
            ? {
                ...s,
                confidence: resolved.confidence,
                mapboxPlace: resolved.mapboxPlace,
                country: resolved.country,
                latitude: resolved.latitude,
                longitude: resolved.longitude,
                source: resolved.source,
                venueId: resolved.venueId,
                mapboxName: resolved.mapboxName ?? null,
                address: resolved.address ?? s.address,
                // Keep the card open so the located business name stays reviewable
                // instead of collapsing the moment it's confirmed.
                expanded: resolved.source === 'address' ? true : s.expanded,
                resolving: false,
              }
            : s,
        ),
      );
    } catch {
      setStops((prev) => prev.map((s) => (s.key === key ? { ...s, resolving: false } : s)));
    }
  }, []);

  const resolveAllStops = useCallback(
    async (list: EditableStop[]) => {
      await Promise.all(
        list.filter(isValidStop).map((stop) => resolveStop(stop.key, stop)),
      );
    },
    [resolveStop],
  );

  const onParse = async () => {
    setError(null);
    try {
      const parsed = await parse.mutateAsync(rawText);
      // Act is already chosen; only adopt the parsed title.
      setTourTitle(parsed.tourTitle ?? '');
      const editable = toEditable(parsed);
      setStops(editable);
      // Fresh import session -> fresh stable tour id (distinct from any earlier attempt).
      tourIdRef.current = newId();
      setPhase('review');
      void resolveAllStops(editable);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const updateStop = (key: string, patch: Partial<EditableStop>) => {
    setStops((prev) => prev.map((stop) => (stop.key === key ? { ...stop, ...patch } : stop)));
  };

  const toggleExpand = (key: string) =>
    setStops((prev) =>
      prev.map((stop) => (stop.key === key ? { ...stop, expanded: !stop.expanded } : stop)),
    );

  const reResolveStop = useCallback(
    (key: string) => {
      setStops((prev) => {
        const stop = prev.find((s) => s.key === key);
        if (stop && isValidStop(stop)) void resolveStop(key, stop);
        return prev;
      });
    },
    [resolveStop],
  );

  // Address field blur: if a street was typed, locate by that address; otherwise
  // fall back to the normal venue-name lookup.
  const onAddressBlur = useCallback(
    (key: string) => {
      setStops((prev) => {
        const stop = prev.find((s) => s.key === key);
        if (!stop) return prev;
        if (stop.address.trim() && stop.city.trim()) void resolveStopByAddress(key, stop);
        else if (isValidStop(stop)) void resolveStop(key, stop);
        return prev;
      });
    },
    [resolveStop, resolveStopByAddress],
  );

  const removeStop = (key: string) => setStops((prev) => prev.filter((stop) => stop.key !== key));
  const addStop = () => setStops((prev) => [...prev, makeStop()]);
  const shiftAllYears = (delta: number) =>
    setStops((prev) => prev.map((stop) => ({ ...stop, date: shiftDateYear(stop.date, delta) })));

  const years = yearsInStops(stops);
  const yearLabel =
    years.length === 0
      ? null
      : years.length === 1
        ? String(years[0])
        : `${years[0]}–${years[years.length - 1]}`;

  const validStops = stops.filter(isValidStop);
  const skipped = stops.length - validStops.length;
  const needsAttention = validStops.filter(
    (stop) => stop.confidence === 'needs_review' || stop.confidence === 'unresolved',
  ).length;
  const stillResolving = validStops.some((stop) => stop.resolving);
  const canCreate = actName.trim().length > 0 && validStops.length > 0;

  const onCreate = async () => {
    setError(null);
    // Reuse the session's stable ids so a re-tap after a failed/lost-ack commit converges to one
    // tour + set of shows (the RPC upserts on these ids) rather than duplicating.
    const tourId = (tourIdRef.current ??= newId());
    const payloadStops: ImportStop[] = validStops.map((stop) => ({
      id: stop.showId,
      date: stop.date,
      venueName: stop.venueName.trim(),
      city: stop.city.trim(),
      country: stop.country ?? null,
      address: stop.address.trim() || null,
      latitude: stop.latitude ?? null,
      longitude: stop.longitude ?? null,
      confidence: stop.confidence,
      venueId: stop.venueId ?? null,
    }));
    try {
      const { id } = await create.mutateAsync({
        id: tourId,
        actName: actName.trim(),
        actId: actId ?? null,
        tourTitle: tourTitle.trim() || null,
        stops: payloadStops,
      });
      router.replace({ pathname: '/tours/[id]', params: { id } });
    } catch (err) {
      setError(getErrorMessage(err));
    }
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
          {phase === 'input' ? (
            <>
              <Text variant="title">Import a tour</Text>
              {!!actName && (
                <View style={styles.lockedAct}>
                  <Text variant="caption" color="textMuted">
                    Act
                  </Text>
                  <Text variant="body" style={styles.lockedActName}>
                    {actName}
                  </Text>
                </View>
              )}
              <Text color="textMuted">
                Paste tour dates from a poster, listing, or email. We&apos;ll pull out the venues and
                dates for you to review before saving.
              </Text>

              <TextInput
                style={styles.textArea}
                placeholder={
                  'e.g.\nThe Band — Summer 2024 Tour\nJun 12 — Red Rocks, Morrison CO\nJun 14 — The Gorge, George WA'
                }
                placeholderTextColor={colors.textMuted}
                value={rawText}
                onChangeText={setRawText}
                multiline
                textAlignVertical="top"
                autoCapitalize="sentences"
              />

              {!!error && <Text color="danger">{error}</Text>}

              <Button
                title="Parse with AI"
                onPress={onParse}
                loading={parse.isPending}
                disabled={rawText.trim().length === 0}
              />
            </>
          ) : (
            <>
              <Text variant="title">Review import</Text>
              <Text color="textMuted">
                Each stop is checked against Mapbox using venue name + city. Matched stops are
                collapsed below — tap one to edit it. The highlighted stops are the ones that need a
                quick look.
              </Text>

              {needsAttention > 0 ? (
                <View style={styles.attentionBanner}>
                  <Text variant="body" color="warning" style={styles.attentionTitle}>
                    {needsAttention} {needsAttention === 1 ? 'stop needs' : 'stops need'} a look
                  </Text>
                  <Text variant="caption" color="textMuted">
                    Tap the Map target on the venue field to search Mapbox, or add a street address
                    if it isn&apos;t in the database.
                  </Text>
                </View>
              ) : (
                validStops.length > 0 &&
                !stillResolving && (
                  <View style={styles.allClearBanner}>
                    <Text variant="body" color="success" style={styles.attentionTitle}>
                      All {validStops.length} {validStops.length === 1 ? 'stop is' : 'stops are'}{' '}
                      matched
                    </Text>
                  </View>
                )
              )}

              <View style={styles.lockedAct}>
                <Text variant="caption" color="textMuted">
                  Act
                </Text>
                <Text variant="body" style={styles.lockedActName}>
                  {actName}
                </Text>
              </View>
              <TextField
                label="Tour title (optional)"
                value={tourTitle}
                onChangeText={setTourTitle}
              />

              <Text variant="heading">Stops ({stops.length})</Text>

              {yearLabel && (
                <View style={styles.yearCard}>
                  <View style={styles.yearText}>
                    <Text variant="body">Tour year: {yearLabel}</Text>
                    <Text variant="caption" color="textMuted">
                      Undated text can guess the wrong year. Shift every date if needed.
                    </Text>
                  </View>
                  <View style={styles.yearButtons}>
                    <Text
                      variant="body"
                      color="primary"
                      style={styles.yearStep}
                      onPress={() => shiftAllYears(-1)}
                    >
                      −1
                    </Text>
                    <Text
                      variant="body"
                      color="primary"
                      style={styles.yearStep}
                      onPress={() => shiftAllYears(1)}
                    >
                      +1
                    </Text>
                  </View>
                </View>
              )}

              {stops.map((stop, index) => {
                const invalid = !isValidStop(stop);
                const badge = matchBadge(stop);
                const badgeTone = badge ? badgeStyles(badge.tone, styles) : null;

                // Matched stops collapse to a single tidy row so attention lands
                // on the ones that still need work. Tap to expand and edit.
                if (isMatched(stop) && !stop.expanded) {
                  return (
                    <Pressable
                      key={stop.key}
                      style={({ pressed }) => [styles.matchedRow, pressed && styles.matchedRowPressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${stop.venueName}`}
                      onPress={() => toggleExpand(stop.key)}
                    >
                      <View style={styles.matchedCheck}>
                        <Text style={styles.matchedCheckMark}>✓</Text>
                      </View>
                      <View style={styles.matchedInfo}>
                        <Text variant="body" numberOfLines={1} style={styles.matchedVenue}>
                          {stop.venueName}
                        </Text>
                        <Text variant="caption" color="textMuted" numberOfLines={1}>
                          {formatShowDate(stop.date)} · {stop.mapboxPlace || stop.city}
                        </Text>
                      </View>
                      <Text variant="caption" color="primary">
                        Edit ›
                      </Text>
                    </Pressable>
                  );
                }

                return (
                  <View key={stop.key} style={stopCardStyle(stop, styles)}>
                    <View style={styles.stopHeader}>
                      <Text variant="caption" color="textMuted">
                        Stop {index + 1}
                      </Text>
                      <View style={styles.stopHeaderActions}>
                        {isMatched(stop) && (
                          <Text
                            variant="caption"
                            color="primary"
                            onPress={() => toggleExpand(stop.key)}
                          >
                            Collapse
                          </Text>
                        )}
                        <Text variant="caption" color="danger" onPress={() => removeStop(stop.key)}>
                          Remove
                        </Text>
                      </View>
                    </View>

                    {badge && badgeTone && (
                      <View style={[styles.badge, badgeTone.wrap]}>
                        <Text variant="caption" color={badgeTone.text} style={styles.badgeLabel}>
                          {badge.label}
                        </Text>
                        <Text variant="caption" color="textMuted">
                          {badge.detail}
                        </Text>
                      </View>
                    )}

                    <TextField
                      label="Date (YYYY-MM-DD)"
                      value={stop.date}
                      onChangeText={(value) => updateStop(stop.key, { date: value })}
                      placeholder="2024-06-12"
                      autoCapitalize="none"
                      error={stop.date && !ISO_DATE.test(stop.date) ? 'Use YYYY-MM-DD' : undefined}
                    />
                    <TextField
                      label="City"
                      value={stop.city}
                      onChangeText={(value) =>
                        updateStop(stop.key, {
                          city: value,
                          confidence: undefined,
                          source: undefined,
                          venueId: null,
                          mapboxName: null,
                          latitude: null,
                          longitude: null,
                        })
                      }
                      onBlur={() => reResolveStop(stop.key)}
                      autoCapitalize="words"
                    />
                    <VenueAutocomplete
                      label="Venue"
                      placeholder="Venue name"
                      cityContext={stop.city}
                      value={stop.venueName}
                      onChangeText={(value) =>
                        updateStop(stop.key, {
                          venueName: value,
                          confidence: undefined,
                          source: undefined,
                          venueId: null,
                          mapboxName: null,
                          latitude: null,
                          longitude: null,
                        })
                      }
                      onBlur={() => reResolveStop(stop.key)}
                      onSelectVenue={({ name, city, address, latitude, longitude }) => {
                        updateStop(stop.key, {
                          venueName: name,
                          // Explicit Mapbox pick wins — update city from the chosen place.
                          city: city.trim() || stop.city,
                          address: address ?? stop.address,
                          latitude: latitude ?? null,
                          longitude: longitude ?? null,
                          confidence:
                            latitude != null && longitude != null ? 'confirmed' : 'needs_review',
                          source: 'mapbox',
                          venueId: null,
                          mapboxName: null,
                          mapboxPlace: city || stop.mapboxPlace,
                          resolving: false,
                        });
                      }}
                    />
                    <TextField
                      label="Street address"
                      placeholder="No venue match? Type the address to locate it"
                      value={stop.address}
                      onChangeText={(value) =>
                        updateStop(stop.key, { address: value, confidence: undefined })
                      }
                      onBlur={() => onAddressBlur(stop.key)}
                      autoCapitalize="words"
                    />
                    {!!stop.mapboxName && stop.mapboxName.trim() !== stop.venueName.trim() && (
                      <Pressable
                        onPress={() => updateStop(stop.key, { venueName: stop.mapboxName ?? '' })}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.adoptRow, pressed && styles.adoptRowPressed]}
                      >
                        <Text variant="caption" color="textMuted">
                          Mapbox lists this address as{' '}
                          <Text variant="caption" weight="semibold">
                            {stop.mapboxName}
                          </Text>
                        </Text>
                        <Text variant="caption" color="primary" weight="semibold">
                          Use name
                        </Text>
                      </Pressable>
                    )}
                    {invalid && (
                      <Text variant="caption" color="textMuted">
                        Needs a valid date, venue, and city to be saved.
                      </Text>
                    )}
                  </View>
                );
              })}

              <Button title="Add stop" variant="secondary" onPress={addStop} />

              {skipped > 0 && (
                <Text variant="caption" color="textMuted">
                  {skipped} incomplete {skipped === 1 ? 'stop' : 'stops'} will be skipped.
                </Text>
              )}

              {!!error && <Text color="danger">{error}</Text>}

              <Button
                title={`Create tour with ${validStops.length} ${
                  validStops.length === 1 ? 'show' : 'shows'
                }`}
                onPress={onCreate}
                loading={create.isPending || stillResolving}
                disabled={!canCreate}
              />
              <Text variant="body" color="primary" style={styles.startOver} onPress={() => setPhase('input')}>
                Start over
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
  textArea: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  lockedAct: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  lockedActName: {
    fontWeight: '600',
  },
  attentionBanner: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: withAlpha(colors.warning, 0.55),
    borderRadius: radius.md,
    backgroundColor: withAlpha(colors.warning, 0.12),
  },
  allClearBanner: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: withAlpha(colors.success, 0.5),
    borderRadius: radius.md,
    backgroundColor: withAlpha(colors.success, 0.12),
  },
  attentionTitle: {
    fontWeight: '700',
  },
  yearCard: {
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
  yearText: {
    flex: 1,
    gap: 2,
  },
  yearButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  yearStep: {
    minWidth: 36,
    textAlign: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    fontWeight: '700',
  },
  stopCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  stopNeedsReview: {
    borderColor: withAlpha(colors.warning, 0.55),
    borderLeftWidth: 3,
    backgroundColor: withAlpha(colors.warning, 0.1),
  },
  stopUnresolved: {
    borderColor: withAlpha(colors.danger, 0.55),
    borderLeftWidth: 3,
    backgroundColor: withAlpha(colors.danger, 0.1),
  },
  badge: {
    gap: 2,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  badgeLabel: {
    fontWeight: '700',
  },
  badgeOk: {
    backgroundColor: withAlpha(colors.success, 0.14),
  },
  badgeWarn: {
    backgroundColor: withAlpha(colors.warning, 0.16),
  },
  badgeBad: {
    backgroundColor: withAlpha(colors.danger, 0.16),
  },
  badgeBusy: {
    backgroundColor: colors.surfaceMuted,
  },
  badgeIdle: {
    backgroundColor: colors.surfaceMuted,
  },
  stopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stopHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  matchedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  matchedRowPressed: {
    opacity: 0.6,
  },
  adoptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: withAlpha(colors.primary, 0.06),
  },
  adoptRowPressed: {
    opacity: 0.6,
  },
  matchedCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.success, 0.16),
  },
  matchedCheckMark: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
  matchedInfo: {
    flex: 1,
    gap: 1,
  },
  matchedVenue: {
    fontWeight: '600',
  },
  startOver: {
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  });
