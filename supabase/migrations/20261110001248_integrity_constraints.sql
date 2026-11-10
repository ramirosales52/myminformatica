-- Historial/notificaciones no pueden apuntar a un turno de otro espacio.
alter table public.activity_log add constraint activity_appointment_workspace_fk
  foreign key(workspace_id,appointment_id) references public.appointments(workspace_id,id);
alter table public.notifications add constraint notification_appointment_workspace_fk
  foreign key(workspace_id,appointment_id) references public.appointments(workspace_id,id);

-- Simultaneidad permite clientes distintos, no duplicar al mismo cliente en el mismo instante.
create unique index appointments_no_duplicate on public.appointments(workspace_id,customer_id,starts_at)
  where deleted_at is null and status <> 'cancelled';
create unique index appointment_service_unique on public.appointment_services(appointment_id,service_id);

create or replace function private.log_event(w uuid,a uuid,action_text text,b jsonb,c jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member(w) then raise exception 'Sin acceso al espacio de trabajo.'; end if;
  insert into public.activity_log(workspace_id,appointment_id,actor_id,action,before_data,after_data)
    values(w,a,auth.uid(),action_text,b,c);
  insert into public.notifications(workspace_id,user_id,appointment_id,title)
    select w,user_id,a,action_text from public.workspace_members
    where workspace_id=w and user_id<>auth.uid() and active;
end $$;
