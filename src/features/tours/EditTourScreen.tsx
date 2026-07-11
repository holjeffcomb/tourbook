import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TourForm } from '@/features/tours/TourForm';
import { useMyMembership, useTour, useUpdateTour } from '@/features/tours/queries';
import type { CreateTourValues } from '@/features/tours/schema';
import { colors, spacing } from '@/theme';

export function EditTourScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tourQuery = useTour(id);
  const membershipQuery = useMyMembership(id);
  const updateTour = useUpdateTour(id);

  if (tourQuery.isLoading || membershipQuery.isLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (tourQuery.isError || !tourQuery.data) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text color="danger">Couldn&apos;t load this tour.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const tour = tourQuery.data;
  const defaultValues: CreateTourValues = {
    actName: tour.act.name,
    role: membershipQuery.data?.role ?? '',
    title: tour.title ?? '',
    startDate: tour.start_date,
    endDate: tour.end_date,
  };

  return (
    <TourForm
      title="Edit tour"
      submitLabel="Save changes"
      defaultValues={defaultValues}
      onSubmit={async (values) => {
        await updateTour.mutateAsync(values);
        router.back();
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
