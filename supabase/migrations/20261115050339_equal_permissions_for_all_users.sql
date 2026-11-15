-- Negocio único compartido: todas las cuentas autenticadas tienen acceso completo.
-- Los roles históricos se conservan como datos, pero ya no deciden permisos.
-- No se modifican Auth, notificaciones privadas ni validaciones de cobros/agenda.
alter policy workspace_edit on public.workspaces
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

-- Compatibilidad con las RPC antiguas de invitaciones y membresías.
-- Se conserva la firma, pero se elimina toda distinción admin/member.
create or replace function private.is_member(w uuid, admin_only boolean default false)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select private.can_operate_appointments(w);
$$;
revoke all on function private.is_member(uuid,boolean) from public, anon;
grant execute on function private.is_member(uuid,boolean) to authenticated;

create or replace function private.is_business_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null;
$$;
revoke all on function private.is_business_admin() from public, anon;
grant execute on function private.is_business_admin() to authenticated;

notify pgrst, 'reload schema';
