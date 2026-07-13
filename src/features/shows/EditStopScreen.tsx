import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { OffDayForm } from '@/features/shows/OffDayForm';
import { ShowForm } from '@/features/shows/ShowForm';
import { useDeleteStop, useStop, useUpdateOffDay, useUpdateShow } from '@/features/shows/queries';
import type { CreateShowValues, OffDayValues } from '@/features/shows/schema';
import { getErrorMessage } from '@/lib/errors';
import { spacing } from '@/theme';
import { useColors } from '@/theme/ThemeProvider';

export function EditStopScreen() {
  const { id, showId } = useLocalSearchParams<{ id: string; showId: string }>();
  const router = useRouter();
  const colors = useColors();
  const stopQuery = useStop(showId);
  const updateShow = useUpdateShow(id, showId);
  const updateOffDay = useUpdateOffDay(id, showId);
  const deleteStop = useDeleteStop(id);

  if (stopQuery.isLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (stopQuery.isError || !stopQuery.data) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text color="danger">Couldn&apos;t load this stop.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const stop = stopQuery.data;
  const isOff = stop.kind === 'off';

  const confirmDelete = () => {
    Alert.alert(
      isOff ? 'Delete off day' : 'Delete show',
      'This removes it from the tour. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteStop.mutateAsync(showId);
              router.back();
            } catch (error) {
              Alert.alert('Error', getErrorMessage(error, 'Unable to delete'));
            }
          },
        },
      ],
    );
  };

  if (isOff) {
    const defaultValues: OffDayValues = {
      date: stop.date,
      label: stop.label ?? '',
      city: stop.city ?? '',
      latitude: stop.latitude,
      longitude: stop.longitude,
      address: stop.address,
    };
    return (
      <OffDayForm
        title="Edit off day"
        submitLabel="Save changes"
        defaultValues={defaultValues}
        onSubmit={async (values) => {
          await updateOffDay.mutateAsync(values);
          router.back();
        }}
        onDelete={confirmDelete}
      />
    );
  }

  // A city-only show (venue TBD) has no venue row, so fall back to inline fields.
  const defaultValues: CreateShowValues = {
    date: stop.date,
    venueName: stop.venue?.name ?? '',
    venueCity: stop.venue?.city ?? stop.city ?? '',
    latitude: stop.venue?.latitude ?? stop.latitude ?? null,
    longitude: stop.venue?.longitude ?? stop.longitude ?? null,
    address: stop.venue?.address ?? stop.address ?? null,
  };

  return (
    <ShowForm
      title="Edit show"
      submitLabel="Save changes"
      defaultValues={defaultValues}
      onSubmit={async (values) => {
        await updateShow.mutateAsync(values);
        router.back();
      }}
      onDelete={confirmDelete}
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
