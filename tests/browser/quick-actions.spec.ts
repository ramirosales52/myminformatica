import { expect, test } from '@playwright/test'

// Componentes reales, proveedores aislados. Nunca conecta ni escribe en una base.
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error
  })
  await page.route('**/src/providers/DataProvider.tsx*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export const useData = () => window.fixture;',
    }),
  )
  await page.route('**/src/providers/AuthProvider.tsx*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: "export const useAuth = () => ({ session: { user: { id: 'user' } } });",
    }),
  )
  await page.route('**/src/providers/ToastProvider.tsx*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export const useToast = () => (text) => { window.notice = text; };',
    }),
  )
  await page.route('**/src/lib/supabase.ts*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export const configured = true; export const messageFor = e => e.message;
      export const db = () => { throw Error('Unexpected database call'); };
      export const rpc = async (name, args) => {
        window.calls.push({name, args});
        if (window.fail) throw Error('Saldo actualizado por otro integrante');
        if (name === 'record_payment') window.fixture.appointmentData.payments.push({appointment_id:'a',amount_cents:args.p_amount,kind:'charge',currency:'ARS',paid_at:args.p_paid_at});
        if (name === 'save_appointment') Object.assign(window.fixture.appointmentData.appointments[0], args.p_payload);
        return 'a';
      };`,
    }),
  )
  await page.route('**/__quick-agenda*', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import RefreshRuntime from '/@react-refresh';
      import '/src/index.css';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {today} = await import('/src/lib/domain.ts');
      const a = {id:'a', workspace_id:'w', customer_id:'c', responsible_id:'user', reference:'T-001', starts_at:today()+'T14:00:00-03:00', duration_minutes:60, total_cents:2000000, currency:'ARS', status:'pending', payment_method:'cash', version:7, notes:'No copiar', deleted_at:null};
      const params = new URLSearchParams(location.search);
      if(params.has('paid')) window.startPaid = Number(params.get('paid'));
      if(params.has('cancelled')) a.status='cancelled';
      const data = {appointments:[a], payments:[{appointment_id:'a',amount_cents:window.startPaid ?? 400000,kind:'charge'}], customers:[{id:'c',full_name:'Ana Pérez',phone:params.has('noPhone')?'':'+5493511234567',tz_offset_minutes:-120},{id:'other',full_name:'Pedro López',phone:'+12025550123'}], services:[{id:'s',name:'Mantenimiento',active:true,price_ars:2500000,price_usd:3000,duration_minutes:45}], appointmentServices:[{appointment_id:'a',service_id:'s',name:'Servicio anterior',price_cents:2000000,duration_minutes:60}], profiles:[{id:'user',full_name:'Técnico'}], templates:[{id:'t',title:'Plantilla del equipo',body:'Hola {nombre_cliente}: {servicio} el {fecha} a las {hora}. {precio} {moneda}'}],activity:[], notifications:[],members:[]};
      window.calls=[]; window.selected=false;
      data.payments.forEach(p=>{p.paid_at=a.starts_at;p.currency='ARS';});
      data.customers.forEach(c=>{c.created_at=a.starts_at;});
      window.fixture={appointmentData:data,data,profile:data.profiles[0],sync:'live',workspace:{id:'w',allow_overlap:false},workspaces:[{id:'w'}],schedule:[{...a,customer_name:'Ana Pérez',responsible_name:'Técnico',workspace_name:'Negocio',services:[{service_id:'s',name:'Servicio anterior'}]}],refresh:async()=>window.render()};
      const {AppointmentList}=await import('/src/components/AppointmentList.tsx');
      const {RescheduleForm}=await import('/src/components/RescheduleForm.tsx');
      const {AppointmentMessage}=await import('/src/components/AppointmentMessage.tsx');
      const {AppointmentForm}=await import('/src/components/AppointmentForm.tsx');
      const {Agenda}=await import('/src/pages/Agenda.tsx');
      const root=ReactDOM.createRoot(document.getElementById('root'));
      const mode=params.get('mode');
      const App = mode === 'app' ? (await import('/src/App.tsx')).default : null;
      // Usar la misma URL versionada de Vite que App, no otra instancia del contexto.
      const appSource = mode === 'app' ? await fetch('/src/App.tsx').then(r=>r.text()) : '';
      const queryURL = appSource.match(/from ["']([^"']*tanstack_react-query[^"']*)["']/)?.[1];
      const query = queryURL ? await import(queryURL) : null;
      const queryClient = query ? new query.QueryClient() : null;
      const close=()=>{window.closed=true;};
      window.render=()=>{
        let child;
        if(mode==='app') { root.render(React.createElement(query.QueryClientProvider,{client:queryClient},React.createElement(App))); return; }
        if(mode==='reschedule') child=React.createElement(RescheduleForm,{appointment:a,onClose:close});
        else if(mode==='message') child=React.createElement(AppointmentMessage,{appointment:a,onClose:close});
        else if(mode==='repeat'||mode==='form') child=React.createElement(AppointmentForm,{repeatFrom:mode==='repeat'?a:undefined,initialCustomer:mode==='repeat'?'c':undefined,onClose:close});
        else if(mode==='agenda') child=React.createElement(Agenda,{onSelect:(id)=>{window.selected=id;},onNew:()=>{}});
        else child=React.createElement(AppointmentList,{appointments:[a],onSelect:()=>{window.selected=true;},onAction:(action)=>{window.action=action;}});
        root.render(React.createElement('main',{className:'panel',style:{maxWidth:900,margin:'16px auto'}},child));
      };
      window.render();
    </script></body></html>`,
    }),
  )
})

