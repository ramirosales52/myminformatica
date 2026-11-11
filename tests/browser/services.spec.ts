import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const url = process.env.VITE_SUPABASE_URL || ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):55321$/.test(url))
  throw new Error('Esta prueba solo puede usar Supabase local 55321.')
const client = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '', {
  auth: { persistSession: false, autoRefreshToken: false },
})
const workspace = crypto.randomUUID()
const name = `Servicio eliminable ${crypto.randomUUID()}`
const email = `services.${crypto.randomUUID()}@agenda.test`
const password = crypto.randomUUID() + 'aA1!'
let user = ''
let service = ''

test.beforeAll(async () => {
  const signup = await client.auth.signUp({ email, password })
  if (signup.error) throw signup.error
  user = signup.data.user!.id
  const profile = await client.rpc('ensure_profile', { p_name: 'QA catálogo' })
  if (profile.error) throw profile.error
  const db = new pg.Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55322/postgres',
  })
  await db.connect()
  try {
    await db.query('insert into public.workspaces(id,name,created_by) values($1,$2,$3)', [
      workspace,
      'QA catálogo temporal',
      user,
    ])
    await db.query(
      "insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'admin')",
      [workspace, user],
    )
  } finally {
    await db.end()
  }
  const created = await client
    .from('services')
    .insert({ workspace_id: workspace, name })
    .select()
    .single()
  if (created.error) throw created.error
  service = created.data.id
})

test.afterAll(async () => {
  await client.removeAllChannels()
  const db = new pg.Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:55322/postgres',
  })
  await db.connect()
  try {
    // Solo UUID propios; nunca limpiar el negocio compartido devuelto por create_workspace.
    await db.query('begin')
    for (const table of ['notifications', 'activity_log', 'services', 'workspace_members'])
      await db.query(`delete from public.${table} where workspace_id=$1`, [workspace])
    await db.query('delete from public.workspaces where id=$1', [workspace])
    await db.query('delete from public.profiles where id=$1', [user])
    await db.query('delete from auth.users where id=$1', [user])
    await db.query('commit')
  } finally {
    await db.end()
  }
})

test('confirma o cancela el borrado y oculta el servicio eliminado del catálogo', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await page.locator('.main-nav').getByRole('button', { name: 'Servicios', exact: true }).click()
  await page.getByLabel('Buscar servicios').fill(name)
  const card = page.locator('.service-card').filter({ hasText: name })
  await expect(card).toBeVisible()
  await page.getByRole('button', { name: `Eliminar ${name}`, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(
    'Los turnos existentes, precios acordados y cobros se conservarán.',
  )
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(card).toBeVisible()
  await page.getByRole('button', { name: `Eliminar ${name}`, exact: true }).click()
  await dialog.getByRole('button', { name: 'Eliminar servicio', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(card).toHaveCount(0)
  const removed = await client
    .from('services')
    .select('active,deleted_at')
    .eq('id', service)
    .single()
  expect(removed.error).toBeNull()
  expect(removed.data?.active).toBe(false)
  expect(removed.data?.deleted_at).toBeTruthy()
  await page.reload()
  await page.locator('.main-nav').getByRole('button', { name: 'Servicios', exact: true }).click()
  await page.getByLabel('Buscar servicios').fill(name)
  await expect(card).toHaveCount(0)
})
