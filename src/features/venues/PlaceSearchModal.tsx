import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '@/components/Text';
import { usePlaceSuggestions, useVenueSuggestions } from '@/features/venues/queries';
import type { VenueSuggestion } from '@/features/venues/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import {
  isMapboxConfigured,
  makeSessionToken,
  retrievePlace,
  type PlaceSuggestion,
} from '@/lib/mapbox';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

export type PlaceSearchResult = {
  name: string;
  city: string;
  address: string | null;
  // Existing venues from our catalog may predate geocoding and lack coordinates.
  latitude: number | null;
  longitude: number | null;
  /** Set when the result is an existing catalog venue (null for fresh Mapbox hits). */
  id?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (place: PlaceSearchResult) => void;
  /** Prefill the search box (current venue name). */
  initialQuery?: string;
  /** Bias results toward this city. */
  cityContext?: string;
  title?: string;
};

export function PlaceSearchModal({
  visible,
  onClose,
  onSelect,
  initialQuery = '',
  cityContext,
  title = 'Find on Mapbox',
}: Props) {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const sessionToken = useRef(makeSessionToken());
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  // Search immediately with the opening query; debounce only subsequent typing.
  const [immediateTerm, setImmediateTerm] = useState('');
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const debounced = useDebouncedValue(query, 250);
  const searchTerm =
    immediateTerm && query.trim() === immediateTerm ? immediateTerm : debounced.trim();

  const { data, isFetching, isError, error, isFetched } = usePlaceSuggestions(
    searchTerm,
    sessionToken.current,
    cityContext,
    visible,
  );

  // Existing venues from our own catalog, shown first so people reuse them.
  const venueMatches = useVenueSuggestions(searchTerm, cityContext, visible).data ?? [];

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setImmediateTerm('');
      setPickingId(null);
      setPickError(null);
      return;
    }
    const starter = initialQuery.trim();
    setQuery(starter);
    setImmediateTerm(starter);
    setPickingId(null);
    setPickError(null);
    sessionToken.current = makeSessionToken();
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [visible, initialQuery]);

  const suggestions = data ?? [];
  const showEmpty =
    visible &&
    isFetched &&
    !isFetching &&
    searchTerm.length >= 2 &&
    suggestions.length === 0 &&
    venueMatches.length === 0 &&
    !isError;

  const handleSelectVenue = (venue: VenueSuggestion) => {
    setPickError(null);
    onSelect({
      id: venue.id,
      name: venue.name,
      city: venue.city || cityContext?.trim() || '',
      address: venue.address,
      latitude: venue.latitude,
      longitude: venue.longitude,
    });
    onClose();
  };

  const handleSelect = async (suggestion: PlaceSuggestion) => {
    setPickError(null);

    // Forward-geocode hits already include coordinates.
    if (
      suggestion.latitude != null &&
      suggestion.longitude != null
    ) {
      onSelect({
        id: null,
        name: suggestion.name,
        city: suggestion.city || cityContext?.trim() || '',
        address: suggestion.address ?? suggestion.placeFormatted ?? null,
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
      });
      onClose();
      return;
    }

    setPickingId(suggestion.mapboxId);
    try {
      const details = await retrievePlace(suggestion.mapboxId, sessionToken.current);
      sessionToken.current = makeSessionToken();
      if (!details || details.latitude == null || details.longitude == null) {
        setPickError('Could not load coordinates for that place. Try another result.');
        setPickingId(null);
        return;
      }
      onSelect({
        id: null,
        name: details.name || suggestion.name,
        city: details.city || cityContext?.trim() || '',
        address: details.address,
        latitude: details.latitude,
        longitude: details.longitude,
      });
      onClose();
    } catch {
      setPickError('Place lookup failed. Check your connection and try again.');
      setPickingId(null);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text variant="body" color="primary" onPress={onClose} style={styles.headerAction}>
            Cancel
          </Text>
          <Text variant="heading" style={styles.headerTitle}>
            {title}
          </Text>
          <View style={styles.headerAction} />
        </View>

        <View style={styles.body}>
          <Text color="textMuted">
            Search Mapbox&apos;s place database
            {cityContext?.trim() ? ` · biased toward ${cityContext.trim()}` : ''}.
          </Text>

          <View style={styles.searchRow}>
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                // Once the user edits, fall back to debounce.
                if (immediateTerm && text.trim() !== immediateTerm) {
                  setImmediateTerm('');
                }
              }}
              placeholder="e.g. Fillmore Auditorium"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>

          {!isMapboxConfigured() && (
            <Text color="danger">Mapbox isn&apos;t configured, so place search is unavailable.</Text>
          )}

          {isError && (
            <Text color="danger">
              {error instanceof Error ? error.message : 'Search failed. Try again.'}
            </Text>
          )}
          {!!pickError && <Text color="danger">{pickError}</Text>}

          {isFetching && suggestions.length === 0 && (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primary} />
              <Text variant="caption" color="textMuted">
                Searching Mapbox…
              </Text>
            </View>
          )}

          {showEmpty && (
            <View style={styles.centered}>
              <Text>No places found</Text>
              <Text variant="caption" color="textMuted" style={styles.emptyHint}>
                Try a shorter name, add the city to the query, or check the spelling.
              </Text>
            </View>
          )}

          {searchTerm.length < 2 && (
            <View style={styles.centered}>
              <Text variant="caption" color="textMuted">
                Type at least 2 characters to search.
              </Text>
            </View>
          )}

          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.mapboxId}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              venueMatches.length > 0 ? (
                <View style={styles.section}>
                  <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
                    Already in Tourbook
                  </Text>
                  {venueMatches.map((venue) => (
                    <Pressable
                      key={venue.id}
                      onPress={() => handleSelectVenue(venue)}
                      disabled={!!pickingId}
                      style={({ pressed }) => [
                        styles.item,
                        styles.venueItem,
                        pressed && styles.itemPressed,
                      ]}
                    >
                      <View style={styles.itemText}>
                        <Text>{venue.name}</Text>
                        <Text variant="caption" color="textMuted">
                          {venue.city}
                          {venue.showCount > 0
                            ? ` · ${venue.showCount} ${venue.showCount === 1 ? 'show' : 'shows'}`
                            : ''}
                        </Text>
                      </View>
                      <Text variant="caption" color="primary">
                        Use
                      </Text>
                    </Pressable>
                  ))}
                  {suggestions.length > 0 && (
                    <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
                      From Mapbox
                    </Text>
                  )}
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const busy = pickingId === item.mapboxId;
              return (
                <Pressable
                  onPress={() => handleSelect(item)}
                  disabled={!!pickingId}
                  style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                >
                  <View style={styles.itemText}>
                    <Text>{item.name}</Text>
                    {!!item.placeFormatted && (
                      <Text variant="caption" color="textMuted">
                        {item.placeFormatted}
                      </Text>
                    )}
                  </View>
                  {busy ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text variant="caption" color="primary">
                      Use
                    </Text>
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerAction: {
    minWidth: 64,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  searchRow: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  searchInput: {
    height: 48,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  list: {
    gap: spacing.xs,
    paddingBottom: spacing.xl,
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingTop: spacing.xs,
  },
  venueItem: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  itemPressed: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  centered: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  emptyHint: {
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
});
