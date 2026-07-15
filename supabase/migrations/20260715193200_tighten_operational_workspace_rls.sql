begin;

alter table public.cater_customers enable row level security;
alter table public.cater_events enable row level security;
alter table public.cater_beoflow_messages enable row level security;
alter table public.cater_plan_versions enable row level security;
alter table public.cater_collaborators enable row level security;
alter table public.cater_event_assignments enable row level security;

drop policy if exists cater_customers_select_workspace_or_self on public.cater_customers;
drop policy if exists "cater_customers_select_workspace_or_self" on public.cater_customers;
drop policy if exists cater_customers_insert_workspace_or_self on public.cater_customers;
drop policy if exists "cater_customers_insert_workspace_or_self" on public.cater_customers;
drop policy if exists cater_customers_update_workspace_staff on public.cater_customers;
drop policy if exists "cater_customers_update_workspace_staff" on public.cater_customers;
drop policy if exists cater_customers_delete_workspace_admin on public.cater_customers;
drop policy if exists "cater_customers_delete_workspace_admin" on public.cater_customers;

create policy cater_customers_select_workspace_or_self
on public.cater_customers
for select
to authenticated
using (
  public.beoflow_is_workspace_staff(workspace_id)
  or (
    public.beoflow_can_access_workspace(workspace_id)
    and lower(coalesce(email, '')) = lower(public.cater_current_auth_email())
  )
);

create policy cater_customers_insert_workspace_or_self
on public.cater_customers
for insert
to authenticated
with check (
  public.beoflow_is_workspace_staff(workspace_id)
  or (
    public.beoflow_can_access_workspace(workspace_id)
    and lower(coalesce(email, '')) = lower(public.cater_current_auth_email())
  )
);

create policy cater_customers_update_workspace_staff
on public.cater_customers
for update
to authenticated
using (public.beoflow_is_workspace_staff(workspace_id))
with check (public.beoflow_is_workspace_staff(workspace_id));

create policy cater_customers_delete_workspace_admin
on public.cater_customers
for delete
to authenticated
using (public.beoflow_is_workspace_admin(workspace_id));

drop policy if exists cater_events_select_by_workspace_role on public.cater_events;
drop policy if exists "cater_events_select_by_workspace_role" on public.cater_events;
drop policy if exists cater_events_select_workspace_managers on public.cater_events;
drop policy if exists cater_events_insert_by_workspace_role on public.cater_events;
drop policy if exists "cater_events_insert_by_workspace_role" on public.cater_events;
drop policy if exists cater_events_insert_workspace_managers on public.cater_events;
drop policy if exists cater_events_update_by_workspace_role on public.cater_events;
drop policy if exists "cater_events_update_by_workspace_role" on public.cater_events;
drop policy if exists cater_events_update_workspace_managers on public.cater_events;
drop policy if exists cater_events_delete_workspace_admin on public.cater_events;
drop policy if exists "cater_events_delete_workspace_admin" on public.cater_events;
drop policy if exists cater_events_delete_workspace_managers on public.cater_events;

create policy cater_events_select_by_workspace_role
on public.cater_events
for select
to authenticated
using (
  public.beoflow_is_workspace_staff(workspace_id)
  or (
    public.beoflow_can_access_workspace(workspace_id)
    and (
      client_id = (select auth.uid())
      or created_by = (select auth.uid())
      or (customer_id is not null and public.cater_customer_email_matches(customer_id))
    )
  )
);

create policy cater_events_insert_by_workspace_role
on public.cater_events
for insert
to authenticated
with check (
  public.beoflow_is_workspace_staff(workspace_id)
  or (
    public.beoflow_can_access_workspace(workspace_id)
    and (
      client_id = (select auth.uid())
      or created_by = (select auth.uid())
    )
  )
);

create policy cater_events_update_by_workspace_role
on public.cater_events
for update
to authenticated
using (
  public.beoflow_is_workspace_staff(workspace_id)
  or (
    public.beoflow_can_access_workspace(workspace_id)
    and (
      client_id = (select auth.uid())
      or created_by = (select auth.uid())
      or (customer_id is not null and public.cater_customer_email_matches(customer_id))
    )
  )
)
with check (
  public.beoflow_is_workspace_staff(workspace_id)
  or (
    public.beoflow_can_access_workspace(workspace_id)
    and (
      client_id = (select auth.uid())
      or created_by = (select auth.uid())
    )
  )
);

