-- Public Cater Vegas request flow.
-- Lets anonymous visitors submit quote requests without granting direct table access.

begin;

create or replace function public.cater_submit_public_request(
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_guest_count integer default null,
  p_notes text default null,
  p_event_date date default null,
  p_event_type text default null,
  p_plan jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id constant text := 'cater-vegas';
  v_customer_id bigint;
  v_event_id bigint;
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_event_type text := nullif(trim(coalesce(p_event_type, '')), '');
  v_cart_count integer := 0;
begin
  if v_full_name = '' then
    raise exception 'Full name is required.' using errcode = '22023';
  end if;

  if v_email = '' or v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Valid email is required.' using errcode = '22023';
  end if;

  if p_guest_count is null or p_guest_count <= 0 then
    raise exception 'Guest count must be greater than zero.' using errcode = '22023';
  end if;

  if p_event_date is null then
    raise exception 'Event date is required.' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_plan, '{}'::jsonb)) <> 'object' then
    raise exception 'Plan must be a JSON object.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_plan -> 'cart') = 'array' then
    v_cart_count := jsonb_array_length(p_plan -> 'cart');
  end if;

  if v_cart_count <= 0 then
    raise exception 'Add at least one item before submitting a request.' using errcode = '22023';
  end if;

  insert into public.cater_customers (
    workspace_id,
    full_name,
    email,
    phone,
    notes
  )
  values (
    v_workspace_id,
    v_full_name,
    v_email,
    v_phone,
    v_notes
  )
  on conflict (workspace_id, (lower(email))) where email is not null
  do update set
    full_name = excluded.full_name,
    phone = coalesce(excluded.phone, public.cater_customers.phone),
    notes = coalesce(excluded.notes, public.cater_customers.notes),
    updated_at = now()
  returning id into v_customer_id;

  insert into public.cater_events (
    workspace_id,
    customer_id,
    title,
    event_type,
    status,
    event_date,
    guest_count,
    notes,
    plan,
    created_by
  )
  values (
    v_workspace_id,
    v_customer_id,
    'Public Request - ' || v_full_name,
    coalesce(v_event_type, 'Public Request'),
    'draft',
    p_event_date,
    p_guest_count,
    v_notes,
    jsonb_set(
      jsonb_set(
        coalesce(p_plan, '{}'::jsonb),
        '{source}',
        to_jsonb('public_index'::text),
        true
      ),
      '{submitted_at}',
      to_jsonb(now()),
      true
    ),
    null
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'request_id', v_event_id,
    'event_id', v_event_id,
    'customer_id', v_customer_id,
    'status', 'draft'
  );
end;
$$;

revoke all on function public.cater_submit_public_request(
  text,
  text,
  text,
  integer,
  text,
  date,
  text,
  jsonb
) from public;

grant execute on function public.cater_submit_public_request(
  text,
  text,
  text,
  integer,
  text,
  date,
  text,
  jsonb
) to anon, authenticated;

commit;
