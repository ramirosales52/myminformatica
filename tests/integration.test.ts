import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import { inRange, paidFor, signedAmount, today } from '../src/lib/domain'
import type { Payment, ScheduledAppointment } from '../src/lib/types'

// Estas pruebas ESCRIBEN, pero solo en nuestra instancia local aislada y limpian sus UUID al terminar.
const url =
  process.env.TEST_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:55321'
const key = process.env.TEST_SUPABASE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
const database =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:55322/postgres'
const apiUrl = new URL(url),
  dbUrl = new URL(database)
if (
  !['127.0.0.1', 'localhost'].includes(apiUrl.hostname) ||
  !['127.0.0.1', 'localhost'].includes(dbUrl.hostname) ||
  apiUrl.port !== '55321' ||
  dbUrl.port !== '55322'
)
  throw new Error(
    'Seguridad: las pruebas solo pueden usar los puertos locales 55321/55322 de este proyecto.',
  )
const client = () =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const A = client(),
  B = client(),
  C = client(),
  D = client()
const users: { id: string; email: string; password: string }[] = []
const workspaces: string[] = []
let workspace = '',
  customer = '',
  service = '',
  appointment = '',
  arsAppointment = '',
  responsible = ''
let payload: Record<string, unknown>
const baseDate = new Date(Date.now() + 86400000)
const later = (hours: number) => new Date(baseDate.getTime() + hours * 3600000).toISOString()
async function rpc<T = string>(c: SupabaseClient, name: string, params: Record<string, unknown>) {
  const result = await c.rpc(name, params)
  if (result.error) throw result.error
  return result.data as T
}
async function getPayments() {
  const r = await A.from('payments').select('*').eq('workspace_id', workspace)
  if (r.error) throw r.error
  return r.data as Payment[]
}
async function changeWithRealtime(
  watcher: SupabaseClient,
  table: string,
  event: 'INSERT' | 'UPDATE',
  action: () => Promise<unknown>,
) {
  const channel = watcher.channel(`test-${crypto.randomUUID()}`)
  let timer: ReturnType<typeof setTimeout>
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`No llegó Realtime para ${table}`)), 15000)
      channel.on(
        'postgres_changes',
        { event, schema: 'public', table, filter: `workspace_id=eq.${workspace}` },
        () => resolve(),
      )
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') void action().catch(reject)
        if (status === 'CHANNEL_ERROR') reject(new Error('Realtime no pudo conectarse'))
      })
    })
  } finally {
    clearTimeout(timer!)
    await watcher.removeChannel(channel)
  }
}
beforeAll(async () => {
  for (const [i, c] of [A, B, C, D].entries()) {
    const email = `qa.${Date.now()}.${i}@agenda.test`,
      password = crypto.randomUUID() + 'aA1!'
    const r = await c.auth.signUp({ email, password })
    if (r.error) throw r.error
    users.push({ id: r.data.user!.id, email, password })
    if (!r.data.session)
      throw new Error('En la instancia local la confirmación de correo debe estar desactivada.')
    await rpc(c, 'ensure_profile', {
      p_name: ['Prueba A', 'Prueba B', 'Aislado C', 'Sin espacio D'][i],
    })
  }
  responsible = users[0].id
  workspace = await rpc(A, 'create_workspace', { p_name: 'QA transaccional temporal' })
  workspaces.push(workspace)
  const invitation = await rpc(A, 'create_invite', { p_workspace: workspace })
  await rpc(B, 'join_workspace', { p_token: invitation })
  const isolated = await rpc(C, 'create_workspace', { p_name: 'QA aislado temporal' })
  workspaces.push(isolated)
  const r = await A.from('customers')
    .insert({
      workspace_id: workspace,
      full_name: 'Cliente de prueba automatizada',
      phone: '+5493510000001',
      country_code: '+54',
    })
    .select()
    .single()
  if (r.error) throw r.error
  customer = r.data.id
  const s = await A.from('services').select('*').eq('workspace_id', workspace).limit(1).single()
  if (s.error) throw s.error
  service = s.data.id
  payload = {
    customer_id: customer,
    responsible_id: responsible,
    starts_at: later(0),
    duration_minutes: 60,
    status: 'pending',
    currency: 'USD',
    total_cents: 2000,
    payment_method: 'transfer',
    notes: 'Prueba automatizada, se limpia al terminar.',
    services: [
      {
        service_id: service,
        name: 'Servicio acordado de prueba',
        price_cents: 2000,
        duration_minutes: 60,
      },
    ],
  }
})
afterAll(async () => {
  await Promise.all([A, B, C, D].map((c) => c.removeAllChannels()))
  const connection = new pg.Client({ connectionString: database })
  await connection.connect()
  try {
    await connection.query('begin')
    for (const table of [
      'notifications',
      'activity_log',
      'payments',
      'appointment_services',
      'appointments',
      'customers',
      'services',
      'message_templates',
    ])
      await connection.query(`delete from public.${table} where workspace_id=any($1::uuid[])`, [
        workspaces,
      ])
    await connection.query(
      'delete from private.workspace_invites where workspace_id=any($1::uuid[])',
      [workspaces],
    )
    await connection.query(
      'delete from public.workspace_members where workspace_id=any($1::uuid[])',
      [workspaces],
    )
    await connection.query('delete from public.workspaces where id=any($1::uuid[])', [workspaces])
    await connection.query('delete from public.profiles where id=any($1::uuid[])', [
      users.map((u) => u.id),
    ])
    await connection.query('delete from auth.users where id=any($1::uuid[])', [
      users.map((u) => u.id),
    ])
    await connection.query('commit')
  } finally {
    await connection.end()
  }
})
describe('Supabase real: seguridad, dinero y sincronización', () => {
  it('A crea un turno y B recibe INSERT por Realtime', async () => {
    await changeWithRealtime(B, 'appointments', 'INSERT', async () => {
      appointment = await rpc(A, 'save_appointment', {
        p_workspace: workspace,
        p_payload: payload,
        p_request_id: crypto.randomUUID(),
      })
    })
    const r = await B.from('appointments').select('*').eq('id', appointment).single()
    expect(r.error).toBeNull()
    expect(r.data.total_cents).toBe(2000)
  })
  it('todos los usuarios, incluso sin espacio, ven la misma agenda sin datos privados', async () => {
    for (const viewer of [A, B, C, D]) {
      const rows = await rpc<ScheduledAppointment[]>(viewer, 'global_schedule', {})
      const shared = rows.find((a) => a.id === appointment)
      expect(shared).toMatchObject({
        customer_name: 'Cliente de prueba automatizada',
        responsible_name: 'Prueba A',
        workspace_id: workspace,
        status: 'pending',
        services: [{ service_id: service, name: 'Servicio acordado de prueba' }],
      })
      expect(Object.keys(shared!).sort()).toEqual(
        [
          'id',
          'workspace_id',
          'reference',
          'starts_at',
          'duration_minutes',
          'status',
          'responsible_id',
          'customer_name',
          'responsible_name',
          'workspace_name',
          'services',
        ].sort(),
      )
    }
    const anonymous = client()
    const denied = await anonymous.rpc('global_schedule')
    expect(denied.error).not.toBeNull()
    const fakeIdentity = await anonymous.rpc('global_schedule', { user_id: users[0].id })
    expect(fakeIdentity.error).not.toBeNull()
  })
  it('ver un turno de otro espacio no permite editarlo ni eliminarlo', async () => {
    const edit = await C.rpc('save_appointment', {
      p_workspace: workspace,
      p_id: appointment,
      p_version: 1,
      p_request_id: crypto.randomUUID(),
      p_payload: { ...payload, status: 'completed' },
    })
    expect(edit.error?.message).toContain('Sin acceso')
    const remove = await D.rpc('delete_appointment', { p_id: appointment, p_version: 1 })
    expect(remove.error?.message).toContain('Sin acceso')
  })
  it('B cambia el estado y A recibe UPDATE por Realtime', async () => {
    await changeWithRealtime(A, 'appointments', 'UPDATE', () =>
      rpc(B, 'save_appointment', {
        p_workspace: workspace,
        p_payload: { ...payload, status: 'confirmed' },
        p_request_id: crypto.randomUUID(),
        p_id: appointment,
        p_version: 1,
      }),
    )
    const r = await A.from('appointments').select('status,version').eq('id', appointment).single()
    expect(r.data).toEqual({ status: 'confirmed', version: 2 })
    const global = await rpc<ScheduledAppointment[]>(C, 'global_schedule', {})
    expect(global.find((a) => a.id === appointment)?.status).toBe('confirmed')
  })
  it('bloquea una edición obsoleta sin sobrescribir cambios', async () => {
    const r = await A.rpc('save_appointment', {
      p_workspace: workspace,
      p_payload: payload,
      p_request_id: crypto.randomUUID(),
      p_id: appointment,
      p_version: 1,
    })
    expect(r.error?.message).toContain('Otro integrante')
  })
  it('USD 10 sobre USD 20 genera 10 cobrados y 10 pendientes; Realtime actualiza a B', async () => {
    await changeWithRealtime(B, 'payments', 'INSERT', () =>
      rpc(A, 'record_payment', {
        p_appointment: appointment,
        p_amount: 1000,
        p_kind: 'charge',
        p_method: 'transfer',
        p_paid_at: new Date().toISOString(),
        p_notes: 'Primera mitad',
        p_request_id: crypto.randomUUID(),
      }),
    )
    expect(paidFor(appointment, await getPayments())).toBe(1000)
  })
  it('dos cobros concurrentes no pueden superar el pendiente', async () => {
    const params = {
      p_appointment: appointment,
      p_amount: 1000,
      p_kind: 'charge',
      p_method: 'transfer',
      p_paid_at: new Date().toISOString(),
      p_notes: 'Saldo',
    }
    const results = await Promise.all([
      A.rpc('record_payment', { ...params, p_request_id: crypto.randomUUID() }),
      B.rpc('record_payment', { ...params, p_request_id: crypto.randomUUID() }),
    ])
    expect(results.filter((r) => !r.error)).toHaveLength(1)
    expect(results.filter((r) => r.error)).toHaveLength(1)
    expect(paidFor(appointment, await getPayments())).toBe(2000)
  })
  it('un reintento con el mismo UUID no duplica un pago', async () => {
    const ps = await getPayments()
    const existing = await A.from('payments').select('request_id').eq('id', ps[0].id).single()
    const before = ps.length
    await rpc(B, 'record_payment', {
      p_appointment: appointment,
      p_amount: 1000,
      p_kind: 'charge',
      p_method: 'transfer',
      p_paid_at: new Date().toISOString(),
      p_notes: 'Reintento',
      p_request_id: existing.data!.request_id,
    })
    expect(await getPayments()).toHaveLength(before)
  })
  it('crea turno y anticipo ARS atómicamente sin mezclar USD', async () => {
    arsAppointment = await rpc(A, 'save_appointment', {
      p_workspace: workspace,
      p_request_id: crypto.randomUUID(),
      p_payload: {
        ...payload,
        starts_at: later(2),
        currency: 'ARS',
        total_cents: 2500000,
        initial_payment: {
          amount_cents: 1250000,
          method: 'mercadopago',
          paid_at: new Date().toISOString(),
        },
      },
    })
    const ps = await getPayments()
    expect(ps.filter((p) => p.currency === 'USD').reduce((s, p) => s + signedAmount(p), 0)).toBe(
      2000,
    )
    expect(ps.filter((p) => p.currency === 'ARS').reduce((s, p) => s + signedAmount(p), 0)).toBe(
      1250000,
    )
  })
  it('la agenda global admite paginación estable sin filtrar por espacio', async () => {
    const pages = await Promise.all(
      [0, 1].map((offset) =>
        C.rpc('global_schedule').eq('workspace_id', workspace).order('id').range(offset, offset),
      ),
    )
    for (const page of pages) {
      expect(page.error).toBeNull()
      expect(page.data).toHaveLength(1)
    }
    expect(pages[0].data![0].id).not.toBe(pages[1].data![0].id)
  })
  it('un anticipo inválido revierte el alta completa', async () => {
    const request = crypto.randomUUID()
    const r = await A.rpc('save_appointment', {
      p_workspace: workspace,
      p_request_id: request,
      p_payload: {
        ...payload,
        starts_at: later(4),
        initial_payment: { amount_cents: 2500, method: 'cash', paid_at: new Date().toISOString() },
      },
    })
    expect(r.error).not.toBeNull()
    const check = await A.from('appointments').select('id').eq('request_id', request)
    expect(check.data).toHaveLength(0)
  })
  it('completar un turno sin cobrar no crea movimientos', async () => {
    const id = await rpc(A, 'save_appointment', {
      p_workspace: workspace,
      p_request_id: crypto.randomUUID(),
      p_payload: { ...payload, starts_at: later(6), status: 'completed' },
    })
    const ps = await getPayments()
    expect(paidFor(id, ps)).toBe(0)
    expect(ps.filter((p) => p.appointment_id === id)).toHaveLength(0)
  })
  it('cancelar conserva el turno y sus cobros', async () => {
    await rpc(A, 'save_appointment', {
      p_workspace: workspace,
      p_payload: { ...payload, status: 'cancelled' },
      p_request_id: crypto.randomUUID(),
      p_id: appointment,
      p_version: 2,
    })
    const r = await B.from('appointments').select('status').eq('id', appointment).single()
    expect(r.data?.status).toBe('cancelled')
    expect(paidFor(appointment, await getPayments())).toBe(2000)
  })
  it('devoluciones y correcciones conservan historial y restan dinero', async () => {
    await rpc(A, 'record_payment', {
      p_appointment: appointment,
      p_amount: 500,
      p_kind: 'refund',
      p_method: 'transfer',
      p_paid_at: new Date().toISOString(),
      p_notes: 'Devolución parcial',
      p_request_id: crypto.randomUUID(),
    })
    expect(paidFor(appointment, await getPayments())).toBe(1500)
    const r = await A.rpc('record_payment', {
      p_appointment: appointment,
      p_amount: 1600,
      p_kind: 'refund',
      p_method: 'cash',
      p_paid_at: new Date().toISOString(),
      p_notes: '',
      p_request_id: crypto.randomUUID(),
    })
    expect(r.error?.message).toContain('supera')
  })
  it('cambiar el catálogo no modifica snapshots del turno', async () => {
    const r = await A.from('services')
      .update({ price_usd: 9900, duration_minutes: 120 })
      .eq('id', service)
      .select()
      .single()
    expect(r.error).toBeNull()
    const lines = await B.from('appointment_services').select('*').eq('appointment_id', appointment)
    expect(lines.data![0]).toMatchObject({
      price_cents: 2000,
      duration_minutes: 60,
      name: 'Servicio acordado de prueba',
    })
  })
  it('rechaza teléfonos duplicados y referencias entre espacios', async () => {
    const r = await B.from('customers').insert({
      workspace_id: workspace,
      full_name: 'Duplicado',
      phone: '+5493510000001',
    })
    expect(r.error?.code).toBe('23505')
    const foreign = await C.from('customers')
      .insert({ workspace_id: workspaces[1], full_name: 'Cliente ajeno', phone: '+5493510000002' })
      .select()
      .single()
    const cross = await A.rpc('save_appointment', {
      p_workspace: workspace,
      p_payload: { ...payload, starts_at: later(8), customer_id: foreign.data!.id },
      p_request_id: crypto.randomUUID(),
    })
    expect(cross.error?.code).toBe('23503')
  })
  it('RLS conserva privados los registros completos, pagos, clientes y funciones', async () => {
    for (const table of ['appointments', 'payments', 'customers', 'activity_log']) {
      const r = await C.from(table).select('*').eq('workspace_id', workspace)
      expect(r.data).toHaveLength(0)
    }
    const denied = await C.rpc('record_payment', {
      p_appointment: appointment,
      p_amount: 1,
      p_kind: 'charge',
      p_method: 'cash',
      p_paid_at: new Date().toISOString(),
      p_notes: '',
      p_request_id: crypto.randomUUID(),
    })
    expect(denied.error?.message).toContain('Sin acceso')
    const direct = await A.from('payments').insert({
      workspace_id: workspace,
      appointment_id: appointment,
      amount_cents: 999,
      currency: 'USD',
      kind: 'charge',
      method: 'cash',
      request_id: crypto.randomUUID(),
      created_by: users[0].id,
    })
    expect(direct.error).not.toBeNull()
  })
  it('detecta superposiciones en el servidor', async () => {
    const r = await B.rpc('save_appointment', {
      p_workspace: workspace,
      p_payload: { ...payload, starts_at: later(2) },
      p_request_id: crypto.randomUUID(),
    })
    expect(r.error?.message).toContain('superpone')
  })
  it('guarda mensajes con emojis y saltos después de cerrar sesión', async () => {
    const t = await A.from('message_templates')
      .select('*')
      .eq('workspace_id', workspace)
      .limit(1)
      .single()
    const body = '*Hola {nombre_cliente}* 👋\n\nMensaje persistente ✓'
    const update = await B.from('message_templates')
      .update({ body })
      .eq('id', t.data!.id)
      .eq('version', t.data!.version)
      .select()
      .single()
    expect(update.error).toBeNull()
    const stale = await A.from('message_templates')
      .update({ body: 'Edición obsoleta' })
      .eq('id', t.data!.id)
      .eq('version', t.data!.version)
      .select()
      .single()
    expect(stale.error).not.toBeNull()
    await B.auth.signOut()
    await B.auth.signInWithPassword({ email: users[1].email, password: users[1].password })
    const r = await B.from('message_templates').select('body').eq('id', t.data!.id).single()
    expect(r.data?.body).toBe(body)
  })
  it('elimina lógicamente y mantiene cobros e historial', async () => {
    await rpc(A, 'delete_appointment', { p_id: arsAppointment, p_version: 1 })
    const r = await B.from('appointments').select('deleted_at').eq('id', arsAppointment).single()
    expect(r.data?.deleted_at).toBeTruthy()
    expect(paidFor(arsAppointment, await getPayments())).toBe(1250000)
    const global = await rpc<ScheduledAppointment[]>(C, 'global_schedule', {})
    expect(global.some((a) => a.id === arsAppointment)).toBe(false)
  })
  it('un integrante no puede crear invitaciones ni cambiar el negocio', async () => {
    const r = await B.rpc('create_invite', { p_workspace: workspace })
    expect(r.error).not.toBeNull()
    const edit = await B.from('workspaces')
      .update({ business_name: 'No autorizado' })
      .eq('id', workspace)
      .select()
      .single()
    expect(edit.error).not.toBeNull()
  })
  it('los ingresos de hoy incluyen cobros de un turno de mañana', async () => {
    const ps = await getPayments()
    expect(inRange(String(payload.starts_at), today(), today())).toBe(false)
    expect(
      ps
        .filter((p) => p.currency === 'USD' && inRange(p.paid_at, today(), today()))
        .reduce((sum, p) => sum + signedAmount(p), 0),
    ).toBe(1500)
  })
  it('reprogramar conserva la fecha original en el historial', async () => {
    await rpc(A, 'save_appointment', {
      p_workspace: workspace,
      p_payload: { ...payload, starts_at: later(12), status: 'rescheduled' },
      p_request_id: crypto.randomUUID(),
      p_id: appointment,
      p_version: 3,
    })
    const h = await A.from('activity_log')
      .select('*')
      .eq('appointment_id', appointment)
      .eq('action', 'Turno reprogramado')
      .single()
    expect(h.error).toBeNull()
    expect(new Date(h.data!.before_data.starts_at).getTime()).toBe(
      new Date(String(payload.starts_at)).getTime(),
    )
    expect(new Date(h.data!.after_data.starts_at).getTime()).toBe(new Date(later(12)).getTime())
  })
  it('recordatorios próximos se guardan una sola vez por usuario y horario', async () => {
    await rpc(A, 'save_appointment', {
      p_workspace: workspace,
      p_payload: {
        ...payload,
        starts_at: new Date(Date.now() + 5 * 60000).toISOString(),
        status: 'confirmed',
      },
      p_request_id: crypto.randomUUID(),
    })
    expect(await rpc<number>(A, 'notify_upcoming', { p_workspace: workspace })).toBe(1)
    expect(await rpc<number>(A, 'notify_upcoming', { p_workspace: workspace })).toBe(0)
  })
  it('revocar a B corta el acceso sin borrar su autoría', async () => {
    await rpc(A, 'remove_member', { p_workspace: workspace, p_user: users[1].id })
    const r = await B.from('payments').select('*').eq('workspace_id', workspace)
    expect(r.data).toHaveLength(0)
    const history = await A.from('activity_log').select('*').eq('actor_id', users[1].id)
    expect(history.data!.length).toBeGreaterThan(0)
  })
})
