-- Enable Supabase Realtime for multi-device sync
-- Run after schema.sql and policies.sql

-- Add tables to realtime publication (Supabase Dashboard: Database → Publications → supabase_realtime)
alter publication supabase_realtime add table public.pair_events;
alter publication supabase_realtime add table public.moments;

-- Dashboard checklist:
-- 1. Authentication → enable Email provider
-- 2. Database → Replication → confirm pair_events and moments are enabled
-- 3. Project Settings → API → copy URL + anon key → frontend .env
-- 4. Project Settings → API → service_role key → backend .env only (never frontend)
