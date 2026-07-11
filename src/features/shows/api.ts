import { getOrCreateVenue } from '@/features/venues/api';
import { supabase } from '@/lib/supabase';

export type ShowWithVenue = {
  id: string;
  date: string;
  created_at: string;
  venue: { id: string; name: string; city: string };
};

export type ShowDetail = ShowWithVenue & { tour_id: string };

export async function listShows(tourId: string): Promise<ShowWithVenue[]> {
  const { data, error } = await supabase
    .from('shows')
    .select('id, date, created_at, venue:venues(id, name, city)')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ShowWithVenue[];
}

export async function getShow(showId: string): Promise<ShowDetail> {
  const { data, error } = await supabase
    .from('shows')
    .select('id, date, created_at, tour_id, venue:venues(id, name, city)')
    .eq('id', showId)
    .single();
  if (error) throw error;
  return data as ShowDetail;
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
      created_by: input.userId,
      venue_id: venueId,
      date: input.date,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data;
}

export type UpdateShowInput = {
  userId: string;
  showId: string;
  date: string;
  venueName: string;
  venueCity: string;
};

export async function updateShow(input: UpdateShowInput): Promise<void> {
  const venueId = await getOrCreateVenue(input.venueName, input.venueCity, input.userId);

  const { error } = await supabase
    .from('shows')
    .update({ venue_id: venueId, date: input.date })
    .eq('id', input.showId);

  if (error) throw error;
}

export async function deleteShow(showId: string): Promise<void> {
  const { error } = await supabase.from('shows').delete().eq('id', showId);
  if (error) throw error;
}
