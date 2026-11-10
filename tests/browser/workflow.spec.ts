import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { readFile } from 'node:fs/promises'

const url = process.env.VITE_SUPABASE_URL || '',
  key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):55321$/.test(url))
  throw new Error('Las pruebas de navegador solo pueden usar la instancia local 55321.')
const database = 'postgresql://postgres:postgres@127.0.0.1:55322/postgres'
const A = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const B = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const C = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const emails = [
  `browser.a.${Date.now()}@agenda.test`,
  `browser.b.${Date.now()}@agenda.test`,
  `browser.c.${Date.now()}@agenda.test`,
]
const password = crypto.randomUUID() + 'aA1!'
const ids: string[] = []
let workspace = ''
async function login(page: Page, email: string) {
  await page.goto('/')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Entrar a mi agenda' }).click()
  await expect(page.getByRole('heading', { name: /^Hola, / })).toBeVisible()
}
test.beforeAll(async () => {
  for (const [i, c] of [A, B, C].entries()) {
    const r = await c.auth.signUp({ email: emails[i], password })
    if (r.error) throw r.error
    ids.push(r.data.user!.id)
    const p = await c.rpc('ensure_profile', { p_name: `Verificación ${i ? 'B' : 'A'}` })
    if (p.error) throw p.error
  }
  const w = await A.rpc('create_workspace', { p_name: 'Verificación temporal de navegador' })
  if (w.error) throw w.error
  workspace = w.data
  const invite = await A.rpc('create_invite', { p_workspace: workspace })
  if (invite.error) throw invite.error
  const join = await B.rpc('join_workspace', { p_token: invite.data })
  if (join.error) throw join.error
})
test.afterAll(async () => {
  await Promise.all([A, B, C].map((c) => c.removeAllChannels()))
  const db = new pg.Client({ connectionString: database })
  await db.connect()
  try {
    await db.query('begin')
    // El bucket solo contiene archivos generados por ESTE espacio de prueba.
    const objects = await A.storage.from('receipts').list(workspace)
    for (const folder of objects.data || []) {
      const files = await A.storage.from('receipts').list(`${workspace}/${folder.name}`)
      if (files.data?.length)
        await A.storage
          .from('receipts')
          .remove(files.data.map((f) => `${workspace}/${folder.name}/${f.name}`))
    }
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
      await db.query(`delete from public.${table} where workspace_id=$1`, [workspace])
    await db.query('delete from private.workspace_invites where workspace_id=$1', [workspace])
    await db.query('delete from public.workspace_members where workspace_id=$1', [workspace])
    await db.query('delete from public.workspaces where id=$1', [workspace])
    await db.query('delete from public.profiles where id=any($1::uuid[])', [ids])
    await db.query('delete from auth.users where id=any($1::uuid[])', [ids])
    await db.query('commit')
  } finally {
    await db.end()
  }
})
test('flujo diario completo con dos sesiones, comprobantes y persistencia real', async ({
  browser,
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await login(page, emails[0])
  await expect(page.getByText('Todo sincronizado', { exact: true })).toBeVisible()
  await page.locator('.main-nav').getByRole('button', { name: 'Servicios', exact: true }).click()
  await page.getByRole('button', { name: 'Editar CapCut Pro', exact: true }).click()
  await page.getByLabel('Precio en pesos (ARS)', { exact: true }).fill('25000')
  await page.getByLabel('Precio en dólares (USD)', { exact: true }).fill('20')
  await page.getByRole('button', { name: 'Guardar servicio', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('.topbar-new').click()
  await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click()
  await page.getByLabel('Nombre y apellido', { exact: true }).fill('Cliente verificado')
  await page.getByLabel('WhatsApp', { exact: true }).fill('+5493510000999')
  await page.getByText('CapCut Pro', { exact: true }).last().click()
  await page.getByRole('checkbox', { name: /Instalación de Office/ }).check()
  await expect(page.getByLabel('Duración (minutos)', { exact: true })).toHaveValue('120')
  await page.getByRole('checkbox', { name: /Instalación de Office/ }).uncheck()
  await expect(page.getByLabel('Duración (minutos)', { exact: true })).toHaveValue('60')
  await page.getByLabel('Moneda', { exact: true }).selectOption('USD')
  await expect(page.getByLabel('Precio total', { exact: true })).toHaveValue('20')
  await page.getByLabel('Hora de inicio (24 h)').fill('14:30')
  await page.getByLabel('Cobro recibido ahora').fill('10')
  await page.getByRole('button', { name: 'Agendar turno', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('.main-nav').getByRole('button', { name: 'Inicio', exact: true }).click()
  await expect(
    page.getByRole('button').filter({ hasText: 'Cliente verificado' }).first(),
  ).toBeVisible()
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const second = await contextB.newPage()
  await login(second, emails[1])
  await expect(second.getByText('Todo sincronizado', { exact: true })).toBeVisible()
  await expect(
    second.locator('.appointment-row').filter({ hasText: 'Cliente verificado' }).first(),
  ).toContainText('Pago parcial')
  await second.locator('.appointment-row').filter({ hasText: 'Cliente verificado' }).first().click()
  await second.getByLabel('Estado del turno', { exact: true }).selectOption('completed')
  await expect(
    second.getByRole('dialog').getByText('Completado', { exact: true }).first(),
  ).toBeVisible()
  await second.getByRole('button', { name: 'Cerrar detalle', exact: true }).click()
  await expect(
    page.locator('.appointment-row').filter({ hasText: 'Cliente verificado' }).first(),
  ).toContainText('Completado')
  await page.locator('.appointment-row').filter({ hasText: 'Cliente verificado' }).first().click()
  await page.getByRole('button', { name: 'Registrar movimiento', exact: true }).click()
  await page.getByRole('button', { name: 'Cobrar saldo completo', exact: true }).click()
  await page.getByRole('button', { name: 'Registrar cobro', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    second.locator('.appointment-row').filter({ hasText: 'Cliente verificado' }).first(),
  ).toContainText('Pagado')
  await page.locator('.appointment-row').filter({ hasText: 'Cliente verificado' }).first().click()
  const whatsapp = page.getByRole('link', { name: 'WhatsApp', exact: true })
  await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa.me\/5493510000999\?text=/)
  await page.getByRole('button', { name: 'Comprobante', exact: true }).click()
  await expect(page.locator('.receipt')).toContainText('Trabajo completado')
  await expect(page.locator('.receipt')).toContainText('USD 20,00')
  const png = page.waitForEvent('download')
  await page.bringToFront()
  await page.getByRole('button', { name: 'Descargar PNG', exact: true }).click()
  const pngFile = await png
  expect(pngFile.suggestedFilename()).toMatch(/\.png$/)
  await pngFile.saveAs('/tmp/opencode/agenda-comprobante.png')
  expect(
    (await readFile('/tmp/opencode/agenda-comprobante.png')).subarray(0, 8).toString('hex'),
  ).toBe('89504e470d0a1a0a')
  const pdf = page.waitForEvent('download')
  await page.bringToFront()
  await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click()
  const pdfFile = await pdf
  expect(pdfFile.suggestedFilename()).toMatch(/\.pdf$/)
  expect((await readFile((await pdfFile.path())!)).subarray(0, 5).toString()).toBe('%PDF-')
  await page.getByRole('checkbox').check()
  await page
    .getByRole('button', { name: 'Preparar comprobante para WhatsApp', exact: true })
    .click()
  const share = page.getByRole('link', { name: 'Abrir WhatsApp y confirmar envío' })
  await expect(share).toBeVisible()
  const shareHref = await share.getAttribute('href')
  expect(shareHref).toContain('5493510000999')
  const text = new URL(shareHref!).searchParams.get('text')!
  expect(text).toContain('enlace válido por 1 hora')
  const signed = text.split('\n').at(-1)!
  const result = await page.request.get(signed)
  expect(result.ok()).toBe(true)
  expect(result.headers()['content-type']).toContain('image/png')
  const token = new URL(signed).searchParams.get('token')!
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  expect(claims.exp * 1000 - Date.now()).toBeGreaterThan(3500000)
  expect(claims.exp * 1000 - Date.now()).toBeLessThanOrEqual(3600000)
  const publicUrl = signed.replace('/object/sign/', '/object/public/').split('?')[0]
  const denied = await page.request.get(publicUrl)
  expect(denied.ok()).toBe(false)
  await page.getByRole('button', { name: 'Revocar enlace compartido', exact: true }).click()
  const revoked = await page.request.get(signed)
  expect(revoked.ok()).toBe(false)
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click()
  await page.screenshot({ path: '/tmp/opencode/agenda-dashboard.png', fullPage: true })
  await page
    .locator('.main-nav')
    .getByRole('button', { name: 'Reportes de ingresos', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Reportes de ingresos', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.report-stats')).toContainText('USD 20,00')
  const csv = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar movimientos CSV', exact: true }).click()
  expect((await csv).suggestedFilename()).toMatch(/\.csv$/)
  for (const label of ['Hoy', 'Ayer', 'Esta semana', 'Este mes', 'Mes anterior']) {
    await page.locator('.period-tabs').getByRole('button', { name: label, exact: true }).click()
    await expect(page.locator('.report-date')).toBeVisible()
  }
  await page.locator('.period-tabs').getByRole('button', { name: 'Este mes', exact: true }).click()
  await page.screenshot({ path: '/tmp/opencode/agenda-reportes.png', fullPage: true })
  await page.locator('.main-nav').getByRole('button', { name: 'Mensajes', exact: true }).click()
  await page.getByRole('button', { name: 'Editar Confirmación de turno', exact: true }).click()
  await page
    .getByLabel('Texto del mensaje', { exact: true })
    .fill('*Hola {nombre_cliente}* 👋\n\nNos vemos el {fecha} a las {hora}.')
  await page.getByRole('button', { name: 'Guardar mensaje', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const template = page
    .locator('.message-card')
    .filter({ has: page.getByRole('heading', { name: 'Confirmación de turno', exact: true }) })
  await template.getByRole('button', { name: 'Preparar envío', exact: true }).click()
  await page
    .getByLabel('Cliente', { exact: true })
    .selectOption({ label: 'Cliente verificado · +5493510000999' })
  const turnOption = page.getByLabel('Turno para completar las variables').locator('option').nth(1)
  const value = await turnOption.getAttribute('value')
  await page.getByLabel('Turno para completar las variables').selectOption(value!)
  await expect(page.locator('.message-preview')).toContainText('*Hola Cliente verificado* 👋')
  await expect(page.getByRole('link', { name: 'Abrir WhatsApp', exact: true })).toHaveAttribute(
    'href',
    /5493510000999/,
  )
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mensajes', exact: true })).toBeVisible()
  await expect(
    page.locator('.message-card').filter({ hasText: 'Confirmación de turno' }),
  ).toContainText('*Hola {nombre_cliente}* 👋')
  await page.locator('.main-nav').getByRole('button', { name: 'Agenda', exact: true }).click()
  for (const view of ['Día', 'Semana', 'Mes']) {
    await page.locator('.agenda-toolbar').getByRole('button', { name: view, exact: true }).click()
    await expect(
      page.locator(view === 'Mes' ? '.month-view' : '.agenda-panel .appointment-list'),
    ).toBeVisible()
  }
  await page.getByRole('button', { name: 'Hoy', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Abrir navegación', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Abrir navegación', exact: true }).click()
  await page.locator('.main-nav').getByRole('button', { name: 'Inicio', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Hola, Verificación/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: '/tmp/opencode/agenda-mobile.png', fullPage: true })
  for (const width of [360, 768, 1024]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const [label, heading] of [
      ['Agenda', 'Agenda compartida'],
      ['Clientes', 'Clientes'],
      ['Servicios', 'Servicios'],
      ['Mensajes', 'Mensajes'],
      ['Reportes de ingresos', 'Reportes de ingresos'],
      ['Ajustes', 'Ajustes'],
    ]) {
      if (width <= 760)
        await page.getByRole('button', { name: 'Abrir navegación', exact: true }).click()
      await page.locator('.main-nav').getByRole('button', { name: label, exact: true }).click()
      await expect(
        page.getByRole('heading', { name: heading, exact: true, level: 1 }),
      ).toBeVisible()
      await expect
        .poll(
          () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          { message: `${label} a ${width}px`, timeout: 3000 },
        )
        .toBe(true)
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Qué bueno verte.' })).toBeVisible()
  await login(page, emails[0])
  await expect(
    page.locator('.appointment-row').filter({ hasText: 'Cliente verificado' }).first(),
  ).toContainText('Pagado')
  await page.getByRole('button', { name: 'Abrir mi perfil', exact: true }).click()
  await page.getByLabel('Nombre y apellido', { exact: true }).fill('Lucas de verificación')
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click()
  await expect(page.locator('.breadcrumb')).toContainText('Agenda de Lucas')
  expect(errors).toEqual([])
  await contextB.close()
})

test('un usuario sin espacio ve los turnos globales sin acciones ni datos privados', async ({
  page,
}) => {
  const customer = await A.from('customers')
    .insert({
      workspace_id: workspace,
      full_name: 'Cliente de agenda global',
      phone: '+5493510000888',
      notes: 'Nota privada que no debe compartirse',
    })
    .select()
    .single()
  if (customer.error) throw customer.error
  const service = await A.from('services')
    .select('id')
    .eq('workspace_id', workspace)
    .limit(1)
    .single()
  if (service.error) throw service.error
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' }).format(
    new Date(),
  )
  const payload = {
    customer_id: customer.data.id,
    responsible_id: ids[0],
    starts_at: `${today}T22:00:00-03:00`,
    duration_minutes: 60,
    status: 'confirmed',
    currency: 'USD',
    total_cents: 12345,
    payment_method: 'cash',
    notes: 'Trabajo privado de prueba',
    services: [
      {
        service_id: service.data.id,
        name: 'Servicio global',
        price_cents: 12345,
        duration_minutes: 60,
      },
    ],
  }
  const saved = await A.rpc('save_appointment', {
    p_workspace: workspace,
    p_request_id: crypto.randomUUID(),
    p_payload: payload,
  })
  if (saved.error) throw saved.error
  await login(page, emails[0])
  await page.getByLabel('Búsqueda global').fill('3510000888')
  const localPhoneMatch = page
    .locator('.search-results')
    .getByRole('button')
    .filter({ hasText: 'Turno ·' })
  await expect(localPhoneMatch).toContainText('Cliente de agenda global')
  await localPhoneMatch.click()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Editar / reprogramar' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByLabel('Correo electrónico')).toBeVisible()
  await login(page, emails[2])
  const row = page
    .locator('.appointment-row')
    .filter({ hasText: 'Cliente de agenda global' })
    .first()
  await expect(row).toBeVisible()
  await expect(row).toContainText('Solo lectura')
  await expect(row).not.toContainText('USD')
  await expect(row).not.toContainText('Sin cobros')
  await row.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Verificación temporal de navegador')
  await expect(dialog).toContainText('Solo lectura')
  await expect(dialog.getByRole('button', { name: 'Registrar movimiento' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Editar / reprogramar' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Eliminar turno' })).toHaveCount(0)
  await expect(dialog.getByText('Notas del trabajo')).toHaveCount(0)
  await expect(dialog).not.toContainText('Trabajo privado de prueba')
  await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click()
  const rescheduled = await A.rpc('save_appointment', {
    p_workspace: workspace,
    p_id: saved.data,
    p_version: 1,
    p_request_id: crypto.randomUUID(),
    p_payload: { ...payload, status: 'rescheduled', starts_at: `${today}T23:00:00-03:00` },
  })
  if (rescheduled.error) throw rescheduled.error
  await expect(row).toContainText('Reprogramado', { timeout: 20000 })
  await expect(row).toContainText('23:00')
  await page.getByLabel('Búsqueda global').fill('Cliente de agenda global')
  await expect(
    page.locator('.search-results').getByText('Cliente de agenda global', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('Búsqueda global').fill('3510000888')
  await expect(
    page.locator('.search-results').getByRole('button').filter({ hasText: 'Turno ·' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Cerrar búsqueda', exact: true }).click()
  await page.locator('.main-nav').getByRole('button', { name: 'Agenda', exact: true }).click()
  await page.getByRole('button', { name: 'Mes', exact: true }).click()
  await expect(
    page.locator('.month-appointment').filter({ hasText: 'Cliente' }).first(),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Día', exact: true }).click()
  await page.getByLabel('Buscar turnos').fill('Cliente de agenda global')
  await expect(row).toBeVisible()
  await page.reload()
  await expect(row).toBeVisible()
  await page.setViewportSize({ width: 360, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await row.click()
  await expect(dialog).toContainText('Solo lectura')
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('.main-nav').getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Crear espacio de trabajo', exact: true }),
  ).toBeVisible()
})
