import { getOrCreateVenue } from '@/features/venues/api';
import { supabase } from '@/lib/supabase';

export type ShowWithVenue = {
  id: string;
  date: string;
  created_at: string;
  venue: { id: string; name: string; city: string };
};

export async function listShows(tourId: string): Promise<ShowWithVenue[]> {
  const { data, error } = await supabase
    .from('shows')
    .select('id, date, created_at, venue:venues(id, name, city)')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ShowWithVenue[];
}

export type CreateShowInput = {
  userId: string;
  tourId: string;
  date: string;
  venueName: string;
  venueCity: string;
};

export async function createShow(input: CreateShowInput): Promise<{ id: string }> {
  const venueId = await getOrCreateVenue(input.venueName, input.venueCity, input.userId);

  const { data, error } = await supabase
    .from('shows')
    .insert({
      tour_id: input.tourId,
      user_id: input.userId,
      venue_id: venueId,
      date: input.date,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data;
}
