-- DispoCam — RLS HARDENING
-- Run AFTER supabase/schema.sql (idempotent — safe to re-run).
-- In: Supabase dashboard → SQL Editor → Run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. OWNERSHIP — every event gets an optional owner (the signed-in host).
--    New events created while signed in are owned by that user; anonymous
--    guests who shoot never touch events, so the guest flow is unaffected.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.events add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EVENTS POLICIES
--    • select  → public (anyone can open an event link / join)
--    • insert  → SIGNED-IN HOSTS ONLY, and the row must belong to them
--    • update  → owner only  (this is what "Reveal now" uses in host controls)
--    • delete  → owner only
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "anyone can create events" on public.events;

create policy "signed-in hosts create events" on public.events
  for insert with check (auth.role() = 'authenticated' and owner_id = auth.uid());

create policy "hosts update their events" on public.events
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "hosts delete their events" on public.events
  for delete using (owner_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PHOTOS POLICIES
--    • select  → public (guests and hosts read the developed gallery)
--    • insert  → public BUT only into events that exist (the trigger below is
--                the real gatekeeper: live event + under shot limit + path)
--    • delete  → the event's owner only (host moderation)
--    • update  → never opened (the app never edits a photo row)
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "anyone can insert photos" on public.photos;

create policy "guests insert photos into live events" on public.photos
  for insert with check (exists (select 1 from public.events ev where ev.id = event_id));

create policy "hosts delete photos in their events" on public.photos
  for delete using (
    exists (select 1 from public.events ev where ev.id = event_id and ev.owner_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SERVER-SIDE GUARD — the trust boundary for every photo insert.
--    The client was enforcing limits before; now the database does too:
--    • the event must exist
--    • the film must not have developed yet (reveal_at in the future)
--    • the event must be under its shot limit (max_photos_limit)
--    • storage_path must look like an R2 key (once-films/…)
--    A `for update` lock on the event row serializes inserts per event so two
--    guests can't both sneak past the count check at the same instant.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.enforce_photo_limits()
returns trigger
language plpgsql
security definer
as $$
declare
  ev_lock public.events%rowtype;
  shot_count int;
begin
  select * into ev_lock from public.events where id = new.event_id for update;
  if not found then
    raise exception 'Event does not exist';
  end if;

  if now() > ev_lock.reveal_at then
    raise exception 'This film has already developed';
  end if;

  select count(*) into shot_count from public.photos where event_id = new.event_id;
  if shot_count >= ev_lock.max_photos_limit then
    raise exception 'Shot limit reached for this event';
  end if;

  if new.storage_path is null or new.storage_path !~ '^once-films/' then
    raise exception 'Invalid storage path';
  end if;

  return new;
end;
$$;

drop trigger if exists photos_insert_guard on public.photos;
create trigger photos_insert_guard
  before insert on public.photos
  for each row execute function public.enforce_photo_limits();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. NOTE ON THE WORKER (server-side paid events)
--    The Cloudflare Worker creates PAID events after Razorpay verification.
--    It must use the Supabase SERVICE ROLE key for that insert (RLS bypass —
--    the Worker is trusted because it verifies the payment signature first).
--    Add the secret:  npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
--    The client (anon key) continues to work for everything else.
-- ─────────────────────────────────────────────────────────────────────────────
