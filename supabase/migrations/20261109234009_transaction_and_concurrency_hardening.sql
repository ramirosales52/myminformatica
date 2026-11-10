-- Versionado de todos los formularios compartidos; las columnas de versión no son escribibles por el cliente.
alter table public.profiles add column version integer not null default 1;
alter table public.workspaces add column version integer not null default 1;
alter table public.customers add column version integer not null default 1;
alter table public.services add column version integer not null default 1;
alter table public.message_templates add column version integer not null default 1;
create function private.bump_version() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.version := old.version + 1; return new; end $$;
revoke all on function private.bump_version() from public,anon,authenticated;
create trigger bump_profile before update on public.profiles for each row execute function private.bump_version();
create trigger bump_workspace before update on public.workspaces for each row execute function private.bump_version();
create trigger bump_customer before update on public.customers for each row execute function private.bump_version();
create trigger bump_service before update on public.services for each row execute function private.bump_version();
create trigger bump_template before update on public.message_templates for each row execute function private.bump_version();

-- Revocación sin borrar los autores ni responsables del historial.
alter table public.workspace_members add column active boolean not null default true;
create or replace function private.is_member(w uuid, admin_only boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.workspace_members m
    where m.workspace_id=w and m.user_id=auth.uid() and m.active and (not admin_only or m.role='admin'));
