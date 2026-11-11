import { expect, test } from '@playwright/test'

// Real form with isolated providers: no account, remote writes or database required.
test.beforeEach(async ({ page }) => {
  await page.route('**/src/providers/DataProvider.tsx*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export const useData = () => window.fixture;`,
    }),
  )
  await page.route('**/src/providers/AuthProvider.tsx*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export const useAuth = () => ({ session: { user: { id: 'user' } } });`,
    }),
  )
  await page.route('**/src/providers/ToastProvider.tsx*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export const useToast = () => () => {};`,
    }),
  )
  await page.route('**/src/lib/supabase.ts*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export const db = () => { throw Error('Unexpected database call'); };
      export const messageFor = e => e.message;
      export const rpc = async (name, args) => { window.saved = args; return 'appointment'; };`,
    }),
  )
  await page.route('**/__appointment-pricing*', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body><div id="root"></div><script type="module">
        import React from '/node_modules/.vite/deps/react.js';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import RefreshRuntime from '/@react-refresh';
        import '/src/index.css';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        const services = [
          { id: 'first', name: 'Limpieza', price_ars: 1000000, price_usd: 1000, duration_minutes: 30, active: true },
          { id: 'second', name: 'Instalación', price_ars: 2000000, price_usd: 2000, duration_minutes: 60, active: true },
          { id: 'third', name: 'Configuración', price_ars: 500000, price_usd: 500, duration_minutes: 15, active: true }
        ];
        const editing = location.search.includes('edit');
        const appointment = editing ? {
          id: 'appointment', workspace_id: 'workspace', customer_id: 'customer', responsible_id: 'user',
          total_cents: 800000, duration_minutes: 30, currency: 'ARS', status: 'pending',
          starts_at: '2030-01-01T12:00:00Z', payment_method: 'cash', version: 2
        } : undefined;
        window.fixture = {
          workspace: { id: 'workspace' }, workspaces: [{ id: 'workspace' }], refresh: async () => {},
          appointmentData: {
            services, appointments: [], profiles: [{ id: 'user', full_name: 'Técnico' }],
            customers: [{ id: 'customer', full_name: 'Cliente', tz_offset_minutes: null }],
            appointmentServices: editing ? [{
              appointment_id: 'appointment', service_id: 'first', name: 'Limpieza', price_cents: 1000000, duration_minutes: 30
            }] : []
          }
        };
        const { AppointmentForm } = await import('/src/components/AppointmentForm.tsx');
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(AppointmentForm, {
          appointment, initialCustomer: 'customer', onClose: () => { window.formClosed = true; }
        }));
      </script></body></html>`,
    }),
  )
})

test('combina servicios y conserva el precio personalizado al sumar o quitar otros', async ({
  page,
}) => {
  await page.goto('/__appointment-pricing')
  const total = page.getByLabel('Precio total', { exact: true })
  await page.getByRole('checkbox', { name: /Limpieza/ }).check()
  await page.getByRole('checkbox', { name: /Instalación/ }).check()
  await expect(total).toHaveValue('30000')
  await expect(page.getByLabel('Duración (minutos)', { exact: true })).toHaveValue('90')
  await total.fill('25000')
  await expect(page.getByText('Suma de servicios: ARS 30.000 · Descuento: ARS 5.000')).toBeVisible()
  await page.getByRole('checkbox', { name: /Configuración/ }).check()
  await expect(total).toHaveValue('25000')
  await page.getByRole('checkbox', { name: /Instalación/ }).uncheck()
  await expect(total).toHaveValue('25000')
  await page.getByRole('checkbox', { name: /Instalación/ }).check()
  await page.getByRole('button', { name: 'Agendar turno', exact: true }).click()
  const saved = await page.evaluate(
    () => (window as unknown as { saved: { p_payload: Record<string, unknown> } }).saved,
  )
  expect(saved.p_payload).toMatchObject({ total_cents: 2500000, duration_minutes: 105 })
  expect(saved.p_payload.services).toHaveLength(3)
})

test('al editar conserva el descuento y permite volver al precio del catálogo', async ({
  page,
}) => {
  await page.goto('/__appointment-pricing?edit')
  const total = page.getByLabel('Precio total', { exact: true })
  await expect(total).toHaveValue('8000')
  await page.getByRole('checkbox', { name: /Instalación/ }).check()
  await expect(total).toHaveValue('8000')
  await page.getByRole('button', { name: 'Usar suma de servicios', exact: true }).click()
  await expect(total).toHaveValue('30000')
  await page.getByRole('checkbox', { name: /Configuración/ }).check()
  await expect(total).toHaveValue('35000')
  await total.fill('0')
  await page.getByRole('checkbox', { name: /Configuración/ }).uncheck()
  await expect(total).toHaveValue('0')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  const saved = await page.evaluate(
    () => (window as unknown as { saved: { p_payload: Record<string, unknown> } }).saved,
  )
  expect(saved.p_payload.total_cents).toBe(0)
  expect(saved.p_payload.services).toHaveLength(2)
})

test('cambiar moneda recalcula el catálogo sin reutilizar un importe en otra moneda', async ({
  page,
}) => {
  await page.goto('/__appointment-pricing')
  await page.getByRole('checkbox', { name: /Limpieza/ }).check()
  await page.getByLabel('Precio total', { exact: true }).fill('8000')
  await page.getByLabel('Moneda', { exact: true }).selectOption('USD')
  await expect(page.getByLabel('Precio total', { exact: true })).toHaveValue('10')
  await expect(
    page.getByRole('button', { name: 'Usar suma de servicios', exact: true }),
  ).toHaveCount(0)
})
