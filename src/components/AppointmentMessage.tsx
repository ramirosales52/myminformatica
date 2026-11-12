import { useState } from 'react'
import { useData } from '../providers/DataProvider'
import {
  customerSchedule,
  fillTemplate,
  money,
  paidFor,
  serviceNames,
  whatsappUrl,
  zoned,
} from '../lib/domain'
import type { Appointment } from '../lib/types'
import { Field, Modal } from './ui'

export function AppointmentMessage({
  appointment: a,
  onClose,
}: {
  appointment: Appointment
  onClose: () => void
}) {
  const { appointmentData: data } = useData()
  const [choice, setChoice] = useState('reminder')
  const customer = data.customers.find((c) => c.id === a.customer_id)
  const pending = Math.max(0, a.total_cents - paidFor(a.id, data.payments))
  const services = serviceNames(a.id, data.appointmentServices)
  const greeting = `¡Hola ${customer?.full_name ?? ''}!`
  const defaults: Record<string, string> = {
    reminder: `${greeting} Te recordamos tu turno de ${services} para el ${customerSchedule(a.starts_at, customer?.tz_offset_minutes)}.`,
    start: `${greeting} Estamos listos para comenzar con ${services}. ¿Podemos conectarnos?`,
    balance: `${greeting} Te recordamos el saldo pendiente de ${money(pending, a.currency)} por ${services}.`,
  }
  const template = data.templates.find((t) => `template:${t.id}` === choice)
  const rendered = template
    ? fillTemplate(template.body, {
        nombre_cliente: customer?.full_name ?? '',
        servicio: services,
        precio: new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(
          a.total_cents / 100,
        ),
        moneda: a.currency,
        fecha: zoned(a.starts_at, 'dd/MM/yyyy'),
        hora: zoned(a.starts_at, 'HH:mm'),
      })
    : defaults[choice]
  return (
    <Modal title="WhatsApp del turno" subtitle={customer?.full_name} onClose={onClose}>
      <div className="form-stack">
        <Field label="Mensaje">
          <select value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="reminder">Recordar turno</option>
            <option value="start">Avisar que empezamos</option>
            {pending > 0 && a.status !== 'cancelled' ? (
              <option value="balance">Recordar saldo</option>
            ) : null}
            {data.templates.map((t) => (
              <option key={t.id} value={`template:${t.id}`}>
                {t.title}
              </option>
            ))}
          </select>
        </Field>
        <div className="message-preview">
          <span>Vista previa</span>
          <p>{rendered}</p>
        </div>
        <p className="muted small">
          WhatsApp se abre con el texto preparado. Revisalo y confirmá el envío allí.
        </p>
        {customer?.phone ? (
          <a
            className="btn btn-primary"
            href={whatsappUrl(customer.phone, rendered)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir WhatsApp
          </a>
        ) : (
          <p className="warning">Este cliente no tiene un teléfono registrado.</p>
        )}
      </div>
    </Modal>
  )
}
