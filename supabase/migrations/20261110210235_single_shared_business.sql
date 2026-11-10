-- Vista única del negocio sin borrar, trasladar ni renumerar datos históricos.
-- Los workspace_id existentes quedan como referencias internas de procedencia.
alter table public.appointments drop constraint appointments_workspace_id_customer_id_fkey;
alter table public.appointments add constraint appointments_customer_fk
  foreign key(customer_id) references public.customers(id);
alter table public.appointment_services drop constraint appointment_services_workspace_id_service_id_fkey;
alter table public.appointment_services add constraint appointment_services_service_fk
  foreign key(service_id) references public.services(id);

alter policy members_read on public.workspace_members using ((select auth.uid()) is not null);
create function private.is_business_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null and exists(
    select 1 from public.workspace_members where user_id=auth.uid() and active and role='admin'
  );
$$;
revoke all on function private.is_business_admin() from public, anon;
grant execute on function private.is_business_admin() to authenticated;
alter policy workspace_edit on public.workspaces
  using (private.is_business_admin()) with check (private.is_business_admin());

alter policy workspace_read on public.message_templates using ((select auth.uid()) is not null);
do $$ declare t text; begin
  foreach t in array array['services','message_templates'] loop
    execute format('alter policy workspace_insert on public.%I with check (private.can_operate_appointments(workspace_id))', t);
    execute format('alter policy workspace_update on public.%I using (private.can_operate_appointments(workspace_id)) with check (private.can_operate_appointments(workspace_id))', t);
  end loop;
end $$;
alter policy template_delete on public.message_templates using ((select auth.uid()) is not null);
alter policy appointment_history_read on public.activity_log using ((select auth.uid()) is not null);
-- Los avisos personales siguen siendo privados, pero ya no dependen de membresías.
alter policy notification_read on public.notifications using (user_id=(select auth.uid()));
alter policy notification_update on public.notifications
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

-- Mantiene la RPC para clientes anteriores, pero nunca crea un segundo negocio.
-- En instalaciones vacías conserva el alta inicial y su catálogo original.
do $$ declare definition text; old_selection text; begin
  definition := pg_get_functiondef('private.create_workspace(text)'::regprocedure);
  old_selection := 'select workspace_id into w from public.workspace_members where user_id=auth.uid() and active limit 1;';
  if strpos(definition, old_selection)=0 then raise exception 'Alta de negocio inesperada'; end if;
  definition := replace(definition, 'hashtextextended(auth.uid()::text, 0)', 'hashtextextended(''single_shared_business'', 0)');
  definition := replace(definition, old_selection,
    'select id into w from public.workspaces order by created_at,id limit 1;');
  execute definition;
end $$;

-- Un único bloqueo de agenda para que turnos históricos y nuevos no se superpongan
-- por pertenecer a distintos espacios. No cambia cobros, versiones ni idempotencia.
do $$ declare definition text; old_lock text; begin
  definition := pg_get_functiondef('private.save_appointment(uuid,jsonb,uuid,uuid,integer)'::regprocedure);
  old_lock := 'select * into w from public.workspaces where id=p_workspace for update;';
  if strpos(definition, old_lock)=0 or strpos(definition, 'a.workspace_id=p_workspace and (p_id is null')=0 then
    raise exception 'Validación de agenda inesperada';
  end if;
  definition := replace(definition, old_lock,
    'select * into w from public.workspaces order by created_at,id limit 1 for update;');
  definition := replace(definition, 'a.workspace_id=p_workspace and (p_id is null', '(p_id is null');
  execute definition;
end $$;

create or replace function private.log_event(w uuid,a uuid,action_text text,b jsonb,c jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_operate_appointments(w) then raise exception 'Iniciá sesión para continuar.'; end if;
  insert into public.activity_log(workspace_id,appointment_id,actor_id,action,before_data,after_data)
    values(w,a,auth.uid(),action_text,b,c);
  insert into public.notifications(workspace_id,user_id,appointment_id,title)
    select w,id,a,action_text from public.profiles where id<>auth.uid();
end $$;

create or replace function private.notify_upcoming(p_workspace uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare count_inserted integer;
begin
  if not private.can_operate_appointments(p_workspace) then raise exception 'Iniciá sesión para continuar.'; end if;
  insert into public.notifications(workspace_id,user_id,appointment_id,title,event_key)
    select a.workspace_id,auth.uid(),a.id,'Un turno comienza en menos de 15 minutos',a.id::text||':'||a.starts_at::text
    from public.appointments a where a.deleted_at is null and a.status in ('pending','confirmed','rescheduled')
    and a.starts_at between now() and now()+interval '15 minutes'
    on conflict(user_id,event_key) do nothing;
  get diagnostics count_inserted = row_count;
  return count_inserted;
end $$;
notify pgrst, 'reload schema';
