import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useCreateShow } from '@/features/shows/queries';
import { createShowSchema, type CreateShowValues } from '@/features/shows/schema';
import { spacing } from '@/theme';

export function AddShowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const createShow = useCreateShow(id);
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<CreateShowValues>({
    resolver: zodResolver(createShowSchema),
    defaultValues: { date: '', venueName: '', venueCity: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createShow.mutateAsync(values);
      router.back();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to add show');
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
        <Text variant="title">Add show</Text>

        <Controller
          control={control}
          name="date"
          render={({ field, fieldState }) => (
            <TextField
              label="Date"
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="venueName"
          render={({ field, fieldState }) => (
            <TextField
              label="Venue"
              placeholder="e.g. Red Rocks Amphitheatre"
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
          name="venueCity"
          render={({ field, fieldState }) => (
            <TextField
              label="City"
              placeholder="e.g. Morrison, CO"
              autoCapitalize="words"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />

        {!!formError && <Text color="danger">{formError}</Text>}

        <Button title="Add show" onPress={onSubmit} loading={formState.isSubmitting} />
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
