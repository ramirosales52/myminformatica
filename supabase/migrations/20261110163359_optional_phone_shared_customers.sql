-- Clientes compartidos por todos los usuarios autenticados, sin depender del espacio.
-- El teléfono vacío no identifica a una persona ni debe impedir registrar otras.
alter table public.customers drop constraint customers_phone_check;
alter table public.customers drop constraint customers_workspace_id_phone_key;
alter table public.customers alter column phone set default '';
alter table public.customers add column deleted_at timestamptz;
alter table public.customers add constraint customers_phone_check
  check (phone = '' or phone ~ '^\+[1-9][0-9]{6,14}$');
create unique index customers_workspace_id_phone_key on public.customers(workspace_id, phone)
  where phone <> '' and deleted_at is null;

alter policy workspace_update on public.customers
  using (private.can_operate_appointments(workspace_id))
  with check (private.can_operate_appointments(workspace_id));
-- Borrado lógico: no destruye referencias, turnos, cobros ni autoría.
grant update(deleted_at) on public.customers to authenticated;

-- El historial de clientes también es compartido, no solo el de turnos.
alter policy appointment_history_read on public.activity_log
  using (private.is_member(workspace_id) or ((select auth.uid()) is not null and
    (appointment_id is not null or action in ('Cliente creado', 'Cliente actualizado', 'Cliente eliminado'))));
notify pgrst, 'reload schema';
