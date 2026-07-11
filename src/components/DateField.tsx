import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { dateToISO, formatShowDate, isoToDate } from '@/lib/date';
import { colors, radius, spacing } from '@/theme';

type Props = {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
  clearable?: boolean;
  placeholder?: string;
};

export function DateField({
  label,
  value,
  onChange,
  error,
  clearable = false,
  placeholder = 'Select a date',
}: Props) {
  const [open, setOpen] = useState(false);
  const pickerValue = value ? isoToDate(value) : new Date();

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        {clearable && !!value && (
          <Text variant="caption" color="primary" onPress={() => onChange(null)}>
            Clear
          </Text>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={[styles.field, !!error && styles.fieldError]}
      >
        <Text color={value ? 'text' : 'textMuted'}>
          {value ? formatShowDate(value) : placeholder}
        </Text>
      </Pressable>

      {!!error && (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      )}

      {open && (
        <View style={styles.picker}>
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onValueChange={(_event, selected) => {
              // iOS spinner updates live; Android fires once on confirm.
              onChange(dateToISO(selected));
              if (Platform.OS === 'android') setOpen(false);
            }}
            onDismiss={() => setOpen(false)}
          />
          {Platform.OS === 'ios' && (
            <Button
              title="Done"
              variant="secondary"
              onPress={() => {
                if (!value) onChange(dateToISO(pickerValue));
                setOpen(false);
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  field: {
    height: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  fieldError: {
    borderColor: colors.danger,
  },
  picker: {
    gap: spacing.sm,
  },
});
