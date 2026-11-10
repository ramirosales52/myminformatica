# Verificación

Se utiliza Supabase **local real**: Auth, PostgreSQL, Realtime y Storage en `127.0.0.1:55321/55322`. No se usan mocks ni proyectos remotos existentes.

```bash
npm ci
npx supabase@2.116.0 start
# Configurar .env.local con URL y clave publicable locales.
npm test
npm run test:integration
npm run test:e2e
npm run lint
npm run build
```

Playwright aprovecha `/usr/bin/chromium` si existe. En otra máquina: `npx playwright install chromium` o `CHROMIUM_PATH` con un navegador compatible.

Las suites crean cuentas y espacios de verificación y eliminan **solo sus UUID** en `afterAll`; no usan `db reset`. Si se termina el proceso a la fuerza, eliminá únicamente esos registros de prueba. No ejecutar en producción.

## Escenarios solicitados

| #   | Escenario                               | Cobertura                                             |
| --- | --------------------------------------- | ----------------------------------------------------- |
| 1   | A crea y B recibe automáticamente       | Evento INSERT real y dos contextos de navegador       |
| 2   | B cambia estado y A recibe              | Evento UPDATE y navegador sin recargar                |
| 3   | USD 20 con pago de USD 10               | Reglas, SQL real y formulario con anticipo            |
| 4   | Segunda mitad sin duplicación           | Cobros concurrentes y reintento idempotente           |
| 5   | Monedas separadas                       | Reglas e integración ARS/USD                          |
| 6   | Completado no pagado no genera ingresos | Reglas y operación real                               |
| 7   | Cancelación conserva historial          | Turno consultable y cobros intactos                   |
| 8   | Cambio de catálogo no modifica acuerdos | Modificar precio/duración y comprobar snapshots       |
| 9   | Comprobante correcto                    | Datos y descargas reales PNG/PDF                      |
| 10  | WhatsApp correcto                       | Teléfono internacional, texto y enlace firmado        |
| 11  | Mensajes persistentes                   | Edición con emojis, recarga y cierre/inicio de sesión |
| 12  | Reportes por movimientos reales         | Fechas argentinas, filtros y CSV                      |
| 13  | Datos al volver a ingresar              | Salir, ingresar y consultar turno pagado              |

## Controles adicionales

- Agenda y detalles operativos disponibles para integrantes, usuarios de otro espacio y una cuarta cuenta sin membresías. Acceso anónimo rechazado en lectura y RPC de escritura.
- Operadores ajenos crean clientes/turnos, editan, reasignan responsables sin membresías, cobran, devuelven y eliminan lógicamente. Se conservan autoría, historial, versiones y validaciones económicas; administración, plantillas y escrituras directas siguen protegidas.
- Paginación estable de la agenda global; los cambios de estado se reflejan y los turnos eliminados dejan de mostrarse.
- Navegador: cuenta sin membresías busca por teléfono, edita/reprograma un turno ajeno sin cambiar su cliente/catálogo/espacio, se asigna como responsable, cobra, comparte y revoca un comprobante con los datos comerciales originales, cancela y elimina. Recibe cambios de otro operador sin recargar y crea nuevos turnos con clientes nuevos. Agenda y detalle comprobados también a 360 px.
- Prohibidas escrituras directas en pagos y cambios del negocio sin rol administrador.
- Invitaciones y revocación de acceso sin borrar autoría.
- Claves compuestas impiden referencias a clientes de otro espacio.
- Teléfonos duplicados rechazados por índice único.
- Versiones obsoletas de turnos y mensajes rechazadas.
- Control de superposiciones en el servidor.
- Anticipo inválido revierte el alta completa.
- Devoluciones superiores al cobrado rechazadas.
- Eliminación lógica conserva ingresos.
- CSV neutraliza fórmulas y preserva caracteres especiales.
- Storage: URL firmada funciona, URL pública no; revocar elimina el archivo.
- Móvil a 390 px sin desbordamiento horizontal y menú operativo.
- Sin errores JavaScript de página en el recorrido.

## Base de datos

```bash
npx supabase@2.116.0 db lint --local --schema public,private --fail-on error
npx supabase@2.116.0 db advisors --local --type all --level warn --fail-on error
```

Resultado local: sin errores de esquema y sin advertencias/errores de los asesores. RLS en todas las tablas propias; funciones privilegiadas en `private`, fuera de la Data API.

## Antes de operar en producción

Las pruebas locales **no sustituyen** la aceptación en el dominio final:

1. Confirmar email y recuperar contraseña con SMTP real.
2. Crear dos cuentas y aceptar una invitación en HTTPS.
3. Con dos sesiones abiertas, crear, editar y cobrar un turno.
4. Desconectar una sesión y comprobar reconciliación al volver.
5. Descargar comprobante y abrir enlace desde un dispositivo sin sesión.
6. Confirmar manualmente un envío en WhatsApp real. Los tests no envían mensajes externos.
7. Revisar backups, encabezados, políticas, URL Configuration y aislamiento con una tercera cuenta.

**No hay despliegue remoto verificado.** Faltan el proyecto nuevo y Vercel. Costos, SMTP y dominios no se activan automáticamente.
