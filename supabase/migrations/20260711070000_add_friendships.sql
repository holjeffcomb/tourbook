-- Mutual friendships via request/accept. One directed row per unordered pair.

create table friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles (id) on delete cascade,
  addressee_id uuid not null references profiles (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- Prevent A→B and B→A both existing as separate rows.
create unique index friendships_pair_uidx on friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);

create index friendships_requester_id_idx on friendships (requester_id);
create index friendships_addressee_id_idx on friendships (addressee_id);
create index friendships_status_idx on friendships (status);

create trigger friendships_set_updated_at
  before update on friendships
  for each row
  execute function public.set_updated_at();

alter table friendships enable row level security;

create policy "Friends can view their friendships"
  on friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy "Users can send friend requests"
  on friendships for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'pending'
  );

-- Addressee accepts/declines; requester may cancel a pending request (delete preferred)
-- or reset a declined row back to pending when re-requesting.
create policy "Participants can update friendships"
  on friendships for update to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid())
  with check (
    (addressee_id = auth.uid() and status in ('accepted', 'declined', 'pending'))
    or (requester_id = auth.uid() and status in ('pending', 'declined'))
  );

create policy "Participants can remove friendships"
  on friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Used by tour RLS and app queries. SECURITY DEFINER so policies can check
-- friendship without requiring the viewer to already see the other party's rows.
create or replace function public.is_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a)
      )
  );
$$;

grant execute on function public.is_friends(uuid, uuid) to authenticated;
