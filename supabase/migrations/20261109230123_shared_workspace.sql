-- Instalación nueva. Nunca ejecutar sobre tablas de otra aplicación.
create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(full_name) between 1 and 120),
  phone text not null default '', avatar_url text not null default '',
  created_at timestamptz not null default now()
);
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  business_name text not null default 'Servicio técnico remoto',
  business_phone text not null default '', business_email text not null default '',
  allow_overlap boolean not null default false,
  timezone text not null default 'America/Argentina/Cordoba' check (timezone = 'America/Argentina/Cordoba'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references public.profiles(id),
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);
create index members_user on public.workspace_members(user_id, workspace_id);
create table private.workspace_invites (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  token_hash text not null unique, expires_at timestamptz not null default now() + interval '7 days',
  created_by uuid not null references public.profiles(id), used_by uuid references public.profiles(id)
);
alter table private.workspace_invites enable row level security;

create function private.is_member(w uuid, admin_only boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.workspace_members m
    where m.workspace_id=w and m.user_id=auth.uid() and (not admin_only or m.role='admin'));
$$;
create function private.shared_profile(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (u=auth.uid() or exists(
    select 1 from public.workspace_members a join public.workspace_members b on a.workspace_id=b.workspace_id
    where a.user_id=auth.uid() and b.user_id=u));
$$;

create table public.customers (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  full_name text not null check(length(full_name) between 1 and 160),
  phone text not null check(phone ~ '^\+[1-9][0-9]{6,14}$'), country_code text not null default '+54',
  notes text not null default '', created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(), unique(workspace_id,phone), unique(workspace_id,id)
);
create table public.services (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  name text not null check(length(name) between 1 and 160), description text not null default '',
  duration_minutes integer not null default 60 check(duration_minutes between 5 and 10080),
  price_ars bigint not null default 0 check(price_ars between 0 and 100000000000),
  price_usd bigint not null default 0 check(price_usd between 0 and 100000000000),
  category text not null default 'General', active boolean not null default true,
  created_at timestamptz not null default now(), unique(workspace_id,id)
);
create table public.appointments (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  reference text not null default ('T-' || upper(replace(gen_random_uuid()::text,'-',''))),
  customer_id uuid not null, responsible_id uuid not null,
  starts_at timestamptz not null, duration_minutes integer not null check(duration_minutes between 5 and 10080),
  status text not null default 'pending' check(status in ('pending','confirmed','completed','rescheduled','cancelled')),
  currency text not null check(currency in ('ARS','USD')), total_cents bigint not null check(total_cents between 0 and 100000000000),
  payment_method text not null default 'undefined' check(payment_method in ('transfer','mercadopago','paypal','binance','cash','other','undefined')),
  notes text not null default '', version integer not null default 1,
  created_by uuid not null references public.profiles(id), updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  request_id uuid not null unique,
  unique(workspace_id,id), unique(workspace_id,reference),
  foreign key(workspace_id,customer_id) references public.customers(workspace_id,id),
  foreign key(workspace_id,responsible_id) references public.workspace_members(workspace_id,user_id)
);
create index appointment_date on public.appointments(workspace_id, starts_at);
create index appointment_customer on public.appointments(workspace_id,customer_id);
create index appointment_responsible on public.appointments(workspace_id,responsible_id);
create table public.appointment_services (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  appointment_id uuid not null, service_id uuid not null,
  name text not null, price_cents bigint not null check(price_cents between 0 and 100000000000),
  duration_minutes integer not null check(duration_minutes between 5 and 10080),
  foreign key(workspace_id,appointment_id) references public.appointments(workspace_id,id),
  foreign key(workspace_id,service_id) references public.services(workspace_id,id)
);
create index appointment_services_parent on public.appointment_services(workspace_id,appointment_id);
create index appointment_services_service on public.appointment_services(workspace_id,service_id);
create table public.payments (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, appointment_id uuid not null,
  kind text not null check(kind in ('charge','refund','correction_charge','correction_refund')),
  amount_cents bigint not null check(amount_cents between 1 and 100000000000),
  currency text not null check(currency in ('ARS','USD')),
  method text not null check(method in ('transfer','mercadopago','paypal','binance','cash','other','undefined')),
  paid_at timestamptz not null default now(), created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id), notes text not null default '', request_id uuid not null unique,
  foreign key(workspace_id,appointment_id) references public.appointments(workspace_id,id)
);
create index payment_date on public.payments(workspace_id,paid_at);
create index payment_appointment on public.payments(workspace_id,appointment_id);
create index payment_author on public.payments(created_by);
create table public.message_templates (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  title text not null check(length(title) between 1 and 160), category text not null default 'General',
  body text not null check(length(body) between 1 and 10000), updated_at timestamptz not null default now()
);
create index template_workspace on public.message_templates(workspace_id);
create table public.activity_log (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  appointment_id uuid, actor_id uuid not null references public.profiles(id),
  action text not null, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create index activity_workspace_date on public.activity_log(workspace_id,created_at desc);
create index activity_appointment on public.activity_log(appointment_id);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references public.profiles(id), appointment_id uuid,
  title text not null, read_at timestamptz, created_at timestamptz not null default now()
);
create index notifications_user on public.notifications(user_id,workspace_id,created_at desc);

