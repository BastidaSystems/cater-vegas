begin;

create table if not exists public.cater_providers (
  id bigint generated always as identity primary key,
  workspace_id text not null default 'cater-vegas' references public.beoflow_workspaces(id),
  provider_name text not null,
  provider_type text not null default 'vendor' check (
    provider_type in ('venue', 'food', 'beverage', 'rental', 'staffing', 'transportation', 'entertainment', 'floral', 'decor', 'service', 'vendor', 'other')
  ),
  contact_name text,
  email text,
  phone text,
  website text,
  city text,
  state text,
  status text not null default 'active' check (status in ('active', 'preferred', 'inactive', 'archived')),
  notes text,
  service_category text,
  public_visible boolean not null default false,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by uuid references public.cater_profiles(id) on delete set null,
  approved_at timestamptz,
  public_description text,
  image_url text,
  created_by uuid references public.cater_profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cater_providers add column if not exists workspace_id text not null default 'cater-vegas';
alter table public.cater_providers alter column workspace_id set default 'cater-vegas';
update public.cater_providers set workspace_id = 'cater-vegas' where workspace_id is null;
alter table public.cater_providers alter column workspace_id set not null;
alter table public.cater_providers add column if not exists provider_type text not null default 'vendor';
alter table public.cater_providers alter column provider_type set default 'vendor';
alter table public.cater_providers add column if not exists contact_name text;
alter table public.cater_providers add column if not exists email text;
alter table public.cater_providers add column if not exists phone text;
alter table public.cater_providers add column if not exists website text;
alter table public.cater_providers add column if not exists city text;
alter table public.cater_providers add column if not exists state text;
alter table public.cater_providers add column if not exists status text not null default 'active';
alter table public.cater_providers alter column status set default 'active';
alter table public.cater_providers add column if not exists notes text;
alter table public.cater_providers add column if not exists service_category text;
alter table public.cater_providers add column if not exists public_visible boolean not null default false;
alter table public.cater_providers add column if not exists approval_status text not null default 'pending';
alter table public.cater_providers alter column approval_status set default 'pending';
alter table public.cater_providers add column if not exists approved_by uuid references public.cater_profiles(id) on delete set null;
alter table public.cater_providers add column if not exists approved_at timestamptz;
alter table public.cater_providers add column if not exists public_description text;
alter table public.cater_providers add column if not exists image_url text;
alter table public.cater_providers add column if not exists created_by uuid;
alter table public.cater_providers alter column created_by set default auth.uid();
alter table public.cater_providers drop constraint if exists cater_providers_provider_type_check;
alter table public.cater_providers add constraint cater_providers_provider_type_check
  check (provider_type in ('venue', 'food', 'beverage', 'rental', 'staffing', 'transportation', 'entertainment', 'floral', 'decor', 'service', 'vendor', 'other'));
alter table public.cater_providers drop constraint if exists cater_providers_status_check;
alter table public.cater_providers add constraint cater_providers_status_check
  check (status in ('active', 'preferred', 'inactive', 'archived'));
alter table public.cater_providers drop constraint if exists cater_providers_approval_status_check;
alter table public.cater_providers add constraint cater_providers_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

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

create index if not exists cater_providers_workspace_id_idx on public.cater_providers (workspace_id);
create index if not exists cater_providers_created_by_idx on public.cater_providers (created_by);
create index if not exists cater_providers_email_idx on public.cater_providers (email);
create index if not exists cater_providers_workspace_status_type_idx
  on public.cater_providers (workspace_id, status, provider_type);
create index if not exists cater_providers_workspace_approval_idx
  on public.cater_providers (workspace_id, approval_status, created_at desc);
create index if not exists cater_providers_workspace_created_by_idx
  on public.cater_providers (workspace_id, created_by, created_at desc);
create index if not exists cater_providers_public_filter_idx
  on public.cater_providers (workspace_id, service_category, approval_status, public_visible, status);
create index if not exists cater_providers_public_inventory_idx
  on public.cater_providers (workspace_id, service_category, status, created_at desc)
  where public_visible = true and approval_status = 'approved';

drop trigger if exists cater_providers_set_updated_at on public.cater_providers;
create trigger cater_providers_set_updated_at
before update on public.cater_providers
for each row execute function public.cater_set_updated_at();

alter table public.cater_providers enable row level security;

drop policy if exists "cater_providers_select_workspace_staff" on public.cater_providers;
drop policy if exists "cater_providers_select_public_approved" on public.cater_providers;
drop policy if exists "cater_providers_select_own_submissions" on public.cater_providers;
drop policy if exists cater_providers_select_public_active on public.cater_providers;
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

drop policy if exists "cater_providers_insert_workspace_staff" on public.cater_providers;
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

drop policy if exists "cater_providers_update_workspace_staff" on public.cater_providers;
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

drop policy if exists "cater_providers_delete_workspace_admin" on public.cater_providers;
create policy "cater_providers_delete_workspace_admin"
on public.cater_providers
for delete
to authenticated
using (public.beoflow_is_workspace_admin(workspace_id));

grant select on public.cater_providers to anon;
grant select, insert, update, delete on public.cater_providers to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.cater_providers replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.cater_providers;
exception
  when duplicate_object then
    null;
  when undefined_object then
    null;
end;
$$;

commit;