create policy cater_events_delete_workspace_admin
on public.cater_events
for delete
to authenticated
using (public.beoflow_is_workspace_admin(workspace_id));

drop policy if exists cater_beoflow_messages_select_event_access on public.cater_beoflow_messages;
drop policy if exists "cater_beoflow_messages_select_event_access" on public.cater_beoflow_messages;
drop policy if exists cater_beoflow_messages_insert_event_access on public.cater_beoflow_messages;
drop policy if exists "cater_beoflow_messages_insert_event_access" on public.cater_beoflow_messages;
drop policy if exists cater_beoflow_messages_delete_workspace_admin on public.cater_beoflow_messages;
drop policy if exists "cater_beoflow_messages_delete_workspace_admin" on public.cater_beoflow_messages;

create policy cater_beoflow_messages_select_event_access
on public.cater_beoflow_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.cater_events e
    where e.id = public.cater_beoflow_messages.event_id
      and e.workspace_id = public.cater_beoflow_messages.workspace_id
      and public.cater_can_access_event(e.id)
  )
);

create policy cater_beoflow_messages_insert_event_access
on public.cater_beoflow_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.cater_events e
    where e.id = public.cater_beoflow_messages.event_id
      and e.workspace_id = public.cater_beoflow_messages.workspace_id
      and public.cater_can_access_event(e.id)
  )
  and (
    user_id is null
    or user_id = (select auth.uid())
    or public.beoflow_is_workspace_staff(workspace_id)
  )
);

create policy cater_beoflow_messages_delete_workspace_admin
on public.cater_beoflow_messages
for delete
to authenticated
using (public.beoflow_is_workspace_admin(workspace_id));

drop policy if exists cater_plan_versions_select_event_access on public.cater_plan_versions;
drop policy if exists "cater_plan_versions_select_event_access" on public.cater_plan_versions;
drop policy if exists cater_plan_versions_insert_event_access on public.cater_plan_versions;
drop policy if exists "cater_plan_versions_insert_event_access" on public.cater_plan_versions;
drop policy if exists cater_plan_versions_update_workspace_admin on public.cater_plan_versions;
drop policy if exists "cater_plan_versions_update_workspace_admin" on public.cater_plan_versions;
drop policy if exists cater_plan_versions_delete_workspace_admin on public.cater_plan_versions;
drop policy if exists "cater_plan_versions_delete_workspace_admin" on public.cater_plan_versions;

create policy cater_plan_versions_select_event_access
on public.cater_plan_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.cater_events e
    where e.id = public.cater_plan_versions.event_id
      and e.workspace_id = public.cater_plan_versions.workspace_id
      and public.cater_can_access_event(e.id)
  )
);

create policy cater_plan_versions_insert_event_access
on public.cater_plan_versions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.cater_events e
    where e.id = public.cater_plan_versions.event_id
      and e.workspace_id = public.cater_plan_versions.workspace_id
      and public.cater_can_access_event(e.id)
  )
  and (
    created_by is null
    or created_by = (select auth.uid())
    or public.beoflow_is_workspace_staff(workspace_id)
  )
);

create policy cater_plan_versions_update_workspace_admin
on public.cater_plan_versions
for update
to authenticated
using (public.beoflow_is_workspace_admin(workspace_id))
with check (public.beoflow_is_workspace_admin(workspace_id));

create policy cater_plan_versions_delete_workspace_admin
on public.cater_plan_versions
for delete
to authenticated
using (public.beoflow_is_workspace_admin(workspace_id));

