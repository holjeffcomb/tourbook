-- Discovery for the shared venue catalog: when a user starts typing a venue name
-- (e.g. "Progresja"), surface venues that already exist in the database so people
-- converge on one canonical row (with its coordinates) instead of duplicating.
--
-- Ranking, best-first:
--   1. exact name match
--   2. name prefix match
--   3. city bias (matches the city the user is already filling in)
--   4. popularity (how many booked shows reference the venue)
--   5. alphabetical
--
-- SECURITY DEFINER so popularity is a stable, global property of the venue (the
-- show *count* isn't sensitive, and venues themselves are already world-readable).
create or replace function public.search_venues(
  term text,
  city_bias text default null,
  max_results integer default 8
)
returns table (
  id uuid,
  name text,
  city text,
  latitude double precision,
  longitude double precision,
  address text,
  show_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select
      btrim(coalesce(term, '')) as raw,
      -- Escape LIKE wildcards so user input is matched literally.
      replace(replace(replace(btrim(coalesce(term, '')), '\', '\\'), '%', '\%'), '_', '\_') as esc,
      nullif(btrim(coalesce(city_bias, '')), '') as city_raw,
      nullif(
        replace(replace(replace(btrim(coalesce(city_bias, '')), '\', '\\'), '%', '\%'), '_', '\_'),
        ''
      ) as city_esc
  )
  select
    v.id, v.name, v.city, v.latitude, v.longitude, v.address,
    count(s.id) as show_count
  from venues v
  cross join q
  left join shows s on s.venue_id = v.id and s.kind = 'show'
  where length(q.raw) >= 2
    and (v.name ilike '%' || q.esc || '%' or v.city ilike '%' || q.esc || '%')
  group by v.id, q.raw, q.esc, q.city_esc
  order by
    (lower(v.name) = lower(q.raw)) desc,
    (v.name ilike q.esc || '%') desc,
    (q.city_esc is not null and v.city ilike '%' || q.city_esc || '%') desc,
    count(s.id) desc,
    v.name asc
  limit greatest(1, least(coalesce(max_results, 8), 25));
$$;

grant execute on function public.search_venues(text, text, integer) to authenticated;
