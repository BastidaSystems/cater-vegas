-- Allow Cater Vegas Create Account signups to become workspace owners.
-- Run in the CATER VEGAS Supabase project.

begin;

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
      'collaborator',
      'workspace_pending',
      'collaborator_pending',
      'organizer_pending',
      'client_pending'
    )
  );

create or replace function public.cater_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'cater_role', '');
  safe_role text := 'client_pending';
  target_workspace_id text;
  workspace_name text;
  workspace_slug text;
begin
  if requested_role in (
    'owner',
    'admin',
    'super_admin',
    'platform_admin',
    'organizer',
    'client',
    'client_pending',
    'collaborator_pending',
    'organizer_pending',
    'workspace_pending'
  ) then
    safe_role := requested_role;
  end if;

  target_workspace_id := coalesce(
    nullif(new.raw_user_meta_data ->> 'workspace_id', ''),
    case
      when safe_role in ('owner', 'admin', 'super_admin', 'platform_admin', 'organizer')
        then 'cater-vegas-' || replace(new.id::text, '-', '')
      else 'cater-vegas'
    end
  );
  workspace_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'workspace_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', '') || ' Workspace',
    split_part(new.email, '@', 1) || ' Workspace'
  );
  workspace_slug := lower(regexp_replace(target_workspace_id, '[^a-z0-9]+', '-', 'g'));

  if safe_role in ('owner', 'admin', 'super_admin', 'platform_admin', 'organizer') then
    insert into public.beoflow_workspaces (id, name, slug, industry, status, owner_id)
    values (target_workspace_id, workspace_name, workspace_slug, 'catering_events', 'active', new.id)
    on conflict (id) do update
      set name = coalesce(nullif(public.beoflow_workspaces.name, ''), excluded.name),
          industry = coalesce(public.beoflow_workspaces.industry, excluded.industry),
          status = 'active',
          owner_id = coalesce(public.beoflow_workspaces.owner_id, excluded.owner_id),
          updated_at = now();
  end if;

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
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.cater_profiles.full_name),
        phone = coalesce(excluded.phone, public.cater_profiles.phone),
        company = coalesce(excluded.company, public.cater_profiles.company),
        updated_at = now();

  if safe_role in ('owner', 'admin', 'super_admin', 'platform_admin', 'organizer') then
    insert into public.beoflow_workspace_members (workspace_id, user_id, role, status)
    values (target_workspace_id, new.id, safe_role, 'active')
    on conflict (workspace_id, user_id) do update
      set role = excluded.role,
          status = 'active',
          updated_at = now();
  end if;

  return new;
end;
$$;

drop policy if exists "cater_profiles_insert_safe_self_or_admin" on public.cater_profiles;
create policy "cater_profiles_insert_safe_self_or_admin"
on public.cater_profiles
for insert
to authenticated
with check (
  public.beoflow_is_workspace_admin(workspace_id)
  or (
    (select auth.uid()) = id
    and role in (
      'owner',
      'admin',
      'super_admin',
      'platform_admin',
      'organizer',
      'client',
      'client_pending',
      'collaborator_pending',
      'organizer_pending',
      'workspace_pending'
    )
  )
);

create or replace function public.beoflow_can_access_workspace(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.beoflow_workspace_members m
    where m.workspace_id = target_workspace_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
  or exists (
    select 1
    from public.cater_profiles p
    where p.id = (select auth.uid())
      and p.workspace_id = target_workspace_id
      and p.role in ('owner', 'admin', 'super_admin', 'platform_admin', 'staff', 'organizer', 'collaborator', 'client')
  );
$$;

commit;
