import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 600 },
]) {
  for (const long of [false, true]) {
    test(`modal centrado y accesible: ${viewport.width}px, contenido ${long ? 'largo' : 'corto'}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      // Exercise the real shared component inside the same animated ancestor as page-level modals.
      // No authentication or database is needed for this layout regression.
      await page.route('**/__modal-test', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
            <body><div id="root"></div><script type="module">
              import React from '/node_modules/.vite/deps/react.js';
              import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
              const { createElement: h, useState } = React;
              const { createRoot } = ReactDOM;
              import RefreshRuntime from '/@react-refresh';
              import '/src/index.css';
              RefreshRuntime.injectIntoGlobalHook(window);
              window.$RefreshReg$ = () => {};
              window.$RefreshSig$ = () => (type) => type;
              window.__vite_plugin_react_preamble_installed__ = true;
              const { Modal } = await import('/src/components/ui.tsx');
              function Fixture() {
                const [open, setOpen] = useState(false);
                return h('div', { className: 'page', style: { marginTop: '300px', height: '1800px' } },
                  h('button', { onClick: () => setOpen(true) }, 'Abrir modal'),
                  open && h(Modal, { title: 'Prueba de modal', onClose: () => setOpen(false) },
                    h('div', { style: { height: '${long ? 1600 : 80}px' } }, 'Contenido'),
                    h('button', { onClick: () => setOpen(false) }, 'Finalizar')));
              }
              createRoot(document.getElementById('root')).render(h(Fixture));
            </script></body></html>`,
        }),
      )
      await page.goto('/__modal-test')
      await page.getByRole('button', { name: 'Abrir modal' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect
        .poll(async () =>
          dialog.evaluate((element) => {
            const rect = element.getBoundingClientRect()
            return Math.abs(rect.y + rect.height / 2 - window.innerHeight / 2)
          }),
        )
        .toBeLessThan(2)
      const rect = (await dialog.boundingBox())!
      expect(Math.abs(rect.x + rect.width / 2 - viewport.width / 2)).toBeLessThan(2)
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height)
      await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
      if (long) {
        expect(
          await dialog.evaluate((element) => element.scrollHeight > element.clientHeight),
        ).toBe(true)
        await dialog.hover()
        await page.mouse.wheel(0, 2000)
        await expect.poll(() => dialog.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      }
      await dialog.getByRole('button', { name: 'Finalizar' }).click()
      await expect(dialog).toHaveCount(0)
      await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
      await expect(page.getByRole('button', { name: 'Abrir modal' })).toBeFocused()
    })
  }
}
