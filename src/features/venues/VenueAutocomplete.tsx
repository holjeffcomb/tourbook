import { useRef } from 'react';
import { AutocompleteField } from '@/components/AutocompleteField';
import { usePlaceSuggestions } from '@/features/venues/queries';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { isMapboxConfigured, makeSessionToken, retrievePlace } from '@/lib/mapbox';

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
};

export function VenueAutocomplete({ value, onChangeText, onBlur, error, onSelectVenue }: Props) {
  const sessionToken = useRef(makeSessionToken());
  const debounced = useDebouncedValue(value, 250);
  const { data } = usePlaceSuggestions(debounced, sessionToken.current);

  const suggestions = (data ?? []).map((place) => ({
    id: place.mapboxId,
    label: place.name,
    sublabel: place.placeFormatted,
  }));

  return (
    <AutocompleteField
      label="Venue"
      placeholder={
        isMapboxConfigured() ? 'e.g. Red Rocks Amphitheatre' : 'Enter a venue name'
      }
      value={value}
      onChangeText={onChangeText}
      onBlur={onBlur}
      error={error}
      suggestions={suggestions}
      onSelect={async (suggestion) => {
        onChangeText(suggestion.label);
        try {
          const details = await retrievePlace(suggestion.id, sessionToken.current);
          // Start a fresh billing session after a completed retrieve.
          sessionToken.current = makeSessionToken();
          if (details) {
            onSelectVenue({
              name: details.name || suggestion.label,
              city: details.city,
              address: details.address,
              latitude: details.latitude,
              longitude: details.longitude,
            });
            return;
          }
        } catch {
          // Fall back to the label/context if the coordinate lookup fails.
        }
        onSelectVenue({ name: suggestion.label, city: suggestion.sublabel ?? '' });
      }}
    />
  );
}