test('día destaca las horas y mueve la línea de ahora sin recargar', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T17:30:00Z') })
  await page.goto('/__quick-agenda?mode=agenda')
  await page.getByRole('button', { name: 'Día', exact: true }).click()
  await page.clock.pauseAt(new Date('2026-11-12T17:30:10Z'))
  const marker = page.locator('.timeline-now')
  await expect(marker).toHaveAttribute('aria-label', 'Hora actual: 14:30')
  await expect(marker.locator('time')).toHaveText('Ahora 14:30')
  await expect(page.locator('.is-current-hour > time')).toHaveText('14:00')
  await page.clock.runFor(60000)
  await expect(marker).toHaveAttribute('aria-label', 'Hora actual: 14:31')
  await page.getByRole('button', { name: 'Período siguiente' }).click()
  await expect(marker).toHaveCount(0)
  await page.getByRole('button', { name: 'Período anterior' }).click()
  await expect(marker).toHaveCount(1)
  await page.getByRole('textbox', { name: 'Buscar turnos' }).fill('sin coincidencias')
  await expect(page.locator('.has-appointments')).toHaveCount(0)
  await expect(marker).toHaveCount(1)
})

test('línea de ahora visible también fuera del horario habitual', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T08:15:00Z') })
  await page.goto('/__quick-agenda?mode=agenda')
  await page.getByRole('button', { name: 'Día', exact: true }).click()
  await expect(page.locator('.is-current-hour > time')).toHaveText('05:00')
  await expect(page.locator('.timeline-now')).toHaveAttribute('aria-label', 'Hora actual: 05:15')
})

test('semana posiciona el turno por hora y abre su detalle', async ({ page }) => {
  await page.goto('/__quick-agenda?mode=agenda')
  const grid = page.getByRole('region', { name: 'Calendario semanal por hora' })
  await expect(grid.locator('.week-time-heading')).toHaveCount(7)
  const event = grid.getByRole('button', { name: /Ana Pérez, 14:00 a 15:00/ })
  await expect(event).toHaveCSS('top', '432px')
  await expect(event).toHaveCSS('height', '72px')
  await page.screenshot({ path: test.info().outputPath('semana.png') })
  await event.click()
  expect(await page.evaluate(() => (window as unknown as { selected: string }).selected)).toBe('a')
  await page.getByRole('button', { name: 'Período siguiente' }).click()
  await expect(grid.locator('.week-time-event')).toHaveCount(0)
  await page.getByRole('button', { name: 'Período anterior' }).click()
  await expect(grid.locator('.week-time-event')).toHaveCount(1)
  await page.getByRole('textbox', { name: 'Buscar turnos' }).fill('sin coincidencias')
  await expect(grid.locator('.week-time-event')).toHaveCount(0)
})

test('día conserva cobros dentro del timeline y la semana no desborda en móvil', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/__quick-agenda?mode=agenda')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: 'Día', exact: true }).click()
  const timeline = page.getByLabel('Línea de tiempo del día')
  await expect(timeline.locator('.has-appointments > time')).toHaveText('14:00')
  await page.screenshot({ path: test.info().outputPath('dia-movil.png'), fullPage: true })
  await timeline.getByRole('button', { name: 'Completar al 50%', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar cobro' }).click()
  await expect(timeline.getByText('Falta cobrar ARS 10.000')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: 'Mes', exact: true }).click()
  await expect(page.locator('.month-view')).toBeVisible()
})

