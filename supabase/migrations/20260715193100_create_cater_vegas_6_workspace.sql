begin;

do $$
declare
  v_expected_user_id constant uuid := '035c21ae-06e6-4984-829f-7b8fc8a2a6bd';
  v_user_id uuid;
  v_email constant text := 'catervegas6@gmail.com';
  v_new_workspace_id constant text := 'cater-vegas-6';
  v_new_slug constant text := 'cater-vegas-6';
begin
  select id
  into v_user_id
  from auth.users
  where lower(email) = lower(v_email)
  limit 1;

  if v_user_id is null then
    raise exception 'User % does not exist in auth.users. Stop.', v_email;
  end if;

  if v_user_id <> v_expected_user_id then
    raise exception 'User % has UUID %, expected %. Stop.', v_email, v_user_id, v_expected_user_id;
  end if;

  if exists (
    select 1
    from public.beoflow_workspaces
    where slug = v_new_slug
      and id <> v_new_workspace_id
  ) then
    raise exception 'Workspace slug % already exists on another workspace. Stop.', v_new_slug;
  end if;

  insert into public.beoflow_workspaces (
    id,
    name,
    slug,
    industry,
    status,
    owner_id
  )
  values (
    v_new_workspace_id,
    'Cater Vegas 6',
    v_new_slug,
    'catering_events',
    'active',
    v_user_id
  )
  on conflict (id) do update
    set name = excluded.name,
        slug = excluded.slug,
        industry = excluded.industry,
        status = 'active',
        owner_id = v_user_id,
        updated_at = now();

  insert into public.cater_profiles (
    id,
    workspace_id,
    email,
    full_name,
    role
  )
  select
    u.id,
    v_new_workspace_id,
    u.email,
    coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)),
    'owner'
  from auth.users u
  where u.id = v_user_id
  on conflict (id) do update
    set workspace_id = excluded.workspace_id,
        email = excluded.email,
        role = 'owner',
        updated_at = now();

  insert into public.beoflow_workspace_members (
    workspace_id,
    user_id,
    role,
    status
  )
  values (
    v_new_workspace_id,
    v_user_id,
    'owner',
    'active'
  )
  on conflict (workspace_id, user_id) do update
    set role = 'owner',
        status = 'active',
        updated_at = now();

  update public.beoflow_workspace_members
  set status = 'disabled',
      updated_at = now()
  where workspace_id = 'cater-vegas'
    and user_id = v_user_id
    and status <> 'disabled';
end;
$$;

commit;
