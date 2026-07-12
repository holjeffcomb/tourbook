-- Wire 'friends' visibility into tour/show SELECT policies.
-- Must run after 20260711080000 (enum value commit) so 'friends' is usable.

drop policy "Public tours are viewable; private tours only by members" on tours;
create policy "Tours are viewable by public, friends, or members"
  on tours for select to authenticated
  using (
    visibility = 'public'
    or (
      visibility = 'friends'
      and created_by is not null
      and public.is_friends(created_by, auth.uid())
    )
    or exists (
      select 1 from tour_members m
      where m.tour_id = tours.id and m.user_id = auth.uid()
    )
  );

drop policy "Shows are viewable when their tour is" on shows;
create policy "Shows are viewable when their tour is"
  on shows for select to authenticated
  using (
    exists (
      select 1 from tours t
      where t.id = shows.tour_id
        and (
          t.visibility = 'public'
          or (
            t.visibility = 'friends'
            and t.created_by is not null
            and public.is_friends(t.created_by, auth.uid())
          )
          or exists (
            select 1 from tour_members m
            where m.tour_id = t.id and m.user_id = auth.uid()
          )
        )
    )
  );
