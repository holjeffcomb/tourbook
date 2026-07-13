import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { ActAutocomplete } from '@/features/acts/ActAutocomplete';
import {
  createTourSchema,
  VISIBILITY_OPTIONS,
  type CreateTourValues,
} from '@/features/tours/schema';
import { getErrorMessage } from '@/lib/errors';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

type Props = {
  title: string;
  submitLabel: string;
  defaultValues: CreateTourValues;
  onSubmit: (values: CreateTourValues) => Promise<void>;
  /** When false, hide the visibility picker (e.g. non-creator edits). */
  showVisibility?: boolean;
};

export function TourForm({
  title,
  submitLabel,
  defaultValues,
  onSubmit,
  showVisibility = true,
}: Props) {
  const styles = useThemedStyles(createStyles);
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

          {showVisibility && (
            <Controller
              control={control}
              name="visibility"
              render={({ field }) => (
                <View style={styles.visibility}>
                  <Text variant="caption" color="textMuted">
                    Visibility
                  </Text>
                  <View style={styles.visibilityOptions}>
                    {VISIBILITY_OPTIONS.map((option) => {
                      const selected = field.value === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => field.onChange(option.value)}
                          style={[styles.visibilityOption, selected && styles.visibilitySelected]}
                        >
                          <Text variant="body" color={selected ? 'primary' : 'text'}>
                            {option.label}
                          </Text>
                          <Text variant="caption" color="textMuted">
                            {option.hint}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            />
          )}

          {!!formError && <Text color="danger">{formError}</Text>}

          <Button title={submitLabel} onPress={submit} loading={formState.isSubmitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
  visibility: {
    gap: spacing.sm,
  },
  visibilityOptions: {
    gap: spacing.sm,
  },
  visibilityOption: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  visibilitySelected: {
    borderColor: colors.primary,
  },
});