test('cobra lo que falta para el 50% sin abrir el detalle', async ({ page }) => {
  await page.goto('/__quick-agenda')
  await expect(page.getByText('Falta cobrar ARS 16.000')).toBeVisible()
  await page.getByRole('button', { name: 'Completar al 50%', exact: true }).click()
  await expect(page.getByText('ARS 6.000', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Transferencia bancaria', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar cobro' }).click()
  await expect(page.getByText('Falta cobrar ARS 10.000')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { selected: boolean }).selected)).toBe(
    false,
  )
  const calls = await page.evaluate(
    () => (window as unknown as { calls: { name: string; args: Record<string, unknown> }[] }).calls,
  )
  expect(calls).toHaveLength(1)
  expect(calls[0].args).toMatchObject({
    p_amount: 600000,
    p_method: 'transfer',
    p_kind: 'charge',
    p_appointment: 'a',
  })
  await expect(page.getByRole('button', { name: 'Completar al 50%' })).toBeDisabled()
  await page.getByRole('button', { name: 'Pago Total', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar cobro' }).click()
  await expect(page.locator('.payment-text')).toHaveText('Pagado')
  await expect(page.getByRole('button', { name: 'Pago Total', exact: true })).toHaveCount(0)
})

test('otro importe, error e idempotencia al reintentar el mismo cobro', async ({ page }) => {
  await page.goto('/__quick-agenda')
  await page.getByRole('button', { name: 'Otro importe' }).click()
  await page.getByLabel('Importe en ARS').fill('123.45')
  await page.evaluate(() => {
    ;(window as unknown as { fail: boolean }).fail = true
  })
  await page.getByRole('button', { name: 'Confirmar cobro' }).click()
  await expect(page.getByRole('alert')).toHaveText('Saldo actualizado por otro integrante')
  await page.getByRole('button', { name: 'Confirmar cobro' }).click()
  const calls = await page.evaluate(
    () => (window as unknown as { calls: { args: Record<string, unknown> }[] }).calls,
  )
  expect(calls).toHaveLength(2)
  expect(calls[0].args.p_request_id).toBe(calls[1].args.p_request_id)
  expect(calls[0].args.p_amount).toBe(12345)
})

test('el desplegable ofrece todos los estados y conserva versión y servicios, sin cobrar', async ({
  page,
}) => {
  await page.goto('/__quick-agenda')
  const status = page.getByRole('combobox', { name: 'Cambiar estado del turno' })
  await expect(status.locator('option')).toHaveText([
    'Pendiente',
    'Confirmado',
    'Completado',
    'Reprogramado',
    'Cancelado',
  ])
  await status.selectOption('confirmed')
  await expect(status).toHaveValue('confirmed')
  const calls = await page.evaluate(
    () => (window as unknown as { calls: { name: string; args: Record<string, unknown> }[] }).calls,
  )
  expect(calls).toHaveLength(1)
  expect(calls[0].name).toBe('save_appointment')
  expect(calls[0].args).toMatchObject({
    p_version: 7,
    p_payload: {
      status: 'confirmed',
      total_cents: 2000000,
      services: [{ service_id: 's', price_cents: 2000000 }],
    },
  })
})

test('no ofrece cobrar un cancelado ni WhatsApp sin teléfono', async ({ page }) => {
  await page.goto('/__quick-agenda?cancelled&noPhone')
  await expect(page.getByRole('button', { name: 'Pago Total', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'WhatsApp', exact: true })).toHaveCount(0)
})

test('cancelar desde el desplegable pide confirmación y permite reactivar', async ({ page }) => {
  await page.goto('/__quick-agenda')
  const status = page.getByRole('combobox', { name: 'Cambiar estado del turno' })
  page.once('dialog', (dialog) => dialog.dismiss())
  await status.selectOption('cancelled')
  await expect(status).toHaveValue('pending')
  expect(await page.evaluate(() => (window as unknown as { calls: unknown[] }).calls.length)).toBe(
    0,
  )
  page.once('dialog', (dialog) => dialog.accept())
  await status.selectOption('cancelled')
  await expect(status).toHaveValue('cancelled')
  await expect(page.getByRole('button', { name: 'Pago Total', exact: true })).toHaveCount(0)
  await status.selectOption('confirmed')
  await expect(status).toHaveValue('confirmed')
  await expect(page.getByRole('button', { name: 'Pago Total', exact: true })).toBeVisible()
})

