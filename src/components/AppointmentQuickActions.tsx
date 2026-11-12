import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarClock, FileCheck2, MessageCircle, Pencil, Wallet } from 'lucide-react'
import { useData } from '../providers/DataProvider'
import { useToast } from '../providers/ToastProvider'
import { money, paidFor, quickChargeAmount, toCents } from '../lib/domain'
import { updateAppointment } from '../lib/appointmentActions'
import type { OnAppointmentAction } from '../lib/appointmentActions'
import { messageFor, rpc } from '../lib/supabase'
import { METHODS, STATUS } from '../lib/types'
import type { Appointment, Method, Status } from '../lib/types'
import { Button, Field, Modal } from './ui'

export function AppointmentQuickActions({
  appointment: a,
  onAction,
}: {
  appointment: Appointment
  onAction?: OnAppointmentAction
}) {
  const { appointmentData: data, refresh } = useData()
  const notify = useToast()
  const [paymentTarget, setPaymentTarget] = useState<'half' | 'balance' | 'other' | null>(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const paid = paidFor(a.id, data.payments)
  const active = !a.deleted_at && a.status !== 'cancelled'
  const phone = data.customers.find((c) => c.id === a.customer_id)?.phone
  async function changeStatus(status: Status) {
    if (status === a.status || lock.current || busy) return
    if (!navigator.onLine) {
      notify('No hay conexión. Reconectate antes de cambiar el estado.', true)
      return
    }
    if (
      status === 'cancelled' &&
      !window.confirm('¿Cancelar este turno? Sus cobros y su historial se conservarán.')
    )
      return
    lock.current = true
    setBusy(true)
    try {
      await updateAppointment(a, data.appointmentServices, { status })
      notify('Estado del turno actualizado.')
      await refresh()
    } catch (err) {
      notify(messageFor(err), true)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <div className="appointment-quick-actions" role="group" aria-label="Acciones del turno">
      <div className="appointment-action-bar">
        {active && a.total_cents > paid ? (
          <>
            <Button
              variant="secondary"
              title="Completar el 50% del total"
              aria-label="Completar al 50%"
              disabled={busy || quickChargeAmount(a.total_cents, paid, 'half') <= 0}
              onClick={() => setPaymentTarget('half')}
            >
              50%
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setPaymentTarget('balance')}>
              Pago Total
            </Button>
            <Button
              variant="ghost"
              title="Otro importe"
              aria-label="Otro importe"
              disabled={busy}
              onClick={() => setPaymentTarget('other')}
            >
              <Wallet size={16} />
            </Button>
          </>
        ) : null}
        {!a.deleted_at ? (
          <select
            className="appointment-status-select"
            aria-label="Cambiar estado del turno"
            value={a.status}
            disabled={busy}
            onChange={(e) => void changeStatus(e.target.value as Status)}
          >
            {Object.entries(STATUS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : null}
        {phone && onAction ? (
          <Button variant="ghost" disabled={busy} onClick={() => onAction('message', a)}>
            <MessageCircle size={15} /> WhatsApp
          </Button>
        ) : null}
        {onAction ? (
          <>
            {!a.deleted_at ? (
              <>
                <Button
                  variant="ghost"
                  title="Reprogramar"
                  aria-label="Reprogramar"
                  disabled={busy}
                  onClick={() => onAction('reschedule', a)}
                >
                  <CalendarClock size={16} />
                </Button>
                <Button
                  variant="ghost"
                  title="Editar turno"
                  aria-label="Editar turno"
                  disabled={busy}
                  onClick={() => onAction('edit', a)}
                >
                  <Pencil size={16} />
                </Button>
              </>
            ) : null}
            <Button
              variant="ghost"
              title="Comprobante"
              aria-label="Comprobante"
              disabled={busy}
              onClick={() => onAction('receipt', a)}
            >
              <FileCheck2 size={16} />
            </Button>
            <Button
              variant="ghost"
              title="Otros movimientos"
              aria-label="Otros movimientos"
              disabled={busy}
              onClick={() => onAction('payment', a)}
            >
              <Wallet size={16} />
            </Button>
          </>
        ) : null}
      </div>
      {paymentTarget ? (
        <QuickPayment
          key={a.id}
          appointment={a}
          target={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onBusyChange={setBusy}
        />
      ) : null}
    </div>
  )
}

function QuickPayment({
  appointment: a,
  target,
  onClose,
  onBusyChange,
}: {
  appointment: Appointment
  target: 'half' | 'balance' | 'other'
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const { appointmentData: data, refresh } = useData()
  const notify = useToast()
  const paid = paidFor(a.id, data.payments)
  const pending = quickChargeAmount(a.total_cents, paid, 'balance')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Method>(a.payment_method)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const request = useRef<{ key: string; id: string; paidAt: string } | null>(null)
  const cents = target === 'other' ? null : quickChargeAmount(a.total_cents, paid, target)
  async function save(e: FormEvent) {
    e.preventDefault()
    if (lock.current || saved) return
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    setError('')
    try {
      if (!navigator.onLine) throw new Error('No hay conexión. Reconectate antes de cobrar.')
      const value = cents ?? toCents(amount)
      if (value <= 0 || value > pending)
        throw new Error('Revisá el importe: debe ser mayor que cero y no superar el saldo.')
      if (a.deleted_at || a.status === 'cancelled')
        throw new Error('El turno ya no está activo. Revisá sus movimientos desde el detalle.')
      const key = JSON.stringify([a.id, value, method])
      if (request.current?.key !== key)
        request.current = { key, id: crypto.randomUUID(), paidAt: new Date().toISOString() }
      await rpc('record_payment', {
        p_appointment: a.id,
        p_amount: value,
        p_kind: 'charge',
        p_method: method,
        p_paid_at: request.current.paidAt,
        p_notes: '',
        p_request_id: request.current.id,
      })
      setSaved(true)
      notify(`Cobro registrado: ${money(value, a.currency)}.`)
      await refresh()
      onClose()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      lock.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }
  return (
    <Modal
      title={
        target === 'half'
          ? 'Completar al 50%'
          : target === 'balance'
            ? 'Pago Total'
            : 'Otro importe'
      }
      subtitle={`${data.customers.find((customer) => customer.id === a.customer_id)?.full_name ?? 'Cliente'} · ${a.reference} · Pendiente: ${money(pending, a.currency)}`}
      onClose={onClose}
      busy={busy}
    >
      <form className="quick-payment-confirmation" onSubmit={save} aria-label="Cobrar este turno">
        <fieldset disabled={busy || saved}>
          <div className="form-grid">
            {target === 'other' ? (
              <Field label={`Importe en ${a.currency}`}>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max={pending / 100}
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
            ) : (
              <div className="quick-payment-amount">
                <span>Vas a registrar ahora</span>
                <strong>{money(cents ?? 0, a.currency)}</strong>
              </div>
            )}
          </div>
          <div className="quick-payment-methods" role="group" aria-label="Medio de pago">
            <span>Medio de pago</span>
            <div>
              {Object.entries(METHODS).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={method === value}
                  onClick={() => setMethod(value as Method)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="muted small">
            Solo confirmá dinero que ya recibiste. Se registra con fecha y hora actuales.
          </p>
        </fieldset>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="quick-payment-footer">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {saved ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!saved ? (
            <Button type="submit" loading={busy} disabled={cents === 0 || pending <= 0}>
              Confirmar cobro
            </Button>
          ) : (
            <span role="status">Cobro guardado. No vuelvas a registrarlo.</span>
          )}
        </div>
      </form>
    </Modal>
  )
}
