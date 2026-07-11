-- Allow authenticated users to read each other's basic profile so shared tours
-- can show participants and creators by name. Profiles remain writable only by
-- their owner (profiles hold no sensitive data — just a display name).
drop policy "Profiles are viewable by owner" on profiles;

create policy "Profiles are viewable by authenticated users"
  on profiles for select to authenticated
  using (true);
