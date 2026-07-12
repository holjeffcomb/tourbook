import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { VenueAutocomplete } from '@/features/venues/VenueAutocomplete';
import { offDaySchema, type OffDayValues } from '@/features/shows/schema';
import { getErrorMessage } from '@/lib/errors';
import { spacing } from '@/theme';

type Props = {
  title: string;
  submitLabel: string;
  defaultValues: OffDayValues;
  onSubmit: (values: OffDayValues) => Promise<void>;
  onDelete?: () => void;
  dateAnchor?: string | null;
};

export function OffDayForm({
  title,
  submitLabel,
  defaultValues,
  onSubmit,
  onDelete,
  dateAnchor,
}: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState, setValue, watch } = useForm<OffDayValues>({
    resolver: zodResolver(offDaySchema),
    defaultValues,
  });

  const offDayCity = watch('city');

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  });

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
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="title">{title}</Text>
          <Text color="textMuted">
            An off day is a travel or rest day with no show. Add a hotel, address, or city to place
            it on the map.
          </Text>

          <Controller
            control={control}
            name="date"
            render={({ field, fieldState }) => (
              <DateField
                label="Date"
                value={field.value || null}
                onChange={(value) => field.onChange(value ?? '')}
                error={fieldState.error?.message}
                anchorDate={dateAnchor}
              />
            )}
          />

          <Controller
            control={control}
            name="city"
            render={({ field, fieldState }) => (
              <TextField
                label="City (optional)"
                placeholder="e.g. Denver, CO"
                autoCapitalize="words"
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="label"
            render={({ field, fieldState }) => (
              <VenueAutocomplete
                label="Place or note (optional)"
                placeholder="e.g. Marriott Downtown, Travel day"
                cityContext={offDayCity}
                value={field.value ?? ''}
                onChangeText={(text) => {
                  field.onChange(text);
                  // Typing after a pick invalidates the picked coordinates; drop
                  // them so the typed city gets geocoded fresh on save.
                  setValue('latitude', null, { shouldDirty: true });
                  setValue('longitude', null, { shouldDirty: true });
                  setValue('address', null, { shouldDirty: true });
                }}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                onSelectVenue={({ name, city, address, latitude, longitude }) => {
                  setValue('label', name, { shouldValidate: true, shouldDirty: true });
                  setValue('city', city || offDayCity || '', {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                  setValue('latitude', latitude ?? null, { shouldDirty: true });
                  setValue('longitude', longitude ?? null, { shouldDirty: true });
                  setValue('address', address ?? null, { shouldDirty: true });
                }}
              />
            )}
          />

          <Controller
            control={control}
            name="address"
            render={({ field, fieldState }) => (
              <TextField
                label="Street address (optional)"
                placeholder="Helps when the place isn't in the map database"
                autoCapitalize="words"
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />

          {!!formError && <Text color="danger">{formError}</Text>}

          <Button title={submitLabel} onPress={submit} loading={formState.isSubmitting} />

          {onDelete && (
            <Text variant="body" color="danger" onPress={onDelete} style={styles.delete}>
              Delete off day
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    paddingTop: spacing.md,
  },
  flex: {
    flex: 1,
  },
  form: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  delete: {
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
});
