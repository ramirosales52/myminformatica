import { expect, test } from '@playwright/test'

const tutorialText =
  '¡Hola! 👋 Te compartimos el comprobante de tu turno del martes, 15 de enero de 2030 a las 12:00 hs (hora de Argentina).\n\n💻 Tutorial para instalar la app de conexión remota:\nhttps://drive.google.com/drive/folders/1RkQH8nKH_vJERmQ40d5jYTdgrAa4ib02\n\nCuando la tengas instalada, pasanos tu ID por este chat.\nM&M Informática'

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
    await expect(
      receipt.getByRole('heading', { name: 'Comprobante de turno', exact: true }),
    ).toBeVisible()
    await expect(page.locator('.modal-heading h2')).toHaveCount(0)
    await expect(page.locator('.share-receipt')).toHaveCount(0)
    await expect(receipt.locator('.payment-pill')).toHaveText(scenario.label)
    await expect(receipt.locator('.receipt-balance strong')).toHaveText(scenario.balance)
    await expect(receipt.locator('.receipt-schedule')).toContainText('15/01/2030')
    await expect(receipt.locator('.receipt-schedule')).toContainText('12:00 h')
    await expect(receipt.locator('.receipt-timezone')).toHaveText('Hora de Argentina (UTC−3)')
    await expect(receipt.locator('.receipt-reference')).toContainText('T-TEST')
    await expect(receipt.locator('.receipt-brand strong')).toHaveText('M&M Informatica')
    expect(
      await receipt.evaluate((element) =>
        Boolean(
          element
            .querySelector('.receipt-customer')!
            .compareDocumentPosition(element.querySelector('.receipt-schedule')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    ).toBe(true)
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
  await expect(receipt.locator('.receipt-zone-note')).toHaveCount(0)
  await expect(receipt.locator('.receipt-footer')).not.toContainText('Tu horario')
  await expect(receipt.locator('.receipt-footer')).not.toContainText('Argentina')
  await expect(receipt.locator('.receipt-footer')).not.toContainText('factura')
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

test('copia un PNG real sin descargar y conserva la descarga PNG', async ({ page, context }) => {
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
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar PNG', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('T-TEST.png')
  await expect(page.getByRole('button', { name: 'Descargar PDF', exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Copiar imagen + tutorial', exact: true }),
  ).toHaveCount(0)
})

test('copia el mensaje con la fecha del turno y el enlace exacto', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/__receipt-test')
  await expect(page.getByRole('button', { name: 'Copiar tutorial', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Copiar tutorial', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Tutorial copiado')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(tutorialText)
})

for (const scenario of [
  { offset: 240, date: 'martes, 15 de enero de 2030 a las 16:00' },
  { offset: 840, date: 'miércoles, 16 de enero de 2030 a las 02:00' },
]) {
  test(`copia el mensaje en hora del país con diferencia de ${scenario.offset} minutos`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(`/__receipt-test?offset=${scenario.offset}`)
    await page.getByRole('button', { name: 'Copiar tutorial', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Tutorial copiado')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      tutorialText.replace(
        'martes, 15 de enero de 2030 a las 12:00 hs (hora de Argentina)',
        `${scenario.date} hs (hora de tu país)`,
      ),
    )
  })
}

test('muestra el logo personalizado al agregarlo en la carpeta de marca', async ({ page }) => {
  await page.route('**/branding/logo.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  )
  await page.goto('/__receipt-test')
  const logo = page.getByRole('img', { name: 'Logo de M&M Informatica' })
  await expect(logo).toBeVisible()
  expect(await logo.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(1)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar PNG', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('T-TEST.png')
})

test('mantiene el ícono de la PC si todavía no se agregó el logo', async ({ page }) => {
  await page.route('**/branding/logo.png', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/__receipt-test')
  await expect(page.locator('.receipt-brand .brand-mark svg')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Logo de M&M Informatica' })).toHaveCount(0)
})

test('avisa si se deniega copiar el tutorial y permite reintentar', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = async () => {
      throw new DOMException('Denied', 'NotAllowedError')
    }
  })
  await page.goto('/__receipt-test')
  await page.getByRole('button', { name: 'Copiar tutorial', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('No se pudo copiar el tutorial')
  await expect(page.getByRole('button', { name: 'Copiar tutorial', exact: true })).toBeEnabled()
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
  await expect(page.getByRole('button', { name: 'Copiar tutorial', exact: true })).toBeDisabled()
})
