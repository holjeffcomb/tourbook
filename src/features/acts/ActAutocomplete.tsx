import { AutocompleteField } from '@/components/AutocompleteField';
import { useActSearch } from '@/features/acts/queries';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  error?: string;
};

export function ActAutocomplete({ value, onChangeText, onBlur, error }: Props) {
  const debounced = useDebouncedValue(value, 250);
  const { data } = useActSearch(debounced);

  const suggestions = (data ?? []).map((act) => ({ id: act.id, label: act.name }));

  return (
    <AutocompleteField
      label="Act"
      placeholder="Who did you tour with?"
      value={value}
      onChangeText={onChangeText}
      onBlur={onBlur}
      error={error}
      suggestions={suggestions}
      onSelect={(suggestion) => onChangeText(suggestion.label)}
    />
  );
}
