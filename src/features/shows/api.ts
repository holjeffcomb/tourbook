import { getOrCreateVenue } from '@/features/venues/api';
import { supabase } from '@/lib/supabase';

export type ShowVenue = {
  id: string;
  name: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
};

export type ShowWithVenue = {
  id: string;
  date: string;
  created_at: string;
  created_by: string | null;
  venue: ShowVenue;
};

export type ShowDetail = ShowWithVenue & { tour_id: string; venue: ShowVenue & { address: string | null } };

const venueSelect = 'id, name, city, latitude, longitude';

export async function listShows(tourId: string): Promise<ShowWithVenue[]> {
  const { data, error } = await supabase
    .from('shows')
    .select(`id, date, created_at, created_by, venue:venues(${venueSelect})`)
    .eq('tour_id', tourId)
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ShowWithVenue[];
}

export async function getShow(showId: string): Promise<ShowDetail> {
  const { data, error } = await supabase
    .from('shows')
    .select(`id, date, created_at, created_by, tour_id, venue:venues(${venueSelect}, address)`)
    .eq('id', showId)
    .single();
  if (error) throw error;
  return data as unknown as ShowDetail;
}

export type VenueFields = {
  venueName: string;
  venueCity: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
};

export type CreateShowInput = VenueFields & {
  userId: string;
  tourId: string;
  date: string;
};

export async function createShow(input: CreateShowInput): Promise<{ id: string }> {
  const venueId = await getOrCreateVenue({
    name: input.venueName,
    city: input.venueCity,
    userId: input.userId,
    latitude: input.latitude,
    longitude: input.longitude,
    address: input.address,
  });

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

export type UpdateShowInput = VenueFields & {
  userId: string;
  showId: string;
  date: string;
};

export async function updateShow(input: UpdateShowInput): Promise<void> {
  const venueId = await getOrCreateVenue({
    name: input.venueName,
    city: input.venueCity,
    userId: input.userId,
    latitude: input.latitude,
    longitude: input.longitude,
    address: input.address,
  });

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
