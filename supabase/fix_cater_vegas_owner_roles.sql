-- Promote Cater Vegas owner accounts and keep owner workspaces isolated.
-- Run in the CATER VEGAS Supabase project after supabase/schema.sql.

begin;

with owner_accounts(email, fallback_name, workspace_id, workspace_name, workspace_slug) as (
  values
    ('exmarquesado@gmail.com', 'Rodrigo Marquesado', 'cater-vegas', 'Cater Vegas', 'cater-vegas'),
    ('davidrramirez61@gmail.com', 'David Ramirez', 'cater-vegas-david', 'David Cater Vegas', 'cater-vegas-david')
),
matched_users as (
  select
    u.id,
    u.email,
    owner_accounts.workspace_id,
    owner_accounts.workspace_name,
    owner_accounts.workspace_slug,
    coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), owner_accounts.fallback_name) as full_name
  from auth.users u
  join owner_accounts on lower(owner_accounts.email) = lower(u.email)
)
insert into public.beoflow_workspaces (
  id,
  name,
  slug,
  industry,
  status,
  owner_id
)
select
  workspace_id,
  workspace_name,
  workspace_slug,
  'catering_events',
  'active',
  id
from matched_users
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    industry = excluded.industry,
    status = 'active',
    owner_id = excluded.owner_id,
    updated_at = now();

with owner_accounts(email, fallback_name, workspace_id) as (
  values
    ('exmarquesado@gmail.com', 'Rodrigo Marquesado', 'cater-vegas'),
    ('davidrramirez61@gmail.com', 'David Ramirez', 'cater-vegas-david')
),
matched_users as (
  select
    u.id,
    u.email,
    owner_accounts.workspace_id,
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
  workspace_id,
  email,
  full_name,
  'owner'
from matched_users
on conflict (id) do update
set workspace_id = excluded.workspace_id,
    email = excluded.email,
    full_name = coalesce(nullif(public.cater_profiles.full_name, ''), excluded.full_name),
    role = 'owner',
    updated_at = now();

with owner_accounts(email, workspace_id) as (
  values
    ('exmarquesado@gmail.com', 'cater-vegas'),
    ('davidrramirez61@gmail.com', 'cater-vegas-david')
),
matched_profiles as (
  select p.id, owner_accounts.workspace_id
  from public.cater_profiles p
  join owner_accounts on lower(owner_accounts.email) = lower(p.email)
)
insert into public.beoflow_workspace_members (workspace_id, user_id, role, status)
select workspace_id, id, 'owner', 'active'
from matched_profiles
on conflict (workspace_id, user_id)
do update set role = 'owner',
              status = 'active',
              updated_at = now();

delete from public.beoflow_workspace_members m
using public.cater_profiles p
where m.user_id = p.id
  and lower(p.email) = 'davidrramirez61@gmail.com'
  and m.workspace_id = 'cater-vegas';

commit;
