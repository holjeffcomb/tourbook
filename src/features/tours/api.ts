import { getOrCreateAct } from '@/features/acts/api';
import { supabase } from '@/lib/supabase';

export type TourWithAct = {
  id: string;
  role: string | null;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  visibility: 'private';
  created_at: string;
  act: { id: string; name: string };
};

const tourSelect = 'id, role, title, start_date, end_date, visibility, created_at, act:acts(id, name)';

export async function listTours(): Promise<TourWithAct[]> {
  const { data, error } = await supabase
    .from('tours')
    .select(tourSelect)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TourWithAct[];
}

export async function getTour(id: string): Promise<TourWithAct> {
  const { data, error } = await supabase.from('tours').select(tourSelect).eq('id', id).single();
  if (error) throw error;
  return data as TourWithAct;
}

export type CreateTourInput = {
  userId: string;
  actName: string;
  role?: string;
  title?: string;
  startDate?: string | null;
  endDate?: string | null;
};

export async function createTour(input: CreateTourInput): Promise<{ id: string }> {
  const actId = await getOrCreateAct(input.actName, input.userId);

  const { data, error } = await supabase
    .from('tours')
    .insert({
      user_id: input.userId,
      act_id: actId,
      role: input.role?.trim() || null,
      title: input.title?.trim() || null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data;
}

export type UpdateTourInput = {
  userId: string;
  tourId: string;
  actName: string;
  role?: string;
  title?: string;
  startDate?: string | null;
  endDate?: string | null;
};

export async function updateTour(input: UpdateTourInput): Promise<void> {
  const actId = await getOrCreateAct(input.actName, input.userId);

  const { error } = await supabase
    .from('tours')
    .update({
      act_id: actId,
      role: input.role?.trim() || null,
      title: input.title?.trim() || null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
    })
    .eq('id', input.tourId);

  if (error) throw error;
}

export async function deleteTour(tourId: string): Promise<void> {
  // Shows are removed automatically via the tour_id ON DELETE CASCADE.
  const { error } = await supabase.from('tours').delete().eq('id', tourId);
  if (error) throw error;
}