drop policy if exists cater_collaborators_select_by_workspace_or_event on public.cater_collaborators;
drop policy if exists "cater_collaborators_select_by_workspace_or_event" on public.cater_collaborators;
drop policy if exists cater_collaborators_select_by_role_or_event on public.cater_collaborators;
drop policy if exists "cater_collaborators_select_by_role_or_event" on public.cater_collaborators;
drop policy if exists cater_collaborators_insert_workspace_admin on public.cater_collaborators;
drop policy if exists "cater_collaborators_insert_workspace_admin" on public.cater_collaborators;
drop policy if exists cater_collaborators_update_workspace_admin on public.cater_collaborators;
drop policy if exists "cater_collaborators_update_workspace_admin" on public.cater_collaborators;
drop policy if exists cater_collaborators_delete_workspace_admin on public.cater_collaborators;
drop policy if exists "cater_collaborators_delete_workspace_admin" on public.cater_collaborators;

create policy cater_collaborators_select_by_workspace_or_event
on public.cater_collaborators
for select
to authenticated
using (
  public.beoflow_is_workspace_staff(workspace_id)
  or (
    public.beoflow_can_access_workspace(workspace_id)
    and public.cater_is_current_collaborator(id)
  )
  or exists (
    select 1
    from public.cater_event_assignments a
    where a.collaborator_id = public.cater_collaborators.id
      and a.workspace_id = public.cater_collaborators.workspace_id
      and public.cater_can_access_event(a.event_id)
  )
);

create policy cater_collaborators_insert_workspace_admin
on public.cater_collaborators
for insert
to authenticated
with check (public.beoflow_is_workspace_admin(workspace_id));

create policy cater_collaborators_update_workspace_admin
on public.cater_collaborators
for update
to authenticated
using (public.beoflow_is_workspace_admin(workspace_id))
with check (public.beoflow_is_workspace_admin(workspace_id));

create policy cater_collaborators_delete_workspace_admin
on public.cater_collaborators
for delete
to authenticated
using (public.beoflow_is_workspace_admin(workspace_id));

drop policy if exists cater_event_assignments_select_event_access on public.cater_event_assignments;
drop policy if exists "cater_event_assignments_select_event_access" on public.cater_event_assignments;
drop policy if exists cater_event_assignments_insert_workspace_staff on public.cater_event_assignments;
drop policy if exists "cater_event_assignments_insert_workspace_staff" on public.cater_event_assignments;
drop policy if exists cater_event_assignments_update_workspace_staff on public.cater_event_assignments;
drop policy if exists "cater_event_assignments_update_workspace_staff" on public.cater_event_assignments;
drop policy if exists cater_event_assignments_delete_workspace_admin on public.cater_event_assignments;
drop policy if exists "cater_event_assignments_delete_workspace_admin" on public.cater_event_assignments;

create policy cater_event_assignments_select_event_access
on public.cater_event_assignments
for select
to authenticated
using (
  public.beoflow_is_workspace_staff(workspace_id)
  or (
    public.beoflow_can_access_workspace(workspace_id)
    and public.cater_is_current_collaborator(collaborator_id)
  )
  or exists (
    select 1
    from public.cater_events e
    where e.id = public.cater_event_assignments.event_id
      and e.workspace_id = public.cater_event_assignments.workspace_id
      and public.cater_can_access_event(e.id)
  )
);

create policy cater_event_assignments_insert_workspace_staff
on public.cater_event_assignments
for insert
to authenticated
with check (
  public.beoflow_is_workspace_staff(workspace_id)
  and exists (
    select 1
    from public.cater_events e
    where e.id = public.cater_event_assignments.event_id
      and e.workspace_id = public.cater_event_assignments.workspace_id
      and public.cater_can_access_event(e.id)
  )
);

create policy cater_event_assignments_update_workspace_staff
on public.cater_event_assignments
for update
to authenticated
using (
  public.beoflow_is_workspace_staff(workspace_id)
  and exists (
    select 1
    from public.cater_events e
    where e.id = public.cater_event_assignments.event_id
      and e.workspace_id = public.cater_event_assignments.workspace_id
      and public.cater_can_access_event(e.id)
  )
)
with check (
  public.beoflow_is_workspace_staff(workspace_id)
  and exists (
    select 1
    from public.cater_events e
    where e.id = public.cater_event_assignments.event_id
      and e.workspace_id = public.cater_event_assignments.workspace_id
      and public.cater_can_access_event(e.id)
  )
);

create policy cater_event_assignments_delete_workspace_admin
on public.cater_event_assignments
for delete
to authenticated
using (public.beoflow_is_workspace_admin(workspace_id));

commit;
