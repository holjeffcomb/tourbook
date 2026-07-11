import { useRouter } from 'expo-router';
import { TourForm } from '@/features/tours/TourForm';
import { useCreateTour } from '@/features/tours/queries';

export function CreateTourScreen() {
  const router = useRouter();
  const createTour = useCreateTour();

  return (
    <TourForm
      title="New tour"
      submitLabel="Create tour"
      defaultValues={{ actName: '', role: '', title: '', startDate: null, endDate: null }}
      onSubmit={async (values) => {
        await createTour.mutateAsync(values);
        router.back();
      }}
    />
  );
}
