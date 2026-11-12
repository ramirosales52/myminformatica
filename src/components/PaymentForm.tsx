import { useState } from 'react'
import type { FormEvent } from 'react'
import { useData } from '../providers/DataProvider'
import { useToast } from '../providers/ToastProvider'
import { messageFor, rpc } from '../lib/supabase'
import { localInput, money, paidFor, quickChargeAmount, toCents, toUTC } from '../lib/domain'
import { KINDS, METHODS } from '../lib/types'
import type { Appointment, Method, PaymentKind } from '../lib/types'
import { Button, Field, Modal } from './ui'

export function PaymentForm({
  appointment,
  onClose,
}: {
  appointment: Appointment
  onClose: () => void
}) {
  const { appointmentData: data, refresh } = useData()
  const notify = useToast()
  const [kind, setKind] = useState<PaymentKind>('charge')
  const [method, setMethod] = useState<Method>(appointment.payment_method)
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(localInput(new Date()))
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [requestId] = useState(() => crypto.randomUUID())
  const paid = paidFor(appointment.id, data.payments)
  const pending = Math.max(0, appointment.total_cents - paid)
  const refund = kind === 'refund' || kind === 'correction_refund'
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const cents = toCents(amount)
      if (cents === 0) throw new Error('El importe debe ser mayor que cero.')
      await rpc('record_payment', {
        p_appointment: appointment.id,
        p_amount: cents,
        p_kind: kind,
        p_method: method,
        p_paid_at: toUTC(paidAt),
        p_notes: notes,
        p_request_id: requestId,
      })
      await refresh()
      notify(
        refund
          ? 'Devolución registrada sin borrar el historial.'
          : 'Cobro registrado. Ingresos actualizados.',
      )
      onClose()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Registrar movimiento"
      subtitle="Los ingresos reflejan únicamente dinero efectivamente cobrado."
      onClose={onClose}
      busy={busy}
    >
      <form className="form-stack" onSubmit={save}>
        <div className="payment-summary">
          <div>
            <small>Total acordado</small>
            <strong>{money(appointment.total_cents, appointment.currency)}</strong>
          </div>
          <div>
            <small>Cobrado</small>
            <strong className="text-green">{money(paid, appointment.currency)}</strong>
          </div>
          <div>
            <small>Pendiente</small>
            <strong>{money(pending, appointment.currency)}</strong>
          </div>
        </div>
        <Field label="Tipo de movimiento">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as PaymentKind)
              setAmount('')
            }}
          >
            {Object.entries(KINDS).map(([v, t]) => (
              <option value={v} key={v}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Importe en ${appointment.currency}`}>
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={(refund ? paid : pending) / 100}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
        </Field>
        <div className="quick-amounts">
          <Button
            variant="secondary"
            type="button"
            disabled={
              refund ? paid <= 0 : quickChargeAmount(appointment.total_cents, paid, 'half') <= 0
            }
            onClick={() =>
              setAmount(
                String(
                  (refund
                    ? Math.min(paid, Math.round(appointment.total_cents / 2))
                    : quickChargeAmount(appointment.total_cents, paid, 'half')) / 100,
                ),
              )
            }
          >
            {refund ? 'Devolver 50% del servicio' : 'Completar al 50%'}
          </Button>
          <Button
            variant="secondary"
            type="button"
            disabled={(refund ? paid : pending) <= 0}
            onClick={() => setAmount(String((refund ? paid : pending) / 100))}
          >
            {refund ? 'Devolver todo' : 'Cobrar saldo completo'}
          </Button>
        </div>
        <div className="form-grid">
          <Field label="Medio de pago">
            <select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              {Object.entries(METHODS).map(([v, t]) => (
                <option value={v} key={v}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha y hora (Argentina)">
            <input
              type="datetime-local"
              required
              max={localInput(new Date())}
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Observaciones"
          hint="Para corregir un cobro, agregá un movimiento compensatorio con su motivo."
        >
          <textarea
            required={kind.startsWith('correction')}
            minLength={kind.startsWith('correction') ? 3 : undefined}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            Registrar {refund ? 'devolución' : 'cobro'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
