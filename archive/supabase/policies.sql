-- Row Level Security for Tether

alter table public.profiles enable row level security;
alter table public.pair_codes enable row level security;
alter table public.pairs enable row level security;
alter table public.pair_events enable row level security;
alter table public.moments enable row level security;
alter table public.pair_state enable row level security;

-- profiles
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select to authenticated
using (id = auth.uid());

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles for insert to authenticated
with check (id = auth.uid());

-- pair_codes: no direct client access (backend service role only)
drop policy if exists "No direct pair_codes access" on public.pair_codes;
create policy "No direct pair_codes access"
on public.pair_codes for all to authenticated
using (false)
with check (false);

-- pairs
drop policy if exists "Users can read own pairs" on public.pairs;
create policy "Users can read own pairs"
on public.pairs for select to authenticated
using (auth.uid() = user_a or auth.uid() = user_b);

-- pair_events
drop policy if exists "Users can read own pair events" on public.pair_events;
create policy "Users can read own pair events"
on public.pair_events for select to authenticated
using (
  exists (
    select 1 from public.pairs
    where pairs.id = pair_events.pair_id
      and (pairs.user_a = auth.uid() or pairs.user_b = auth.uid())
  )
);

drop policy if exists "Users can create events in own pair" on public.pair_events;
create policy "Users can create events in own pair"
on public.pair_events for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.pairs
    where pairs.id = pair_events.pair_id
      and status = 'active'
      and (pairs.user_a = auth.uid() or pairs.user_b = auth.uid())
  )
);

-- moments
drop policy if exists "Users can read own moments" on public.moments;
create policy "Users can read own moments"
on public.moments for select to authenticated
using (
  exists (
    select 1 from public.pairs
    where pairs.id = moments.pair_id
      and (pairs.user_a = auth.uid() or pairs.user_b = auth.uid())
  )
);

drop policy if exists "Users can create own moments" on public.moments;
create policy "Users can create own moments"
on public.moments for insert to authenticated
with check (
  creator_id = auth.uid()
  and exists (
    select 1 from public.pairs
    where pairs.id = moments.pair_id
      and (pairs.user_a = auth.uid() or pairs.user_b = auth.uid())
  )
);

-- pair_state
drop policy if exists "Users can read own pair state" on public.pair_state;
create policy "Users can read own pair state"
on public.pair_state for select to authenticated
using (
  exists (
    select 1 from public.pairs
    where pairs.id = pair_state.pair_id
      and (pairs.user_a = auth.uid() or pairs.user_b = auth.uid())
  )
);

drop policy if exists "Users can upsert own pair state" on public.pair_state;
create policy "Users can upsert own pair state"
on public.pair_state for insert to authenticated
with check (
  exists (
    select 1 from public.pairs
    where pairs.id = pair_state.pair_id
      and (pairs.user_a = auth.uid() or pairs.user_b = auth.uid())
  )
);

drop policy if exists "Users can update own pair state" on public.pair_state;
create policy "Users can update own pair state"
on public.pair_state for update to authenticated
using (
  exists (
    select 1 from public.pairs
    where pairs.id = pair_state.pair_id
      and (pairs.user_a = auth.uid() or pairs.user_b = auth.uid())
  )
);
