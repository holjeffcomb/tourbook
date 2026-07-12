import { useLocalSearchParams, useRouter } from 'expo-router';
import { ShowForm } from '@/features/shows/ShowForm';
import { useCreateShow, useStops } from '@/features/shows/queries';
import { useTour } from '@/features/tours/queries';

export function AddShowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const createShow = useCreateShow(id);
  const tourQuery = useTour(id);
  const stopsQuery = useStops(id);

  // Anchor the date picker to the tour's range (or its earliest stop) so a new
  // stop doesn't default to today's year and land far outside the tour.
  const dateAnchor =
    tourQuery.data?.start_date ?? tourQuery.data?.end_date ?? stopsQuery.data?.[0]?.date;

  return (
    <ShowForm
      title="Add show"
      submitLabel="Add show"
      dateAnchor={dateAnchor}
      defaultValues={{
        date: '',
        venueName: '',
        venueCity: '',
        latitude: null,
        longitude: null,
        address: null,
      }}
      onSubmit={async (values) => {
        await createShow.mutateAsync(values);
        router.back();
      }}
    />
  );
}
