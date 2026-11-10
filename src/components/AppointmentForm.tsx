import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarDays, Check, Clock3, Plus, UserRound, Wallet } from 'lucide-react'
import { useData } from '../providers/DataProvider'
import { useAuth } from '../providers/AuthProvider'
import { useToast } from '../providers/ToastProvider'
import { db, messageFor, rpc } from '../lib/supabase'
import {
  duration,
  endTime,
  money,
  normalizeOptionalPhone,
  toCents,
  toOffsetMinutes,
  today,
  toUTC,
  zoned,
} from '../lib/domain'
import { METHODS, STATUS } from '../lib/types'
import type { Appointment, AppointmentService, Currency, Method, Status } from '../lib/types'
import { Button, Field, Modal } from './ui'

export function AppointmentForm({
  appointment,
  initialCustomer,
  initialDay,
  onClose,
  onSaved,
}: {
  appointment?: Appointment
  initialCustomer?: string
  initialDay?: string
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const { appointmentData, workspace: selectedWorkspace, workspaces, refresh } = useData()
  const [customerId, setCustomerId] = useState(appointment?.customer_id ?? initialCustomer ?? '')
  const targetWorkspaceId = appointment?.workspace_id
  const workspace = targetWorkspaceId
    ? workspaces.find((w) => w.id === targetWorkspaceId)
    : selectedWorkspace
  const data = appointmentData
  const { session } = useAuth()
  const notify = useToast()
  const [newCustomer, setNewCustomer] = useState(false)
  const [offsetEdits, setOffsetEdits] = useState<Record<string, string>>({})
  const offsetKey = newCustomer ? 'new' : customerId
  const selectedCustomer = data.customers.find((c) => c.id === customerId)
  const offset =
    offsetEdits[offsetKey] ??
    (!newCustomer && selectedCustomer?.tz_offset_minutes
      ? String(selectedCustomer.tz_offset_minutes / 60)
      : '')
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [currency, setCurrency] = useState<Currency>(appointment?.currency ?? 'ARS')
  const [lines, setLines] = useState<AppointmentService[]>(
    appointment ? data.appointmentServices.filter((l) => l.appointment_id === appointment.id) : [],
  )
  const [amount, setAmount] = useState(String((appointment?.total_cents ?? 0) / 100))
  const [minutes, setMinutes] = useState(appointment?.duration_minutes ?? 60)
  const [date, setDate] = useState(
    appointment ? zoned(appointment.starts_at, 'yyyy-MM-dd') : (initialDay ?? today()),
  )
  const [time, setTime] = useState(appointment ? zoned(appointment.starts_at, 'HH:mm') : '09:00')
  const [status, setStatus] = useState<Status>(appointment?.status ?? 'pending')
  const [responsible, setResponsible] = useState(
    appointment?.responsible_id ?? session?.user.id ?? '',
  )
  const [method, setMethod] = useState<Method>(appointment?.payment_method ?? 'undefined')
  const [initialPayment, setInitialPayment] = useState('0')
  const [notes, setNotes] = useState(appointment?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [requestId] = useState(() => crypto.randomUUID())
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', unload)
    return () => window.removeEventListener('beforeunload', unload)
  }, [dirty])
  const startsAt =
    date && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
      ? toUTC(`${date}T${time}`)
      : new Date().toISOString()
  const overlap = data.appointments.some(
    (a) =>
      a.id !== appointment?.id &&
      !a.deleted_at &&
      a.status !== 'cancelled' &&
      new Date(a.starts_at).getTime() < new Date(startsAt).getTime() + minutes * 60000 &&
      endTime(a).getTime() > new Date(startsAt).getTime(),
  )
  function close() {
    if (!busy && (!dirty || window.confirm('¿Descartar los cambios sin guardar?'))) onClose()
  }
  function toggleService(id: string) {
    const service = data.services.find((s) => s.id === id)!
    const updated = lines.some((l) => l.service_id === id)
      ? lines.filter((l) => l.service_id !== id)
      : [
          ...lines,
          {
            service_id: service.id,
            name: service.name,
            price_cents: currency === 'ARS' ? service.price_ars : service.price_usd,
            duration_minutes: service.duration_minutes,
          },
        ]
    setLines(updated)
    setAmount(String(updated.reduce((s, l) => s + l.price_cents, 0) / 100))
    setMinutes(updated.reduce((s, l) => s + l.duration_minutes, 0) || 60)
  }
  function changeCurrency(value: Currency) {
    setCurrency(value)
    const updated = lines.map((l) => {
      const s = data.services.find((s) => s.id === l.service_id)
      return {
        ...l,
        price_cents: s ? (value === 'ARS' ? s.price_ars : s.price_usd) : l.price_cents,
      }
    })
    setLines(updated)
    setAmount(String(updated.reduce((s, l) => s + l.price_cents, 0) / 100))
    setInitialPayment('0')
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (!workspace) throw new Error('Esperá a que se conecte el negocio para crear turnos.')
      if (!lines.length) throw new Error('Seleccioná al menos un servicio del catálogo.')
      const total = toCents(amount),
        initial = toCents(initialPayment)
      if (initial > total) throw new Error('El cobro inicial no puede superar el precio total.')
      const offsetMinutes = toOffsetMinutes(offset)
      let customer = customerId
      if (newCustomer) {
        const normalized = normalizeOptionalPhone(phone, '')
        const existing =
          normalized && data.customers.find((c) => c.phone === normalized && !c.deleted_at)
        if (existing)
          throw new Error(
            `Ese WhatsApp ya pertenece a ${existing.full_name}. Seleccionalo en clientes registrados.`,
          )
        const { data: c, error: err } = await db()
          .from('customers')
          .insert({
            workspace_id: workspace.id,
            full_name: customerName.trim(),
            phone: normalized,
            tz_offset_minutes: offsetMinutes,
          })
          .select()
          .single()
        if (err) throw err
        customer = c.id
        setOffsetEdits((values) => ({ ...values, [c.id]: offset }))
        setCustomerId(c.id)
        setNewCustomer(false)
        await refresh()
      } else if (
        selectedCustomer &&
        offsetMinutes !== (selectedCustomer.tz_offset_minutes ?? null)
      ) {
        const { error: err } = await db()
          .from('customers')
          .update({ tz_offset_minutes: offsetMinutes })
          .eq('id', selectedCustomer.id)
          .eq('version', selectedCustomer.version)
          .select()
          .single()
        if (err) throw err
        await refresh()
      }
      if (!customer) throw new Error('Seleccioná un cliente.')
      const moved =
        appointment && new Date(startsAt).getTime() !== new Date(appointment.starts_at).getTime()
      const payload = {
        customer_id: customer,
        responsible_id: responsible,
        starts_at: startsAt,
        duration_minutes: minutes,
        status: moved && status !== 'cancelled' && status !== 'completed' ? 'rescheduled' : status,
        currency,
        total_cents: total,
        payment_method: method,
        notes,
        services: lines.map(({ service_id, name, price_cents, duration_minutes }) => ({
          service_id,
          name,
          price_cents,
          duration_minutes,
        })),
        initial_payment:
          !appointment && initial > 0
            ? { amount_cents: initial, method, paid_at: new Date().toISOString() }
            : null,
      }
      const id = await rpc<string>('save_appointment', {
        p_workspace: workspace.id,
        p_payload: payload,
        p_request_id: requestId,
        p_id: appointment?.id ?? null,
        p_version: appointment?.version ?? null,
      })
      await refresh()
      notify(
        appointment
          ? 'Turno actualizado.'
          : initial > 0
            ? 'Turno y cobro guardados.'
            : 'Turno agendado.',
      )
      onSaved?.(id)
      onClose()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={appointment ? 'Editar turno' : 'Agendar nuevo turno'}
      onClose={close}
      wide
      busy={busy}
    >
      <form className="appointment-form" onSubmit={save} onChange={() => setDirty(true)}>
        <div className="form-section-title">
          <UserRound size={17} />
          <h3>Cliente</h3>
          <button
            type="button"
            className="text-link ml-auto"
            onClick={() => setNewCustomer((v) => !v)}
          >
            {newCustomer ? (
              'Seleccionar registrado'
            ) : (
              <>
                <Plus size={14} />
                Nuevo cliente
              </>
            )}
          </button>
        </div>
        {newCustomer ? (
          <div className="form-grid">
            <Field label="Nombre y apellido">
              <input
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                maxLength={160}
                placeholder="Nombre del cliente"
              />
            </Field>
            <Field label="WhatsApp (opcional)" hint="Número completo con código de país.">
              <input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+54 9 351 123 4567"
              />
            </Field>
          </div>
        ) : (
          <Field label="Cliente registrado">
            <select required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Seleccionar cliente…</option>
              {(appointment ? data.customers : appointmentData.customers)
                .filter((c) => !c.deleted_at || c.id === appointment?.customer_id)
                .toSorted((a, b) => a.full_name.localeCompare(b.full_name))
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.full_name} · {c.phone || 'Sin teléfono'}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <div className="form-section-title">
          <Check size={17} />
          <h3>Servicios del turno</h3>
          <span className="muted ml-auto">Podés combinar varios</span>
        </div>
        <div className="service-picker">
          {data.services
            .filter((s) => s.active || lines.some((l) => l.service_id === s.id))
            .map((s) => (
              <label
                className={`service-option ${lines.some((l) => l.service_id === s.id) ? 'selected' : ''}`}
                key={s.id}
              >
                <input
                  type="checkbox"
                  checked={lines.some((l) => l.service_id === s.id)}
                  onChange={() => {
                    setDirty(true)
                    toggleService(s.id)
                  }}
                />
                <span>
                  <strong>{s.name}</strong>
                  <small>
                    {duration(s.duration_minutes)} ·{' '}
                    {money(currency === 'ARS' ? s.price_ars : s.price_usd, currency)}
                  </small>
                </span>
              </label>
            ))}
          {!data.services.length ? (
            <p className="muted">Primero registrá tus servicios en el catálogo.</p>
          ) : null}
        </div>
        <div className="form-section-title">
          <CalendarDays size={17} />
          <h3>Fecha y horario</h3>
          <span className="muted ml-auto">Argentina · UTC−3</span>
        </div>
        <div className="form-grid three">
          <Field label="Fecha">
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Hora de inicio (24 h)">
            <input
              type="text"
              inputMode="numeric"
              required
              pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
              title="Usá el formato de 24 horas: HH:mm"
              maxLength={5}
              list="appointment-times"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="14:30"
            />
            <datalist id="appointment-times">
              {Array.from({ length: 96 }, (_, i) => {
                const value = `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`
                return <option value={value} key={value} />
              })}
            </datalist>
          </Field>
          <Field label="Duración (minutos)">
            <input
              type="number"
              min={5}
              max={10080}
              required
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </Field>
        </div>
        <div className="inline-info">
          <Clock3 size={15} />
          {time} a {zoned(endTime({ starts_at: startsAt, duration_minutes: minutes }), 'HH:mm')} ·{' '}
          {duration(minutes)}
        </div>
        <Field
          label="Diferencia de hora con Argentina"
          hint="En horas: −2 si está dos horas atrás, +4 si está cuatro horas adelante. Vacío o 0 usa la hora argentina. Se recuerda para los comprobantes de este cliente."
        >
          <input
            type="text"
            inputMode="decimal"
            value={offset}
            onChange={(e) =>
              setOffsetEdits((values) => ({ ...values, [offsetKey]: e.target.value }))
            }
            placeholder="0"
          />
        </Field>
        {overlap && status !== 'cancelled' ? (
          <div className="warning">
            Este horario coincide con otro turno.
            {selectedWorkspace?.allow_overlap
              ? ' Los turnos simultáneos están habilitados.'
              : ' Elegí otro horario o habilitá superposiciones en Ajustes.'}
          </div>
        ) : null}
        <div className="form-grid">
          <Field label="Estado">
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {Object.entries(STATUS).map(([v, text]) => (
                <option value={v} key={v}>
                  {text}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsable">
            <select required value={responsible} onChange={(e) => setResponsible(e.target.value)}>
              <option value="">Seleccionar integrante…</option>
              {data.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-section-title">
          <Wallet size={17} />
          <h3>Importe acordado</h3>
        </div>
        <div className="form-grid three">
          <Field label="Moneda">
            <select value={currency} onChange={(e) => changeCurrency(e.target.value as Currency)}>
              <option value="ARS">Pesos argentinos (ARS)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </Field>
          <Field label="Precio total">
            <input
              inputMode="decimal"
              type="number"
              required
              min={0}
              max={1000000000}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Medio de pago">
            <select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              {Object.entries(METHODS).map(([v, text]) => (
                <option value={v} key={v}>
                  {text}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {!appointment ? (
          <div className="initial-payment">
            <Field
              label="Cobro recibido ahora"
              hint="Solo ingresá dinero que ya recibiste. Se registra junto con el turno."
            >
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={initialPayment}
                onChange={(e) => setInitialPayment(e.target.value)}
              />
            </Field>
            <div className="segmented">
              <button
                type="button"
                onClick={() => setInitialPayment(String(Math.round(Number(amount) * 50) / 100))}
              >
                50%
              </button>
              <button type="button" onClick={() => setInitialPayment(amount)}>
                100%
              </button>
            </div>
          </div>
        ) : (
          <div className="inline-info">
            Los cobros y devoluciones se administran desde el detalle del turno.
          </div>
        )}
        <Field label="Notas adicionales">
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Acceso remoto, indicaciones o detalles del trabajo…"
          />
        </Field>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            <CalendarDays size={17} />
            {appointment ? 'Guardar cambios' : 'Agendar turno'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
