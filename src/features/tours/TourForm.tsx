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
import { ActAutocomplete } from '@/features/acts/ActAutocomplete';
import { createTourSchema, type CreateTourValues } from '@/features/tours/schema';
import { spacing } from '@/theme';

type Props = {
  title: string;
  submitLabel: string;
  defaultValues: CreateTourValues;
  onSubmit: (values: CreateTourValues) => Promise<void>;
};

export function TourForm({ title, submitLabel, defaultValues, onSubmit }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<CreateTourValues>({
    resolver: zodResolver(createTourSchema),
    defaultValues,
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Something went wrong');
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
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text variant="title">{title}</Text>

          <Controller
            control={control}
            name="actName"
            render={({ field, fieldState }) => (
              <ActAutocomplete
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="role"
            render={({ field, fieldState }) => (
              <TextField
                label="Your role (optional)"
                placeholder="e.g. FOH, Lighting, Drummer"
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
            name="title"
            render={({ field, fieldState }) => (
              <TextField
                label="Title (optional)"
                placeholder="e.g. Summer 2019 Run"
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="startDate"
            render={({ field, fieldState }) => (
              <DateField
                label="Start date (optional)"
                clearable
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="endDate"
            render={({ field, fieldState }) => (
              <DateField
                label="End date (optional)"
                clearable
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />

          {!!formError && <Text color="danger">{formError}</Text>}

          <Button title={submitLabel} onPress={submit} loading={formState.isSubmitting} />
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
});