test('reprograma con fecha y hora sin modificar precio, servicios ni responsable', async ({
  page,
}) => {
  await page.goto('/__quick-agenda?mode=reschedule')
  await expect(page.getByRole('button', { name: 'Guardar horario' })).toBeDisabled()
  await page.getByLabel('Nueva fecha').fill('2030-02-20')
  await page.getByLabel('Nueva hora (Argentina)').fill('16:30')
  await page.getByRole('button', { name: 'Guardar horario' }).click()
  const calls = await page.evaluate(
    () => (window as unknown as { calls: { args: Record<string, unknown> }[] }).calls,
  )
  expect(calls[0].args).toMatchObject({
    p_version: 7,
    p_payload: {
      starts_at: '2030-02-20T19:30:00.000Z',
      total_cents: 2000000,
      responsible_id: 'user',
      status: 'rescheduled',
    },
  })
})

test('WhatsApp ya tiene cliente, horario del cliente y saldo; permite plantillas', async ({
  page,
}) => {
  await page.goto('/__quick-agenda?mode=message')
  await expect(page.locator('.message-preview')).toContainText('12:00 (hora de tu país)')
  await page.getByLabel('Mensaje', { exact: true }).selectOption('balance')
  const link = page.getByRole('link', { name: 'Abrir WhatsApp' })
  const url = new URL((await link.getAttribute('href'))!)
  expect(url.pathname).toBe('/5493511234567')
  expect(url.searchParams.get('text')).toContain('ARS 16.000')
  await page.getByLabel('Mensaje', { exact: true }).selectOption('template:t')
  await expect(page.locator('.message-preview')).toContainText('Hola Ana Pérez: Servicio anterior')
  await expect(page.locator('.message-preview')).not.toContainText('{nombre_cliente}')
})

test('repetir usa catálogo actual y no copia cobros, notas ni estado', async ({ page }) => {
  await page.goto('/__quick-agenda?mode=repeat')
  await expect(page.getByLabel('Cliente registrado')).toHaveValue('Ana Pérez')
  await expect(page.getByLabel('Precio total', { exact: true })).toHaveValue('25000')
  await expect(page.getByLabel('Duración (minutos)', { exact: true })).toHaveValue('45')
  await expect(page.getByLabel('Cobro recibido ahora')).toHaveValue('0')
  await page.getByLabel('Fecha', { exact: true }).fill('2030-02-20')
  await page.getByRole('button', { name: 'Agendar turno', exact: true }).click()
  const calls = await page.evaluate(
    () => (window as unknown as { calls: { args: Record<string, unknown> }[] }).calls,
  )
  expect(calls[0].args).toMatchObject({
    p_id: null,
    p_payload: {
      customer_id: 'c',
      total_cents: 2500000,
      notes: '',
      status: 'pending',
      initial_payment: null,
    },
  })
})

test('buscar cliente por teléfono y seleccionarlo con teclado', async ({ page }) => {
  await page.goto('/__quick-agenda?mode=form')
  const input = page.getByRole('combobox', { name: 'Cliente registrado' })
  await input.fill('2025550123')
  await input.press('Enter')
  await expect(input).toHaveValue('Pedro López')
  await input.fill('Cliente nuevo')
  await page.getByRole('option', { name: 'Crear «Cliente nuevo»' }).click()
  await expect(page.getByLabel('Nombre y apellido')).toHaveValue('Cliente nuevo')
})

