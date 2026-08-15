-- Dispcam schema for Supabase (Postgres)
-- SAFE TO RE-RUN: every statement is idempotent. If you already ran an older
-- version of this file, just run this whole file again — it will add whatever
-- is missing and leave existing data untouched.
-- Run in: Supabase dashboard → SQL Editor (or: supabase db push)

-- Events: created by the host, time-locked until reveal_at
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  reveal_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Add the photo-limit column if this table predates this schema
alter table public.events add column if not exists max_photos_limit integer not null default 10;

-- Paid-tier columns: guest capacity, plan id, and the Razorpay payment id
-- (null for free events).
alter table public.events add column if not exists max_guests integer default 10;
alter table public.events add column if not exists plan text default 'free';
alter table public.events add column if not exists payment_id text;
alter table public.events add column if not exists host_email text;

-- One event per Razorpay payment (idempotency at the DB level)
create unique index if not exists events_payment_id_unique on public.events (payment_id) where payment_id is not null;

-- Photos: one row per captured shot, pointing at its R2 object key
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_name text,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- Optional guest email for photo delivery (PDF album + original downloads)
-- when the film develops. Null when the guest chose to stay anonymous.
alter table public.photos add column if not exists guest_email text;

create index if not exists photos_event_id_idx on public.photos (event_id);
create index if not exists photos_event_email_idx on public.photos (event_id, guest_email);

-- Row Level Security: mirrors the old Firestore rules (allow read/write for all).
-- The app only ever selects and inserts, so that is all that is opened here.
-- Tighten these before production (e.g. restrict writes to a host secret).
alter table public.events enable row level security;
alter table public.photos enable row level security;

drop policy if exists "events are publicly readable" on public.events;
drop policy if exists "anyone can create events" on public.events;
drop policy if exists "photos are publicly readable" on public.photos;
drop policy if exists "anyone can insert photos" on public.photos;

create policy "events are publicly readable" on public.events for select using (true);
create policy "anyone can create events" on public.events for insert with check (true);

create policy "photos are publicly readable" on public.photos for select using (true);
create policy "anyone can insert photos" on public.photos for insert with check (true);
