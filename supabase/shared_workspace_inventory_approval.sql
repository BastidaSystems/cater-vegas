-- Shared Cater Vegas workspace and inventory approval model.
-- Run in Supabase SQL Editor as project owner/postgres.

begin;

insert into public.beoflow_workspaces (id, name, slug, industry, status)
values ('cater-vegas', 'Cater Vegas', 'cater-vegas', 'catering_events', 'active')
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    industry = excluded.industry,
    status = 'active',
    updated_at = now();

alter table public.beoflow_workspace_members drop constraint if exists beoflow_workspace_members_role_check;
alter table public.beoflow_workspace_members add constraint beoflow_workspace_members_role_check
  check (role in ('owner', 'admin', 'super_admin', 'platform_admin', 'organizer', 'collaborator', 'viewer'));

alter table public.cater_profiles drop constraint if exists cater_profiles_role_check;
alter table public.cater_profiles add constraint cater_profiles_role_check
  check (
    role in (
      'owner',
      'admin',
      'super_admin',
      'platform_admin',
      'staff',
      'organizer',
      'client',
      'viewer',
      'collaborator',
      'workspace_pending',
      'collaborator_pending',
      'organizer_pending',
      'client_pending'
    )
  );

alter table public.cater_providers
  add column if not exists workspace_id text not null default 'cater-vegas',
  add column if not exists service_category text,
  add column if not exists public_visible boolean not null default false,
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approved_by uuid references public.cater_profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists public_description text,
  add column if not exists image_url text,
  add column if not exists created_by uuid references public.cater_profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.cater_providers alter column workspace_id set default 'cater-vegas';
alter table public.cater_providers alter column approval_status set default 'pending';
update public.cater_providers set workspace_id = 'cater-vegas' where workspace_id is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cater_providers_workspace_id_fkey') then
    alter table public.cater_providers
      add constraint cater_providers_workspace_id_fkey
      foreign key (workspace_id) references public.beoflow_workspaces(id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cater_providers_created_by_fkey') then
    alter table public.cater_providers
      add constraint cater_providers_created_by_fkey
      foreign key (created_by) references public.cater_profiles(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cater_providers_approved_by_fkey') then
    alter table public.cater_providers
      add constraint cater_providers_approved_by_fkey
      foreign key (approved_by) references public.cater_profiles(id) on delete set null;
  end if;
end;
$$;

alter table public.cater_providers drop constraint if exists cater_providers_approval_status_check;
alter table public.cater_providers add constraint cater_providers_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

create index if not exists cater_providers_workspace_approval_idx
  on public.cater_providers (workspace_id, approval_status, created_at desc);

create index if not exists cater_providers_workspace_created_by_idx
  on public.cater_providers (workspace_id, created_by, created_at desc);

create index if not exists cater_providers_public_filter_idx
  on public.cater_providers (workspace_id, service_category, approval_status, public_visible, status);

create index if not exists cater_providers_public_inventory_idx
  on public.cater_providers (workspace_id, service_category, status, created_at desc)
  where public_visible = true and approval_status = 'approved';

create or replace function public.cater_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'cater_role', '');
  safe_role text := 'collaborator_pending';
  target_workspace_id text := 'cater-vegas';
begin
  if requested_role in (
    'client_pending',
    'collaborator_pending',
    'organizer_pending',
    'workspace_pending'
  ) then
    safe_role := requested_role;
  elsif requested_role = 'client' then
    safe_role := 'client_pending';
  end if;

  insert into public.beoflow_workspaces (id, name, slug, industry, status, owner_id)
  values (
    target_workspace_id,
    'Cater Vegas',
    'cater-vegas',
    'catering_events',
    'active',
    null
  )
  on conflict (id) do update
    set name = coalesce(nullif(public.beoflow_workspaces.name, ''), excluded.name),
        industry = coalesce(public.beoflow_workspaces.industry, excluded.industry),
        status = 'active',
        owner_id = public.beoflow_workspaces.owner_id,
        updated_at = now();

  insert into public.cater_profiles (id, workspace_id, email, full_name, phone, company, role)
  values (
    new.id,
    target_workspace_id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'company', ''),
    safe_role
  )
  on conflict (id) do update
    set workspace_id = excluded.workspace_id,
        email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.cater_profiles.full_name),
        phone = coalesce(excluded.phone, public.cater_profiles.phone),
        company = coalesce(excluded.company, public.cater_profiles.company),
        role = excluded.role,
        updated_at = now();

  insert into public.beoflow_workspace_members (workspace_id, user_id, role, status)
  values (
    target_workspace_id,
    new.id,
    case
      when safe_role = 'organizer_pending' then 'organizer'
      when safe_role = 'collaborator_pending' then 'collaborator'
      else 'viewer'
    end,
    'pending'
  )
  on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        status = excluded.status,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists cater_auth_users_create_profile on auth.users;
create trigger cater_auth_users_create_profile
after insert on auth.users
for each row execute function public.cater_handle_new_user();

alter table public.beoflow_workspaces enable row level security;
alter table public.beoflow_workspace_members enable row level security;
alter table public.cater_profiles enable row level security;

drop policy if exists "beoflow_workspaces_insert_pending_owner" on public.beoflow_workspaces;
create policy "beoflow_workspaces_insert_pending_owner"
on public.beoflow_workspaces
for insert
to authenticated
with check (false);

