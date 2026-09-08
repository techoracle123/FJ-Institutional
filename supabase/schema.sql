-- FJ Institutional — Supabase schema
-- Run in Supabase Studio → SQL Editor.

create table if not exists public.journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  direction text not null check (direction in ('long','short')),
  entry double precision,
  exit double precision,
  r double precision,
  note text default '',
  created_at timestamptz not null default now()
);

create index if not exists journal_user_idx on public.journal(user_id, created_at desc);

alter table public.journal enable row level security;

drop policy if exists "own rows select" on public.journal;
create policy "own rows select" on public.journal
  for select using (auth.uid() = user_id);

drop policy if exists "own rows insert" on public.journal;
create policy "own rows insert" on public.journal
  for insert with check (auth.uid() = user_id);

drop policy if exists "own rows update" on public.journal;
create policy "own rows update" on public.journal
  for update using (auth.uid() = user_id);

drop policy if exists "own rows delete" on public.journal;
create policy "own rows delete" on public.journal
  for delete using (auth.uid() = user_id);

-- Immutable published theses (audit trail for the track record).
create table if not exists public.thesis_log (
  id text primary key,
  symbol text not null,
  direction text not null,
  conviction text not null,
  probability double precision not null,
  entry_low double precision,
  entry_high double precision,
  stop double precision,
  t1 double precision,
  t2 double precision,
  model_version text,
  payload jsonb not null,
  issued_at timestamptz not null default now(),
  outcome text,
  realised_r double precision,
  resolved_at timestamptz
);

create index if not exists thesis_log_symbol_idx on public.thesis_log(symbol, issued_at desc);

alter table public.thesis_log enable row level security;

drop policy if exists "public read" on public.thesis_log;
create policy "public read" on public.thesis_log for select using (true);
