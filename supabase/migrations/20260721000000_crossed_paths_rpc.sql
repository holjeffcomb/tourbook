-- Server-side "crossing paths" (near-miss) detection.
--
-- Moves the near-miss scan off the device: instead of downloading every friend's
-- full itinerary and cross-joining on the phone (see the old client fan-out in
-- src/features/social/useUpcomingCrossedPaths.ts), the caller gets back just the
-- matched stop pairs between them and their accepted friends.
--
-- Design notes (intentionally the *simplest* thing that scales to a few thousand
-- users; no PostGIS, no cron, no precomputed tables):
--   * The pair-finding cross join is the expensive + privacy-sensitive part, so it
--     lives here. Presentation (label / city / same_venue|same_city|nearby) stays in
--     the TS `compute.ts` helpers on the client, which remain the single source of
--     truth (also used by the 1:1 Compare + detail screens). We therefore return the
--     *raw* stop/venue columns and let the client reconstruct stops exactly as the
--     read path does.
--   * SECURITY DEFINER so it can join across a friend's rows, but it re-checks
--     friendship + tour visibility internally (RLS does not apply inside a definer
--     function) — this is the single audited boundary for crossing data.
--   * Coordinates live on the venue for booked shows and on the row for city-only
--     stops, so both the "located" filter and the distance use coalesce(show, venue).
--   * Haversine matches src/lib/geo.ts (same earth radius + atan2 form) so the miles
--     agree with the client to float precision.
--   * All matched pairs (past + upcoming) are returned; the client partitions
--     upcoming vs past using the device's local date, exactly as before.

create or replace function public.crossed_paths(
  max_miles double precision default 100,
  date_window_days integer default 0
)
returns table (
  friend_id uuid,
  friend_display_name text,
  friend_username text,
  my_stop_id uuid,
  my_tour_id uuid,
  my_tour_title text,
  my_act_name text,
  my_kind stop_kind,
  my_venue_id uuid,
  my_venue_name text,
  my_venue_city text,
  my_venue_country text,
  my_venue_lat double precision,
  my_venue_lng double precision,
  my_label text,
  my_city text,
  my_country text,
  my_address text,
  my_date date,
  my_lat double precision,
  my_lng double precision,
  their_stop_id uuid,
  their_tour_id uuid,
  their_tour_title text,
  their_act_name text,
  their_kind stop_kind,
  their_venue_id uuid,
  their_venue_name text,
  their_venue_city text,
  their_venue_country text,
  their_venue_lat double precision,
  their_venue_lng double precision,
  their_label text,
  their_city text,
  their_country text,
  their_address text,
  their_date date,
  their_lat double precision,
  their_lng double precision,
  miles double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      s.id, s.tour_id, s.date, s.kind, s.venue_id,
      s.label, s.city, s.country, s.address,
      s.latitude as show_lat, s.longitude as show_lng,
      v.name as venue_name, v.city as venue_city, v.country as venue_country,
      v.latitude as venue_lat, v.longitude as venue_lng,
      t.title as tour_title, a.name as act_name,
      coalesce(s.latitude, v.latitude) as lat,
      coalesce(s.longitude, v.longitude) as lng
    from shows s
    join tour_members tm on tm.tour_id = s.tour_id and tm.user_id = auth.uid()
    join tours t on t.id = s.tour_id
    left join acts a on a.id = t.act_id
    left join venues v on v.id = s.venue_id
    where s.date is not null
      and coalesce(s.latitude, v.latitude) is not null
      and coalesce(s.longitude, v.longitude) is not null
  ),
  friends as (
    select distinct
      case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as fid
    from friendships f
    where f.status = 'accepted'
      and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  ),
  theirs as (
    select
      fr.fid as friend_id,
      pr.display_name as friend_display_name,
      pr.username as friend_username,
      s.id, s.tour_id, s.date, s.kind, s.venue_id,
      s.label, s.city, s.country, s.address,
      s.latitude as show_lat, s.longitude as show_lng,
      v.name as venue_name, v.city as venue_city, v.country as venue_country,
      v.latitude as venue_lat, v.longitude as venue_lng,
      t.title as tour_title, a.name as act_name,
      coalesce(s.latitude, v.latitude) as lat,
      coalesce(s.longitude, v.longitude) as lng
    from friends fr
    join profiles pr on pr.id = fr.fid
    join tour_members tm on tm.user_id = fr.fid
    join tours t on t.id = tm.tour_id
    join shows s on s.tour_id = t.id
    left join acts a on a.id = t.act_id
    left join venues v on v.id = s.venue_id
    where s.date is not null
      and coalesce(s.latitude, v.latitude) is not null
      and coalesce(s.longitude, v.longitude) is not null
      -- Mirror the tours SELECT policy exactly (RLS is bypassed under DEFINER).
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
  ),
  pairs as (
    select
      theirs.friend_id, theirs.friend_display_name, theirs.friend_username,
      me.id as my_stop_id, me.tour_id as my_tour_id, me.tour_title as my_tour_title,
      me.act_name as my_act_name, me.kind as my_kind, me.venue_id as my_venue_id,
      me.venue_name as my_venue_name, me.venue_city as my_venue_city,
      me.venue_country as my_venue_country, me.venue_lat as my_venue_lat,
      me.venue_lng as my_venue_lng, me.label as my_label, me.city as my_city,
      me.country as my_country, me.address as my_address, me.date as my_date,
      me.show_lat as my_lat, me.show_lng as my_lng,
      theirs.id as their_stop_id, theirs.tour_id as their_tour_id,
      theirs.tour_title as their_tour_title, theirs.act_name as their_act_name,
      theirs.kind as their_kind, theirs.venue_id as their_venue_id,
      theirs.venue_name as their_venue_name, theirs.venue_city as their_venue_city,
      theirs.venue_country as their_venue_country, theirs.venue_lat as their_venue_lat,
      theirs.venue_lng as their_venue_lng, theirs.label as their_label,
      theirs.city as their_city, theirs.country as their_country,
      theirs.address as their_address, theirs.date as their_date,
      theirs.show_lat as their_lat, theirs.show_lng as their_lng,
      -- Haversine (matches src/lib/geo.ts, R = 3958.7613 mi). The asin form avoids
      -- a (1 - h) term: Postgres sqrt() errors on a negative arg (float noise near
      -- antipodes), and the cross join distances every pair before the mile filter.
      -- least(1, ...) keeps asin in domain.
      3958.7613 * 2 * asin(least(1, sqrt(
        power(sin(radians(theirs.lat - me.lat) / 2), 2) +
        cos(radians(me.lat)) * cos(radians(theirs.lat)) *
        power(sin(radians(theirs.lng - me.lng) / 2), 2)
      ))) as miles
    from me
    join theirs
      on me.tour_id <> theirs.tour_id
     and abs(me.date - theirs.date) <= date_window_days
  )
  select
    friend_id, friend_display_name, friend_username,
    my_stop_id, my_tour_id, my_tour_title, my_act_name, my_kind, my_venue_id,
    my_venue_name, my_venue_city, my_venue_country, my_venue_lat, my_venue_lng,
    my_label, my_city, my_country, my_address, my_date, my_lat, my_lng,
    their_stop_id, their_tour_id, their_tour_title, their_act_name, their_kind,
    their_venue_id, their_venue_name, their_venue_city, their_venue_country,
    their_venue_lat, their_venue_lng, their_label, their_city, their_country,
    their_address, their_date, their_lat, their_lng, miles
  from pairs
  where miles <= max_miles
  order by miles asc;
$$;

grant execute on function public.crossed_paths(double precision, integer) to authenticated;
