-- Venue identity by *location*, not by text. City strings are inconsistent
-- ("Denver" vs "Denver, CO"), so the normalized (name, city) unique key splits
-- one real venue into several rows — each only aware of its own shows.
--
-- Two parts:
--   1. find_nearby_venue: read-only lookup used at write time so getOrCreateVenue
--      can reuse an existing venue within a small radius instead of forking.
--   2. merge_duplicate_venues: repeatable, idempotent cleanup that collapses
--      already-duplicated rows (repoint shows, keep one canonical row).

-- ---------------------------------------------------------------------------
-- 1. Nearest existing venue within `radius_m` meters (haversine, no PostGIS).
--    name_hint only nudges ordering when several candidates are equally close.
-- ---------------------------------------------------------------------------
create or replace function public.find_nearby_venue(
  lat double precision,
  lng double precision,
  radius_m double precision default 75,
  name_hint text default null
)
returns table (
  id uuid,
  name text,
  city text,
  distance_m double precision,
  show_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.name, d.city, d.distance_m, d.show_count
  from (
    select
      v.id, v.name, v.city,
      2 * 6371000 * asin(sqrt(
        power(sin(radians(v.latitude - lat) / 2), 2) +
        cos(radians(lat)) * cos(radians(v.latitude)) *
        power(sin(radians(v.longitude - lng) / 2), 2)
      )) as distance_m,
      count(s.id) as show_count
    from venues v
    left join shows s on s.venue_id = v.id and s.kind = 'show'
    where v.latitude is not null and v.longitude is not null
    group by v.id
  ) d
  where lat is not null and lng is not null and d.distance_m <= radius_m
  order by
    (name_hint is not null and lower(btrim(d.name)) = lower(btrim(name_hint))) desc,
    d.show_count desc,
    d.distance_m asc
  limit 1;
$$;

grant execute on function public.find_nearby_venue(double precision, double precision, double precision, text)
  to authenticated;
revoke execute on function public.find_nearby_venue(double precision, double precision, double precision, text)
  from anon, public;

-- ---------------------------------------------------------------------------
-- 2. Collapse venues that sit within `radius_m` of each other into one row.
--    Idempotent: re-running merges only whatever is still duplicated. Greedy,
--    best-first — the row with the most shows (then oldest) survives, and it
--    adopts the most specific name and the city string that names its region.
-- ---------------------------------------------------------------------------
create or replace function public.merge_duplicate_venues(radius_m double precision default 75)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical record;
  dup record;
  best_name text;
  best_city text;
  best_addr text;
  cluster_ids uuid[];
  merged_count int := 0;
begin
  for canonical in
    select v.id, v.name, v.city, v.latitude, v.longitude, v.address
    from venues v
    where v.latitude is not null and v.longitude is not null
    order by (select count(*) from shows s where s.venue_id = v.id) desc, v.created_at asc
  loop
    -- May have been merged away while processing an earlier canonical.
    if not exists (select 1 from venues where id = canonical.id) then
      continue;
    end if;

    best_name := canonical.name;
    best_city := canonical.city;
    best_addr := canonical.address;
    cluster_ids := array[]::uuid[];

    for dup in
      select v.id, v.name, v.city, v.address
      from venues v
      where v.id <> canonical.id
        and v.latitude is not null and v.longitude is not null
        and 2 * 6371000 * asin(sqrt(
              power(sin(radians(v.latitude - canonical.latitude) / 2), 2) +
              cos(radians(canonical.latitude)) * cos(radians(v.latitude)) *
              power(sin(radians(v.longitude - canonical.longitude) / 2), 2)
            )) <= radius_m
    loop
      cluster_ids := cluster_ids || dup.id;

      -- Prefer a more specific (longer) name.
      if length(coalesce(dup.name, '')) > length(coalesce(best_name, '')) then
        best_name := dup.name;
      end if;
      -- Prefer a city that names its region (has a comma), then the longer one.
      if (case when position(',' in coalesce(dup.city, '')) > 0 then 1000 else 0 end)
           + length(coalesce(dup.city, ''))
         > (case when position(',' in coalesce(best_city, '')) > 0 then 1000 else 0 end)
           + length(coalesce(best_city, ''))
      then
        best_city := dup.city;
      end if;
      if best_addr is null and dup.address is not null then
        best_addr := dup.address;
      end if;
    end loop;

    if array_length(cluster_ids, 1) is null then
      continue; -- nothing nearby to merge
    end if;

    -- Repoint every show off the duplicates before removing them (FK is restrict).
    update shows set venue_id = canonical.id where venue_id = any(cluster_ids);
    delete from venues where id = any(cluster_ids);
    merged_count := merged_count + array_length(cluster_ids, 1);

    -- Canonicalize the survivor's display fields, but never collide with an
    -- unrelated venue that already holds this normalized (name, city).
    update venues v
      set name = best_name,
          city = best_city,
          address = coalesce(v.address, best_addr)
      where v.id = canonical.id
        and not exists (
          select 1 from venues o
          where o.id <> canonical.id
            and o.normalized_name = lower(btrim(best_name))
            and o.normalized_city = lower(btrim(best_city))
        );
  end loop;

  return merged_count;
end;
$$;

-- Maintenance only — not exposed to app clients.
revoke execute on function public.merge_duplicate_venues(double precision)
  from anon, authenticated, public;

-- Initial cleanup of existing duplicates.
select public.merge_duplicate_venues(75);
