-- Repair Cater Vegas roles for one shared workspace.
-- Rodi is admin/owner. David is a pending collaborator until admin approval.
-- Run in the CATER VEGAS Supabase project after supabase/schema.sql.

begin;

insert into public.beoflow_workspaces (id, name, slug, industry, status)
values ('cater-vegas', 'Cater Vegas', 'cater-vegas', 'catering_events', 'active')
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    industry = excluded.industry,
    status = 'active',
    updated_at = now();

with workspace_accounts(email, fallback_name, profile_role, member_role, member_status) as (
  values
    ('exmarquesado@gmail.com', 'Rodrigo Marquesado', 'owner', 'owner', 'active'),
    ('davidrramirez61@gmail.com', 'David Ramirez', 'collaborator_pending', 'collaborator', 'pending')
),
matched_users as (
  select
    u.id,
    u.email,
    workspace_accounts.fallback_name,
    workspace_accounts.profile_role,
    workspace_accounts.member_role,
    workspace_accounts.member_status,
    coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), workspace_accounts.fallback_name) as full_name
  from auth.users u
  join workspace_accounts on lower(workspace_accounts.email) = lower(u.email)
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
  profile_role
from matched_users
on conflict (id) do update
set workspace_id = 'cater-vegas',
    email = excluded.email,
    full_name = coalesce(nullif(public.cater_profiles.full_name, ''), excluded.full_name),
    role = excluded.role,
    updated_at = now();

with workspace_accounts(email, member_role, member_status) as (
  values
    ('exmarquesado@gmail.com', 'owner', 'active'),
    ('davidrramirez61@gmail.com', 'collaborator', 'pending')
),
matched_profiles as (
  select p.id, workspace_accounts.member_role, workspace_accounts.member_status
  from public.cater_profiles p
  join workspace_accounts on lower(workspace_accounts.email) = lower(p.email)
)
insert into public.beoflow_workspace_members (workspace_id, user_id, role, status)
select 'cater-vegas', id, member_role, member_status
from matched_profiles
on conflict (workspace_id, user_id)
do update set role = excluded.role,
              status = excluded.status,
              updated_at = now();

delete from public.beoflow_workspace_members m
using public.cater_profiles p
where m.user_id = p.id
  and lower(p.email) in ('exmarquesado@gmail.com', 'davidrramirez61@gmail.com')
  and m.workspace_id <> 'cater-vegas'
  and m.workspace_id like 'cater-vegas%';

update public.cater_providers p
set workspace_id = 'cater-vegas',
    approval_status = coalesce(p.approval_status, 'pending'),
    public_visible = case
      when coalesce(p.approval_status, 'pending') = 'approved' then p.public_visible
      else false
    end,
    updated_at = now()
from public.cater_profiles cp
where p.created_by = cp.id
  and lower(cp.email) in ('exmarquesado@gmail.com', 'davidrramirez61@gmail.com')
  and p.workspace_id <> 'cater-vegas';

update public.cater_providers p
set approval_status = 'approved',
    updated_at = now()
from public.cater_profiles cp
where p.created_by = cp.id
  and p.public_visible = true
  and p.approval_status = 'pending'
  and cp.role in ('owner', 'admin', 'super_admin', 'platform_admin', 'organizer');

update public.cater_providers
set public_visible = false,
    updated_at = now()
where approval_status <> 'approved'
  and public_visible = true;

commit;