drop policy if exists "beoflow_workspace_members_insert_pending_self_or_admin" on public.beoflow_workspace_members;
create policy "beoflow_workspace_members_insert_pending_self_or_admin"
on public.beoflow_workspace_members
for insert
to authenticated
with check (
  public.beoflow_is_workspace_admin(workspace_id)
  or (
    workspace_id = 'cater-vegas'
    and user_id = (select auth.uid())
    and status = 'pending'
    and role in ('collaborator', 'viewer')
  )
);

drop policy if exists "beoflow_workspace_members_select_own_or_admin" on public.beoflow_workspace_members;
create policy "beoflow_workspace_members_select_own_or_admin"
on public.beoflow_workspace_members
for select
to authenticated
using (user_id = (select auth.uid()) or public.beoflow_is_workspace_admin(workspace_id));

drop policy if exists "beoflow_workspace_members_update_admin" on public.beoflow_workspace_members;
create policy "beoflow_workspace_members_update_admin"
on public.beoflow_workspace_members
for update
to authenticated
using (public.beoflow_is_workspace_admin(workspace_id))
with check (public.beoflow_is_workspace_admin(workspace_id));

drop policy if exists "cater_profiles_insert_safe_self_or_admin" on public.cater_profiles;
create policy "cater_profiles_insert_safe_self_or_admin"
on public.cater_profiles
for insert
to authenticated
with check (
  public.beoflow_is_workspace_admin(workspace_id)
  or (
    workspace_id = 'cater-vegas'
    and (select auth.uid()) = id
    and role in (
      'client_pending',
      'collaborator_pending',
      'organizer_pending',
      'workspace_pending'
    )
  )
);

drop policy if exists "cater_profiles_select_own_or_workspace_admin" on public.cater_profiles;
create policy "cater_profiles_select_own_or_workspace_admin"
on public.cater_profiles
for select
to authenticated
using ((select auth.uid()) = id or public.beoflow_is_workspace_admin(workspace_id));

drop policy if exists "cater_profiles_update_workspace_admin" on public.cater_profiles;
create policy "cater_profiles_update_workspace_admin"
on public.cater_profiles
for update
to authenticated
using (public.beoflow_is_workspace_admin(workspace_id))
with check (public.beoflow_is_workspace_admin(workspace_id));

alter table public.cater_providers enable row level security;

drop policy if exists cater_providers_select_public_active on public.cater_providers;
drop policy if exists "cater_providers_select_public_approved" on public.cater_providers;
drop policy if exists "cater_providers_select_workspace_staff" on public.cater_providers;
drop policy if exists "cater_providers_select_own_submissions" on public.cater_providers;
drop policy if exists "cater_providers_insert_workspace_staff" on public.cater_providers;
drop policy if exists "cater_providers_update_workspace_staff" on public.cater_providers;
drop policy if exists "cater_providers_delete_workspace_admin" on public.cater_providers;

create policy "cater_providers_select_public_approved"
on public.cater_providers
for select
to anon, authenticated
using (
  workspace_id = 'cater-vegas'
  and public_visible = true
  and approval_status = 'approved'
  and status in ('active', 'preferred')
);

create policy "cater_providers_select_workspace_staff"
on public.cater_providers
for select
to authenticated
using (public.beoflow_is_workspace_staff(workspace_id));

create policy "cater_providers_select_own_submissions"
on public.cater_providers
for select
to authenticated
using (
  workspace_id = 'cater-vegas'
  and created_by = (select auth.uid())
);

create policy "cater_providers_insert_workspace_staff"
on public.cater_providers
for insert
to authenticated
with check (
  workspace_id = 'cater-vegas'
  and created_by = (select auth.uid())
  and (
    public.beoflow_is_workspace_admin(workspace_id)
    or (
      public.beoflow_current_workspace_role(workspace_id) = 'collaborator'
      and approval_status = 'pending'
      and public_visible = false
      and approved_by is null
      and approved_at is null
    )
  )
);

create policy "cater_providers_update_workspace_staff"
on public.cater_providers
for update
to authenticated
using (
  public.beoflow_is_workspace_admin(workspace_id)
  or (
    public.beoflow_current_workspace_role(workspace_id) = 'collaborator'
    and created_by = (select auth.uid())
    and approval_status = 'pending'
  )
)
with check (
  public.beoflow_is_workspace_admin(workspace_id)
  or (
    workspace_id = 'cater-vegas'
    and public.beoflow_current_workspace_role(workspace_id) = 'collaborator'
    and created_by = (select auth.uid())
    and approval_status = 'pending'
    and public_visible = false
    and approved_by is null
    and approved_at is null
  )
);

create policy "cater_providers_delete_workspace_admin"
on public.cater_providers
for delete
to authenticated
using (public.beoflow_is_workspace_admin(workspace_id));

grant select on public.cater_providers to anon;
grant select, insert, update, delete on public.cater_providers to authenticated;

delete from public.beoflow_workspace_members
where workspace_id <> 'cater-vegas'
  and workspace_id like 'cater-vegas%';

update public.cater_profiles
set workspace_id = 'cater-vegas',
    role = case
      when role in ('owner', 'admin', 'super_admin', 'platform_admin', 'collaborator', 'organizer', 'client', 'viewer') then role
      when role in ('collaborator_pending', 'organizer_pending', 'client_pending', 'workspace_pending') then role
      else 'collaborator_pending'
    end,
    updated_at = now()
where workspace_id is null
   or workspace_id like 'cater-vegas%';

update public.cater_providers
set workspace_id = 'cater-vegas',
    approval_status = coalesce(approval_status, 'pending'),
    public_visible = case
      when coalesce(approval_status, 'pending') = 'approved' then public_visible
      else false
    end,
    updated_at = now()
where workspace_id is null
   or workspace_id like 'cater-vegas%';

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
