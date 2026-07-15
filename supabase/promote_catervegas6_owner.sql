-- Promote the Cater Vegas account shown as catervegas6@... to owner access.
-- Run this in the Cater Vegas Supabase SQL Editor as project owner/postgres.

begin;

do $$
declare
  target_user_id uuid;
  target_email text;
begin
  select u.id, u.email
    into target_user_id, target_email
  from auth.users u
  where lower(u.email) like lower('catervegas6@%')
  order by u.created_at desc
  limit 1;

  if target_user_id is null then
    raise exception 'No auth.users account was found for catervegas6@%%.';
  end if;

  insert into public.beoflow_workspaces (id, name, slug, industry, status, owner_id)
  values ('cater-vegas', 'Cater Vegas', 'cater-vegas', 'catering_events', 'active', target_user_id)
  on conflict (id) do update
    set name = excluded.name,
        slug = excluded.slug,
        industry = excluded.industry,
        status = 'active',
        owner_id = coalesce(public.beoflow_workspaces.owner_id, excluded.owner_id),
        updated_at = now();

  insert into public.cater_profiles (id, workspace_id, email, full_name, role)
  values (target_user_id, 'cater-vegas', target_email, coalesce(nullif(target_email, ''), 'Cater Vegas Owner'), 'owner')
  on conflict (id) do update
    set workspace_id = 'cater-vegas',
        email = excluded.email,
        full_name = coalesce(nullif(public.cater_profiles.full_name, ''), excluded.full_name),
        role = 'owner',
        updated_at = now();

  insert into public.beoflow_workspace_members (workspace_id, user_id, role, status)
  values ('cater-vegas', target_user_id, 'owner', 'active')
  on conflict (workspace_id, user_id) do update
    set role = 'owner',
        status = 'active',
        updated_at = now();

  raise notice 'Promoted % (%) to Cater Vegas owner.', target_email, target_user_id;
end $$;

commit;
