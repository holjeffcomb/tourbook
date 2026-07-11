import { useLocalSearchParams, useRouter } from 'expo-router';
import { ShowForm } from '@/features/shows/ShowForm';
import { useCreateShow } from '@/features/shows/queries';

export function AddShowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const createShow = useCreateShow(id);

  return (
    <ShowForm
      title="Add show"
      submitLabel="Add show"
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
