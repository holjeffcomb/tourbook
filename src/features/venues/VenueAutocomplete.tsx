import { AutocompleteField } from '@/components/AutocompleteField';
import { useVenueSearch } from '@/features/venues/queries';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  error?: string;
  onSelectVenue: (venue: { name: string; city: string }) => void;
};

export function VenueAutocomplete({ value, onChangeText, onBlur, error, onSelectVenue }: Props) {
  const debounced = useDebouncedValue(value, 250);
  const { data } = useVenueSearch(debounced);

  const suggestions = (data ?? []).map((venue) => ({
    id: venue.id,
    label: venue.name,
    sublabel: venue.city,
  }));

  return (
    <AutocompleteField
      label="Venue"
      placeholder="e.g. Red Rocks Amphitheatre"
      value={value}
      onChangeText={onChangeText}
      onBlur={onBlur}
      error={error}
      suggestions={suggestions}
      onSelect={(suggestion) =>
        onSelectVenue({ name: suggestion.label, city: suggestion.sublabel ?? '' })
      }
    />
  );
}
