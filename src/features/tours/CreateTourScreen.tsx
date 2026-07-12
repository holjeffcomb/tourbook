import { useLocalSearchParams, useRouter } from 'expo-router';
import { TourForm } from '@/features/tours/TourForm';
import { useCreateTour } from '@/features/tours/queries';

export function CreateTourScreen() {
  const router = useRouter();
  const { act } = useLocalSearchParams<{ act?: string }>();
  const createTour = useCreateTour();

  return (
    <TourForm
      title="New tour"
      submitLabel="Create tour"
      defaultValues={{
        actName: act ?? '',
        role: '',
        title: '',
        startDate: null,
        endDate: null,
        visibility: 'public',
      }}
      onSubmit={async (values) => {
        const { id } = await createTour.mutateAsync(values);
        // Replace the create form with the new tour's detail.
        router.replace({ pathname: '/tours/[id]', params: { id } });
      }}
    />
  );
}
