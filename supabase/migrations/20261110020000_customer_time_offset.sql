-- Hora local del cliente para el comprobante: diferencia manual en minutos respecto de Argentina.
-- El código telefónico no indica dónde está la persona, así que se carga a mano por cliente.
alter table public.customers add column if not exists tz_offset_minutes integer
  check (tz_offset_minutes is null or tz_offset_minutes between -540 and 1020);

grant insert(tz_offset_minutes), update(tz_offset_minutes) on public.customers to authenticated;
