import { useLocalSearchParams, useRouter } from 'expo-router';
import { TourForm } from '@/features/tours/TourForm';
import { useCreateTour } from '@/features/tours/queries';

export function CreateTourScreen() {
  const router = useRouter();
  const { act, actId } = useLocalSearchParams<{ act?: string; actId?: string }>();
  const createTour = useCreateTour();
  const actName = act ?? '';

  return (
    <TourForm
      title="New tour"
      submitLabel="Create tour"
      lockedActName={actName || undefined}
      defaultValues={{
        actName,
        role: '',
        title: '',
        startDate: null,
        endDate: null,
        visibility: 'private',
      }}
      onSubmit={async (values) => {
        // Queued + optimistic offline; navigate to the new tour immediately using
        // the client-generated id (it syncs on reconnect).
        const id = createTour.submit({ ...values, actId: actId ?? null });
        router.replace({ pathname: '/tours/[id]', params: { id } });
      }}
    />
  );
}
