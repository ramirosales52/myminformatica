import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Probar el comprobante real sin autenticación ni escrituras en la base de datos.
  await page.route('**/src/providers/DataProvider.tsx*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const useData = () => ({
        workspaces: [{ id: 'workspace', version: 1, business_name: 'Servicio técnico remoto' }],
        appointmentData: {
          customers: [{ id: 'customer', version: 1,
            full_name: new URLSearchParams(location.search).has('long') ? 'María de los Ángeles Fernández de la Vega' : 'Cliente de prueba',
            tz_offset_minutes: Number(new URLSearchParams(location.search).get('offset')) || null }],
          payments: [{ appointment_id: 'appointment', kind: 'payment',
            amount_cents: Number(new URLSearchParams(location.search).get('paid')) || 0 }],
          appointmentServices: [
            { appointment_id: 'appointment', name: 'Instalación', price_cents: 10000 },
            ...(new URLSearchParams(location.search).has('long') ? [
              { appointment_id: 'appointment', name: 'Configuración remota y recuperación de archivos del equipo personal', price_cents: 5000 },
              { appointment_id: 'appointment', name: 'Actualización y optimización del sistema operativo', price_cents: 5000 }
            ] : [])
          ]
        }
      });`,
    }),
  )
  await page.route('**/__receipt-test*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body><div id="root"></div><script type="module">
          import React from '/node_modules/.vite/deps/react.js';
          import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
          import RefreshRuntime from '/@react-refresh';
          import '/src/index.css';
          RefreshRuntime.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => (type) => type;
          window.__vite_plugin_react_preamble_installed__ = true;
          const { Receipt } = await import('/src/components/Receipt.tsx');
          const { ToastProvider } = await import('/src/providers/ToastProvider.tsx');
          const appointment = {
            id: 'appointment', workspace_id: 'workspace', customer_id: 'customer',
             version: 1, reference: 'T-TEST', status: new URLSearchParams(location.search).get('status') || 'confirmed',
            starts_at: '2030-01-15T15:00:00Z', duration_minutes: 60,
             total_cents: 10000, currency: new URLSearchParams(location.search).get('currency') || 'ARS'
          };
          function Fixture() {
            const [version, setVersion] = React.useState(1);
            window.updateReceipt = () => setVersion(2);
            return React.createElement(Receipt, {
              appointment: { ...appointment, version }, onClose: () => {}
            });
          }
          ReactDOM.createRoot(document.getElementById('root')).render(
            React.createElement(ToastProvider, null, React.createElement(Fixture)));
        </script></body></html>`,
    }),
  )
})

for (const scenario of [
  { paid: 0, label: 'Pago pendiente', balance: 'ARS 100' },
  { paid: 4000, label: 'Pago parcial', balance: 'ARS 60' },
  { paid: 10000, label: 'Pago completo', balance: 'ARS 0' },
]) {
  test(`muestra ${scenario.label} sin cambiar los importes`, async ({ page }) => {
    await page.goto(`/__receipt-test?paid=${scenario.paid}`)
    const receipt = page.locator('.receipt')
    await expect(receipt.locator('.payment-pill')).toHaveText(scenario.label)
    await expect(receipt.locator('.receipt-balance strong')).toHaveText(scenario.balance)
    await expect(receipt.locator('.receipt-schedule')).toContainText('15/01/2030')
    await expect(receipt.locator('.receipt-schedule')).toContainText('12:00 h')
    await expect(receipt.locator('.receipt-timezone')).toHaveText('Hora de Argentina (UTC−3)')
    await expect(receipt.locator('.receipt-reference')).toContainText('T-TEST')
    if (scenario.paid === 4000) {
      await receipt.screenshot({ path: '/tmp/opencode/receipt-desktop.png' })
    }
  })
}

test('es legible en móvil con nombres largos, varios servicios, USD y horario del cliente', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto('/__receipt-test?paid=4000&currency=USD&offset=240&long&status=rescheduled')
  const receipt = page.locator('.receipt')
  await expect(receipt.locator('.badge')).toHaveText('Turno reprogramado')
  await expect(receipt.locator('h3')).toHaveText('María de los Ángeles Fernández de la Vega')
  await expect(receipt.locator('li')).toHaveCount(3)
  await expect(receipt.locator('.receipt-schedule')).toContainText('16:00 h')
  await expect(receipt.locator('.receipt-zone-note')).toContainText('Argentina: 15/01/2030 12:00')
  await expect(receipt.locator('.receipt-balance strong')).toHaveText('USD 60,00')
  await expect(receipt.locator('.receipt-totals')).toContainText('Descuento acordado')
  const overflowing = await receipt.evaluate((element) =>
    [element, ...element.querySelectorAll<HTMLElement>('*')]
      .filter((node) => node.scrollWidth > node.clientWidth + 1)
      .map((node) => node.className),
  )
  expect(overflowing).toEqual([])
  await receipt.screenshot({ path: '/tmp/opencode/receipt-mobile.png' })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar PNG', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('T-TEST.png')
})

test('copia un PNG real sin descargar y conserva las descargas PNG y PDF', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await page.goto('/__receipt-test')
  await page.getByRole('button', { name: 'Copiar imagen', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Imagen copiada')
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read()
    const blob = await item.getType('image/png')
    const image = await createImageBitmap(blob)
    const receipt = document.querySelector('.receipt')!.getBoundingClientRect()
    return {
      signature: Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 8)),
      width: image.width,
      height: image.height,
      expectedWidth: Math.round(receipt.width) * 2,
      expectedHeight: Math.round(receipt.height) * 2,
    }
  })
  expect(copied.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  expect(Math.abs(copied.width - copied.expectedWidth)).toBeLessThanOrEqual(2)
  expect(Math.abs(copied.height - copied.expectedHeight)).toBeLessThanOrEqual(2)
  expect(downloads).toEqual([])
  for (const format of ['PNG', 'PDF']) {
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: `Descargar ${format}`, exact: true }).click()
    expect((await download).suggestedFilename()).toBe(`T-TEST.${format.toLowerCase()}`)
  }
})

test('avisa si el navegador no admite copiar imágenes', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'ClipboardItem', { value: undefined })
  })
  await page.goto('/__receipt-test')
  await page.getByRole('button', { name: 'Copiar imagen', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Tu navegador no permite copiar imágenes')
  await expect(page.getByRole('button', { name: 'Descargar PNG', exact: true })).toBeEnabled()
})

test('avisa si se deniega el permiso y permite reintentar', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.clipboard.write = async () => {
      throw new DOMException('Denied', 'NotAllowedError')
    }
  })
  await page.goto('/__receipt-test')
  await page.getByRole('button', { name: 'Copiar imagen', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Permití el acceso al portapapeles')
  await expect(page.getByRole('button', { name: 'Copiar imagen', exact: true })).toBeEnabled()
})

test('no permite copiar una instantánea desactualizada', async ({ page }) => {
  await page.goto('/__receipt-test')
  await expect(page.getByRole('button', { name: 'Copiar imagen', exact: true })).toBeEnabled()
  await page.evaluate(() => {
    ;(window as Window & { updateReceipt: () => void }).updateReceipt()
  })
  await expect(page.getByRole('button', { name: 'Copiar imagen', exact: true })).toBeDisabled()
})
