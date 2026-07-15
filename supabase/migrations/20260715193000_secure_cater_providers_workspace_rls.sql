begin;

alter table public.cater_providers enable row level security;

drop policy if exists cater_providers_select_public_active on public.cater_providers;
drop policy if exists cater_providers_select_public_approved on public.cater_providers;
drop policy if exists "cater_providers_select_public_approved" on public.cater_providers;
drop policy if exists cater_providers_select_public_approved_default_workspace on public.cater_providers;
drop policy if exists cater_providers_select_workspace_staff on public.cater_providers;
drop policy if exists "cater_providers_select_workspace_staff" on public.cater_providers;
drop policy if exists cater_providers_select_workspace_managers on public.cater_providers;
drop policy if exists cater_providers_select_authenticated_workspace_access on public.cater_providers;
drop policy if exists cater_providers_select_own_submissions on public.cater_providers;
drop policy if exists "cater_providers_select_own_submissions" on public.cater_providers;
drop policy if exists cater_providers_insert_workspace_staff on public.cater_providers;
drop policy if exists "cater_providers_insert_workspace_staff" on public.cater_providers;
drop policy if exists cater_providers_insert_workspace_managers on public.cater_providers;
drop policy if exists cater_providers_insert_workspace_access on public.cater_providers;
drop policy if exists cater_providers_update_workspace_staff on public.cater_providers;
drop policy if exists "cater_providers_update_workspace_staff" on public.cater_providers;
drop policy if exists cater_providers_update_workspace_managers on public.cater_providers;
drop policy if exists cater_providers_update_workspace_access on public.cater_providers;
drop policy if exists cater_providers_delete_workspace_admin on public.cater_providers;
drop policy if exists "cater_providers_delete_workspace_admin" on public.cater_providers;
drop policy if exists cater_providers_delete_workspace_managers on public.cater_providers;

create policy cater_providers_select_public_approved_default_workspace
on public.cater_providers
for select
to anon
using (
  workspace_id = 'cater-vegas'
  and public_visible = true
  and approval_status = 'approved'
  and status in ('active', 'preferred')
);

create policy cater_providers_select_authenticated_workspace_access
on public.cater_providers
for select
to authenticated
using (public.beoflow_can_access_workspace(workspace_id));

create policy cater_providers_insert_workspace_access
on public.cater_providers
for insert
to authenticated
with check (
  created_by = (select auth.uid())
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

create policy cater_providers_update_workspace_access
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
    public.beoflow_current_workspace_role(workspace_id) = 'collaborator'
    and created_by = (select auth.uid())
    and approval_status = 'pending'
    and public_visible = false
    and approved_by is null
    and approved_at is null
  )
);

create policy cater_providers_delete_workspace_admin
on public.cater_providers
for delete
to authenticated
using (public.beoflow_is_workspace_admin(workspace_id));

commit;
