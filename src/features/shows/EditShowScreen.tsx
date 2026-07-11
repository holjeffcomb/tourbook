import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { ShowForm } from '@/features/shows/ShowForm';
import { useDeleteShow, useShow, useUpdateShow } from '@/features/shows/queries';
import type { CreateShowValues } from '@/features/shows/schema';
import { colors, spacing } from '@/theme';

export function EditShowScreen() {
  const { id, showId } = useLocalSearchParams<{ id: string; showId: string }>();
  const router = useRouter();
  const showQuery = useShow(showId);
  const updateShow = useUpdateShow(id, showId);
  const deleteShow = useDeleteShow(id);

  if (showQuery.isLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (showQuery.isError || !showQuery.data) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text color="danger">Couldn&apos;t load this show.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const show = showQuery.data;
  const defaultValues: CreateShowValues = {
    date: show.date,
    venueName: show.venue.name,
    venueCity: show.venue.city,
    latitude: show.venue.latitude,
    longitude: show.venue.longitude,
    address: show.venue.address,
  };

  const confirmDelete = () => {
    Alert.alert('Delete show', 'This removes the show. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteShow.mutateAsync(showId);
            router.back();
          } catch (error) {
            Alert.alert('Error', error instanceof Error ? error.message : 'Unable to delete show');
          }
        },
      },
    ]);
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
