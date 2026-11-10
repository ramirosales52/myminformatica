# Arquitectura

## Decisiones

- SPA Vite + React + TypeScript. Se prioriza el requisito tecnológico inicial sobre la mención contradictoria a Next.js.
- Supabase Auth, PostgreSQL, Realtime y Storage privado. No hay base de datos simulada ni clientes de ejemplo.
- TanStack Query mantiene una caché volátil; las escrituras se confirman en PostgreSQL antes de informar éxito. Solo la sesión de Auth se persiste en el navegador.
- Cada fila de negocio pertenece a un `workspace_id`. RLS verifica integrantes, no metadatos editables del JWT.
- La agenda es global para cualquier usuario autenticado, incluso sin espacio. `public.global_schedule` delega a una función privada con autorización explícita que comparte solo fecha, duración, estado, referencia, nombres de cliente/responsable/espacio y servicios. No expone teléfonos, notas, importes, cobros ni historial. Las tablas completas y todas las escrituras conservan RLS por espacio. La agenda se reconcilia cada 15 segundos y al refrescar datos propios.
- Importes enteros en centavos. ARS y USD nunca se convierten ni suman entre sí.
- Turnos y cobros se escriben mediante RPC transaccionales; las funciones privilegiadas viven en `private`, fuera de los esquemas de la Data API, con autorización explícita y `search_path` fijo.
- Bloqueo del espacio de trabajo para editar agenda y comprobar superposiciones; bloqueo del turno para cobrar. Versionado optimista evita sobrescribir ediciones concurrentes. UUID de solicitud evita repetir altas y cobros al reintentar.
- Los movimientos económicos son inmutables. Una corrección agrega un movimiento compensatorio. La eliminación de un turno es lógica y no elimina sus cobros ni su historial.
- Los servicios del turno son instantáneas de nombre, precio y duración. Modificar el catálogo no cambia lo acordado.
- Fechas persistidas como `timestamptz`, interpretación y filtros con `America/Argentina/Cordoba`. Los comprobantes pueden mostrarse en la hora del país del cliente con la diferencia horaria que se carga a mano en su ficha; sin APIs externas.
- Los comprobantes se generan en el dispositivo. Para compartir se carga un PNG a un bucket privado y se genera un enlace firmado de una hora, con confirmación explícita. WhatsApp siempre requiere que el operador confirme el envío.

## Estructura

```
src/
  components/       UI, formularios y comprobantes
  lib/              cliente Supabase, tipos y reglas puras
  providers/        sesión, datos compartidos y notificaciones UI
  pages/            siete módulos de gestión
supabase/
  migrations/       esquema, restricciones, RLS y RPC
tests/              reglas, integración SQL y navegador
docs/               instalación, operación y pruebas
```

## Modelo

`profiles → workspace_members ← workspaces → customers / services / appointments / message_templates`

`appointments → appointment_services / payments / activity_log`

`workspace_members → notifications`; `private.workspace_invites` guarda únicamente hashes de invitaciones.

## Límites operativos

La instalación remota requiere un proyecto Supabase nuevo y sus variables públicas. No se modifican proyectos existentes. Los reportes de ingresos usan la fecha del movimiento; las estadísticas de trabajos y pendientes del período usan la fecha del turno y se identifican como tales. Los pagos de turnos eliminados permanecen en los reportes. Sin WhatsApp Business API no existe envío automático.