test('por cobrar incluye pagos parciales y permite limpiar filtros', async ({ page }) => {
  await page.goto('/__quick-agenda?mode=agenda')
  await page.getByRole('button', { name: 'Por cobrar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Por cobrar', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('.appointment-card').first()).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Por cobrar', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

test('la app conserva fecha, vista y filtros al volver a la agenda', async ({ page }) => {
  await page.goto('/__quick-agenda?mode=app')
  const nav = page.getByRole('navigation', { name: 'Navegación principal' })
  await nav.getByRole('button', { name: /^Agenda/ }).click()
  await page.getByRole('button', { name: 'Mes', exact: true }).click()
  await page.getByRole('button', { name: 'Período siguiente' }).click()
  await page.getByRole('button', { name: 'Por cobrar', exact: true }).click()
  await page.getByRole('textbox', { name: 'Buscar turnos' }).fill('Ana')
  const period = await page.locator('.date-navigation h2').textContent()
  await nav.getByRole('button', { name: 'Clientes', exact: true }).click()
  await nav.getByRole('button', { name: /^Agenda/ }).click()
  await expect(page.locator('.month-view')).toBeVisible()
  await expect(page.locator('.date-navigation h2')).toHaveText(period!)
  await expect(page.getByRole('textbox', { name: 'Buscar turnos' })).toHaveValue('Ana')
  await expect(page.getByRole('button', { name: 'Por cobrar', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('los accesos de la tarjeta abren reprogramación y WhatsApp, sin repetir trabajo', async ({
  page,
}) => {
  await page.goto('/__quick-agenda?mode=app')
  const card = page.locator('.today-panel .appointment-card').first()
  await expect(card.locator('details')).toHaveCount(0)
  await expect(card.getByRole('combobox', { name: 'Cambiar estado del turno' })).toHaveCount(1)
  await expect(card.getByRole('button', { name: 'Repetir trabajo' })).toHaveCount(0)
  await card.getByRole('button', { name: 'Reprogramar', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Reprogramar turno' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar ventana' }).click()
  await card.getByRole('button', { name: 'WhatsApp', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'WhatsApp del turno' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar ventana' }).click()
})

for (const width of [320, 390, 768, 1440]) {
  test(`tarjeta y cobro legibles sin desborde a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/__quick-agenda')
    const alignment = await page.locator('.appointment-card').evaluate((card) => {
      const row = card.querySelector('.appointment-row')!.getBoundingClientRect()
      const actions = card.querySelector('.appointment-action-bar')!.getBoundingClientRect()
      const buttons = [
        ...card.querySelectorAll('.appointment-action-bar button, .appointment-action-bar select'),
      ].map((button) => button.getBoundingClientRect())
      return {
        centers: Math.abs(row.y + row.height / 2 - actions.y - actions.height / 2),
        sameLine: buttons.every((button) => Math.abs(button.y - buttons[0].y) < 2),
        dropdowns: card.querySelectorAll('details,select').length,
      }
    })
    expect(alignment.centers).toBeLessThan(2)
    expect(alignment.sameLine).toBe(true)
    expect(alignment.dropdowns).toBe(1)
    if (width === 1440)
      await page.screenshot({ path: '/tmp/opencode/agenda-inline-buttons.png', fullPage: true })
    await page.getByRole('button', { name: 'Completar al 50%', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Confirmar cobro' })).toBeVisible()
    const sizes = await page.locator('.appointment-card').evaluate((element) => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      name: parseFloat(
        getComputedStyle(element.querySelector('.appointment-main > strong')!).fontSize,
      ),
      amount: parseFloat(
        getComputedStyle(element.querySelector('.appointment-amount > strong')!).fontSize,
      ),
    }))
    expect(sizes.overflow).toBe(false)
    expect(sizes.name).toBeGreaterThanOrEqual(14)
    expect(sizes.amount).toBeGreaterThanOrEqual(14)
    if (width === 390)
      await page.screenshot({ path: '/tmp/opencode/agenda-quick-mobile.png', fullPage: true })
  })
}

test('la agenda del inicio mantiene las acciones legibles en un celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/__quick-agenda?mode=app')
  const card = page.locator('.today-panel .appointment-card').first()
  await card.getByRole('button', { name: 'Completar al 50%', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirmar cobro' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.screenshot({ path: '/tmp/opencode/agenda-app-mobile.png', fullPage: true })
})

test('la confirmación de cobro desde el historial no cierra la ficha al pulsar Escape', async ({
  page,
}) => {
  await page.goto('/__quick-agenda?mode=app')
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('button', { name: 'Clientes', exact: true })
    .click()
  await page
    .getByRole('button', { name: /Ana Pérez/ })
    .first()
    .click()
  await page
    .getByRole('dialog', { name: 'Ana Pérez', exact: true })
    .getByRole('button', { name: 'Completar al 50%', exact: true })
    .click()
  await expect(page.getByRole('dialog', { name: 'Completar al 50%', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Completar al 50%', exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Ana Pérez', exact: true })).toBeVisible()
})
