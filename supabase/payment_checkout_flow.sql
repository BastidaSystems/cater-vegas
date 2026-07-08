-- Pending Stripe checkout sessions for Cater Vegas.
-- Real cater_events rows are created only after Stripe confirms payment.

begin;

create extension if not exists pgcrypto;

create table if not exists public.cater_pending_checkouts (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'cater-vegas',
  full_name text not null,
  email text not null,
  phone text,
  guest_count integer not null,
  notes text,
  event_date date not null,
  event_type text,
  plan jsonb not null default '{}'::jsonb,
  stripe_checkout_session_id text unique,
  status text not null default 'created',
  created_event_id bigint references public.cater_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cater_pending_checkouts_workspace_idx
  on public.cater_pending_checkouts(workspace_id, created_at desc);

alter table public.cater_pending_checkouts enable row level security;

commit;
