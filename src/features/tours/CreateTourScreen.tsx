import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useCreateTour } from '@/features/tours/queries';
import { createTourSchema, type CreateTourValues } from '@/features/tours/schema';
import { spacing } from '@/theme';

export function CreateTourScreen() {
  const router = useRouter();
  const createTour = useCreateTour();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<CreateTourValues>({
    resolver: zodResolver(createTourSchema),
    defaultValues: { actName: '', role: '', title: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createTour.mutateAsync(values);
      router.back();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to create tour');
    }
  });

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Cancel
        </Text>
      </View>

      <View style={styles.form}>
        <Text variant="title">New tour</Text>

        <Controller
          control={control}
          name="actName"
          render={({ field, fieldState }) => (
            <TextField
              label="Act"
              placeholder="Who did you tour with?"
              autoCapitalize="words"
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

        {!!formError && <Text color="danger">{formError}</Text>}

        <Button title="Create tour" onPress={onSubmit} loading={formState.isSubmitting} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    paddingTop: spacing.md,
  },
  form: {
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
});
