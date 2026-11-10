-- El responsable ahora referencia perfiles globales, sin prefijo de espacio.
create index appointment_responsible_profile on public.appointments(responsible_id);
