import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { PlaceSearchModal } from '@/features/venues/PlaceSearchModal';
import { isMapboxConfigured } from '@/lib/mapbox';
import { colors, radius, spacing } from '@/theme';

export type SelectedVenue = {
  name: string;
  city: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
  const [modalOpen, setModalOpen] = useState(false);
  const mapboxReady = isMapboxConfigured();

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
            onChangeText={onChangeText}
            onBlur={onBlur}
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

const styles = StyleSheet.create({
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
    backgroundColor: '#EFF6FF',
  },
  searchButtonPressed: {
    backgroundColor: '#DBEAFE',
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
