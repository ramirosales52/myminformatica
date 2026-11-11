-- Borrado lógico: conserva las referencias, acuerdos e informes históricos.
alter table public.services add column deleted_at timestamptz;
grant update(deleted_at) on public.services to authenticated;
alter table public.services add constraint services_deleted_inactive
  check (deleted_at is null or not active);

-- El catálogo ahora es compartido por todo el negocio, no por workspace.
-- Los nombres eliminados pueden volver a usarse.
create unique index services_unique_catalog_name on public.services
  (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')))
  where deleted_at is null;
notify pgrst, 'reload schema';
