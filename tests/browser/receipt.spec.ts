import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Probar el comprobante real sin autenticación ni escrituras en la base de datos.
  await page.route('**/src/providers/DataProvider.tsx*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const useData = () => ({
        workspaces: [{ id: 'workspace', version: 1, business_name: 'Servicio técnico' }],
        appointmentData: {
          customers: [{ id: 'customer', version: 1, full_name: 'Cliente de prueba' }],
          payments: [],
          appointmentServices: [{ appointment_id: 'appointment', name: 'Instalación' }]
        }
      });`,
    }),
  )
  await page.route('**/__receipt-test', (route) =>
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
            version: 1, reference: 'T-TEST', status: 'confirmed',
            starts_at: '2030-01-15T15:00:00Z', duration_minutes: 60,
            total_cents: 10000, currency: 'ARS'
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
    return Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 8))
  })
  expect(copied).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
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
