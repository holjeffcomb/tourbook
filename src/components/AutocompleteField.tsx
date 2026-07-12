import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing } from '@/theme';

export type Suggestion = { id: string; label: string; sublabel?: string };

type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  suggestions: Suggestion[];
  onSelect: (suggestion: Suggestion) => void;
};

export function AutocompleteField({
  label,
  value,
  onChangeText,
  onBlur,
  error,
  placeholder,
  autoCapitalize = 'words',
  suggestions,
  onSelect,
}: Props) {
  const [focused, setFocused] = useState(false);
  // Blur fires before a suggestion's press; defer hiding so the tap registers.
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always show suggestions while focused so the user can confirm a pick
  // (e.g. "MTELUS" with one Mapbox hit still needs a tap to lock in coords).
  const showList = focused && suggestions.length > 0;

  return (
    <View style={styles.container}>
      <TextField
        label={label}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          if (blurTimeout.current) clearTimeout(blurTimeout.current);
          setFocused(true);
        }}
        onBlur={() => {
          blurTimeout.current = setTimeout(() => setFocused(false), 150);
          onBlur?.();
        }}
        error={error}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
      />

      {showList && (
        <View style={styles.list}>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.id}
              onPress={() => {
                if (blurTimeout.current) clearTimeout(blurTimeout.current);
                setFocused(false);
                onSelect(suggestion);
              }}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <Text>{suggestion.label}</Text>
              {!!suggestion.sublabel && (
                <Text variant="caption" color="textMuted">
                  {suggestion.sublabel}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  item: {
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemPressed: {
    backgroundColor: colors.surface,
  },
});
