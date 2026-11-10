import { ArrowUpRight, Clock3, Monitor, Plus } from 'lucide-react'
import { useData } from '../providers/DataProvider'
import {
  duration,
  initials,
  money,
  paidFor,
  PAYMENT_STATUS,
  paymentState,
  serviceNames,
  zoned,
} from '../lib/domain'
import type { Appointment } from '../lib/types'
import { Badge, Button, Empty } from './ui'

export function AppointmentList({
  appointments,
  onSelect,
  onNew,
  showDate = false,
}: {
  appointments: Appointment[]
  onSelect: (id: string) => void
  onNew?: () => void
  showDate?: boolean
}) {
  const { data } = useData()
  if (!appointments.length)
    return (
      <Empty
        title="Un día con espacio para más."
        description="Todavía no hay turnos para esta fecha. Agendá un trabajo y compartilo con tu equipo."
        action={
          onNew ? (
            <Button variant="secondary" onClick={onNew}>
              <Plus size={16} />
              Agendar un turno
            </Button>
          ) : undefined
        }
      />
    )
  return (
    <div className="appointment-list">
      {appointments
        .toSorted((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map((a) => {
          const customer = data.customers.find((c) => c.id === a.customer_id)
          const paid = paidFor(a.id, data.payments)
          const state = paymentState(a.total_cents, paid)
          return (
            <button
              className={`appointment-row ${a.status === 'cancelled' ? 'is-cancelled' : ''}`}
              key={a.id}
              onClick={() => onSelect(a.id)}
            >
              <div className="appointment-time">
                <strong>{zoned(a.starts_at, 'HH:mm')}</strong>
                <span>
                  {showDate ? zoned(a.starts_at, 'dd MMM') : duration(a.duration_minutes)}
                </span>
              </div>
              <span className={`avatar avatar-${a.status}`}>
                {initials(customer?.full_name ?? '')}
              </span>
              <div className="appointment-main">
                <strong>{customer?.full_name ?? 'Cliente'}</strong>
                <span>
                  <Monitor size={13} />
                  {serviceNames(a.id, data.appointmentServices)}
                </span>
                <small>
                  <Clock3 size={12} />
                  {duration(a.duration_minutes)} · Remoto
                </small>
              </div>
              <div className="appointment-state">
                <Badge status={a.status} />
                <span className={`payment-text ${state}`}>{PAYMENT_STATUS[state]}</span>
              </div>
              <div className="appointment-amount">
                <strong>{money(a.total_cents, a.currency)}</strong>
                <span>{paid > 0 ? `${money(paid, a.currency)} cobrado` : 'Sin cobros'}</span>
              </div>
              <ArrowUpRight className="row-arrow" size={17} />
            </button>
          )
        })}
    </div>
  )
}
