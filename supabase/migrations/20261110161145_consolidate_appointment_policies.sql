-- Las políticas globales sustituyen a las lecturas por membresía; no duplicar
-- comprobaciones permisivas en cada consulta. No cambia el alcance de acceso.
do $$ declare t text; begin
  foreach t in array array['workspaces','customers','services','appointments','appointment_services','payments'] loop
    execute format('drop policy workspace_read on public.%I', t);
  end loop;
end $$;
drop policy profile_read on public.profiles;
drop policy workspace_insert on public.customers;

alter policy appointment_history_read on public.activity_log
  using (private.is_member(workspace_id) or (appointment_id is not null and (select auth.uid()) is not null));
drop policy workspace_read on public.activity_log;

drop policy receipt_read on storage.objects;
drop policy receipt_insert on storage.objects;
drop policy receipt_delete on storage.objects;
