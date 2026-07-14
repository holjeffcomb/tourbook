import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { PlaceSearchModal } from '@/features/venues/PlaceSearchModal';
import { useVenueSuggestions } from '@/features/venues/queries';
import type { VenueSuggestion } from '@/features/venues/api';
import { isMapboxConfigured } from '@/lib/mapbox';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

export type SelectedVenue = {
  name: string;
  city: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Present when the pick is an existing venue from our catalog (not Mapbox). */
  id?: string | null;
};

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  error?: string;
  onSelectVenue: (venue: SelectedVenue) => void;
  /** When set, Mapbox search is biased toward this city. */
  cityContext?: string;
  label?: string;
  placeholder?: string;
};

/** Simple crosshair / nav-target glyph (no icon package required). */
function TargetIcon({ active }: { active?: boolean }) {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const stroke = active ? colors.primary : colors.textMuted;
  return (
    <View style={styles.target}>
      <View style={[styles.targetRing, { borderColor: stroke }]} />
      <View style={[styles.targetDot, { backgroundColor: stroke }]} />
      <View style={[styles.targetArmH, { backgroundColor: stroke }]} />
      <View style={[styles.targetArmV, { backgroundColor: stroke }]} />
    </View>
  );
}

export function VenueAutocomplete({
  value,
  onChangeText,
  onBlur,
  error,
  onSelectVenue,
  cityContext,
  label = 'Venue',
  placeholder,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const [modalOpen, setModalOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  // Hide the dropdown right after a pick so it doesn't reopen on the filled value.
  const [dismissed, setDismissed] = useState(false);
  const mapboxReady = isMapboxConfigured();

  const debouncedValue = useDebouncedValue(value, 250);
  const suggestionsQuery = useVenueSuggestions(
    debouncedValue,
    cityContext,
    focused && !dismissed,
  );
  const suggestions = suggestionsQuery.data ?? [];
  // Don't suggest the exact thing already typed (usually the just-picked venue).
  const filtered = suggestions.filter(
    (s) => s.name.trim().toLowerCase() !== value.trim().toLowerCase(),
  );
  const showSuggestions = focused && !dismissed && filtered.length > 0;

  const pickSuggestion = (venue: VenueSuggestion) => {
    onChangeText(venue.name);
    onSelectVenue({
      id: venue.id,
      name: venue.name,
      city: venue.city,
      address: venue.address,
      latitude: venue.latitude,
      longitude: venue.longitude,
    });
    setDismissed(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.field}>
          <TextField
            label={label}
            placeholder={
              placeholder ??
              (mapboxReady ? 'Type a name, or tap the target to search' : 'Enter a venue name')
            }
            value={value}
            onChangeText={(text) => {
              setDismissed(false);
              onChangeText(text);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              onBlur?.();
            }}
            error={error}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search Mapbox for this place"
          disabled={!mapboxReady}
          onPress={() => setModalOpen(true)}
          style={({ pressed }) => [
            styles.searchButton,
            !mapboxReady && styles.searchButtonDisabled,
            pressed && mapboxReady && styles.searchButtonPressed,
          ]}
        >
          <TargetIcon active={mapboxReady} />
          <Text variant="caption" color={mapboxReady ? 'primary' : 'textMuted'}>
            Map
          </Text>
        </Pressable>
      </View>

      {showSuggestions && (
        <View style={styles.suggestions}>
          {filtered.map((item, index) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              // onPressIn so selection fires before the field's onBlur tears this down.
              onPressIn={() => pickSuggestion(item)}
              style={({ pressed }) => [
                styles.suggestionItem,
                index === filtered.length - 1 && styles.suggestionItemLast,
                pressed && styles.suggestionItemPressed,
              ]}
            >
              <View style={styles.suggestionText}>
                <Text numberOfLines={1}>{item.name}</Text>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {item.city}
                  {item.showCount > 0
                    ? ` · ${item.showCount} ${item.showCount === 1 ? 'show' : 'shows'}`
                    : ''}
                </Text>
              </View>
              <Text variant="caption" color="primary">
                Use
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {mapboxReady ? (
        <Text variant="caption" color="textMuted">
          Tap the target to search Mapbox
          {cityContext?.trim() ? ` near ${cityContext.trim()}` : ''}.
        </Text>
      ) : (
        <Text variant="caption" color="textMuted">
          Mapbox isn&apos;t configured — enter the venue name manually.
        </Text>
      )}

      <PlaceSearchModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        initialQuery={value}
        cityContext={cityContext}
        onSelect={(place) => {
          onChangeText(place.name);
          onSelectVenue({
            id: place.id ?? null,
            name: place.name,
            city: place.city,
            address: place.address,
            latitude: place.latitude,
            longitude: place.longitude,
          });
        }}
      />
    </View>
  );
}

const TARGET = 22;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  field: {
    flex: 1,
  },
  suggestions: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestionItemLast: {
    borderBottomWidth: 0,
  },
  suggestionItemPressed: {
    backgroundColor: colors.primaryMuted,
  },
  suggestionText: {
    flex: 1,
    gap: 2,
  },
  searchButton: {
    marginTop: 22, // align with input under the caption label
    width: 56,
    height: 48,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: colors.primaryMuted,
  },
  searchButtonPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  searchButtonDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  target: {
    width: TARGET,
    height: TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetRing: {
    position: 'absolute',
    width: TARGET,
    height: TARGET,
    borderRadius: TARGET / 2,
    borderWidth: 2,
  },
  targetDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  targetArmH: {
    position: 'absolute',
    width: TARGET,
    height: 2,
  },
  targetArmV: {
    position: 'absolute',
    width: 2,
    height: TARGET,
  },
});
