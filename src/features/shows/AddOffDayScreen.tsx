import { useLocalSearchParams, useRouter } from 'expo-router';
import { OffDayForm } from '@/features/shows/OffDayForm';
import { useCreateOffDay, useStops } from '@/features/shows/queries';
import { useTour } from '@/features/tours/queries';

export function AddOffDayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const createOffDay = useCreateOffDay(id);
  const tourQuery = useTour(id);
  const stopsQuery = useStops(id);

  // Anchor the date picker to the tour's range (or its earliest stop) so a new
  // off day doesn't default to today's year and land far outside the tour.
  const dateAnchor =
    tourQuery.data?.start_date ?? tourQuery.data?.end_date ?? stopsQuery.data?.[0]?.date;

  return (
    <OffDayForm
      title="Add off day"
      submitLabel="Add off day"
      dateAnchor={dateAnchor}
      defaultValues={{ date: '', label: '', city: '', latitude: null, longitude: null, address: null }}
      onSubmit={async (values) => {
        // Fire-and-forget: offline the write is queued (optimistically shown) and
        // syncs on reconnect; we navigate back immediately rather than await.
        createOffDay.submit(values);
        router.back();
      }}
    />
  );
}
