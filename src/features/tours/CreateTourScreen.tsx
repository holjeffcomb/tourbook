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
        visibility: 'public',
      }}
      onSubmit={async (values) => {
        const { id } = await createTour.mutateAsync({ ...values, actId: actId ?? null });
        // Replace the create form with the new tour's detail.
        router.replace({ pathname: '/tours/[id]', params: { id } });
      }}
    />
  );
}
