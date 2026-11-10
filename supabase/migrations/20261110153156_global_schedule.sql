-- Proyección global de solo lectura. No amplía las políticas de las tablas de negocio.
-- SECURITY DEFINER es intencional: comparte únicamente estos campos entre espacios.
create function private.global_schedule()
returns table (
  id uuid, workspace_id uuid, reference text, starts_at timestamptz,
  duration_minutes integer, status text, responsible_id uuid,
  customer_name text, responsible_name text, workspace_name text, services jsonb
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para ver la agenda.'; end if;
  return query
    select a.id, a.workspace_id, a.reference, a.starts_at, a.duration_minutes,
      a.status, a.responsible_id, c.full_name, p.full_name, w.name,
      coalesce((select jsonb_agg(jsonb_build_object('service_id', s.service_id, 'name', s.name) order by s.id)
        from public.appointment_services s where s.appointment_id = a.id and s.workspace_id = a.workspace_id), '[]'::jsonb)
    from public.appointments a
    join public.customers c on c.id = a.customer_id and c.workspace_id = a.workspace_id
    join public.profiles p on p.id = a.responsible_id
    join public.workspaces w on w.id = a.workspace_id
    where a.deleted_at is null;
end $$;

create function public.global_schedule()
returns table (
  id uuid, workspace_id uuid, reference text, starts_at timestamptz,
  duration_minutes integer, status text, responsible_id uuid,
  customer_name text, responsible_name text, workspace_name text, services jsonb
)
language sql stable security invoker set search_path = '' as $$
  select * from private.global_schedule();
$$;

revoke all on function private.global_schedule(), public.global_schedule() from public, anon;
grant execute on function private.global_schedule(), public.global_schedule() to authenticated;
notify pgrst, 'reload schema';