-- RLS: lecturas compartidas, escrituras de catálogo, configuración solo administradores.
alter table public.profiles enable row level security;
create policy profile_read on public.profiles for select to authenticated using(private.shared_profile(id));
create policy profile_edit on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
alter table public.workspaces enable row level security;
create policy workspace_read on public.workspaces for select to authenticated using(private.is_member(id));
create policy workspace_edit on public.workspaces for update to authenticated using(private.is_member(id,true)) with check(private.is_member(id,true));
alter table public.workspace_members enable row level security;
create policy members_read on public.workspace_members for select to authenticated using(private.is_member(workspace_id));
do $$ declare t text; begin
  foreach t in array array['customers','services','message_templates','appointments','appointment_services','payments','activity_log'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy workspace_read on public.%I for select to authenticated using (private.is_member(workspace_id))',t);
  end loop;
  foreach t in array array['customers','services','message_templates'] loop
    execute format('create policy workspace_insert on public.%I for insert to authenticated with check (private.is_member(workspace_id))',t);
    execute format('create policy workspace_update on public.%I for update to authenticated using (private.is_member(workspace_id)) with check (private.is_member(workspace_id))',t);
  end loop;
end $$;
create policy template_delete on public.message_templates for delete to authenticated using(private.is_member(workspace_id));
alter table public.notifications enable row level security;
create policy notification_read on public.notifications for select to authenticated using(user_id=(select auth.uid()) and private.is_member(workspace_id));
create policy notification_update on public.notifications for update to authenticated using(user_id=(select auth.uid()) and private.is_member(workspace_id)) with check(user_id=(select auth.uid()) and private.is_member(workspace_id));

-- Concesiones por columna: no se puede trasladar una fila a otro espacio ni falsificar autoría.
revoke all on public.profiles,public.workspaces,public.workspace_members,public.customers,public.services,public.message_templates,public.appointments,public.appointment_services,public.payments,public.activity_log,public.notifications from anon,authenticated;
grant select on public.profiles,public.workspaces,public.workspace_members,public.customers,public.services,public.message_templates,public.appointments,public.appointment_services,public.payments,public.activity_log,public.notifications to authenticated;
grant update(full_name,phone,avatar_url) on public.profiles to authenticated;
grant update(name,business_name,business_phone,business_email,allow_overlap) on public.workspaces to authenticated;
grant insert(workspace_id,full_name,phone,country_code,notes) on public.customers to authenticated;
grant update(full_name,phone,country_code,notes) on public.customers to authenticated;
grant insert(workspace_id,name,description,duration_minutes,price_ars,price_usd,category,active) on public.services to authenticated;
grant update(name,description,duration_minutes,price_ars,price_usd,category,active) on public.services to authenticated;
grant insert(workspace_id,title,category,body) on public.message_templates to authenticated;
grant update(title,category,body,updated_at) on public.message_templates to authenticated;
grant delete on public.message_templates to authenticated;
grant update(read_at) on public.notifications to authenticated;

create function private.ensure_profile(p_name text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  insert into public.profiles(id,full_name) values(auth.uid(), coalesce(nullif(trim(p_name),''),'Integrante')) on conflict(id) do nothing;
end $$;
create function public.ensure_profile(p_name text default null) returns void language sql security invoker set search_path = '' as $$ select private.ensure_profile(p_name); $$;

create function private.create_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare w uuid; n text;
begin
  perform private.ensure_profile();
  if length(trim(p_name)) not between 1 and 120 then raise exception 'Ingresá un nombre válido.'; end if;
  -- Un espacio inicial por persona: evita duplicados si se reintenta el alta.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select workspace_id into w from public.workspace_members where user_id=auth.uid() limit 1;
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
create function public.create_workspace(p_name text) returns uuid language sql security invoker set search_path = '' as $$ select private.create_workspace(p_name); $$;

create function private.create_invite(p_workspace uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare token text := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
  if not private.is_member(p_workspace,true) then raise exception 'Solo un administrador puede invitar integrantes.'; end if;
  insert into private.workspace_invites(workspace_id,token_hash,created_by) values(p_workspace,encode(extensions.digest(token,'sha256'),'hex'),auth.uid());
  return token;
end $$;
create function public.create_invite(p_workspace uuid) returns text language sql security invoker set search_path = '' as $$ select private.create_invite(p_workspace); $$;
create function private.join_workspace(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i private.workspace_invites;
begin
  perform private.ensure_profile();
  select * into i from private.workspace_invites where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if i.id is null or i.expires_at<now() or (i.used_by is not null and i.used_by<>auth.uid()) then raise exception 'Invitación inválida, utilizada o vencida.'; end if;
  insert into public.workspace_members(workspace_id,user_id) values(i.workspace_id,auth.uid()) on conflict do nothing;
  update private.workspace_invites set used_by=auth.uid() where id=i.id;
  return i.workspace_id;
end $$;
create function public.join_workspace(p_token text) returns uuid language sql security invoker set search_path = '' as $$ select private.join_workspace(p_token); $$;
create function private.remove_member(p_workspace uuid,p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member(p_workspace,true) or p_user=auth.uid() then raise exception 'No podés realizar esta acción.'; end if;
  if exists(select 1 from public.appointments where workspace_id=p_workspace and responsible_id=p_user) then raise exception 'Reasigná sus turnos antes de quitar al integrante.'; end if;
  delete from public.workspace_members where workspace_id=p_workspace and user_id=p_user;
end $$;
create function public.remove_member(p_workspace uuid,p_user uuid) returns void language sql security invoker set search_path = '' as $$ select private.remove_member(p_workspace,p_user); $$;

create function private.log_event(w uuid,a uuid,action_text text,b jsonb,c jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member(w) then raise exception 'Sin acceso al espacio de trabajo.'; end if;
  insert into public.activity_log(workspace_id,appointment_id,actor_id,action,before_data,after_data) values(w,a,auth.uid(),action_text,b,c);
  insert into public.notifications(workspace_id,user_id,appointment_id,title)
    select w,user_id,a,action_text from public.workspace_members where workspace_id=w and user_id<>auth.uid();
end $$;

create function private.save_appointment(p_workspace uuid,p_payload jsonb,p_request_id uuid,p_id uuid default null,p_version integer default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare old_row public.appointments; saved public.appointments; line jsonb; paid bigint; existing_id uuid; w public.workspaces; new_start timestamptz; dur integer; new_status text;
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
  end if;
  new_start := (p_payload->>'starts_at')::timestamptz;
  dur := (p_payload->>'duration_minutes')::integer;
  new_status := p_payload->>'status';
  if new_start is null or dur is null or dur not between 5 and 10080 then raise exception 'Fecha o duración inválidas.'; end if;
  if not w.allow_overlap and new_status <> 'cancelled' and exists(
    select 1 from public.appointments a where a.workspace_id=p_workspace and (p_id is null or a.id<>p_id)
    and a.deleted_at is null and a.status not in ('cancelled')
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
    case when old_row.id is null then null else to_jsonb(old_row) end,to_jsonb(saved)||jsonb_build_object('services',p_payload->'services'));
  return saved.id;
end $$;
create function public.save_appointment(p_workspace uuid,p_payload jsonb,p_request_id uuid,p_id uuid default null,p_version integer default null) returns uuid
language sql security invoker set search_path = '' as $$ select private.save_appointment(p_workspace,p_payload,p_request_id,p_id,p_version); $$;

create function private.record_payment(p_appointment uuid,p_amount bigint,p_kind text,p_method text,p_paid_at timestamptz,p_notes text,p_request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.appointments; balance bigint; payment_id uuid;
begin
  select * into a from public.appointments where id=p_appointment;
  if a.id is null or not private.is_member(a.workspace_id) then raise exception 'Sin acceso al turno.'; end if;
  select * into a from public.appointments where id=p_appointment for update;
  select id into payment_id from public.payments where request_id=p_request_id and appointment_id=p_appointment;
  if payment_id is not null then return payment_id; end if;
  if p_amount is null or p_amount<=0 or p_kind not in ('charge','refund','correction_charge','correction_refund') then raise exception 'Importe o tipo de movimiento inválido.'; end if;
  if p_kind like 'correction_%' and length(trim(coalesce(p_notes,'')))<3 then raise exception 'Explicá el motivo de la corrección.'; end if;
  if p_paid_at is null or p_paid_at>now()+interval '1 minute' then raise exception 'La fecha de cobro no puede estar en el futuro.'; end if;
  select coalesce(sum(case when kind in ('refund','correction_refund') then -amount_cents else amount_cents end),0) into balance from public.payments where appointment_id=p_appointment;
  if p_kind in ('charge','correction_charge') and p_amount>a.total_cents-balance then raise exception 'El cobro supera el saldo pendiente. Revisá si otra persona ya registró un pago.'; end if;
  if p_kind in ('refund','correction_refund') and p_amount>balance then raise exception 'La devolución supera el dinero cobrado.'; end if;
  insert into public.payments(workspace_id,appointment_id,kind,amount_cents,currency,method,paid_at,created_by,notes,request_id)
  values(a.workspace_id,a.id,p_kind,p_amount,a.currency,p_method,p_paid_at,auth.uid(),coalesce(p_notes,''),p_request_id) returning id into payment_id;
  perform private.log_event(a.workspace_id,a.id,case when p_kind in ('refund','correction_refund') then 'Devolución o corrección registrada' else 'Pago registrado' end,null,jsonb_build_object('payment_id',payment_id,'amount_cents',p_amount,'currency',a.currency,'kind',p_kind));
  return payment_id;
end $$;
create function public.record_payment(p_appointment uuid,p_amount bigint,p_kind text,p_method text,p_paid_at timestamptz,p_notes text,p_request_id uuid) returns uuid
language sql security invoker set search_path = '' as $$ select private.record_payment(p_appointment,p_amount,p_kind,p_method,p_paid_at,p_notes,p_request_id); $$;

create function private.delete_appointment(p_id uuid,p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id=p_id for update;
  if a.id is null or not private.is_member(a.workspace_id) then raise exception 'Sin acceso al turno.'; end if;
  if a.version is distinct from p_version then raise exception 'El turno cambió. Volvé a abrirlo antes de eliminar.'; end if;
  update public.appointments set deleted_at=now(),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
  perform private.log_event(a.workspace_id,a.id,'Turno eliminado de la agenda',to_jsonb(a),null);
end $$;
create function public.delete_appointment(p_id uuid,p_version integer) returns void language sql security invoker set search_path = '' as $$ select private.delete_appointment(p_id,p_version); $$;

-- Auditoría de catálogos: los cambios también llegan a la actividad del equipo.
create function private.audit_catalog() returns trigger language plpgsql security definer set search_path = '' as $$
declare w uuid; label text;
begin
  w := case when TG_OP='DELETE' then old.workspace_id else new.workspace_id end;
  if auth.uid() is null then return null; end if;
  label := case TG_TABLE_NAME when 'customers' then 'Cliente' when 'services' then 'Servicio' else 'Mensaje' end;
  perform private.log_event(w,null,label||case TG_OP when 'INSERT' then ' creado' when 'UPDATE' then ' actualizado' else ' eliminado' end,
    case when TG_OP='INSERT' then null else to_jsonb(old) end,case when TG_OP='DELETE' then null else to_jsonb(new) end);
  return null;
end $$;
create trigger audit_customers after insert or update on public.customers for each row execute function private.audit_catalog();
create trigger audit_services after insert or update on public.services for each row execute function private.audit_catalog();
create trigger audit_templates after insert or update or delete on public.message_templates for each row execute function private.audit_catalog();

-- Acceso explícito a funciones; nada queda ejecutable por PUBLIC/anon.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_member(uuid,boolean),private.shared_profile(uuid) to authenticated;
grant execute on function private.ensure_profile(text),private.create_workspace(text),private.create_invite(uuid),private.join_workspace(text),private.remove_member(uuid,uuid),private.save_appointment(uuid,jsonb,uuid,uuid,integer),private.record_payment(uuid,bigint,text,text,timestamptz,text,uuid),private.delete_appointment(uuid,integer) to authenticated;
revoke all on function public.ensure_profile(text),public.create_workspace(text),public.create_invite(uuid),public.join_workspace(text),public.remove_member(uuid,uuid),public.save_appointment(uuid,jsonb,uuid,uuid,integer),public.record_payment(uuid,bigint,text,text,timestamptz,text,uuid),public.delete_appointment(uuid,integer) from public,anon;
grant execute on function public.ensure_profile(text),public.create_workspace(text),public.create_invite(uuid),public.join_workspace(text),public.remove_member(uuid,uuid),public.save_appointment(uuid,jsonb,uuid,uuid,integer),public.record_payment(uuid,bigint,text,text,timestamptz,text,uuid),public.delete_appointment(uuid,integer) to authenticated;

-- Storage privado: compartir exige un URL firmado con vencimiento, nunca un bucket público.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('receipts','receipts',false,10485760,array['image/png','application/pdf']);
create policy receipt_read on storage.objects for select to authenticated using(bucket_id='receipts' and private.is_member(((storage.foldername(name))[1])::uuid));
create policy receipt_insert on storage.objects for insert to authenticated with check(bucket_id='receipts' and private.is_member(((storage.foldername(name))[1])::uuid));
create policy receipt_delete on storage.objects for delete to authenticated using(bucket_id='receipts' and private.is_member(((storage.foldername(name))[1])::uuid));

-- Agregar solo nuestras tablas sin reemplazar la publicación de otros módulos.
do $$ declare t text; begin
  foreach t in array array['profiles','workspaces','workspace_members','customers','services','appointments','appointment_services','payments','message_templates','notifications','activity_log'] loop
    execute format('alter table public.%I replica identity full',t);
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;
