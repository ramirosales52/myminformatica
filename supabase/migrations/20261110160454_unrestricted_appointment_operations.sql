-- Decisión del producto: cualquier usuario autenticado puede operar todos los turnos.
-- La administración del negocio, las invitaciones y las plantillas siguen por membresía.
create function private.can_operate_appointments(w uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.workspaces where id = w);
$$;
revoke all on function private.can_operate_appointments(uuid) from public, anon;
grant execute on function private.can_operate_appointments(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['workspaces','profiles','customers','services','appointments','appointment_services','payments'] loop
    execute format('create policy appointment_operations_read on public.%I for select to authenticated using ((select auth.uid()) is not null)', t);
  end loop;
end $$;
create policy appointment_history_read on public.activity_log for select to authenticated
  using (appointment_id is not null and (select auth.uid()) is not null);
-- Permite registrar un cliente desde el formulario de un turno de cualquier espacio.
create policy appointment_customer_insert on public.customers for insert to authenticated
  with check (private.can_operate_appointments(workspace_id));

-- Cualquier usuario registrado puede ser responsable, sin agregar membresías ni roles.
alter table public.appointments drop constraint appointments_workspace_id_responsible_id_fkey;
alter table public.appointments add constraint appointments_responsible_profile_fk
  foreign key (responsible_id) references public.profiles(id);

-- Cambia únicamente la autorización de las RPC existentes. Conserva transacciones,
-- bloqueos, versiones, idempotencia y todas las validaciones económicas y de agenda.
-- Se exige encontrar el guard esperado: ante una definición inesperada, aborta todo.
do $$
declare signature text; definition text; old_responsible text; new_responsible text;
begin
  old_responsible := 'not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=(p_payload->>''responsible_id'')::uuid and active)';
  new_responsible := 'not exists(select 1 from public.profiles where id=(p_payload->>''responsible_id'')::uuid)';
  foreach signature in array array[
    'private.save_appointment(uuid,jsonb,uuid,uuid,integer)',
    'private.record_payment(uuid,bigint,text,text,timestamp with time zone,text,uuid)',
    'private.delete_appointment(uuid,integer)',
    'private.log_event(uuid,uuid,text,jsonb,jsonb)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if strpos(definition, 'private.is_member(') = 0 then
      raise exception 'No se encontró la autorización esperada en %', signature;
    end if;
    definition := replace(definition, 'private.is_member(', 'private.can_operate_appointments(');
    if signature like 'private.save_appointment(%' then
      if strpos(definition, old_responsible) = 0 then
        raise exception 'No se encontró la validación de responsable esperada';
      end if;
      definition := replace(definition, old_responsible, new_responsible);
      definition := replace(definition, 'Seleccioná un integrante activo como responsable.', 'Seleccioná un usuario registrado como responsable.');
    end if;
    execute definition;
  end loop;
end $$;

-- Comprobantes privados y enlaces temporales disponibles para todos los operadores.
create policy appointment_receipt_read on storage.objects for select to authenticated
  using (bucket_id='receipts' and private.can_operate_appointments(((storage.foldername(name))[1])::uuid));
create policy appointment_receipt_insert on storage.objects for insert to authenticated
  with check (bucket_id='receipts' and private.can_operate_appointments(((storage.foldername(name))[1])::uuid));
create policy appointment_receipt_delete on storage.objects for delete to authenticated
  using (bucket_id='receipts' and private.can_operate_appointments(((storage.foldername(name))[1])::uuid));

notify pgrst, 'reload schema';
