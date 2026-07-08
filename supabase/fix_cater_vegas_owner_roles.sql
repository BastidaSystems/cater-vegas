-- Promote Cater Vegas owner accounts so they route to the admin dashboard.
-- Run in the CATER VEGAS Supabase project after supabase/schema.sql.

begin;

with owner_accounts(email, fallback_name) as (
  values
    ('exmarquesado@gmail.com', 'Rodrigo Marquesado'),
    ('davidrramirez61@gmail.com', 'David Ramirez')
),
matched_users as (
  select
    u.id,
    u.email,
    coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), owner_accounts.fallback_name) as full_name
  from auth.users u
  join owner_accounts on lower(owner_accounts.email) = lower(u.email)
)
insert into public.cater_profiles (
  id,
  workspace_id,
  email,
  full_name,
  role
)
select
  id,
  'cater-vegas',
  email,
  full_name,
  'owner'
from matched_users
on conflict (id) do update
set workspace_id = 'cater-vegas',
    email = excluded.email,
    full_name = coalesce(nullif(public.cater_profiles.full_name, ''), excluded.full_name),
    role = 'owner',
    updated_at = now();

insert into public.beoflow_workspace_members (workspace_id, user_id, role, status)
select 'cater-vegas', id, 'owner', 'active'
from public.cater_profiles
where lower(email) in ('exmarquesado@gmail.com', 'davidrramirez61@gmail.com')
on conflict (workspace_id, user_id)
do update set role = 'owner',
              status = 'active',
              updated_at = now();

commit;
