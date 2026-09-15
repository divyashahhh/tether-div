-- Tether multi-device sync schema
-- Run in Supabase SQL Editor (or via migration)

create extension if not exists "pgcrypto";

-- 1. Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text default 'UTC',
  avatar_url text,
  created_at timestamptz default now()
);

-- 2. Temporary pairing codes
create table if not exists public.pair_codes (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists pair_codes_code_idx on public.pair_codes (code);

-- 3. Permanent pairs
create table if not exists public.pairs (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz default now(),
  constraint different_users check (user_a <> user_b)
);

create index if not exists pairs_user_a_idx on public.pairs (user_a);
create index if not exists pairs_user_b_idx on public.pairs (user_b);

-- 4. Append-only shared event log (source of truth for realtime)
create table if not exists public.pair_events (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists pair_events_pair_id_idx on public.pair_events (pair_id, created_at desc);

-- 5. Shared moments
create table if not exists public.moments (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  caption text,
  image_url text,
  created_at timestamptz default now()
);

create index if not exists moments_pair_id_idx on public.moments (pair_id, created_at desc);

-- Optional: latest derived state (future use)
create table if not exists public.pair_state (
  pair_id uuid primary key references public.pairs(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Tether user')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
