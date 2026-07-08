-- Cater Vegas buyer-facing date pricing rules.
-- Owner/admin can update these; public buyers can read them for checkout totals.

begin;

create table if not exists public.cater_pricing_rules (
  workspace_id text primary key default 'cater-vegas',
  weekday_markup_percent numeric not null default 0,
  weekend_markup_percent numeric not null default 20,
  holiday_markup_percent numeric not null default 40,
  holiday_dates jsonb not null default '["01-01", "05-25", "07-04", "09-07", "11-26", "12-25"]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.cater_pricing_rules enable row level security;

drop policy if exists "cater_pricing_rules_public_read" on public.cater_pricing_rules;
create policy "cater_pricing_rules_public_read"
on public.cater_pricing_rules
for select
to anon, authenticated
using (workspace_id = 'cater-vegas');

drop policy if exists "cater_pricing_rules_admin_manage" on public.cater_pricing_rules;
create policy "cater_pricing_rules_admin_manage"
on public.cater_pricing_rules
for all
to authenticated
using (
  exists (
    select 1
    from public.beoflow_workspace_members m
    where m.workspace_id = cater_pricing_rules.workspace_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'super_admin', 'platform_admin')
  )
)
with check (
  exists (
    select 1
    from public.beoflow_workspace_members m
    where m.workspace_id = cater_pricing_rules.workspace_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'super_admin', 'platform_admin')
  )
);

insert into public.cater_pricing_rules (workspace_id)
values ('cater-vegas')
on conflict (workspace_id) do nothing;

commit;
