import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  display_name: string | null;
};

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId: string, displayName: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName.trim() })
    .eq('id', userId);
  if (error) throw error;
}
