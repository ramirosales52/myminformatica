# Tu agenda · Turnos y cobros

Gestión para un equipo de servicio técnico remoto. Interfaz en español, modo oscuro y **Vite + React + TypeScript + Tailwind + Supabase**, preparada para Vercel.

Se priorizó Vite, como pide la arquitectura original; **no es Next.js**. No había capturas adjuntas: el diseño se basa en la descripción visual.

## Estado de entrega

- Implementación funcional con Supabase Auth, PostgreSQL, RLS, Realtime y Storage privado, verificada contra una instancia **local real y aislada**, sin mocks.
- **Desplegado en producción**: [myminformatica.vercel.app](https://myminformatica.vercel.app) sobre el proyecto Supabase `zycuhuyrzednjowjlnae` (región `sa-east-1`), con las migraciones aplicadas y los datos locales migrados.
- Las cuentas y registros de prueba se eliminan al terminar. No se entregan clientes, turnos ni ingresos ficticios.
- Al crear el espacio se inicializan el catálogo y las plantillas solicitadas. Los precios iniciales son **0 y deben configurarse** antes de presupuestar.

## Funcionalidades

Inicio; agenda diaria, semanal y mensual; clientes e historial; catálogo; mensajes con variables; reportes y CSV; perfil; configuración del negocio; invitaciones; actividad y notificaciones.

Turnos con múltiples servicios, precio/duración personalizados, responsable, control de superposiciones, estados, reprogramaciones auditadas y eliminación lógica. Anticipos, pagos parciales, devoluciones y correcciones inmutables. Comprobantes PNG/PDF y enlaces firmados temporales para WhatsApp.

## 1. Ejecutar con Supabase local

Requisitos: **Node.js 24 LTS recomendado** (mínimo 22), npm y Docker. Ejemplos verificados con CLI **2.116.0**; se fija esta versión porque CLI 3 cambió sus valores predeterminados.

```bash
npm ci
npx supabase@2.116.0 start
```

Puertos propios: **55321** (API) y **55322** (Postgres). No detengas otros proyectos para liberar sus puertos. Si estos están ocupados, cambiá solo `supabase/config.toml` y adaptá variables y pruebas.

Copiá `.env.example` a `.env.local`. Usá la URL y la clave **publicable** informadas por `supabase start` / `supabase status`:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:55321
VITE_SUPABASE_PUBLISHABLE_KEY=CLAVE_PUBLICABLE_LOCAL
```

En el entorno de esta entrega ya existe un `.env.local`, ignorado por Git, apuntando a la instancia local. No lo uses en producción.

```bash
npm run dev
```

Abrí **http://localhost:5173**, creá tu cuenta y el espacio de trabajo. La confirmación por correo está desactivada **solo en la configuración local**. Se usa Auth real, no un login simulado.

Para detener solo esta instancia: `npx supabase@2.116.0 stop`. No uses `db reset` en una base con trabajo real.

## 2. Instalar en un Supabase nuevo

1. Creá un proyecto **vacío** en [Supabase](https://supabase.com/dashboard). Elegí región y contraseña seguras. Guardá la contraseña fuera del repositorio.
2. Vinculá la CLI **a ese proyecto nuevo**, no a otra aplicación:

```bash
npx supabase@2.116.0 login
npx supabase@2.116.0 link --project-ref TU_REFERENCIA_NUEVA
npx supabase@2.116.0 db push --linked --dry-run
```

3. Confirmá el destino y que solo se apliquen los archivos de `supabase/migrations/`:

```bash
npx supabase@2.116.0 db push --linked
```

Alternativa: ejecutar los SQL en orden en el SQL Editor. No mezcles métodos sin reconciliar el historial ni vuelvas a ejecutar migraciones ya aplicadas.

4. En **Authentication → URL Configuration**:
   - Site URL: dominio HTTPS final de la app.
   - Redirect URLs: ese mismo dominio; agregá `http://localhost:5173` solo si vas a usar esa base desde desarrollo.
5. Habilitá email/password, confirmación de email y una política de contraseña segura. Activá protección de contraseñas filtradas si está disponible en tu plan.
6. **Configurá SMTP para producción.** El correo predeterminado de Supabase tiene restricciones. Sin SMTP, turnos, cobros y WhatsApp funcionan, pero la entrega de confirmaciones/recuperaciones depende de la configuración del proyecto.
7. En **Connect / API Keys**, copiá URL y clave **publicable** a las dos variables de `.env.example`. Nunca uses `service_role` ni `sb_secret_` en VITE_. La compilación rechaza esas claves en las variables conocidas del cliente.
8. Verificá Realtime y la publicación `supabase_realtime`; las migraciones agregan las tablas propias. **No expongas `private` en la Data API.**
9. Comprobá que `receipts` sea un bucket **privado**. La migración configura RLS, límite de 10 MB y tipos permitidos.
10. Revisá los asesores de seguridad y que todas las tablas propias tengan RLS.

## 3. Crear las dos cuentas y compartir el espacio

1. A usa **Crear cuenta**, confirma email si corresponde y crea el espacio.
2. En **Ajustes → Espacio de trabajo**, configura negocio y crea una **invitación segura**.
3. Comparte el enlace por un canal privado. Vence en **7 días**, tiene un único uso y la base guarda solo su hash.
4. B abre el enlace, crea su **propia cuenta** e ingresa. En **Tengo una invitación** pega el enlace/código si hace falta. Ya comparten todos los módulos.
5. Si B tenía otro espacio, también puede aceptar una invitación. El espacio activo se cambia desde Ajustes.
6. A es administrador; B es integrante. Ambos administran la operación diaria. Solo administradores cambian el negocio, invitan y revocan accesos. Revocar no borra autoría.
7. Cada persona modifica nombre, teléfono y contraseña en **Mi perfil**. El encabezado muestra **Agenda de [nombre]**; el nombre comercial del comprobante es independiente.

No compartan contraseñas ni credenciales de administración de Supabase entre operadores.

## 4. Desplegar en Vercel

Ya está desplegado y conectado al repositorio: cada push a `main` genera un deploy de producción automático.

| Recurso         | Valor                                                |
| --------------- | ---------------------------------------------------- |
| Producción      | https://myminformatica.vercel.app                    |
| Proyecto Vercel | `ramirosales52s-projects/myminformatica`             |
| Supabase        | `zycuhuyrzednjowjlnae` (sa-east-1)                   |
| Variables       | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |

Para un proyecto nuevo desde cero:

1. Subí el código a tu repositorio Git, **sin `.env.local`**.
2. Importalo en [Vercel](https://vercel.com/new), preset **Vite**.

| Campo            | Valor                               |
| ---------------- | ----------------------------------- |
| Install command  | `npm ci`                            |
| Build command    | `npm run build`                     |
| Output directory | `dist`                              |
| Node.js          | 24 LTS o una versión soportada >=22 |

3. Agregá `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` del proyecto **remoto**. No uses `127.0.0.1` en Vercel.
4. Desplegá. `vercel.json` configura la SPA y encabezados de seguridad. La navegación por hash no requiere servidor Node propio.
5. En Supabase, actualizá Site URL y Redirect URLs con el dominio final.
6. Si cambiás variables VITE_, **volvé a desplegar**: se incorporan al compilar.
7. Verificá `docs/TESTING.md` con dos cuentas reales antes de empezar a trabajar.

Usá proyectos separados para pruebas y producción.

## 5. Reglas económicas

- Importes enteros en centavos. **ARS y USD siempre separados**, sin conversiones implícitas.
- Crear, completar o cancelar un turno **no crea ni borra ingresos**.
- Cobros según **fecha del movimiento**. Estadísticas de trabajos según fecha del turno. Pendientes: saldo actual de los turnos del período, excluyendo cancelados/eliminados; se indica en pantalla.
- Alta de turno y anticipo en **una sola transacción**.
- Cobros con bloqueo de fila y nueva validación del pendiente en PostgreSQL. Dos integrantes no pueden cobrar simultáneamente más que el saldo.
- UUID de idempotencia para altas y cobros. No se reintentan escrituras automáticamente.
- Devoluciones/correcciones agregan movimientos, nunca borran pagos. Las correcciones exigen un motivo.
- Reprogramaciones conservan fechas anterior/nueva, autor y snapshots en el historial.
- Cambiar el catálogo no modifica acuerdos anteriores.
- Eliminar un turno es **lógico**: desaparece de la agenda, pero los cobros siguen en reportes.

## 6. Comprobantes y WhatsApp

- PNG de doble resolución y PDF descargables. **No son facturas fiscales**; no hay integración con ARCA.
- El comprobante puede mostrarse en **la hora del país del cliente**: cargás la diferencia horaria respecto de Argentina a mano en la ficha del cliente (el código telefónico no indica dónde está la persona). La agenda y los reportes siguen en hora argentina. Sin APIs externas ni cambios de horario de verano automáticos: si el país del cliente ajusta su reloj, actualizás la diferencia.
- Compartir pide consentimiento, carga una copia privada y firma un enlace por **1 hora**, con `cacheControl: 0` para no extender el acceso por caché.
- Cualquiera que posea el enlace puede ver esa copia durante su vigencia. Compartilo solo con el destinatario correcto.
- El diálogo permite revocar eliminando el archivo. La eliminación en CDN puede tardar hasta **un minuto**; no elimina copias descargadas.
- Los archivos permanecen privados después de vencer el enlace. Definí retención y limpiá archivos antiguos desde Storage o una tarea de servidor. **No se programa borrado automático en esta versión**.
- `wa.me` abre el número internacional y texto preparados. **El operador confirma el envío**; no se simula entrega.
- No hace falta WhatsApp Business API. Automatizar envíos requerirá credenciales de Meta, consentimiento y plantillas aprobadas.

## 7. Sincronización y operación

- Realtime invalida caché y consulta PostgreSQL. Se reconcilia al suscribirse/reconectarse, al volver a la ventana y periódicamente. Realtime no garantiza recuperar todos los eventos de una desconexión.
- El indicador lateral muestra conexión o reconexión. Los errores no se informan como guardados exitosos.
- No hay escritura offline ni datos de negocio en LocalStorage. **Solo Auth persiste la sesión**; la caché de negocio es volátil.
- Los formularios compartidos usan versiones optimistas; rechazan ediciones obsoletas.
- Recordatorios cada 30 segundos **mientras la app está abierta**. No hay push ni recordatorios con el navegador cerrado.
- Historial cargado en páginas de API de 1.000 filas, sin truncar saldos. Para grandes volúmenes conviene incorporar agregaciones SQL y paginación de interfaz; esta versión se orienta a equipos pequeños.
- Activá backups/PITR según tu plan y comprobá restauraciones. No guardes contraseñas de clientes en notas.

## Comandos

```bash
npm run dev
npm run lint
npm test
npm run test:integration   # Supabase local 55321/55322
npm run test:e2e           # Chromium del sistema o Playwright
npm run build
npm run preview
```

Las suites se niegan a escribir en hosts remotos. Cobertura: `docs/TESTING.md`. Modelo y decisiones: `ARCHITECTURE.md`. Diseño: `DESIGN.md`.
