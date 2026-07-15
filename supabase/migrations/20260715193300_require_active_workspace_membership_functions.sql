begin;

create or replace function public.beoflow_current_workspace_role(target_workspace_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.beoflow_workspace_members m
  where m.workspace_id = target_workspace_id
    and m.user_id = (select auth.uid())
    and m.status = 'active'
  limit 1;
$$;

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
  );
$$;

create or replace function public.beoflow_is_workspace_admin(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.beoflow_current_workspace_role(target_workspace_id), '') in ('owner', 'admin', 'super_admin', 'platform_admin');
$$;

create or replace function public.beoflow_is_workspace_staff(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.beoflow_current_workspace_role(target_workspace_id), '') in ('owner', 'admin', 'super_admin', 'platform_admin', 'organizer');
$$;

commit;