$$;
create or replace function private.shared_profile(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (u=auth.uid() or exists(
    select 1 from public.workspace_members a join public.workspace_members b on a.workspace_id=b.workspace_id
    where a.user_id=auth.uid() and a.active and b.user_id=u));
$$;
create or replace function private.remove_member(p_workspace uuid,p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member(p_workspace,true) or p_user=auth.uid() then raise exception 'No podés realizar esta acción.'; end if;
  update public.workspace_members set active=false where workspace_id=p_workspace and user_id=p_user;
  perform private.log_event(p_workspace,null,'Acceso de integrante revocado',jsonb_build_object('user_id',p_user),null);
end $$;
create or replace function private.join_workspace(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i private.workspace_invites;
begin
  perform private.ensure_profile();
  select * into i from private.workspace_invites where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if i.id is null or i.expires_at<now() or (i.used_by is not null and i.used_by<>auth.uid()) then raise exception 'Invitación inválida, utilizada o vencida.'; end if;
  if i.used_by=auth.uid() then
    if not private.is_member(i.workspace_id) then raise exception 'Tu acceso fue revocado. Solicitá una nueva invitación.'; end if;
    return i.workspace_id;
  end if;
  insert into public.workspace_members(workspace_id,user_id) values(i.workspace_id,auth.uid())
  on conflict(workspace_id,user_id) do update set active=true,role=case when workspace_members.active then workspace_members.role else 'member' end;
  update private.workspace_invites set used_by=auth.uid() where id=i.id;
  perform private.log_event(i.workspace_id,null,'Nuevo integrante en el equipo',null,jsonb_build_object('user_id',auth.uid()));
  return i.workspace_id;
end $$;

-- Alta de turno + anticipo en una sola transacción. Ante un error no queda un turno a medio cobrar.
create or replace function private.save_appointment(p_workspace uuid,p_payload jsonb,p_request_id uuid,p_id uuid default null,p_version integer default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare old_row public.appointments; saved public.appointments; line jsonb; paid bigint; existing_id uuid; w public.workspaces; new_start timestamptz; dur integer; new_status text; old_services jsonb;
begin
  if not private.is_member(p_workspace) then raise exception 'Sin acceso al espacio de trabajo.'; end if;
  select * into w from public.workspaces where id=p_workspace for update;
  if p_id is null then
    select id into existing_id from public.appointments where request_id=p_request_id and workspace_id=p_workspace;
    if existing_id is not null then return existing_id; end if;
  else
    select * into old_row from public.appointments where id=p_id and workspace_id=p_workspace for update;
    if old_row.id is null or old_row.deleted_at is not null then raise exception 'El turno ya no está disponible.'; end if;
    if p_version is distinct from old_row.version then raise exception 'Otro integrante modificó este turno. Cerrá y volvé a abrirlo antes de guardar.'; end if;
    select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into old_services from public.appointment_services s where appointment_id=p_id;
  end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=(p_payload->>'responsible_id')::uuid and active) then raise exception 'Seleccioná un integrante activo como responsable.'; end if;
  new_start := (p_payload->>'starts_at')::timestamptz;
  dur := (p_payload->>'duration_minutes')::integer;
  new_status := p_payload->>'status';
  if new_start is null or dur is null or dur not between 5 and 10080 then raise exception 'Fecha o duración inválidas.'; end if;
  if not w.allow_overlap and new_status <> 'cancelled' and exists(
    select 1 from public.appointments a where a.workspace_id=p_workspace and (p_id is null or a.id<>p_id)
    and a.deleted_at is null and a.status<>'cancelled'
    and a.starts_at < new_start+make_interval(mins=>dur) and a.starts_at+make_interval(mins=>a.duration_minutes)>new_start
  ) then raise exception 'El horario se superpone con otro turno. Elegí otro horario o habilitá turnos simultáneos en Ajustes.'; end if;
  select coalesce(sum(case when kind in ('refund','correction_refund') then -amount_cents else amount_cents end),0) into paid from public.payments where appointment_id=p_id;
  if (p_payload->>'total_cents')::bigint<paid then raise exception 'El precio no puede ser menor que el monto cobrado. Registrá primero la devolución o corrección.'; end if;
  if old_row.id is not null and old_row.currency<>(p_payload->>'currency') and exists(select 1 from public.payments where appointment_id=p_id) then raise exception 'No se puede cambiar la moneda de un turno con movimientos.'; end if;
  if jsonb_typeof(p_payload->'services') is distinct from 'array' or jsonb_array_length(p_payload->'services')=0 then raise exception 'Seleccioná al menos un servicio.'; end if;
  if p_id is null then
    insert into public.appointments(workspace_id,customer_id,responsible_id,starts_at,duration_minutes,status,currency,total_cents,payment_method,notes,created_by,updated_by,request_id)
    values(p_workspace,(p_payload->>'customer_id')::uuid,(p_payload->>'responsible_id')::uuid,new_start,dur,new_status,p_payload->>'currency',(p_payload->>'total_cents')::bigint,coalesce(p_payload->>'payment_method','undefined'),coalesce(p_payload->>'notes',''),auth.uid(),auth.uid(),p_request_id) returning * into saved;
  else
    update public.appointments set customer_id=(p_payload->>'customer_id')::uuid,responsible_id=(p_payload->>'responsible_id')::uuid,starts_at=new_start,duration_minutes=dur,status=new_status,currency=p_payload->>'currency',total_cents=(p_payload->>'total_cents')::bigint,payment_method=coalesce(p_payload->>'payment_method','undefined'),notes=coalesce(p_payload->>'notes',''),version=version+1,updated_by=auth.uid(),updated_at=now()
    where id=p_id returning * into saved;
    delete from public.appointment_services where appointment_id=p_id;
  end if;
  for line in select value from jsonb_array_elements(p_payload->'services') loop
    insert into public.appointment_services(workspace_id,appointment_id,service_id,name,price_cents,duration_minutes)
    values(p_workspace,saved.id,(line->>'service_id')::uuid,line->>'name',(line->>'price_cents')::bigint,(line->>'duration_minutes')::integer);
  end loop;
  perform private.log_event(p_workspace,saved.id,
    case when old_row.id is null then 'Nuevo turno agendado' when saved.status='cancelled' and old_row.status<>'cancelled' then 'Turno cancelado'
    when saved.starts_at<>old_row.starts_at then 'Turno reprogramado' when saved.status<>old_row.status then 'Estado del turno actualizado' else 'Turno editado' end,
    case when old_row.id is null then null else to_jsonb(old_row)||jsonb_build_object('services',old_services) end,to_jsonb(saved)||jsonb_build_object('services',p_payload->'services'));
  if p_id is null and coalesce((p_payload->'initial_payment'->>'amount_cents')::bigint,0)>0 then
    perform private.record_payment(saved.id,(p_payload->'initial_payment'->>'amount_cents')::bigint,'charge',p_payload->'initial_payment'->>'method',(p_payload->'initial_payment'->>'paid_at')::timestamptz,'Cobro inicial al agendar',p_request_id);
  end if;
  return saved.id;
end $$;

-- Recordatorios dentro de la app, deduplicados por integrante y horario del turno.
alter table public.notifications add column event_key text;
create unique index notification_dedupe on public.notifications(user_id,event_key);
create function private.notify_upcoming(p_workspace uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare count_inserted integer;
begin
  if not private.is_member(p_workspace) then raise exception 'Sin acceso al espacio de trabajo.'; end if;
  insert into public.notifications(workspace_id,user_id,appointment_id,title,event_key)
    select p_workspace,auth.uid(),a.id,'Un turno comienza en menos de 15 minutos',a.id::text||':'||a.starts_at::text
    from public.appointments a where a.workspace_id=p_workspace and a.deleted_at is null and a.status in ('pending','confirmed','rescheduled')
    and a.starts_at between now() and now()+interval '15 minutes'
    on conflict(user_id,event_key) do nothing;
  get diagnostics count_inserted = row_count;
  return count_inserted;
end $$;
create function public.notify_upcoming(p_workspace uuid) returns integer language sql security invoker set search_path = '' as $$ select private.notify_upcoming(p_workspace); $$;
revoke all on function private.notify_upcoming(uuid),public.notify_upcoming(uuid) from public,anon;
grant execute on function private.notify_upcoming(uuid),public.notify_upcoming(uuid) to authenticated;

create index if not exists customer_author on public.customers(created_by);
create index if not exists workspace_author on public.workspaces(created_by);
create index if not exists appointment_creator on public.appointments(created_by);
create index if not exists appointment_editor on public.appointments(updated_by);
create index if not exists activity_actor on public.activity_log(actor_id);
create index if not exists notification_workspace on public.notifications(workspace_id);

create or replace function private.create_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare w uuid; n text;
begin
  perform private.ensure_profile();
  if length(trim(p_name)) not between 1 and 120 then raise exception 'Ingresá un nombre válido.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select workspace_id into w from public.workspace_members where user_id=auth.uid() and active limit 1;
  if w is not null then return w; end if;
  insert into public.workspaces(name,created_by) values(trim(p_name),auth.uid()) returning id into w;
  insert into public.workspace_members(workspace_id,user_id,role) values(w,auth.uid(),'admin');
  foreach n in array array['CapCut Pro','Instalación de Adobe','Instalación de CorelDRAW','Instalación de Office','Instalación de Windows 11','Optimización de Windows - NVIDIA','Optimización de Windows - Standard','SketchUp'] loop
    insert into public.services(workspace_id,name,category,description) values(w,n,'Servicio remoto','Configurar precio y duración antes de presupuestar.');
    insert into public.message_templates(workspace_id,title,category,body) values(w,n,'Servicios','¡Hola {nombre_cliente}! 👋' || E'\n\n' || n || E'\nServicio remoto · {precio} {moneda}\n\nCoordinamos un horario para ayudarte.');
  end loop;
  insert into public.message_templates(workspace_id,title,category,body) values
    (w,'Confirmación de turno','Turnos',E'¡Hola {nombre_cliente}! Tu turno para {servicio} está confirmado.\n📅 {fecha} a las {hora} (Argentina).\nImporte acordado: {precio} {moneda}.'),
    (w,'Recordatorio de turno','Turnos',E'¡Hola {nombre_cliente}! Te recordamos tu turno de {servicio} para el {fecha} a las {hora}. ¿Tenés tu computadora lista?'),
    (w,'Confirmación de pago','Cobros',E'¡Hola {nombre_cliente}! Registramos tu pago. ¡Gracias!\nServicio: {servicio}.'),
    (w,'Solicitud de pago pendiente','Cobros',E'¡Hola {nombre_cliente}! Tu servicio de {servicio} tiene un saldo pendiente. Escribinos para coordinar el pago.');
  return w;
end $$;
