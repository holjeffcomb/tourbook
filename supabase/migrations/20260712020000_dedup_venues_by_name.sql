-- Second dedup pass for the "same venue, divergent geocode" case that proximity
-- can't catch (e.g. "The Fillmore Philadelphia / Philadelphia" vs ".../ Philadelphia, PA"
-- whose coordinates are kilometers apart because one was geocoded loosely).
--
-- Deliberately conservative so it never collapses distinct venues:
--   * names must be IDENTICAL (normalized) — different venues in the same
--     building have different names, so they're safe.
--   * cities must be COMPATIBLE — identical, or one is the other plus a
--     ", region" suffix ("Philadelphia" vs "Philadelphia, PA"). "Las Vegas"
--     never matches "Philadelphia".
--   * if both rows are geolocated, they must be within the same metro (max_km),
--     so an identical name in two genuinely different places can't merge.

create or replace function public.merge_duplicate_venues_by_name(max_km double precision default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical record;
  dup record;
  best_city text;
  best_addr text;
  best_lat double precision;
  best_lng double precision;
  cluster_ids uuid[];
  merged_count int := 0;
begin
  for canonical in
    select v.id, v.normalized_name, v.city, v.normalized_city,
           v.latitude, v.longitude, v.address
    from venues v
    order by (select count(*) from shows s where s.venue_id = v.id) desc, v.created_at asc
  loop
    if not exists (select 1 from venues where id = canonical.id) then
      continue;
    end if;

    best_city := canonical.city;
    best_addr := canonical.address;
    best_lat := canonical.latitude;
    best_lng := canonical.longitude;
    cluster_ids := array[]::uuid[];

    for dup in
      select v.id, v.city, v.latitude, v.longitude, v.address
      from venues v
      where v.id <> canonical.id
        and v.normalized_name = canonical.normalized_name
        -- Compatible city: identical, or one is the other + ", region".
        and (
          v.normalized_city = canonical.normalized_city
          or v.normalized_city like canonical.normalized_city || ', %'
          or canonical.normalized_city like v.normalized_city || ', %'
        )
        -- If both are geolocated, they must be in the same metro area.
        and (
          v.latitude is null or v.longitude is null
          or canonical.latitude is null or canonical.longitude is null
          or 2 * 6371 * asin(sqrt(
               power(sin(radians(v.latitude - canonical.latitude) / 2), 2) +
               cos(radians(canonical.latitude)) * cos(radians(v.latitude)) *
               power(sin(radians(v.longitude - canonical.longitude) / 2), 2)
             )) <= max_km
        )
    loop
      cluster_ids := cluster_ids || dup.id;

      -- Prefer a city that names its region (has a comma), then the longer one.
      if (case when position(',' in coalesce(dup.city, '')) > 0 then 1000 else 0 end)
           + length(coalesce(dup.city, ''))
         > (case when position(',' in coalesce(best_city, '')) > 0 then 1000 else 0 end)
           + length(coalesce(best_city, ''))
      then
        best_city := dup.city;
      end if;
      if best_lat is null and dup.latitude is not null then
        best_lat := dup.latitude;
        best_lng := dup.longitude;
      end if;
      if best_addr is null and dup.address is not null then
        best_addr := dup.address;
      end if;
    end loop;

    if array_length(cluster_ids, 1) is null then
      continue;
    end if;

    update shows set venue_id = canonical.id where venue_id = any(cluster_ids);
    delete from venues where id = any(cluster_ids);
    merged_count := merged_count + array_length(cluster_ids, 1);

    update venues v
      set city = best_city,
          latitude = coalesce(v.latitude, best_lat),
          longitude = coalesce(v.longitude, best_lng),
          address = coalesce(v.address, best_addr)
      where v.id = canonical.id
        and not exists (
          select 1 from venues o
          where o.id <> canonical.id
            and o.normalized_name = canonical.normalized_name
            and o.normalized_city = lower(btrim(best_city))
        );
  end loop;

  return merged_count;
end;
$$;

revoke execute on function public.merge_duplicate_venues_by_name(double precision)
  from anon, authenticated, public;

-- Single repeatable entry point: run both passes until the catalog is stable
-- (a name-merge can enable a proximity-merge and vice versa).
create or replace function public.dedup_venues(
  radius_m double precision default 75,
  max_km double precision default 30
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total int := 0;
  pass int;
begin
  loop
    pass := public.merge_duplicate_venues(radius_m)
          + public.merge_duplicate_venues_by_name(max_km);
    total := total + pass;
    exit when pass = 0;
  end loop;
  return total;
end;
$$;

revoke execute on function public.dedup_venues(double precision, double precision)
  from anon, authenticated, public;

select public.dedup_venues();
